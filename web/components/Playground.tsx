"use client";

import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { getVersion } from "@/lib/temper-data";
import { type Row, TLDS, elapsedSeconds, padTo, runSearch } from "@/lib/playground-sim";
import styles from "./Playground.module.css";

type State =
  | { kind: "initial" }
  | { kind: "loading"; name: string }
  | { kind: "done"; name: string; rows: Row[]; elapsed: string };

const PAD = 20;

export default function Playground() {
  const version = getVersion();
  const [state, setState] = useState<State>({ kind: "initial" });
  const [value, setValue] = useState("");
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const focusInput = useCallback(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    focusInput();
  }, [focusInput]);

  useEffect(() => {
    if (state.kind === "done" && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [state]);

  const startSearch = (raw: string) => {
    const clean = raw
      .trim()
      .replace(/^temper\s+search\s+/, "")
      .replace(/\s+/g, "")
      .toLowerCase();
    if (!clean) return;
    setState({ kind: "loading", name: clean });
    setValue("");
    setTimeout(() => {
      setState({
        kind: "done",
        name: clean,
        rows: runSearch(clean),
        elapsed: elapsedSeconds(),
      });
    }, 480);
  };

  const reset = () => {
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

  return (
    <section className="sec" id="play">
      <div className="sec-head">
        <h2>
          Try it <em>here.</em>
        </h2>
        <div className="dek">
          // no install — a browser sandbox that behaves like the real CLI
        </div>
      </div>

      <div className={styles.playWrap}>
        <div className={styles.playLeft}>
          <h3>
            Type a <em>name.</em> Hit enter.
          </h3>
          <p>
            Try <em>dashflow</em>, <em>wellbi</em>, or <em>nimbus</em>.{" "}
            {TLDS.length} TLDs resolve in the browser with simulated data.
          </p>
          <p className={styles.muted}>
            The real CLI queries live RDAP and WHOIS. This sandbox just shows
            the shape of it.
          </p>

          <div className={styles.playSteps}>
            <div className={styles.step}>
              <span className={styles.stepNum}>01</span>
              <span>Type a name (any length).</span>
            </div>
            <div className={styles.step}>
              <span className={styles.stepNum}>02</span>
              <span>
                Press <strong>enter</strong> — {TLDS.length} TLDs resolve.
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
                  type a name and hit enter (try: dashflow, wellbi, nimbus)
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

            {state.kind === "loading" && (
              <>
                <Prompt />
                <span>temper search {state.name}</span>
                {"\n"}
                <span className={styles.mu}>  searching {TLDS.length} TLDs...</span>
              </>
            )}

            {state.kind === "done" && (
              <>
                <Prompt />
                <span>temper search {state.name}</span>
                {"\n"}
                <span className={styles.mu}>
                  {"  "}
                  {TLDS.length} TLDs · {state.elapsed}s
                </span>
                {"\n\n"}
                {state.rows.map((row) => (
                  <span key={row.full}>
                    {"  "}
                    {padTo(row.full, PAD)}
                    {row.available ? (
                      <>
                        <span className={styles.ok}>[available]</span>
                        <span className={styles.mu}>
                          {"  "}${row.price}/yr
                        </span>
                      </>
                    ) : (
                      <span className={styles.tk}>[taken]</span>
                    )}
                    {"\n"}
                  </span>
                ))}
                {"\n"}
                <span className={styles.mu}>{"  "}── </span>
                <span className={styles.k}>
                  {state.rows.filter((r) => r.available).length} available
                </span>
                <span className={styles.mu}> · </span>
                <span className={styles.tk}>
                  {state.rows.filter((r) => !r.available).length} taken
                </span>
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
