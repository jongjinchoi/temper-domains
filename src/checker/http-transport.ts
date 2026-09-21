import { connect as tlsConnect, type TLSSocket } from 'node:tls';
import { connect as http2Connect, type ClientHttp2Session } from 'node:http2';
import { request as httpsRequest, Agent } from 'node:https';
import { request as httpRequest, type ClientRequest, type IncomingMessage } from 'node:http';
import { isIP } from 'node:net';
import { gunzipSync, inflateSync, brotliDecompressSync } from 'node:zlib';

const MAX_BODY = 8 * 1024 * 1024;
export class TransportError extends Error {
  constructor(readonly kind: 'tls' | 'protocol' | 'network' | 'payload', message: string) { super(message); }
}
function transportError(error: unknown): Error {
  if (error instanceof TransportError) return error;
  const code = String((error as NodeJS.ErrnoException)?.code ?? '');
  const message = error instanceof Error ? error.message : String(error);
  return new TransportError(/CERT|SSL|TLS|SELF_SIGNED|VERIFY_LEAF/.test(code) ? 'tls' : /HTTP2|ALPN|HPE_/.test(code) ? 'protocol' : 'network', `${code ? `${code}: ` : ''}${message}`);
}

// One bounded request, no redirects/retries here: scheduling owns every origin.
// Each request owns and closes its TLS socket / HTTP2 session on all exit paths.
export function nativeHttpRequest(urlText: string, init: { signal: AbortSignal; headers: Record<string, string> }): Promise<Response> {
  return new Promise((resolve, reject) => {
    let socket: TLSSocket | undefined;
    let session: ClientHttp2Session | undefined;
    let request: ClientRequest | undefined;
    let agent: Agent | undefined;
    let settled = false;
    const chunks: Buffer[] = [];
    let size = 0;
    const finish = (error?: unknown, response?: Response) => {
      if (settled) return;
      settled = true;
      init.signal.removeEventListener('abort', abort);
      request?.destroy(); session?.destroy(); socket?.destroy(); agent?.destroy();
      if (error !== undefined) reject(init.signal.aborted ? init.signal.reason : transportError(error));
      else resolve(response!);
    };
    const abort = () => finish(init.signal.reason ?? new Error('Aborted'));
    if (init.signal.aborted) { abort(); return; }
    init.signal.addEventListener('abort', abort, { once: true });
    const body = (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) finish(new TransportError('payload', 'RDAP response exceeds 8 MiB'));
      else chunks.push(Buffer.from(chunk));
    };
    const end = (status: number, headers: Headers) => {
      if (settled) return;
      try {
        let bytes = Buffer.concat(chunks);
        const encoding = headers.get('content-encoding');
        const options = { maxOutputLength: MAX_BODY };
        if (encoding === 'gzip') bytes = gunzipSync(bytes, options);
        else if (encoding === 'deflate') bytes = inflateSync(bytes, options);
        else if (encoding === 'br') bytes = brotliDecompressSync(bytes, options);
        else if (encoding && encoding !== 'identity') throw new TransportError('payload', `Unsupported content encoding: ${encoding}`);
        headers.delete('content-encoding'); headers.delete('content-length');
        finish(undefined, new Response([204, 205, 304].includes(status) || !bytes.length ? null : bytes, { status, headers }));
      } catch (error) { finish(new TransportError('payload', error instanceof Error ? error.message : String(error))); }
    };
    const receiveHttp1 = (response: IncomingMessage) => {
      response.on('data', body);
      response.on('error', finish);
      response.on('aborted', () => finish(new TransportError('protocol', 'Incomplete HTTP response')));
      response.on('end', () => {
        const headers = new Headers();
        for (const [key, value] of Object.entries(response.headers)) if (value !== undefined) headers.set(key, Array.isArray(value) ? value.join(', ') : value);
        end(response.statusCode!, headers);
      });
    };
    try {
      const url = new URL(urlText);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new TransportError('protocol', 'Unsupported RDAP URL');
      const headers = { ...init.headers, 'accept-encoding': 'gzip, deflate, br' };
      if (url.protocol === 'http:') {
        request = httpRequest(url, { headers, agent: false }, receiveHttp1);
        request.on('error', finish); request.end(); return;
      }
      socket = tlsConnect({ host: url.hostname, port: Number(url.port || 443), servername: isIP(url.hostname) ? undefined : url.hostname, ALPNProtocols: ['h2', 'http/1.1'], rejectUnauthorized: true });
      socket.on('error', finish);
      socket.once('secureConnect', () => {
        if (settled) return;
        try {
          if (socket!.alpnProtocol === 'h2') {
            session = http2Connect(url.origin, { createConnection: () => socket! });
            session.on('error', finish);
            const stream = session.request({ ':method': 'GET', ':path': url.pathname + url.search, ...Object.fromEntries(Object.entries(headers).map(([k,v]) => [k.toLowerCase(), v])) });
            let status = 0; const responseHeaders = new Headers();
            stream.on('response', values => {
              status = Number(values[':status']);
              for (const [key, value] of Object.entries(values)) if (!key.startsWith(':') && value !== undefined) responseHeaders.set(key, Array.isArray(value) ? value.join(', ') : String(value));
            });
            stream.on('data', body); stream.on('error', finish);
            stream.on('end', () => end(status, responseHeaders));
            stream.on('close', () => { if (!settled) finish(new TransportError('protocol', 'Incomplete HTTP/2 response')); });
            session.on('close', () => { if (!settled) finish(new TransportError('protocol', 'HTTP/2 session closed before response')); });
            stream.end();
          } else {
            agent = new Agent({ keepAlive: false });
            agent.createConnection = () => socket!;
            request = httpsRequest(url, { headers, agent }, receiveHttp1);
            request.on('error', finish); request.end();
          }
        } catch (error) { finish(error); }
      });
    } catch (error) { finish(error); }
  });
}

export const rdapTransport = { request: nativeHttpRequest };
