import { Box, Text, type PropsWithChildren } from "ink";
import { theme } from "./theme";

interface Props {
  title?: string;
  hints?: { key: string; action: string }[];
  minHeight?: number;
}

export default function FrameBox({ title, hints, minHeight, children }: PropsWithChildren<Props>) {
  return (
    <Box flexDirection="column">
      {/* Main content area */}
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor={theme.border}
        borderBottom={hints && hints.length > 0 ? false : true}
        paddingX={1}
        paddingBottom={1}
        minHeight={minHeight}
      >
        {title && (
          <Box marginBottom={1}>
            <Text color={theme.primary} bold>{title}</Text>
          </Box>
        )}
        {children}
      </Box>

      {/* Footer with key hints */}
      {hints && hints.length > 0 && (
        <Box
          borderStyle="single"
          borderColor={theme.border}
          borderTop={false}
          paddingX={1}
        >
          {hints.map((hint, i) => (
            <Text key={`${hint.key}-${hint.action}`}>
              {i > 0 ? <Text color={theme.dim}> · </Text> : null}
              <Text color={theme.blue} bold>{hint.key}</Text>
              <Text color={theme.text}> {hint.action}</Text>
            </Text>
          ))}
        </Box>
      )}
    </Box>
  );
}
