import { DEFAULT_TLDS_COUNT, EXTENDED_TLDS_COUNT, MCP_TOOLS } from "@/lib/temper-data";
import CopyInstall from "./CopyInstall";
import DemoTerminal from "./DemoTerminal";
import styles from "./Hero.module.css";

export default function Hero() {
  return (
    <header className={styles.hero}>
      <span className={styles.eyebrow}>For developers naming their next side project</span>
      <h1 className={styles.headline}>
        Name it. <em>Check the domain.</em> Stay in the terminal.
      </h1>
      <p className={styles.lede}>
        One command checks {DEFAULT_TLDS_COUNT} TLDs. Press <kbd>s</kbd> for name variations when .com is
        taken, and enter to open the registrar you pick — only when you&apos;re ready.
      </p>
      <DemoTerminal />
      <div className={styles.installRow}>
        <CopyInstall label="Copy install command" />
        <a className={styles.alt} href="#install">npm · npx · binaries →</a>
      </div>
      <div className={styles.facts}>
        <span><b>{DEFAULT_TLDS_COUNT}</b> TLDs by default</span>
        <span><b>{EXTENDED_TLDS_COUNT}</b> with --extended</span>
        <span><b>{MCP_TOOLS.length}</b> MCP tools</span>
        <span><b>0</b> telemetry in CLI/MCP</span>
        <span>AGPL-3.0-only</span>
      </div>
    </header>
  );
}
