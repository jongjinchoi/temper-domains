import { getBootstrap, getRdapMatch } from "./bootstrap.ts";
import { getServerLimit } from "./limiter.ts";
import { enrichDomainDetail, getDomainInputError } from "./policy.ts";
import { rdapDetail } from "./rdap.ts";
import type { CheckMethod, DomainDetail } from "./types.ts";
import { sanitizeDomain } from "../utils/validate.ts";
import { whoisDetail } from "./whois.ts";

export async function domainDetail(
  domain: string,
  options: { timeoutMs?: number } = {},
): Promise<DomainDetail> {
  const { timeoutMs = 10000 } = options;
  domain = sanitizeDomain(domain).toLowerCase();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const inputError = getDomainInputError(domain);
    if (inputError) {
      return {
        domain,
        status: "error",
        method: "rdap",
        responseTime: 0,
        error: inputError,
      };
    }

    await getBootstrap();
    const { rdapKey, rdapUrl } = getRdapMatch(domain);
    const method: CheckMethod = rdapUrl ? "rdap" : "whois";

    try {
      if (rdapUrl) {
        const serverLimit = getServerLimit(rdapUrl);
        const detail = await serverLimit(() =>
          rdapDetail(domain, rdapUrl, controller.signal),
          controller.signal,
        );
        return enrichDomainDetail(detail, rdapKey);
      }
      const detail = await whoisDetail(domain, controller.signal, timeoutMs);
      return enrichDomainDetail(detail, rdapKey);
    } catch (err) {
      return enrichDomainDetail({
        domain,
        status: controller.signal.aborted ? "slow" : "error",
        method,
        responseTime: 0,
        error: err instanceof Error ? err.message : String(err),
      }, rdapKey);
    }
  } catch (err) {
    return enrichDomainDetail({
      domain,
      status: controller.signal.aborted ? "slow" : "error",
      method: "rdap",
      responseTime: 0,
      error: err instanceof Error ? err.message : String(err),
    });
  } finally {
    clearTimeout(timeout);
  }
}
