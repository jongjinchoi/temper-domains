import { access, readFile, realpath, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { FORMULA, parseBrewInfo, RELEASE_PAGE, type ReleaseChannel } from "./versions.ts";
import { runProcess, type Invocation, type ProcessOptions } from "./process.ts";

interface Base { identity: string; entry: string; guidance: string; channel?: ReleaseChannel }
export type Installation =
  | (Base & { kind: "npm"; channel: "npm"; npm: Invocation; node: string; prefix: string; root: string })
  | (Base & { kind: "homebrew"; channel: "homebrew"; brew: string; rack: string })
  | (Base & { kind: "manual" });
export type Query = (command: Invocation, options?: ProcessOptions) => Promise<{ stdout: string; stderr: string }>;

export const brewReadEnvironment = (): NodeJS.ProcessEnv => ({ ...process.env, HOMEBREW_NO_AUTO_UPDATE: "1", HOMEBREW_NO_ANALYTICS: "1", NONINTERACTIVE: "1" });

export async function findExecutable(name: string): Promise<string | null> {
  const extensions = process.platform === "win32" ? [".exe", ".cmd", ""] : [""];
  for (const folder of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    for (const ext of extensions) {
      const candidate = resolve(folder, name + ext);
      try {
        await access(candidate, process.platform === "win32" ? constants.F_OK : constants.X_OK);
        if ((await stat(candidate)).isFile()) return await realpath(candidate);
      } catch { /* Continue to the next PATH candidate. */ }
    }
  }
  return null;
}

export async function currentEntry(): Promise<string> {
  if (process.argv[1]) {
    try { return await realpath(resolve(process.argv[1])); } catch { /* Compiled Bun entry is virtual. */ }
  }
  return realpath(process.execPath);
}

async function packageRoot(entry: string, name: string): Promise<string | null> {
  let directory = dirname(entry);
  while (true) {
    try {
      const pkg = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
      if (pkg.name === name) return directory;
    } catch { /* Not a matching package directory. */ }
    const parent = dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

// Invoke npm's verified JS entry with Node, including on Windows (no .cmd shell).
export async function npmInvocation(node: string | null): Promise<Invocation | null> {
  if (!node) return null;
  const executable = await findExecutable("npm");
  if (!executable) return null;
  const candidates = [executable, join(dirname(executable), "node_modules", "npm", "bin", "npm-cli.js")];
  for (const candidate of candidates) {
    try {
      const canonical = await realpath(candidate);
      const root = await packageRoot(canonical, "npm");
      if (root && canonical === await realpath(join(root, "bin", "npm-cli.js"))) return { file: node, args: [canonical] };
    } catch { /* Unknown wrapper: do not interpret or execute it. */ }
  }
  return null;
}

export function isWithin(path: string, parent: string): boolean {
  const suffix = relative(parent, path);
  return suffix !== "" && suffix !== ".." && !suffix.startsWith(`..${sep}`) && !isAbsolute(suffix);
}

interface DetectionOptions {
  signal: AbortSignal;
  entry?: string;
  node?: string | null;
  npm?: Invocation | null;
  brew?: string | null;
  query?: Query;
}

export async function detectInstallation(options: DetectionOptions): Promise<Installation> {
  const { signal } = options;
  const query = options.query ?? runProcess;
  signal.throwIfAborted();
  const entry = await realpath(options.entry ?? await currentEntry());
  const manual = (guidance: string, channel?: ReleaseChannel): Installation => ({ kind: "manual", identity: `manual:${entry}`, entry, guidance, channel });
  const root = await packageRoot(entry, "temper-domains");
  if (root) {
    const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    const bin = typeof pkg.bin === "string" ? pkg.bin : pkg.bin?.temper;
    if (typeof bin !== "string" || await realpath(resolve(root, bin)).catch(() => "") !== entry) {
      return manual("This is a source checkout. Update the checkout using its development workflow.");
    }
    if (root.split(sep).includes("_npx")) return manual("Run the latest version with: npx -y temper-domains@latest <command>", "npm");
    const node = options.node === undefined ? (process.versions.bun ? await findExecutable("node") : await realpath(process.execPath)) : options.node;
    const npm = options.npm === undefined ? await npmInvocation(node) : options.npm;
    if (node && npm) {
      try {
        const [rootResult, prefixResult] = await Promise.all([
          query({ file: npm.file, args: [...npm.args, "root", "--global"] }, { signal }),
          query({ file: npm.file, args: [...npm.args, "prefix", "--global"] }, { signal }),
        ]);
        signal.throwIfAborted();
        const prefix = await realpath(prefixResult.stdout.trim());
        const globalRoot = await realpath(rootResult.stdout.trim());
        const ownedRoot = await realpath(join(globalRoot, "temper-domains"));
        if (ownedRoot === root && isWithin(globalRoot, prefix) && isWithin(root, globalRoot)) {
          return { kind: "npm", channel: "npm", identity: `npm:${npm.file}:${npm.args[0]}:${prefix}:${root}`, entry, root, node, npm, prefix, guidance: "" };
        }
      } catch (error) { if (signal.aborted) throw error; }
    }
    return manual("This package is local, linked, or its global installer could not be verified. Update it using the package manager for that project or installation.", "npm");
  }
  const brew = options.brew === undefined ? await findExecutable("brew") : options.brew;
  if (brew) {
    try {
      const settings = { signal, env: brewReadEnvironment() };
      const [info, prefix, cellar] = await Promise.all([
        query({ file: brew, args: ["info", "--json=v2", "--formula", FORMULA] }, settings),
        query({ file: brew, args: ["--prefix", "--installed", FORMULA] }, settings),
        query({ file: brew, args: ["--cellar", FORMULA] }, settings),
      ]);
      const parsed = parseBrewInfo(info.stdout);
      const rack = await realpath(cellar.stdout.trim());
      const keg = await realpath(prefix.stdout.trim());
      if (parsed.installed.length > 0 && isWithin(keg, rack) && entry === await realpath(join(keg, "bin", "temper"))) {
        return { kind: "homebrew", channel: "homebrew", identity: `brew:${brew}:${rack}`, entry, rack, brew, guidance: "" };
      }
    } catch (error) { if (signal.aborted) throw error; }
  }
  return manual(`The installation method could not be verified. For downloaded binaries, get the release for your platform at ${RELEASE_PAGE}`);
}
