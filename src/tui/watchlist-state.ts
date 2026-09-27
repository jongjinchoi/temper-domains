import type { DomainResult, DomainStatus } from "../checker/types.ts";
import type { WatchEntry } from "../config/watchlist.ts";
import { normalizePosition } from "./list-position.ts";

export interface WatchItem extends WatchEntry {
  status: DomainStatus | "checking";
  result?: DomainResult;
}

export interface WatchlistState {
  items: WatchItem[];
  cursor: number;
  loadError: string | null;
  actionError: string | null;
}

export type WatchlistAction =
  | { type: "loadStarted"; preserveActionError: boolean }
  | { type: "loaded"; entries: WatchEntry[] }
  | { type: "result"; result: DomainResult }
  | { type: "loadFailed"; error: string; entriesLoaded: boolean }
  | { type: "deleteStarted" }
  | { type: "removed"; domain: string }
  | { type: "deleteFailed"; error: string }
  | { type: "reconciled"; entries: WatchEntry[] }
  | { type: "reloadFailed"; error: string }
  | { type: "move"; delta: number };

export const initialWatchlistState: WatchlistState = { items: [], cursor: 0, loadError: null, actionError: null };

// Replace rows while keeping the selected domain, or the same position when it is gone.
function withItems(state: WatchlistState, items: WatchItem[]): WatchlistState {
  const selected = state.items[state.cursor]?.domain;
  const index = items.findIndex(item => item.domain === selected);
  const cursor = normalizePosition({ cursor: index >= 0 ? index : state.cursor, offset: 0 }, items.length, 1).cursor;
  return { ...state, items, cursor };
}

// Pure: every transition reads the latest queued state, never a render snapshot.
export function watchlistReducer(state: WatchlistState, action: WatchlistAction): WatchlistState {
  switch (action.type) {
    case "loadStarted":
      return { ...state, loadError: null, actionError: action.preserveActionError ? state.actionError : null };
    case "loaded":
      return withItems(state, action.entries.map(entry => ({ ...entry, status: "checking" })));
    case "result": {
      const index = state.items.findIndex(item => item.domain === action.result.domain);
      if (index < 0) return state;
      const items = [...state.items];
      items[index] = { ...items[index]!, status: action.result.status, result: action.result };
      return { ...state, items };
    }
    case "loadFailed": {
      const errors = action.entriesLoaded ? {}
        : state.items.length ? { actionError: action.error } : { loadError: action.error };
      const items = state.items.map((item): WatchItem => item.status === "checking"
        ? { ...item, status: "error", result: { domain: item.domain, tld: item.domain.split(".").pop() ?? "",
            status: "error", method: "rdap", responseTime: 0, error: action.error } }
        : item);
      return { ...state, ...errors, items };
    }
    case "deleteStarted":
      return { ...state, actionError: null };
    case "removed":
      return withItems(state, state.items.filter(item => item.domain !== action.domain));
    case "deleteFailed":
      return { ...state, actionError: action.error };
    case "reconciled": {
      const previous = new Map(state.items.map(item => [item.domain, item]));
      return withItems(state, action.entries.map(entry => previous.get(entry.domain) ?? { ...entry, status: "error" }));
    }
    case "reloadFailed":
      return { ...state, actionError: `${action.error}. Could not reload the watchlist; press r to retry.` };
    case "move":
      return { ...state, cursor: normalizePosition({ cursor: state.cursor + action.delta, offset: 0 }, state.items.length, 1).cursor };
  }
}
