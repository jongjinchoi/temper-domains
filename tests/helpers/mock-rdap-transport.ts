import { rdapTransport } from '../../src/checker/http-transport.ts';
// Parser/scheduler integration tests control HTTP responses. Real TLS/ALPN
// transport checks run separately in tests/transport/runner.mjs on Bun and Node.
rdapTransport.request = (url, init) => fetch(url, { ...init, redirect: 'manual' });
