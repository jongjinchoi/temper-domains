import { Text } from "ink";
import type { DomainResult } from "../checker/types.ts";
import { getStatusStyle, theme } from "./theme.ts";

interface Props {
  domain: string;
  result: DomainResult | null;
  isSelected: boolean;
  showTime?: boolean;
}

export default function ResultRow({ domain, result, isSelected, showTime = true }: Props) {
  if (!result) {
    return (
      <Text wrap="truncate-end">
        {isSelected ? <Text color={theme.primary}>  ▸ </Text> : <Text>    </Text>}
        <Text color={theme.text}>{domain.padEnd(20)}</Text>
        <Text color={theme.dim}>  … checking</Text>
      </Text>
    );
  }

  const { icon, color } = getStatusStyle(result.status);
  const time = showTime ? `(${(result.responseTime / 1000).toFixed(2)}s${result.method === "whois" ? ", whois" : ""})` : "";

  return (
    <Text wrap="truncate-end" backgroundColor={isSelected ? theme.surface : undefined}>
      {isSelected ? <Text color={theme.primary}>  ▸ </Text> : <Text>    </Text>}
      <Text color={isSelected ? theme.text : theme.text}>{domain.padEnd(20)}</Text>
      <Text color={color}>  {icon} {result.status.padEnd(12)}</Text>
      {showTime && <Text color={theme.dim}>  {time}</Text>}
    </Text>
  );
}
