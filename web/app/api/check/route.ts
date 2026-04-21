import type { NextRequest } from "next/server";
import { isValidDomainLabel } from "../../../../src/utils/validate.ts";
import { checkDomains } from "@/server/checker";
import { PLAYGROUND_TLDS } from "@/lib/temper-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("name") ?? "";
  const name = raw.trim().toLowerCase();
  if (!isValidDomainLabel(name)) {
    return new Response(JSON.stringify({ error: "invalid domain label" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const start = performance.now();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (obj: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      try {
        for await (const row of checkDomains(name, PLAYGROUND_TLDS, {
          concurrency: PLAYGROUND_TLDS.length,
          timeoutMs: 3000,
          signal: req.signal,
        })) {
          write(row);
        }
        write({ done: true, elapsed: Math.round(performance.now() - start) });
      } catch (err) {
        write({ error: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson",
      "cache-control": "no-store",
    },
  });
}
