"use client";

import { useEffect, useState } from "react";
import styles from "./ThemeToggle.module.css";

type Theme = "light" | "dark";

/**
 * Sticker-style sun/moon that flips data-theme on <html> and persists
 * the choice in localStorage. Initial theme is seeded by an inline
 * script in layout.tsx so we avoid FOUC.
 */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const current =
      (document.documentElement.dataset.theme as Theme | undefined) ??
      (window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light");
    setTheme(current);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("temper-theme", next);
    } catch {
      // storage blocked — theme still applies for this session.
    }
  };

  if (!theme) {
    // Keep the layout slot reserved while we read the current theme.
    return (
      <button
        type="button"
        className={styles.toggle}
        aria-label="Theme toggle"
        aria-hidden
        tabIndex={-1}
      />
    );
  }

  return (
    <button
      type="button"
      className={styles.toggle}
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
    >
      <span aria-hidden>{theme === "dark" ? "☾" : "☀"}</span>
    </button>
  );
}
