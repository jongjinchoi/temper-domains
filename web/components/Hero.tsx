"use client";

import { useEffect, useRef, useState } from "react";
import {
  DEFAULT_TLDS_COUNT,
  HERO_DEMO_NAME,
  HERO_DEMO_TLDS,
  INSTALL_CMD,
  getVersion,
} from "@/lib/temper-data";
import { type LiveResult, runLiveSearch } from "@/lib/playground-client";
import styles from "./Hero.module.css";

type HeroState =
  | { kind: "pending" }
  | { kind: "streaming"; rows: (LiveResult | null)[] }
  | { kind: "done"; rows: (LiveResult | null)[]; elapsedMs: number }
  | { kind: "fallback" };

const ROW_PAD = 14;

export default function Hero() {
  const [copied, setCopied] = useState(false);
  const [state, setState] = useState<HeroState>({ kind: "pending" });
  const version = getVersion();

  useEffect(() => {
    const controller = new AbortController();
    const rowsByTld: (LiveResult | null)[] = HERO_DEMO_TLDS.map(() => null);
    setState({ kind: "streaming", rows: [...rowsByTld] });

    void runLiveSearch(
      HERO_DEMO_NAME,
      {
        onRow: (row) => {
          const idx = HERO_DEMO_TLDS.indexOf(row.tld as (typeof HERO_DEMO_TLDS)[number]);
          if (idx < 0) return;
          rowsByTld[idx] = row;
          setState({ kind: "streaming", rows: [...rowsByTld] });
        },
        onDone: (elapsedMs) => {
          setState({ kind: "done", rows: [...rowsByTld], elapsedMs });
        },
        onError: () => {
          setState({ kind: "fallback" });
        },
      },
      controller.signal,
      HERO_DEMO_TLDS,
    );

    return () => controller.abort();
  }, []);

  const handleCopy = () => {
    if (typeof navigator === "undefined") return;
    navigator.clipboard?.writeText(INSTALL_CMD);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const availableCount =
    state.kind === "done"
      ? state.rows.filter((r) => r?.status === "available").length
      : 0;
  const resolvedCount =
    state.kind === "done"
      ? state.rows.filter((r): r is LiveResult => r !== null).length
      : 0;
  const takenCount = resolvedCount - availableCount;

  return (
    <header className={styles.hero}>
      <div className={styles.heroStickers}>
        <span className={`${styles.sticker} ${styles.flame} ${styles.s1}`}>
          NEW · v{version}
        </span>
        <span className={`${styles.sticker} ${styles.navy} ${styles.s2}`}>
          MADE IN GANGHWA
        </span>
        <span className={`${styles.sticker} ${styles.s3}`}>APACHE 2.0</span>
      </div>

      <div className={styles.heroGrid}>
        <div>
          <div className={styles.issueBar}>
            <span>v{version}</span>
            <span>{DEFAULT_TLDS_COUNT} TLDs</span>
            <span>Apache 2.0</span>
          </div>
          <h1 className={styles.headline}>
            Never{" "}
            <span className={styles.headlineStrike}>open a browser</span>
            <br />
            to find a{" "}
            <span className={styles.headlineUnderline}>domain.</span>
            <br />
            Just type &amp; <em className={styles.headlineFlame}>go.</em>
          </h1>
          <p className={styles.lede}>
            temper is a terminal-first domain search CLI —{" "}
            <strong>{DEFAULT_TLDS_COUNT} TLDs</strong> in under 2 seconds, all
            private. Also an MCP server, so Claude and Cursor can search on
            your behalf.
          </p>
          <button
            type="button"
            className={styles.installSticker}
            onClick={handleCopy}
            aria-label="Copy install command"
          >
            <span className={styles.installIc}>▸</span>
            <span>{copied ? "copied ✓" : INSTALL_CMD}</span>
            <span className={styles.copyHint}>(CLICK TO COPY)</span>
          </button>
        </div>

        <div className={styles.crt} role="status" aria-live="polite">
          <span className={styles.crtPrompt}>&gt;</span> temper search{" "}
          {HERO_DEMO_NAME}
          {"\n"}
          <span className={styles.crtMuted}>
            {"  "}
            {state.kind === "done"
              ? `${HERO_DEMO_TLDS.length} TLDs · ${(state.elapsedMs / 1000).toFixed(1)}s`
              : state.kind === "fallback"
                ? "(live check unavailable)"
                : `resolving ${HERO_DEMO_TLDS.length} TLDs...`}
          </span>
          {"\n\n"}

          {state.kind !== "fallback" &&
            HERO_DEMO_TLDS.map((tld, i) => {
              const row =
                state.kind === "pending"
                  ? null
                  : state.rows[i] ?? null;
              return <HeroRow key={tld} tld={tld} row={row} />;
            })}

          {state.kind === "fallback" && (
            <>
              {HERO_DEMO_TLDS.map((tld) => (
                <HeroRow key={tld} tld={tld} row={null} muted />
              ))}
              {"\n"}
              <span className={styles.crtMuted}>
                {"  "}install: {INSTALL_CMD}
              </span>
            </>
          )}

          {state.kind === "done" && (
            <>
              {"\n"}
              <span className={styles.crtMuted}>
                {"  "}──{" "}
              </span>
              <span className={styles.crtOk}>{availableCount} available</span>
              <span className={styles.crtMuted}> · </span>
              <span className={styles.crtTaken}>{takenCount} taken</span>
            </>
          )}
          <span className={styles.caret} />
        </div>
      </div>
    </header>
  );
}

interface HeroRowProps {
  tld: string;
  row: LiveResult | null;
  muted?: boolean;
}

function HeroRow({ tld, row, muted }: HeroRowProps) {
  const domain = `${HERO_DEMO_NAME}.${tld}`;
  const pad = " ".repeat(Math.max(1, ROW_PAD - domain.length));
  if (!row) {
    return (
      <span>
        {"  "}
        {domain}
        {pad}
        <span className={styles.crtPending}>
          {muted ? "[---]" : "… resolving"}
        </span>
        {"\n"}
      </span>
    );
  }
  const available = row.status === "available";
  const errored = row.status === "error" || row.status === "rate_limited";
  const label = available
    ? "[available]"
    : errored || row.status === "slow"
      ? "[---]"
      : "[taken]";
  const cls = available
    ? styles.crtOk
    : errored || row.status === "slow"
      ? styles.crtPending
      : styles.crtTaken;
  return (
    <span>
      {"  "}
      {domain}
      {pad}
      <span className={cls}>{label}</span>
      {"\n"}
    </span>
  );
}
