import { resolve } from "dns/promises";

export async function dnsCheck(
  domain: string,
): Promise<"available" | "taken" | "error"> {
  try {
    await resolve(domain, "NS");
    return "taken";
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOTFOUND") return "available";
    return "error";
  }
}
