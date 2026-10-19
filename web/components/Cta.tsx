import { GITHUB_URL } from "@/lib/temper-data";
import CopyInstall from "./CopyInstall";
import styles from "./Cta.module.css";

export default function Cta() {
  return (
    <section className={styles.cta}>
      <h2>Name your next project tonight.</h2>
      <p className="sub center">Then go build it. Open source, AGPL-3.0-only.</p>
      <div className={styles.row}>
        <CopyInstall label="Copy the Homebrew command" />
      </div>
      <div className={styles.links}>
        <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">★ Star on GitHub</a>
        <a href={`${GITHUB_URL}/issues`} target="_blank" rel="noopener noreferrer">Report an issue</a>
      </div>
    </section>
  );
}
