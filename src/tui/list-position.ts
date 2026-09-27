export type Position = { cursor: number; offset: number };

export function normalizePosition(position: Position, count: number, capacity: number): Position {
  if (count === 0) return { cursor: 0, offset: 0 };
  const size = Math.max(1, Math.min(capacity, count));
  const cursor = Math.max(0, Math.min(position.cursor, count - 1));
  let offset = Math.max(0, Math.min(position.offset, count - size));
  if (cursor < offset) offset = cursor;
  if (cursor >= offset + size) offset = cursor - size + 1;
  return { cursor, offset };
}
