// ── Node size computation ─────────────────────────────────────────────

import type { NodeDimensions } from './types';

/** Minimum node size in pixels. */
export const BASE_SIZE = 96;

/** Pixels added per doubling of token count. */
export const SCALE_FACTOR = 8;

/**
 * Compute node dimensions from total token count.
 *
 * Size = BASE_SIZE + log2(1 + totalTokens) * SCALE_FACTOR
 *
 * Examples:
 *   0 tokens     → 96 × 72
 *   100 tokens   → ~149 × ~112
 *   10_000 tokens → ~203 × ~152
 */
export function computeNodeSize(totalTokens: number): NodeDimensions {
  const size = BASE_SIZE + Math.log2(1 + totalTokens) * SCALE_FACTOR;
  return { width: size, height: size * 0.75 };
}
