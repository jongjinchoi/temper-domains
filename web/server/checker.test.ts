import { afterEach, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { GET } from "../app/api/check/route.ts";
const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });
function installFetch(hold = false) {
  let aborted = false;
  let started = false;
  globalThis.fetch = (async (input: unknown, init?: RequestInit) => {
    if (String(input).includes("data.iana.org")) return Response.json({ services: [[["com", "net"], [`https://${crypto.randomUUID()}.test/`]]] });
    started = true;
    if (!hold) return new Response(null, { status: 404 });
    return new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener("abort", () => { aborted = true; reject(init.signal!.reason); }, { once: true });
    });
  }) as unknown as typeof fetch;
  return { get aborted() { return aborted; }, get started() { return started; } };
}
test("route streams rows plus measured answer coverage", async () => {
  installFetch();
  const response = await GET(new NextRequest("http://localhost/api/check/?name=sample&tlds=com,net"));
  const messages = (await response.text()).trim().split("\n").map(line => JSON.parse(line));
  expect(messages.slice(0, 2).every(row => row.status === "available")).toBe(true);
  expect(messages[2]).toMatchObject({ done: true, summary: { requested: 2, attempted: 2, answered: 2, unresolved: 0 } });
  expect(messages[2].elapsed).toBeGreaterThanOrEqual(290);
});
test("cancelling the response stream aborts its network lookup", async () => {
  const state = installFetch(true);
  const response = await GET(new NextRequest("http://localhost/api/check/?name=sample&tlds=com"));
  const reader = response.body!.getReader();
  const until = Date.now() + 1000;
  while (!state.started && Date.now() < until) await Bun.sleep(5);
  expect(state.started).toBe(true);
  await reader.cancel();
  await Bun.sleep(10);
  expect(state.aborted).toBe(true);
});
