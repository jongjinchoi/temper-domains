import type { ReactNode } from "react";
import { COMMANDS, KEYMAP } from "@/lib/temper-data";
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
      <div className="sec-head">
        <h2>
          The <em>reference</em> card.
        </h2>
        <div className="dek">Everything temper does, on one page. Tear it out.</div>
      </div>

      <div className={styles.tickets}>
        {COMMANDS.map((cmd) => (
          <div key={cmd.slot} className={styles.tkCard}>
            <div className={styles.stub}>{cmd.slot}</div>
            <div className={styles.body}>
              <div className={styles.sig}>
                <span className={styles.sigF}>temper</span> {cmd.sig.cmd}
                {cmd.sig.arg && (
                  <>
                    {" "}
                    <span className={styles.sigArg}>{cmd.sig.arg}</span>
                  </>
                )}
              </div>
              <div className={styles.d}>{renderDesc(cmd.desc)}</div>
              <div className={styles.ex}>{cmd.example}</div>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.keysRow}>
        <span className={styles.keysLabel}>KEYS →</span>
        {KEYMAP.map((k) => (
          <span key={k.keys.join("+")}>
            {k.keys.map((key) => (
              <kbd key={key}>{key}</kbd>
            ))}{" "}
            {k.action}
          </span>
        ))}
      </div>
    </section>
  );
}
