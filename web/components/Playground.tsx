"use client";

import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { getVersion, PLAYGROUND_TLDS } from "@/lib/temper-data";
import {
  type LiveResult,
  runLiveSearch,
} from "@/lib/playground-client";
import styles from "./Playground.module.css";

type State =
  | { kind: "initial" }
  | { kind: "loading"; name: string; rows: LiveResult[] }
  | { kind: "done"; name: string; rows: LiveResult[]; elapsedMs: number }
  | { kind: "error"; name: string; message: string; rows: LiveResult[] };

const PAD = 20;

function padTo(s: string, n: number): string {
  return s.length >= n ? `${s} ` : s + " ".repeat(n - s.length);
}

function formatElapsed(ms: number): string {
  return (ms / 1000).toFixed(1);
}

export default function Playground() {
  const version = getVersion();
  const [state, setState] = useState<State>({ kind: "initial" });
  const [value, setValue] = useState("");
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    focusInput();
  }, [focusInput]);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [state]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  const startSearch = (raw: string) => {
    const clean = raw
      .trim()
      .replace(/^temper\s+search\s+/, "")
      .replace(/\s+/g, "")
      .toLowerCase();
    if (!clean) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({ kind: "loading", name: clean, rows: [] });
    setValue("");

    void runLiveSearch(
      clean,
      {
        onRow: (row) => {
          setState((prev) => {
            if (prev.kind !== "loading" || prev.name !== clean) return prev;
            return { ...prev, rows: [...prev.rows, row] };
          });
        },
        onDone: (elapsedMs) => {
          setState((prev) => {
            if (prev.kind !== "loading" || prev.name !== clean) return prev;
            return { kind: "done", name: clean, rows: prev.rows, elapsedMs };
          });
        },
        onError: (message) => {
          setState((prev) => {
            const rows = prev.kind === "loading" ? prev.rows : [];
            return { kind: "error", name: clean, message, rows };
          });
        },
      },
      controller.signal,
    );
  };

  const reset = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState({ kind: "initial" });
    setValue("");
    requestAnimationFrame(focusInput);
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      startSearch(value);
    } else if (e.key === "Escape") {
      e.preventDefault();
      reset();
    }
  };

  const availableCount =
    state.kind === "loading" || state.kind === "done" || state.kind === "error"
      ? state.rows.filter((r) => r.status === "available").length
      : 0;
  const takenCount =
    state.kind === "loading" || state.kind === "done" || state.kind === "error"
      ? state.rows.filter((r) => r.status !== "available").length
      : 0;

  return (
    <section className="sec" id="play">
      <div className="sec-head">
        <h2>
          Try it <em>here.</em>
        </h2>
        <div className="dek">
          // live RDAP + WHOIS, streamed as they resolve — the real CLI in a browser
        </div>
      </div>

      <div className={styles.playWrap}>
        <div className={styles.playLeft}>
          <h3>
            Type a <em>name.</em> Hit enter.
          </h3>
          <p>
            Try any name — <em>vercel</em>, <em>nimbus</em>, or your own.{" "}
            {PLAYGROUND_TLDS.length} TLDs resolve live via IANA RDAP (WHOIS
            fallback for .io/.co/.me/.sh/.so/.gg).
          </p>
          <p className={styles.muted}>
            Same checker as the CLI. Names are queried in real time; nothing is
            stored.
          </p>

          <div className={styles.playSteps}>
            <div className={styles.step}>
              <span className={styles.stepNum}>01</span>
              <span>Type a name (any length).</span>
            </div>
            <div className={styles.step}>
              <span className={styles.stepNum}>02</span>
              <span>
                Press <strong>enter</strong> — {PLAYGROUND_TLDS.length} TLDs
                resolve.
              </span>
            </div>
            <div className={styles.step}>
              <span className={styles.stepNum}>03</span>
              <span>
                Press <strong>esc</strong> to reset.
              </span>
            </div>
          </div>
        </div>

        <div
          className={styles.playTerm}
          onClick={focusInput}
          role="presentation"
        >
          <div className={styles.playBar}>
            <span>temper · live demo</span>
            <span>CRT · 80×24</span>
          </div>
          <div ref={bodyRef} className={styles.playBody}>
            {state.kind === "initial" && (
              <>
                <span className={styles.mu}>
                  temper v{version} — search domain availability
                </span>
                {"\n"}
                <span className={styles.mu}>
                  type a name and hit enter
                </span>
                {"\n\n"}
                <Prompt />
                <span>temper search </span>
                <InputLine
                  inputRef={inputRef}
                  value={value}
                  onChange={setValue}
                  onKeyDown={handleKey}
                />
              </>
            )}

            {state.kind !== "initial" && (
              <>
                <Prompt />
                <span>temper search {state.name}</span>
                {"\n"}
                <span className={styles.mu}>
                  {"  "}
                  {state.kind === "done"
                    ? `${PLAYGROUND_TLDS.length} TLDs · ${formatElapsed(state.elapsedMs)}s`
                    : state.kind === "error"
                      ? "error"
                      : `resolving ${PLAYGROUND_TLDS.length} TLDs...`}
                </span>
                {"\n\n"}
                {state.rows.map((row) => (
                  <ResultRow key={row.domain} row={row} />
                ))}
                {state.kind === "done" && (
                  <>
                    {"\n"}
                    <span className={styles.mu}>{"  "}── </span>
                    <span className={styles.k}>
                      {availableCount} available
                    </span>
                    <span className={styles.mu}> · </span>
                    <span className={styles.tk}>{takenCount} taken</span>
                    {"\n\n"}
                    <Prompt />
                    <InputLine
                      inputRef={inputRef}
                      value={value}
                      onChange={setValue}
                      onKeyDown={handleKey}
                    />
                  </>
                )}
                {state.kind === "error" && (
                  <>
                    {"\n"}
                    <span className={styles.tk}>{"  "}! {state.message}</span>
                    {"\n\n"}
                    <Prompt />
                    <InputLine
                      inputRef={inputRef}
                      value={value}
                      onChange={setValue}
                      onKeyDown={handleKey}
                    />
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );

  function Prompt() {
    return (
      <>
        <span className={styles.pr}>&gt;</span>
        <span> </span>
      </>
    );
  }
}

function ResultRow({ row }: { row: LiveResult }) {
  const available = row.status === "available";
  const slow = row.status === "slow";
  const errored = row.status === "error" || row.status === "rate_limited";
  const label = available
    ? "[available]"
    : slow
      ? "[slow]"
      : errored
        ? `[${row.status}]`
        : "[taken]";
  const labelCls = available ? styles.ok : errored || slow ? styles.k : styles.tk;

  return (
    <span>
      {"  "}
      {padTo(row.domain, PAD)}
      <span className={labelCls}>{label}</span>
      <span className={styles.mu}>
        {"  "}
        [{row.method}] {row.responseTime}ms
      </span>
      {"\n"}
    </span>
  );
}

interface InputLineProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  onChange: (value: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
}

function InputLine({ inputRef, value, onChange, onKeyDown }: InputLineProps) {
  return (
    <span className={styles.inputLine}>
      <input
        ref={inputRef}
        type="text"
        autoComplete="off"
        spellCheck={false}
        className={styles.input}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        autoFocus
      />
    </span>
  );
}
