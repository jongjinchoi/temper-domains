import "./home.ts";
const realNow = Date.now;
let now = realNow();
Date.now = () => now;
let revision = 1;
let calls = 0;
globalThis.fetch = (async () => {
  calls++;
  return Response.json({ services: [[["com"], [`https://revision-${revision}.test/`]]] }, {
    headers: { "cache-control": "max-age=10", age: "9", etag: `"${revision}"` },
  });
}) as unknown as typeof fetch;
const cli = await import("../../src/checker/bootstrap.ts");
const web = await import("../../web/server/bootstrap.ts");
await cli.getBootstrap();
await web.getBootstrap();
now += 2000;
revision = 2;
console.log(JSON.stringify({ cli: (await cli.getBootstrap()).get("com"), web: (await web.getBootstrap()).get("com"), calls }));
Date.now = realNow;
