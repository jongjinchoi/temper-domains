import {
  AUTHOR_OSS,
  AUTHOR_PRODUCTS,
  AUTHOR_URL,
  BUILD_STACK,
  COLOPHON_LOCATION,
  COLOPHON_YEAR,
  TYPEFACES,
  getVersion,
} from "@/lib/temper-data";
import styles from "./Colophon.module.css";

export default function Colophon() {
  const version = getVersion();
  return (
    <section className={styles.colophon} aria-labelledby="colophon-hd">
      <div className={styles.mastheadRow}>
        <h2 id="colophon-hd" className={styles.masthead}>
          // COLOPHON
        </h2>
        <span className={styles.issue}>
          v{version} · {COLOPHON_LOCATION} · {COLOPHON_YEAR}
        </span>
      </div>

      <div className={styles.cols}>
        <div>
          <div className={styles.colHd}>TYPESET IN</div>
          <div className={styles.colBody}>
            {TYPEFACES.map((t, i) => (
              <span key={t}>
                {t}
                {i < TYPEFACES.length - 1 && <br />}
              </span>
            ))}
          </div>
        </div>

        <div>
          <div className={styles.colHd}>BUILT WITH</div>
          <div className={styles.colBody}>
            {BUILD_STACK.map((s, i) => (
              <span key={s}>
                {s}
                {i < BUILD_STACK.length - 1 && <br />}
              </span>
            ))}
          </div>
        </div>

        <div>
          <div className={styles.colHd}>MADE BY</div>
          <div className={styles.colBody}>
            <strong>
              <a
                href={AUTHOR_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                @jongjinchoi
              </a>
            </strong>
            <div className={styles.subHd}>PRODUCTS</div>
            {AUTHOR_PRODUCTS.map((p, i) => (
              <span key={p.name}>
                <a href={p.url} target="_blank" rel="noopener noreferrer">
                  {p.name}
                </a>
                {i < AUTHOR_PRODUCTS.length - 1 && " · "}
              </span>
            ))}
            <div className={styles.subHd}>OPEN SOURCE</div>
            {AUTHOR_OSS.map((p, i) => (
              <span key={p.name}>
                <a href={p.url} target="_blank" rel="noopener noreferrer">
                  {p.name}
                </a>
                {i < AUTHOR_OSS.length - 1 && " · "}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
