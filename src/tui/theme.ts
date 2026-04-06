import type { DomainStatus } from "../checker/types";

export const theme = {
  base: "#1a1d23",
  text: "#e8e6e3",
  primary: "#ff7a45",
  green: "#64c896",
  red: "#e64545",
  yellow: "#ffbf47",
  blue: "#7a8fc4",
  dim: "#6b7280",
  border: "#4b5260",
  surface: "#2a2e36",
} as const;

interface StatusStyle {
  icon: string;
  color: string;
}

const STATUS_STYLES: Record<DomainStatus, StatusStyle> = {
  available: { icon: "✓", color: theme.green },
  taken: { icon: "✗", color: theme.red },
  premium: { icon: "✓", color: theme.yellow },
  reserved: { icon: "✗", color: theme.blue },
  rate_limited: { icon: "⚠", color: theme.yellow },
  slow: { icon: "⚠", color: theme.yellow },
  error: { icon: "✗", color: theme.red },
};

export function getStatusStyle(status: DomainStatus): StatusStyle {
  return STATUS_STYLES[status];
}
