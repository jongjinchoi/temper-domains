import { GITHUB_URL } from "@/lib/temper-data";
import styles from "./Nav.module.css";

export default function Nav() {
  return (
    <nav className={styles.nav}>
      <div className={styles.brand}>
        <span className={styles.monogram} aria-hidden>t</span>
        <span>
          temper <span className={styles.brandSub}>/ domains</span>
        </span>
      </div>
      <div className={styles.navLinks}>
        <a href="#features">features</a>
        <a href="#mcp">mcp</a>
        <a href="#commands">commands</a>
        <a href="#themes">themes</a>
        <a href="#play">demo</a>
      </div>
      <a
        className={styles.navCta}
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
      >
        ★ STAR / 5
      </a>
    </nav>
  );
}
