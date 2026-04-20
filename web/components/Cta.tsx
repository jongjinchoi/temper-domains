import { GITHUB_URL } from "@/lib/temper-data";
import styles from "./Cta.module.css";

export default function Cta() {
  return (
    <section className={styles.cta}>
      <h2>
        Forged in the
        <br />
        <em>terminal.</em> 🔥
      </h2>
      <p>
        Open source, Apache 2.0. If temper saves you a tab, give it a star.
        Issues and pull requests welcome.
      </p>
      <div className={styles.btns}>
        <a
          className={`${styles.btn} ${styles.primary}`}
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          ★ Star on GitHub
        </a>
        <a
          className={`${styles.btn} ${styles.ghost}`}
          href={`${GITHUB_URL}#contributing`}
          target="_blank"
          rel="noopener noreferrer"
        >
          → Contribute
        </a>
        <a
          className={`${styles.btn} ${styles.ghost}`}
          href={`${GITHUB_URL}/issues`}
          target="_blank"
          rel="noopener noreferrer"
        >
          → Report an issue
        </a>
      </div>
    </section>
  );
}
