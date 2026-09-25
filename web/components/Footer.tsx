import { GITHUB_URL } from "@/lib/temper-data";
import styles from "./Footer.module.css";

export default function Footer() {
  const sourceUrl = process.env.NEXT_PUBLIC_TEMPER_SOURCE_URL;
  return (
    <div className={styles.foot}>
      <div>
        temper · forged in the terminal 🔥 ·{" "}
        <a href="https://github.com/jongjinchoi">@jongjinchoi</a> ·{" "}
        <a href="/license/">AGPL-3.0-only</a>
      </div>
      <div className={styles.footLinks}>
        <a href={GITHUB_URL}>github</a>
        <a href={`${GITHUB_URL}/releases`}>releases</a>
        {sourceUrl ? <a href={sourceUrl}>source</a> : <span>local source · unpublished</span>}
        <a href="/notices/">third-party notices</a>
      </div>
    </div>
  );
}
