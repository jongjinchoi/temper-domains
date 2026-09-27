import { Box, Text, useBoxMetrics, type DOMElement } from "ink";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { normalizePosition } from "./list-position.ts";
import { theme } from "./theme.ts";

interface Row { key: string; content: ReactNode }
function MeasuredRow({ row, onMeasure }: { row: Row; onMeasure: (key: string, height: number) => void }) {
  const ref = useRef<DOMElement>(null);
  const metrics = useBoxMetrics(ref);
  useEffect(() => {
    if (metrics.hasMeasured && metrics.height > 0) onMeasure(row.key, metrics.height);
  }, [row.key, metrics.height, metrics.hasMeasured, onMeasure]);
  return <Box ref={ref} flexDirection="column" flexShrink={0}>{row.content}</Box>;
}

// The enclosing frame owns the terminal height; this box receives the remaining
// space after headers, notices and footer layout, including their wrapped lines.
export default function ListViewport({ rows, cursor }: { rows: Row[]; cursor: number }) {
  const ref = useRef<DOMElement>(null);
  const { height, width, hasMeasured } = useBoxMetrics(ref);
  const [measurements, setMeasurements] = useState<{ width: number; heights: Map<string, number> }>({ width: 0, heights: new Map() });
  const heights = measurements.width === width ? measurements.heights : new Map<string, number>();
  const measure = useCallback((key: string, rowHeight: number) => setMeasurements(previous => {
    if (previous.width === width && previous.heights.get(key) === rowHeight) return previous;
    const next = new Map(previous.width === width ? previous.heights : []);
    next.set(key, rowHeight);
    return { width, heights: next };
  }), [width]);
  const offsetRef = useRef(0);
  const capacity = Math.max(1, Math.floor(height) - 2);
  const selected = normalizePosition({ cursor, offset: 0 }, rows.length, 1).cursor;
  const size = (index: number) => heights.get(rows[index]!.key) ?? 1;
  let offset = Math.min(offsetRef.current, selected);
  let used = 0;
  for (let i = offset; i <= selected && i < rows.length; i++) used += size(i);
  while (used > capacity && offset < selected) used -= size(offset++);
  let end = offset;
  used = 0;
  while (end < rows.length && (used + size(end) <= capacity || end === offset)) used += size(end++);
  useEffect(() => { offsetRef.current = offset; }, [offset]);
  const oversized = rows.length > 0 && size(selected) > capacity;
  return <Box ref={ref} flexDirection="column" flexGrow={1} flexBasis={0} minHeight={0} overflow="hidden">
    {hasMeasured && height >= 3 ? <>
      <Text color={theme.dim} wrap="truncate-end">{offset ? `↑ ${offset} more` : ' '}</Text>
      <Box height={capacity} flexShrink={0} flexDirection="column" overflow="hidden">
        {rows.slice(offset, end).map(row => <MeasuredRow key={row.key} row={row} onMeasure={measure} />)}
      </Box>
      <Text color={theme.dim} wrap="truncate-end">{oversized ? 'Enlarge terminal to read the full row' : end < rows.length ? `↓ ${rows.length - end} more` : ' '}</Text>
    </> : <Text wrap="truncate-end" color={theme.dim}>Enlarge terminal to show the list</Text>}
  </Box>;
}
