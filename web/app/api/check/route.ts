import type { NextRequest } from "next/server";
import { EXTENDED_TLDS } from "../../../../src/checker/types.ts";
import { isValidDomainLabel } from "../../../../src/utils/validate.ts";
import { checkDomains } from "@/server/checker";
import { PLAYGROUND_TLDS } from "@/lib/temper-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_TLDS = new Set<string>(EXTENDED_TLDS);
const MAX_TLDS_PER_REQUEST = 20;

type ParsedTlds =
  | { kind: "default" }
  | { kind: "explicit"; tlds: readonly string[] }
  | { kind: "invalid" };

function parseTlds(raw: string | null): ParsedTlds {
  if (raw === null) return { kind: "default" };
  const parts = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0 || parts.length > MAX_TLDS_PER_REQUEST) {
    return { kind: "invalid" };
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tld of parts) {
    if (!ALLOWED_TLDS.has(tld)) return { kind: "invalid" };
    if (seen.has(tld)) continue;
    seen.add(tld);
    out.push(tld);
  }
  return { kind: "explicit", tlds: out };
}

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("name") ?? "";
  const name = raw.trim().toLowerCase();
  if (!isValidDomainLabel(name)) {
    return new Response(JSON.stringify({ error: "invalid domain label" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const parsed = parseTlds(req.nextUrl.searchParams.get("tlds"));
  if (parsed.kind === "invalid") {
    return new Response(JSON.stringify({ error: "invalid tlds" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  const tldsToQuery: readonly string[] =
    parsed.kind === "explicit" ? parsed.tlds : PLAYGROUND_TLDS;

  const start = performance.now();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (obj: unknown) =>
        controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      try {
        for await (const row of checkDomains(name, tldsToQuery, {
          concurrency: tldsToQuery.length,
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
