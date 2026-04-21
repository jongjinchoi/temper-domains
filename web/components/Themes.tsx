import { THEMES } from "@/lib/temper-data";
import styles from "./Themes.module.css";

export default function Themes() {
  return (
    <section className="sec" id="themes">
      <div className="sec-head">
        <h2>
          Seven <em>moods.</em>
        </h2>
        <div className="dek">
          // pick one with <code>temper config theme &lt;name&gt;</code>
        </div>
      </div>

      <div className={styles.snaps}>
        {THEMES.map((theme) => {
          const { bg, fg, accent, ok, tk, mu } = theme.palette;
          return (
            <div key={theme.key} className={styles.snap}>
              <div
                className={styles.snapPreview}
                style={{ background: bg, color: fg }}
              >
                <span style={{ color: accent }}>$</span> temper search havenforge
                {"\n"}
                <span style={{ color: mu }}>{"  "}15 TLDs · 1.5s</span>
                {"\n\n"}
                <span style={{ color: tk }}>{"  "}havenforge.com  ✗</span>
                {"\n"}
                <span style={{ color: ok }}>{"  "}havenforge.io   ✓</span>
                {"\n"}
                <span style={{ color: ok }}>{"  "}havenforge.dev  ✓</span>
                {"\n"}
                <span style={{ color: ok }}>{"  "}havenforge.app  ✓</span>
                {"\n"}
                <span style={{ color: mu }}>{"  "}─ 11 · 4 taken</span>
              </div>
              <div className={styles.snapLabel}>
                <strong>{theme.label}</strong>
                <span>{theme.desc}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
