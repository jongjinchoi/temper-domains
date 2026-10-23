import { mock } from "bun:test";
import { EventEmitter } from "node:events";
import assert from "node:assert/strict";
import net from "node:net";

const response = (domain: string) => domain.startsWith("taken.") ? [
  `Domain Name: ${domain}`,
  "Registrar: Example Registrar",
  "Registry Expiry Date: 2027-09-30T01:00:00Z",
  "Registrant Organization: Private Person",
  "Domain Status: clientTransferProhibited https://icann.org/epp#clientTransferProhibited",
  "Name Server: ns1.example.io",
].join("\r\n") : "NOT FOUND";
mock.module("node:net", () => ({ ...net, createConnection: (_port: number, _host: string, onConnect: () => void) => {
  const socket = Object.assign(new EventEmitter(), {
    write(text: string) {
      queueMicrotask(() => { socket.emit("data", Buffer.from(response(text.trim()))); socket.emit("end"); });
    },
    destroy() {},
  });
  queueMicrotask(onConnect);
  return socket;
} }));
globalThis.fetch = Object.assign(async () => { throw new Error("Public network forbidden"); }, { preconnect() {} });
const { whoisLookup } = await import("../../src/checker/whois.ts");

const plain = await whoisLookup("taken.io", new AbortController().signal, 1000);
const detailed = await whoisLookup("taken.io", new AbortController().signal, 1000, true);
const available = await whoisLookup("free.io", new AbortController().signal, 1000, true);

assert.equal(plain.status, "taken");
for (const key of ["expiryDate", "registrar", "statusCodes", "registrant", "nameServers"]) assert.ok(!(key in plain), `plain has ${key}`);
assert.equal(detailed.status, "taken");
assert.equal(detailed.expiryDate, "2027-09-30T01:00:00.000Z");
assert.equal(detailed.registrar, "Example Registrar");
assert.deepEqual(detailed.statusCodes, ["clientTransferProhibited"]);
for (const key of ["registrant", "nameServers", "rawWhois"]) assert.ok(!(key in detailed), `detailed has ${key}`);
assert.equal(available.status, "available");
for (const key of ["expiryDate", "registrar", "statusCodes"]) assert.ok(!(key in available), `available has ${key}`);
