export interface VirtualizerInput {
  blockHeights: number[];
  scrollTop: number;
  viewportHeight: number;
  overscan: number;
}

export interface VirtualizerOutput {
  firstIndex: number;
  lastIndex: number;
  offsetTop: number;
  totalHeight: number;
}

export function computeVisible(input: VirtualizerInput): VirtualizerOutput {
  const { blockHeights, scrollTop, viewportHeight, overscan } = input;
  const n = blockHeights.length;

  if (n === 0) {
    return { firstIndex: 0, lastIndex: -1, offsetTop: 0, totalHeight: 0 };
  }

  // Prefix-sum scan to find first visible index.
  let first = 0;
  let accTop = 0;
  let found = false;
  for (let i = 0; i < n; i++) {
    if (accTop + blockHeights[i] > scrollTop) {
      first = i;
      found = true;
      break;
    }
    accTop += blockHeights[i];
  }
  if (!found) {
    // scrollTop is past the end — clamp to last block.
    first = n - 1;
    accTop -= blockHeights[n - 1];
  }

  // Continue scanning until we've covered viewportHeight.
  let last = first;
  let running = accTop;
  const viewportEnd = scrollTop + viewportHeight;
  for (let i = first; i < n; i++) {
    running += blockHeights[i];
    last = i;
    if (running >= viewportEnd) break;
  }

  // Apply overscan, clamped.
  const firstWithOverscan = Math.max(0, first - overscan);
  const lastWithOverscan = Math.min(n - 1, last + overscan);

  // offsetTop is the top of the first rendered block (including overscan).
  let offsetTop = 0;
  for (let i = 0; i < firstWithOverscan; i++) offsetTop += blockHeights[i];

  let totalHeight = 0;
  for (let i = 0; i < n; i++) totalHeight += blockHeights[i];

  return {
    firstIndex: firstWithOverscan,
    lastIndex: lastWithOverscan,
    offsetTop,
    totalHeight,
  };
}
