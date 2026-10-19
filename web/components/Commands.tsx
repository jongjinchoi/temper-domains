import type { ReactNode } from "react";
import { COMMANDS } from "@/lib/temper-data";
import styles from "./Commands.module.css";

function renderDesc(desc: string): ReactNode {
  // Transform backticked fragments into <code>. Keeps temper-data.ts plain.
  const parts = desc.split(/(`[^`]+`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i}>{part.slice(1, -1)}</code>;
    }
    return <span key={i}>{part}</span>;
  });
}

export default function Commands() {
  return (
    <section className="sec" id="commands">
      <h2 className="center">Every command, one page.</h2>
      <p className="sub center">Beyond search: details, history, extensions and updates.</p>
      <div className={styles.list}>
        {COMMANDS.map((cmd) => (
          <div key={cmd.slot} className={styles.row}>
            <div className={styles.sig}>
              <span className={styles.sigF}>temper</span> {cmd.sig.cmd}
              {cmd.sig.arg && <span className={styles.sigArg}> {cmd.sig.arg}</span>}
            </div>
            <div className={styles.d}>{renderDesc(cmd.desc)}</div>
            <div className={styles.ex}>{cmd.example}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
