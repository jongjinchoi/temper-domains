import { gzipSync } from 'node:zlib';
import { createSecureServer } from 'node:http2';
import { createServer } from 'node:https';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
const dir = await mkdtemp(join(tmpdir(), 'temper-tls-'));
await writeFile(join(dir,'openssl.cnf'), '[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=localhost\n[ext]\nsubjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=critical,CA:TRUE\n');
execFileSync('openssl', ['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(dir,'key.pem'),'-out',join(dir,'cert.pem'),'-days','1','-config',join(dir,'openssl.cnf')], {stdio:'ignore'});
const credentials={key:await readFile(join(dir,'key.pem')),cert:await readFile(join(dir,'cert.pem'))};
let h1;
const handler = (req,res) => {
  const domain = decodeURIComponent(req.url.split('/').at(-1));
  if (domain.startsWith('stall')) return;
  if (domain.startsWith('denied')) { res.writeHead(403); res.end(); return; }
  if (domain.startsWith('broken')) { res.writeHead(200,{'content-encoding':'gzip'}); res.end('invalid compressed response'); return; }
  if (domain.startsWith('redirect')) { res.writeHead(302,{location:`https://localhost:${h1.address().port}/domain/unused.com`}); res.end(); return; }
  if (domain.startsWith('downgrade')) { res.writeHead(302,{location:'http://localhost/domain/unused.com'}); res.end(); return; }
  if (domain.startsWith('limit')) { res.writeHead(429,{'retry-after':'60'}); res.end(); return; }
  if (domain.startsWith('unavailable')) { res.writeHead(503,{'retry-after':'60'}); res.end(); return; }
  if (domain.startsWith('taken')) { res.writeHead(200,{'content-encoding':'gzip'}); res.end(gzipSync(JSON.stringify({objectClassName:'domain',ldhName:domain}))); return; }
  res.writeHead(404);res.end();
};
const h2=createSecureServer({...credentials,allowHTTP1:true}, (req,res)=>{
  if(req.httpVersionMajor!==2) {res.writeHead(426);res.end();return;}
  handler(req,res);
});
h1=createServer(credentials, handler);
for (const server of [h2,h1]) await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
try {
  execFileSync('bun', ['build','tests/transport/worker.ts','--target=node',`--outfile=${join(dir,'worker.mjs')}`]);
  for (const runtime of ['bun','node']) {
    const code=await new Promise(resolve=>{
      const child=spawn(runtime,[runtime === 'node' ? join(dir,'worker.mjs') : 'tests/transport/worker.ts'],{stdio:'inherit',env:{...process.env,NODE_EXTRA_CA_CERTS:join(dir,'cert.pem'),TRANSPORT_H2:`https://localhost:${h2.address().port}`,TRANSPORT_H1:`https://localhost:${h1.address().port}`}});
      child.on('exit',resolve);
    });
    if(code!==0) throw new Error(`${runtime} transport checks failed`);
    const rejected=await new Promise(resolve=>{
      const env={...process.env,TRANSPORT_REJECT_CERT:'1',TRANSPORT_H2:`https://localhost:${h2.address().port}`};
      delete env.NODE_EXTRA_CA_CERTS;
      spawn(runtime,[runtime === 'node' ? join(dir,'worker.mjs') : 'tests/transport/worker.ts'],{stdio:'inherit',env}).on('exit',resolve);
    });
    if(rejected!==0) throw new Error(`${runtime} certificate rejection failed`);
  }
} finally { for(const server of [h2,h1]) server.close(); await rm(dir,{recursive:true,force:true}); }
