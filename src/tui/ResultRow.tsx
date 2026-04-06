import { Box, Text } from "ink";
import type { DomainResult } from "../checker/types";
import { getStatusStyle, theme } from "./theme";

interface Props {
  domain: string;
  result: DomainResult | null;
  isSelected: boolean;
}

export default function ResultRow({ domain, result, isSelected }: Props) {
  const indicator = isSelected ? "▸" : " ";
  const indicatorColor = isSelected ? theme.primary : undefined;
  const bgColor = isSelected ? theme.surface : undefined;

  if (!result) {
    return (
      <Box>
        <Text wrap="truncate-end" backgroundColor={bgColor}>
          <Text color={indicatorColor}>{indicator}</Text>
          {"  "}
          <Text>{domain.padEnd(20)}</Text>
          {"  "}
          <Text color={theme.dim}>… checking</Text>
        </Text>
      </Box>
    );
  }

  const { icon, color } = getStatusStyle(result.status);
  const time = `${result.responseTime}ms`;
  const method = result.method === "whois" ? " (whois)" : "";

  return (
    <Box>
      <Text wrap="truncate-end" backgroundColor={bgColor}>
        <Text color={indicatorColor}>{indicator}</Text>
        {"  "}
        <Text>{domain.padEnd(20)}</Text>
        {"  "}
        <Text color={color}>
          {icon} {result.status.padEnd(12)}
        </Text>
        {"  "}
        <Text color={theme.dim}>
          {time}
          {method}
        </Text>
      </Text>
    </Box>
  );
}
