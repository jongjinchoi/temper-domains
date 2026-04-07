import { Text } from "ink";
import { theme } from "./theme";

interface Props {
  current: number;
  total: number;
  width?: number;
}

export default function ProgressBar({ current, total, width = 20 }: Props) {
  const ratio = total > 0 ? current / total : 0;
  const filled = Math.round(ratio * width);
  const empty = width - filled;
  const percent = Math.round(ratio * 100);

  return (
    <Text>
      <Text color={theme.primary}>{"█".repeat(filled)}</Text>
      <Text color={theme.border}>{"░".repeat(empty)}</Text>
      <Text color={theme.lavender}> {percent}%</Text>
    </Text>
  );
}
