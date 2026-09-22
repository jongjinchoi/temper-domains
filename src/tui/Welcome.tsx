import React from "react";
import { Box, Text, renderToString } from "ink";
import { VERSION } from "../version.ts";
import { TerminalPanel } from "./TerminalPanel.tsx";
import { theme } from "./theme.ts";

const commands = [
  ["temper search <name>", "Search domains"],
  ["temper suggest <idea>", "Explore name ideas"],
  ["temper init", "Set up Temper"],
  ["temper --help", "All commands and options"],
] as const;

export function Welcome({ columns }: { columns: number }) {
  const narrow = columns < 65;
  return <TerminalPanel>
    <Text><Text bold color={theme.primary}>Temper</Text><Text dimColor>  v{VERSION}</Text></Text>
    <Text>Never leave your terminal to find a domain.</Text>
    <Box marginTop={1} flexDirection="column">
      {commands.map(([command, description]) => <Box key={command} flexDirection={narrow ? "column" : "row"} marginBottom={narrow ? 1 : 0}>
        <Text color={theme.primary}>{narrow ? command : command.padEnd(25)}</Text>
        <Text dimColor>{narrow ? `  ${description}` : description}</Text>
      </Box>)}
    </Box>
  </TerminalPanel>;
}

export function showWelcome(): void {
  const columns = Math.max(10, Math.min(process.stdout.columns || 80, 80));
  console.log(renderToString(<Welcome columns={columns} />, { columns }));
}
