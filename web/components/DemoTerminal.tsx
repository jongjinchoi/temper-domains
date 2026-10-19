"use client";

import {
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  DEFAULT_TLDS_COUNT,
  DEMO_FIRST_TLDS,
  DEMO_MORE_TLDS,
  HERO_DEMO_NAME,
} from "@/lib/temper-data";
import {
  type CheckSummary,
  type LiveResult,
  getLiveDisplayStatus,
  runLiveSearch,
} from "@/lib/playground-client";
import styles from "./DemoTerminal.module.css";

// The cached example comes from /api/example/ (ISR), so page views do not
// trigger registry lookups. Only a name the visitor types reaches /api/check/.
interface Example {
  status: "loading" | "playing" | "done" | "unavailable";
  rows: LiveResult[];
  shown: number;
  checkedAt?: string;
  summary?: CheckSummary;
}

interface Pass {
  tlds: number;
  summary?: CheckSummary;
}

interface Search {
  name: string;
  rows: LiveResult[];
  phase: "first" | "first-done" | "more" | "done" | "error";
  passes: Pass[];
  elapsedMs: number;
  message?: string;
}

const PAD = 20;
const REPLAY_MS = 110;
const ANSWERED = new Set(["available", "taken", "premium", "reserved"]);
const ICONS: Record<string, string> = {
  available: "✓", review: "?", taken: "✗", premium: "◆", reserved: "◉",
  rate_limited: "⚠", slow: "⚠", error: "⚠",
};

function padTo(s: string, n: number): string {
  return s.length >= n ? `${s} ` : s + " ".repeat(n - s.length);
}

function checkedAgo(iso: string | undefined): string {
  const at = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(at)) return "cached example";
  const minutes = Math.floor((Date.now() - at) / 60000);
  if (minutes < 1) return "checked just now";
  if (minutes < 60) return `checked ${minutes} min ago`;
  return `checked ${Math.floor(minutes / 60)} h ago`;
}

function isLiveResult(value: unknown): value is LiveResult {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<LiveResult>;
  return typeof row.domain === "string" && typeof row.status === "string" && typeof row.responseTime === "number";
}

export default function DemoTerminal() {
  const [example, setExample] = useState<Example>({ status: "loading", rows: [], shown: 0 });
  const [search, setSearch] = useState<Search | null>(null);
  const [value, setValue] = useState("");
  const [tried, setTried] = useState(false);
  const [cueTop, setCueTop] = useState<number | null>(null);
  const demoRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const promptRef = useRef<HTMLSpanElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cueRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const focusInput = useCallback(() => {
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  // Load and replay the cached example once.
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setInterval> | undefined;
    (async () => {
      try {
        const res = await fetch("/api/example/", { signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { rows?: unknown; checkedAt?: unknown; summary?: CheckSummary; error?: unknown };
        const rows = Array.isArray(body.rows) ? body.rows.filter(isLiveResult) : [];
        if (body.error || rows.length === 0) throw new Error("example unavailable");
        const checkedAt = typeof body.checkedAt === "string" ? body.checkedAt : undefined;
        setExample({ status: "playing", rows, shown: 0, checkedAt, summary: body.summary });
        timer = setInterval(() => {
          setExample((prev) => {
            if (prev.shown + 1 >= prev.rows.length) {
              clearInterval(timer);
              return { ...prev, shown: prev.rows.length, status: "done" };
            }
            return { ...prev, shown: prev.shown + 1 };
          });
        }, REPLAY_MS);
      } catch {
        if (!controller.signal.aborted) setExample({ status: "unavailable", rows: [], shown: 0 });
      }
    })();
    return () => { controller.abort(); clearInterval(timer); };
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [example, search]);

  const phase = search?.phase;
  useEffect(() => {
    if (phase === "first" || phase === "more") terminalRef.current?.focus({ preventScroll: true });
    else if (phase === "first-done" || phase === "done" || phase === "error") focusInput();
  }, [phase, focusInput]);

  const exampleReady = example.status === "done" || example.status === "unavailable";
  const showCue = exampleReady && !tried && search === null;

  // Point the wide-screen cue at the prompt line wherever it ends up.
  useLayoutEffect(() => {
    const place = () => {
      const demo = demoRef.current, prompt = promptRef.current, cue = cueRef.current;
      if (!showCue || !demo || !prompt || !cue) return setCueTop(null);
      const mid = prompt.getBoundingClientRect().top + prompt.offsetHeight / 2 - demo.getBoundingClientRect().top;
      // The arrow tip sits 16px above the bottom of the cue.
      setCueTop(mid - cue.offsetHeight + 16);
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [showCue, example.shown]);

  const runPass = (name: string, tlds: readonly string[], controller: AbortController, done: Search["phase"]) => {
    const current = () => !controller.signal.aborted && abortRef.current === controller;
    void runLiveSearch(
      name,
      {
        onRow: (row) => {
          if (!current()) return;
          setSearch((prev) => (prev && prev.name === name ? { ...prev, rows: [...prev.rows, row] } : prev));
        },
        onDone: (elapsedMs, summary) => {
          if (!current()) return;
          setSearch((prev) => {
            if (!prev || prev.name !== name) return prev;
            const passes = prev.passes.map((pass, i) => (i === prev.passes.length - 1 ? { ...pass, summary } : pass));
            return { ...prev, phase: done, passes, elapsedMs: prev.elapsedMs + elapsedMs };
          });
        },
        onError: (message) => {
          if (!current()) return;
          setSearch((prev) => (prev && prev.name === name ? { ...prev, phase: "error", message } : prev));
        },
      },
      controller.signal,
      tlds,
    );
  };

  const startSearch = (raw: string) => {
    const name = raw.trim().replace(/^temper\s+search\s+/, "").replace(/\s+/g, "").toLowerCase();
    if (!name) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setTried(true);
    setValue("");
    setSearch({ name, rows: [], phase: "first", passes: [{ tlds: DEMO_FIRST_TLDS.length }], elapsedMs: 0 });
    runPass(name, DEMO_FIRST_TLDS, controller, "first-done");
  };

  const checkMore = () => {
    if (!search || search.phase !== "first-done") return;
    const controller = new AbortController();
    abortRef.current = controller;
    setSearch({ ...search, phase: "more", passes: [...search.passes, { tlds: DEMO_MORE_TLDS.length }] });
    runPass(search.name, DEMO_MORE_TLDS, controller, "done");
  };

  const reset = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSearch(null);
    setValue("");
    requestAnimationFrame(focusInput);
  };

  const handleKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      startSearch(value);
    }
  };

  const running = phase === "first" || phase === "more";

  return (
    <div className={styles.demo} ref={demoRef} id="demo">
      <div
        ref={cueRef}
        className={`${styles.cue} ${showCue && cueTop !== null ? styles.cueOn : ""}`}
        style={cueTop === null ? undefined : { top: cueTop }}
        aria-hidden="true"
      >
        Now try
        <br />
        your own name
        <small>type it, then enter</small>
        <svg width="196" height="46" viewBox="0 0 196 46">
          <path d="M126 4 C 128 26, 150 32, 188 30" />
          <path d="M177 22 L 189 30 L 175 37" />
        </svg>
      </div>
      <div
        ref={terminalRef}
        className={styles.term}
        role="group"
        aria-label="Domain search demo"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            reset();
          }
        }}
      >
        <div className={styles.bar}>
          <span className={styles.dots} aria-hidden="true"><b /><b /><b /></span>
          temper · live demo
          <span className={styles.barRight}>{DEFAULT_TLDS_COUNT} TLDs</span>
        </div>
        <div ref={bodyRef} className={styles.body} onClick={focusInput} aria-live="polite">
          {search === null ? <ExampleBlock example={example} /> : <SearchBlock search={search} onMore={checkMore} />}
          {!running && (
            <>
              {"\n"}
              {showCue && <span className={styles.hintInline}>{"  "}↓ try your own name{"\n"}</span>}
              <span className={styles.promptLine} ref={promptRef}>
                <span className={styles.pr}>&gt;</span> temper search <span className={styles.cursor} />
                <input
                  ref={inputRef}
                  type="text"
                  aria-label="Domain name"
                  placeholder="your-project-name"
                  autoComplete="off"
                  spellCheck={false}
                  enterKeyHint="search"
                  className={styles.input}
                  value={value}
                  onChange={(event) => {
                    setValue(event.target.value);
                    if (event.target.value) setTried(true);
                  }}
                  onKeyDown={handleKey}
                />
              </span>
            </>
          )}
        </div>
        <div className={styles.foot}>
          <span><kbd>enter</kbd> search · <kbd>esc</kbd> clear</span>
          <span>confirm purchase &amp; price with a registrar</span>
        </div>
      </div>
    </div>
  );
}

function ResultRow({ row }: { row: LiveResult }) {
  const status = getLiveDisplayStatus(row);
  const cls = status === "available" ? styles.ok
    : status === "taken" ? styles.tk
      : status === "premium" || status === "reserved" ? styles.pm
        : styles.wn;
  const time = `(${(row.responseTime / 1000).toFixed(2)}s${row.method === "whois" ? ", whois" : ""})`;
  return (
    <span>
      {"    "}
      {padTo(row.domain, PAD)}
      {" "}
      <span className={cls}>{ICONS[status] ?? "⚠"} {status}</span>
      <span className={`${styles.mu} ${styles.time}`}>{" ".repeat(Math.max(1, 13 - status.length))}{time}</span>
      {row.reason && row.confidence === "low" && <span className={styles.wn}>{"\n      "}{row.reason}</span>}
      {"\n"}
    </span>
  );
}

function Counts({ rows }: { rows: LiveResult[] }) {
  const count = (pick: (row: LiveResult) => boolean) => rows.filter(pick).length;
  const parts: [number, string, string][] = [
    [count((r) => getLiveDisplayStatus(r) === "available"), styles.ok, "available"],
    [count((r) => getLiveDisplayStatus(r) === "review"), styles.wn, "review"],
    [count((r) => r.status === "taken"), styles.tk, "taken"],
    [count((r) => r.status === "premium" || r.status === "reserved"), styles.pm, "premium/reserved"],
    [count((r) => !ANSWERED.has(r.status)), styles.wn, "unanswered"],
  ];
  const shown = parts.filter(([n]) => n > 0);
  const out: ReactNode[] = [];
  shown.forEach(([n, cls, label], i) => {
    if (i > 0) out.push(<span key={`s${i}`} className={styles.mu}> · </span>);
    out.push(<span key={label} className={cls}>{n} {label}</span>);
  });
  return <span className={styles.sum}>{out}</span>;
}

function ExampleBlock({ example }: { example: Example }) {
  const rows = example.rows.slice(0, example.shown);
  return (
    <>
      <span className={styles.pr}>&gt;</span> temper search {HERO_DEMO_NAME}
      {"\n"}
      <span className={styles.mu}>
        {"  "}
        {example.status === "loading"
          ? "loading the cached example…"
          : example.status === "unavailable"
            ? "example unavailable right now"
            : `${checkedAgo(example.checkedAt)} · ${DEMO_FIRST_TLDS.length} of ${DEFAULT_TLDS_COUNT} TLDs`}
      </span>
      {"\n\n"}
      {rows.map((row) => <ResultRow key={row.domain} row={row} />)}
      {example.status === "done" && (
        <>
          {"\n"}
          <Counts rows={example.rows} />
          {"\n"}
          <span className={`${styles.mu} ${styles.sum}`}>
            {example.summary ? `${example.summary.answered}/${example.summary.requested} answered · ` : ""}cached example
          </span>
          {"\n"}
        </>
      )}
    </>
  );
}

function SearchBlock({ search, onMore }: { search: Search; onMore: () => void }) {
  const requested = search.passes.reduce((n, pass) => n + (pass.summary?.requested ?? pass.tlds), 0);
  const settled = search.passes.filter((pass) => pass.summary);
  const answered = search.passes.reduce(
    (n, pass) => n + (pass.summary?.answered ?? 0), 0,
  ) || search.rows.filter((row) => ANSWERED.has(row.status)).length;
  const unresolved = settled.reduce((n, pass) => n + pass.summary!.unresolved, 0);
  const notQueried = settled.reduce((n, pass) => n + pass.summary!.requested - pass.summary!.attempted, 0);
  const finished = search.phase === "first-done" || search.phase === "done";
  return (
    <>
      <span className={styles.pr}>&gt;</span> temper search {search.name}
      {"\n"}
      <span className={styles.mu}>
        {"  "}
        {search.phase === "first"
          ? `resolving ${DEMO_FIRST_TLDS.length} TLDs...`
          : search.phase === "error"
            ? "error"
            : `${requested} of ${DEFAULT_TLDS_COUNT} TLDs`}
      </span>
      {"\n\n"}
      {search.rows.map((row) => <ResultRow key={row.domain} row={row} />)}
      {search.phase === "more" && <span className={styles.mu}>{"  "}resolving {DEMO_MORE_TLDS.length} more TLDs...{"\n"}</span>}
      {finished && (
        <>
          {"\n"}
          <Counts rows={search.rows} />
          {"\n"}
          <span className={`${styles.mu} ${styles.sum}`}>
            {answered}/{requested} answered in {(search.elapsedMs / 1000).toFixed(1)}s
          </span>
          {unresolved > 0 && (
            <span className={`${styles.wn} ${styles.sum}`}>{"\n"}{unresolved} unresolved · {notQueried} not queried</span>
          )}
          {"\n"}
          <span className={`${styles.mu} ${styles.sum}`}>Confirm purchase availability and pricing with a registrar.</span>
          {"\n"}
        </>
      )}
      {search.phase === "first-done" && (
        <>
          {"\n  "}
          <button type="button" className={styles.more} onClick={onMore}>
            check {DEMO_MORE_TLDS.length} more TLDs →
          </button>
          {"\n"}
        </>
      )}
      {search.phase === "error" && (
        <>
          {"\n"}
          <span className={styles.tk}>{"  "}! {search.message}</span>
          {"\n"}
        </>
      )}
    </>
  );
}
