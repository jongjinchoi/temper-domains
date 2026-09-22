import { parseStableVersion } from "./policy.ts";

export const FORMULA = "jongjinchoi/temper-domains/temper";
export type ReleaseChannel = "npm" | "homebrew";
export const RELEASE_PAGE = "https://github.com/jongjinchoi/temper-domains/releases/latest";

export function parseFormulaVersion(text: string): string {
  const matches = [...text.matchAll(/^\s*version\s+"([^"\r\n]+)"\s*$/gm)];
  const version = matches[0]?.[1];
  if (matches.length !== 1 || !parseStableVersion(version)) throw new Error("The published Homebrew formula has no unambiguous stable version");
  return version!;
}

export function parseBrewInfo(text: string): { version: string; pinned: boolean; installed: string[] } {
  const data = JSON.parse(text);
  const entry = data?.formulae?.length === 1 ? data.formulae[0] : undefined;
  if (entry?.name !== "temper" || entry?.full_name !== FORMULA || entry?.tap !== "jongjinchoi/temper-domains" ||
    !parseStableVersion(entry?.versions?.stable) || typeof entry?.pinned !== "boolean" || !Array.isArray(entry?.installed) ||
    !entry.installed.every((item: { version?: unknown }) => parseStableVersion(item?.version))) {
    throw new Error("Cannot verify the installed Temper Homebrew formula");
  }
  return { version: entry.versions.stable, pinned: entry.pinned, installed: entry.installed.map((item: { version: string }) => item.version) };
}

export type VersionRequest = (url: string, init: RequestInit) => Promise<Response>;
export async function fetchLatestVersion(channel: ReleaseChannel, signal: AbortSignal, request: VersionRequest = fetch): Promise<string> {
  const url = channel === "npm" ? "https://registry.npmjs.org/temper-domains/latest" :
    "https://raw.githubusercontent.com/jongjinchoi/homebrew-temper-domains/HEAD/Formula/temper.rb";
  signal.throwIfAborted();
  const response = await request(url, { signal, redirect: "error", headers: { Accept: channel === "npm" ? "application/json" : "text/plain" } });
  if (!response.ok) throw new Error(`Version check failed (HTTP ${response.status})`);
  // Read with a bound even when the server omits Content-Length.
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Empty version response");
  const decoder = new TextDecoder();
  let text = "";
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      if (text.length > 512 * 1024) throw new Error("Version response is too large");
    }
    text += decoder.decode();
  } finally { await reader.cancel().catch(() => {}); }
  if (channel === "homebrew") return parseFormulaVersion(text);
  const data = JSON.parse(text);
  if (data?.name !== "temper-domains" || !parseStableVersion(data?.version)) throw new Error("Registry returned no valid stable Temper version");
  return data.version;
}
