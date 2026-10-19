import { INSTALL_METHODS, THEMES } from "@/lib/temper-data";
import styles from "./Install.module.css";

export default function Install() {
  return (
    <section className="sec" id="install">
      <h2 className="center">Install in one line.</h2>
      <p className="sub center">Free and open source. No account. macOS, Linux and Windows.</p>
      <div className={styles.inst}>
        {INSTALL_METHODS.map((method) => (
          <div key={method.title} className={styles.card}>
            <h3>{method.title}</h3>
            <p>{method.note}</p>
            {method.command ? (
              <pre>{method.command}</pre>
            ) : (
              <a className={styles.link} href={method.href} target="_blank" rel="noopener noreferrer">
                GitHub releases →
              </a>
            )}
          </div>
        ))}
      </div>
      <div className={styles.themes} aria-label="Built-in themes">
        {THEMES.map((theme) => (
          <span
            key={theme.key}
            className={styles.theme}
            style={{ background: theme.palette.bg, color: theme.palette.fg }}
            title={theme.desc}
          >
            <i style={{ background: theme.palette.accent }} aria-hidden="true" />
            {theme.label}
          </span>
        ))}
      </div>
      <p className={styles.themesCap}>
        {THEMES.length} themes · pick one with <code>temper init</code> or <code>temper config theme &lt;name&gt;</code>
      </p>
    </section>
  );
}
