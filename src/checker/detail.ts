import { getBootstrap, getRdapUrl } from "./bootstrap.ts";
import { getServerLimit } from "./limiter.ts";
import { rdapDetail } from "./rdap.ts";
import type { CheckMethod, DomainDetail } from "./types.ts";
import { whoisDetail } from "./whois.ts";
import { getTld } from "../utils/domain.ts";

export async function domainDetail(
  domain: string,
  options: { timeoutMs?: number } = {},
): Promise<DomainDetail> {
  const { timeoutMs = 10000 } = options;
  const tld = getTld(domain);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    await getBootstrap();
    const rdapUrl = getRdapUrl(tld);
    const method: CheckMethod = rdapUrl ? "rdap" : "whois";

    try {
      if (rdapUrl) {
        const serverLimit = getServerLimit(rdapUrl);
        return await serverLimit(() =>
          rdapDetail(domain, rdapUrl, controller.signal),
        );
      }
      return await whoisDetail(domain, controller.signal, timeoutMs);
    } catch (err) {
      return {
        domain,
        status: "error",
        method,
        responseTime: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  } catch (err) {
    return {
      domain,
      status: "error",
      method: "rdap",
      responseTime: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timeout);
  }
}
