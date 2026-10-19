"use client";

import { type ReactNode, useState } from "react";
import { MCP_TOOLS } from "@/lib/temper-data";
import styles from "./Mcp.module.css";

type Client = "codex" | "claude-code" | "claude-desktop" | "cursor" | "windsurf";

const TABS: { key: Client; label: string }[] = [
  { key: "codex", label: "Codex" },
  { key: "claude-code", label: "Claude Code" },
  { key: "claude-desktop", label: "Desktop" },
  { key: "cursor", label: "Cursor" },
  { key: "windsurf", label: "Windsurf" },
];

function Snippet({ client }: { client: Client }): ReactNode {
  const mu = (text: string) => <span className={styles.mu}>{text}</span>;
  const pr = () => <span className={styles.pr}>$</span>;
  const k = (text: string) => <span className={styles.k}>{text}</span>;

  if (client === "codex") {
    return (
      <>
        {mu("# Codex CLI / IDE extension")}
        {"\n"}
        {pr()} codex mcp add temper -- temper mcp
        {"\n\n"}
        {mu("# or ~/.codex/config.toml")}
        {"\n"}
        [mcp_servers.temper]
        {"\n"}
        {k("command")} = "temper"
        {"\n"}
        {k("args")} = ["mcp"]
        {"\n\n"}
        {mu("# in the Codex TUI")}
        {"\n"}
        {pr()} /mcp
      </>
    );
  }

  if (client === "claude-code") {
    return (
      <>
        {mu("# all projects (recommended)")}
        {"\n"}
        {pr()} claude mcp add {k("--scope")} user \
        {"\n"}
        {"    "}
        {k("--transport")} stdio temper \
        {"\n"}
        {"    "}-- temper mcp
        {"\n\n"}
        {mu("# current folder only")}
        {"\n"}
        {pr()} claude mcp add {k("--transport")} stdio temper \
        {"\n"}
        {"    "}-- temper mcp
      </>
    );
  }

  const header: Record<Exclude<Client, "codex" | "claude-code">, string> = {
    "claude-desktop": "# Settings → Developer → Edit Config",
    cursor: "# .cursor/mcp.json or ~/.cursor/mcp.json",
    windsurf: "# Open your client's MCP configuration",
  };

  return (
    <>
      {mu(header[client])}
      {"\n"}
      {"{"}
      {"\n"}
      {"  "}
      {k('"mcpServers"')}: {"{"}
      {"\n"}
      {"    "}
      {k('"temper"')}: {"{"}
      {"\n"}
      {client === "cursor" && <>{"      "}{k('"type"')}: "stdio",{"\n"}</>}
      {"      "}
      {k('"command"')}: "temper",
      {"\n"}
      {"      "}
      {k('"args"')}: ["mcp"]
      {"\n"}
      {"    "}
      {"}"}
      {"\n"}
      {"  "}
      {"}"}
      {"\n"}
      {"}"}
    </>
  );
}

export default function Mcp() {
  const [active, setActive] = useState<Client>("codex");

  return (
    <section className="sec" id="ai">
      <div className={styles.ai}>
        <div>
          <h2>
            Your AI names it.
            <br />
            <em>temper checks it.</em>
          </h2>
          <p className={styles.lead}>
            <code>temper mcp</code> runs a local MCP server. Your AI assistant searches
            domains, discovers extensions by industry, purpose or region, and
            checks only the extensions you choose. On request, it can resume exact
            unresolved candidates while respecting server waits, or open registrar pages.
          </p>
          <div className={styles.flow}>
            <div><b>1</b><span>&ldquo;8 names for a habit tracker — check .com and .app&rdquo; <i>(example prompt)</i></span></div>
            <div><b>2</b><span>It calls temper&apos;s tools on your machine, for the extensions you asked for.</span></div>
            <div><b>3</b><span>You see what&apos;s free, and <code>open_registrar</code> opens the page you pick.</span></div>
          </div>
          <p className={styles.muted}>
            When invoked through your local MCP server, temper does not proxy
            requests through a temper-hosted service.
          </p>
        </div>

        <div>
          <div className={styles.mcpTabs} role="tablist" aria-label="MCP client">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active === tab.key}
                className={active === tab.key ? styles.active : ""}
                onClick={() => setActive(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <pre className={styles.mcpCode}>
            <Snippet client={active} />
          </pre>
          {active === "windsurf" && (
            <p className={styles.muted}>
              Follow the <a href="https://docs.windsurf.com/windsurf/cascade/mcp">client MCP instructions</a> for
              your installed version. The documentation currently redirects to Devin Desktop;
              its configuration path may differ from older Windsurf versions.
            </p>
          )}
          <div className={styles.toolsPill}>
            {MCP_TOOLS.map((tool) => (
              <span key={tool}>{tool}</span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
