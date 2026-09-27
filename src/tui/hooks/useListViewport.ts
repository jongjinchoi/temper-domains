import { useBoxMetrics, useWindowSize, type DOMElement } from "ink";
import { useRef } from "react";

// One scroll-indicator line above and below at least one row.
const MIN_LIST_HEIGHT = 3;

export type ListViewportState = ReturnType<typeof useListViewport>;

// The screen that owns a list also owns whether its rows are on screen, so key
// handlers and the viewport read the same value. A compact FrameBox detaches the
// list, which Ink reports as unmeasured. useBoxMetrics refreshes after renders of
// its owner, so resizes must re-render the owner to track a remounted list.
export function useListViewport() {
  useWindowSize();
  const ref = useRef<DOMElement>(null);
  const metrics = useBoxMetrics(ref);
  return { ref, metrics, visible: metrics.hasMeasured && metrics.height >= MIN_LIST_HEIGHT };
}
