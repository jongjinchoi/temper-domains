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
    cursor: "# Settings → Tools & Integrations",
    windsurf: "# ~/.codeium/windsurf/mcp_config.json",
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
    <section className="sec" id="mcp">
      <div className="sec-head">
        <h2>
          Let <em>Codex</em> do the <span className="ul">typing.</span>
        </h2>
        <div className="dek">
          // temper speaks MCP over stdio — codex · claude · cursor · windsurf · cline
        </div>
      </div>

      <div className={styles.mcpWrap}>
        <div className={styles.mcpIntro}>
          <h3>
            AI-native, <em>local-only.</em>
          </h3>
          <p>
            temper runs as a local MCP server. Your AI assistant searches
            domains, checks availability, and opens purchase pages — without
            you switching context once.
          </p>
          <p className={styles.muted}>
            When invoked through your local MCP server, temper does not proxy
            requests through a temper-hosted service.
          </p>
          <div className={styles.toolsPill}>
            {MCP_TOOLS.map((tool) => (
              <span key={tool}>{tool}</span>
            ))}
          </div>
        </div>

        <div className={styles.mcpPanel}>
          <div className={styles.mcpTabs}>
            {TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
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
        </div>
      </div>
    </section>
  );
}
