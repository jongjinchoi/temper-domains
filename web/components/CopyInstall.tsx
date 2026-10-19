"use client";

import { useEffect, useRef, useState } from "react";
import { INSTALL_CMD } from "@/lib/temper-data";
import styles from "./CopyInstall.module.css";

export default function CopyInstall({ label }: { label: string }) {
  const [copyState, setCopyState] = useState<"idle" | "pending" | "copied" | "failed">("idle");
  const copyAttempt = useRef(0);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => { copyAttempt.current++; clearTimeout(copyTimer.current); }, []);

  const handleCopy = async () => {
    const attempt = ++copyAttempt.current;
    clearTimeout(copyTimer.current);
    setCopyState("pending");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(INSTALL_CMD);
      if (attempt !== copyAttempt.current) return;
      setCopyState("copied");
      copyTimer.current = setTimeout(() => setCopyState("idle"), 1200);
    } catch {
      if (attempt === copyAttempt.current) setCopyState("failed");
    }
  };

  return (
    <>
      <button type="button" className={styles.copy} onClick={handleCopy} aria-label={label}>
        <span className={styles.ic}>▸</span>
        <span className={styles.command}>{copyState === "copied" ? "copied ✓" : INSTALL_CMD}</span>
      </button>
      <div role="status" aria-live="polite" className={styles.status}>
        {copyState === "failed" ? "Copy failed — select the command" : copyState === "copied" ? "Command copied" : ""}
      </div>
    </>
  );
}
