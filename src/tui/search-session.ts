import { checkFullDomains } from "../checker/checker.ts";
import { canResume } from "../checker/retry.ts";
import type { DomainResult } from "../checker/types.ts";
import { addHistory, replaceHistoryEntry, type HistoryEntry } from "../config/history.ts";
import { normalizeDomainKey } from "../utils/validate.ts";
import { getTld } from "../utils/domain.ts";

export const RESUME_BUDGET_MS = 120000;
interface Snapshot {
  results: ReadonlyMap<string, DomainResult>;
  totalAttempts: ReadonlyMap<string, number>;
  count: number; roundTotal: number; resuming: boolean; elapsed: number; done: boolean;
  error: string | null; historyError: string | null;
}
type HistoryWriter = { add: typeof addHistory; replace: typeof replaceHistoryEntry };

// Memory-only ownership outlives SearchView. No hidden background work survives
// cancel/unmount; a generation fences late iterator results from previous runs.
export class SearchSession {
  readonly domains: readonly string[];
  private state: Snapshot;
  private listeners = new Set<() => void>();
  private started = false;
  private epoch = 0;
  private active?: { epoch: number; controller: AbortController; pending: Set<string>; timer: ReturnType<typeof setInterval> };
  private historyEntry?: HistoryEntry;
  private historyGone = false;
  private historyQueue: Promise<void> = Promise.resolve();

  constructor(readonly query: string, tlds: readonly string[], private timeoutMs?: number,
    private check: typeof checkFullDomains = checkFullDomains,
    private history: HistoryWriter = { add: addHistory, replace: replaceHistoryEntry }) {
    this.domains = tlds.map(tld => normalizeDomainKey(`${query}.${tld}`));
    this.state = { results: new Map(), totalAttempts: new Map(), count: 0, roundTotal: this.domains.length,
      resuming: false, elapsed: 0, done: false, error: null, historyError: null };
  }
  getSnapshot = (): Snapshot => this.state;
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<Snapshot>) { this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener(); }
  start(): Promise<void> {
    if (this.started) return Promise.resolve();
    this.started = true;
    return this.run(this.domains, false);
  }
  resume(domains: readonly string[]): Promise<void> {
    if (!this.started || this.active) throw new Error("Wait for the current search to finish or stop it first.");
    if (!domains.length || domains.length > this.domains.length || new Set(domains).size !== domains.length
      || domains.some(domain => !this.state.results.has(domain) || !canResume(this.state.results.get(domain)!))) {
      throw new Error("Select only unresolved candidates from this search.");
    }
    return this.run(domains, true);
  }
  cancel(): void {
    const active = this.active;
    if (!active) return;
    this.active = undefined; ++this.epoch;
    clearInterval(active.timer); active.controller.abort();
    const results = new Map(this.state.results);
    for (const domain of active.pending) if (!results.has(domain)) results.set(domain, {
      domain, tld: getTld(domain), status: "slow", method: "rdap", responseTime: 0, attempts: 0, terminationReason: "cancelled",
    });
    this.update({ results, done: true });
  }
  private async saveHistory(): Promise<void> {
    const next = this.historyQueue.then(async () => {
      if (this.historyGone || ![...this.state.totalAttempts.values()].some(n => n > 0)) return;
      const entry: HistoryEntry = { query: this.query, timestamp: this.historyEntry?.timestamp ?? new Date().toISOString(),
        available: [...this.state.results.values()].filter(row => row.status === "available").length, total: this.domains.length };
      if (!this.historyEntry) await this.history.add(entry);
      else if (!await this.history.replace(this.historyEntry, entry)) { this.historyGone = true; return; }
      this.historyEntry = entry;
    });
    this.historyQueue = next.catch(() => {});
    return next;
  }
  private async run(domains: readonly string[], resuming: boolean): Promise<void> {
    const epoch = ++this.epoch, controller = new AbortController(), start = performance.now();
    const pending = new Set(domains);
    const timer = setInterval(() => { if (this.epoch === epoch) this.update({ elapsed: Math.round(performance.now() - start) }); }, 100);
    this.active = { epoch, controller, pending, timer };
    this.update({ done: false, error: null, historyError: null, elapsed: 0, count: 0, roundTotal: domains.length, resuming });
    const deadline = Date.now() + RESUME_BUDGET_MS;
    const dispatch = resuming ? domains.filter(domain => {
      const retry = Date.parse(this.state.results.get(domain)!.retryAt ?? "");
      if (Number.isFinite(retry) && retry >= deadline) { pending.delete(domain); return false; }
      return true;
    }) : domains;
    this.update({ count: domains.length - pending.size });
    try {
      if (dispatch.length) for await (const row of this.check(dispatch, {
        signal: controller.signal, timeoutMs: resuming ? RESUME_BUDGET_MS : this.timeoutMs, resume: resuming,
      })) {
        if (!pending.delete(row.domain)) continue;
        const totalAttempts = new Map(this.state.totalAttempts);
        totalAttempts.set(row.domain, (totalAttempts.get(row.domain) ?? 0) + (row.attempts ?? 0));
        // Drain cancellation cleanup to account for transmissions already made.
        // A retired run can only add its once-per-domain attempt count; its
        // availability, errors and progress cannot overwrite the active round.
        if (this.epoch !== epoch) { this.update({ totalAttempts }); continue; }
        const results = new Map(this.state.results).set(row.domain, row);
        this.update({ results, totalAttempts, count: domains.length - pending.size });
      }
      if (this.epoch !== epoch) return;
      if (this.state.results.size && [...this.state.results.values()].every(row => row.terminationReason === "bootstrap_error")) {
        this.update({ error: [...this.state.results.values()][0]!.error ?? "Could not load the domain lookup server directory" });
      }
      await this.saveHistory().catch(error => { if (this.epoch === epoch) this.update({ historyError: String(error instanceof Error ? error.message : error) }); });
    } catch (error) {
      if (this.epoch === epoch) this.update({ error: String(error instanceof Error ? error.message : error) });
    } finally {
      clearInterval(timer);
      if (this.epoch === epoch) {
        this.active = undefined;
        this.update({ done: true, elapsed: Math.round(performance.now() - start) });
      }
    }
  }
}
