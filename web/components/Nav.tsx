import { GITHUB_URL } from "@/lib/temper-data";
import Monogram from "./Monogram";
import ThemeToggle from "./ThemeToggle";
import styles from "./Nav.module.css";

export default function Nav() {
  return (
    <nav className={styles.nav}>
      <a className={styles.brand} href="#top">
        <Monogram variant="flame" size={24} />
        <span>temper</span>
      </a>
      <div className={styles.navLinks}>
        <a href="#loop">How it works</a>
        <a href="#ai">AI</a>
        <a href="#install">Install</a>
        <a href="#faq">FAQ</a>
      </div>
      <div className={styles.navRight}>
        <ThemeToggle />
        <a className="btn" href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
          ★ GitHub
        </a>
        <a className={`btn fill ${styles.install}`} href="#install">
          Install
        </a>
      </div>
    </nav>
  );
}
