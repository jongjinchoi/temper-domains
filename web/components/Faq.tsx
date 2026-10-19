import { FAQ, GITHUB_URL } from "@/lib/temper-data";
import styles from "./Faq.module.css";

export default function Faq() {
  return (
    <section className="sec" id="faq">
      <div className={styles.faq}>
        <div>
          <h2>Questions</h2>
          <p className={styles.more}>
            More in the <a href={`${GITHUB_URL}#readme`}>README</a>.
          </p>
        </div>
        <div>
          {FAQ.map((item, i) => (
            <details key={item.q} className={styles.item} open={i === 0}>
              <summary>{item.q}</summary>
              <p>{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
