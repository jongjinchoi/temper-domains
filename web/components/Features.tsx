import type { ReactNode } from "react";
import {
  EXTENDED_TLDS_COUNT,
  INSTALL_CMD,
  THEMES,
} from "@/lib/temper-data";
import styles from "./Features.module.css";

interface Feature {
  badge: string;
  title: string;
  body: ReactNode;
  dark?: boolean;
}

const FEATURES: Feature[] = [
  {
    badge: "№ 01 / PRIVACY",
    title: "Private by default.",
    body: "Every query runs on your machine. No server, no logs, no tracking. Ever.",
  },
  {
    badge: "№ 02 / SPEED",
    title: "Fast.",
    body: (
      <>
        30 TLDs in under 2 seconds. {EXTENDED_TLDS_COUNT} with{" "}
        <code>--extended</code>.
      </>
    ),
  },
  {
    badge: "№ 03 / AI",
    title: "MCP native.",
    body: "Claude Code, Claude Desktop, Cursor — query temper directly.",
  },
  {
    badge: "№ 04 / INPUT",
    title: "Keyboard-first.",
    body: "Vim nav. Single-key registrar select. Hit enter to buy.",
  },
  {
    badge: "№ 05 / OUTPUT",
    title: "Pipe-friendly.",
    body: (
      <>
        <code>--format json</code> pipes into jq, grep, any shell script.
      </>
    ),
  },
  {
    badge: "№ 06 / STYLE",
    title: "Themeable.",
    body: `${THEMES.length} built-in themes — 5 dark, 2 light. Or write your own.`,
  },
  {
    badge: "№ 07 / LICENSE",
    title: "Open source.",
    body: "Apache 2.0. Zero telemetry. Read every line before you run it.",
  },
  {
    badge: "∞ / INSTALL",
    title: "One command.",
    body: <code>{INSTALL_CMD}</code>,
    dark: true,
  },
];

export default function Features() {
  return (
    <section className="sec" id="features">
      <div className="sec-head">
        <h2>
          Seven <em>facts</em> about temper.
        </h2>
        <div className="dek">
          Opinionated defaults. No configuration required.
        </div>
      </div>

      <div className={styles.feats}>
        {FEATURES.map((f) => (
          <div
            key={f.badge}
            className={`${styles.ftCard} ${f.dark ? styles.ftCardDark : ""}`.trim()}
          >
            <span className={styles.badge}>{f.badge}</span>
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
