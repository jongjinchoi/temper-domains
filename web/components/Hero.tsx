"use client";

import { useState } from "react";
import { DEFAULT_TLDS_COUNT, INSTALL_CMD, getVersion } from "@/lib/temper-data";
import styles from "./Hero.module.css";

export default function Hero() {
  const [copied, setCopied] = useState(false);
  const version = getVersion();

  const handleCopy = () => {
    if (typeof navigator === "undefined") return;
    navigator.clipboard?.writeText(INSTALL_CMD);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

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
            A terminal-first domain search.{" "}
            <strong>{DEFAULT_TLDS_COUNT} TLDs</strong>, under 2 seconds, all
            private. Also an MCP server — so Claude and Cursor can search on
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

        <div className={styles.crt}>
          <span className={styles.crtPrompt}>&gt;</span> temper search dashflow
          {"\n"}
          <span className={styles.crtMuted}>
            {"  "}
            {DEFAULT_TLDS_COUNT} TLDs · 1.4s
          </span>
          {"\n\n"}
          {"  "}dashflow.com{"      "}
          <span className={styles.crtTaken}>[taken]</span>
          {"\n"}
          {"  "}dashflow.io{"       "}
          <span className={styles.crtOk}>[available]</span>
          {"\n"}
          {"  "}dashflow.dev{"      "}
          <span className={styles.crtOk}>[available]</span>
          {"\n"}
          {"  "}dashflow.app{"      "}
          <span className={styles.crtOk}>[available]</span>
          {"\n"}
          {"  "}dashflow.ai{"       "}
          <span className={styles.crtTaken}>[taken]</span>
          {"\n"}
          {"  "}dashflow.co{"       "}
          <span className={styles.crtOk}>[available]</span>
          {"\n"}
          {"  "}dashflow.sh{"       "}
          <span className={styles.crtOk}>[available]</span>
          {"\n\n"}
          <span className={styles.crtMuted}>
            {"  "}── 13 available · 3 taken
          </span>
          <span className={styles.caret} />
        </div>
      </div>
    </header>
  );
}
