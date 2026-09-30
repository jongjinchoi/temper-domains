// Diagnostic only, never a pass/fail check: how this runtime reaches a server that
// listens on 127.0.0.1 alone when it is addressed as "localhost". Stays on loopback.
import dns from 'node:dns';
import http from 'node:http';
import net from 'node:net';
import tls from 'node:tls';

const report = (label, value) => console.log(`${label}: ${value}`);
const describe = error => `error ${error.code ?? error.name}: ${error.message}`;

report('runtime', `${process.versions.bun ? `bun ${process.versions.bun}` : `node ${process.versions.node}`} on ${process.platform}`);
report('lookup localhost', await dns.promises.lookup('localhost', { all: true }).then(JSON.stringify, describe));
report('autoSelectFamily default', typeof net.getDefaultAutoSelectFamily === 'function' ? net.getDefaultAutoSelectFamily() : 'unavailable');

// The server closes every connection at once: an attempt that reaches it fails
// above TCP, and one that does not reports a refused connection.
const server = net.createServer(socket => { socket.on('error', () => {}); socket.end(); });
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

const attempt = start => new Promise(resolve => {
  let finish = value => resolve(value);
  const timer = setTimeout(() => finish('no result within 3s'), 3000);
  const target = start(value => finish(value));
  finish = value => { clearTimeout(timer); target.destroy(); resolve(value); };
  target.on('error', error => finish(describe(error)));
});

report('net.connect default', await attempt(done => {
  const socket = net.connect({ host: 'localhost', port });
  return socket.on('connect', () => done(`connected to ${socket.remoteAddress}`));
}));
report('net.connect autoSelectFamily=false', await attempt(done => {
  const socket = net.connect({ host: 'localhost', port, autoSelectFamily: false });
  return socket.on('connect', () => done(`connected to ${socket.remoteAddress}`));
}));
// Same options as the RDAP transport. Anything other than a refused connection means TCP connected.
report('tls.connect', await attempt(done => {
  const socket = tls.connect({ host: 'localhost', port, servername: 'localhost', ALPNProtocols: ['h2', 'http/1.1'], rejectUnauthorized: true });
  return socket.on('secureConnect', () => done('secure connection established'));
}));
report('http.request agent=false', await attempt(done => {
  const request = http.request(`http://localhost:${port}/`, { agent: false }, response => done(`HTTP ${response.statusCode}`));
  request.end();
  return request;
}));

server.close();
