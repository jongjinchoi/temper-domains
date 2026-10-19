import type { ReactNode } from "react";
import { KEYMAP, LOOP_STEPS } from "@/lib/temper-data";
import styles from "./Loop.module.css";

// Backticked fragments in temper-data.ts render as <code>.
function withCode(text: string): ReactNode {
  return text.split(/(`[^`]+`)/g).map((part, i) =>
    part.startsWith("`") && part.endsWith("`") ? <code key={i}>{part.slice(1, -1)}</code> : <span key={i}>{part}</span>,
  );
}

export default function Loop() {
  return (
    <section className="sec" id="loop">
      <h2 className="center">The naming loop, in one terminal.</h2>
      <p className="sub center">From &ldquo;what should I call it?&rdquo; to the registrar page, without switching windows.</p>
      <div className={styles.loop}>
        {LOOP_STEPS.map((step) => (
          <article key={step.tag} className={styles.step}>
            <div className={styles.tag}>{step.tag}</div>
            <h3>{step.title}</h3>
            <p>{withCode(step.body)}</p>
            <div className={styles.media}>
              <img src={step.media.src} alt={step.media.alt} width={1200} height={700} loading="lazy" />
              <span className={styles.cap}>{step.media.caption}</span>
            </div>
          </article>
        ))}
      </div>
      <p className={styles.note}>Recordings use synthetic lookup responses; they do not show current availability.</p>
      <div className={styles.keys}>
        {KEYMAP.map((k) => (
          <span key={k.keys.join("+")}>
            {k.keys.map((key) => <kbd key={key}>{key}</kbd>)} {k.action}
          </span>
        ))}
      </div>
    </section>
  );
}
