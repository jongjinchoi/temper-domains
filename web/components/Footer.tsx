import { GITHUB_URL } from "@/lib/temper-data";
import styles from "./Footer.module.css";

export default function Footer() {
  return (
    <div className={styles.foot}>
      <div>
        temper · forged in the terminal 🔥 ·{" "}
        <a href="https://github.com/jongjinchoi">@jongjinchoi</a> · Apache 2.0
      </div>
      <div className={styles.footLinks}>
        <a href={GITHUB_URL}>github</a>
        <a href={`${GITHUB_URL}/releases`}>releases</a>
      </div>
    </div>
  );
}
