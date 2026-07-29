// Difficulty presets and the custom-board rules. Pure — safe to import anywhere.

import type { BoardConfig, DifficultyName } from './types';

export const DIFFICULTIES: Record<
  Exclude<DifficultyName, 'custom'>,
  BoardConfig
> = {
  beginner: { rows: 9, cols: 9, mines: 10, label: 'Beginner' },
  intermediate: { rows: 16, cols: 16, mines: 40, label: 'Intermediate' },
  expert: { rows: 16, cols: 30, mines: 99, label: 'Expert' },
};

export const GAP = 3; // px — keep in sync with --gap in globals.css

// ---- Custom difficulty ----
// Bounds for a user-defined board. Mines are additionally capped per board by
// density (see maxMinesFor).
export const CUSTOM_LIMITS = {
  rows: { min: 5, max: 30 },
  cols: { min: 5, max: 40 },
  minMines: 1,
} as const;

// The most mines a custom board may hold: the hardest count that our no-guess
// generator can still reliably make logically solvable, and that never auto-wins
// on the first click.
//
// The maximum solvable density falls as boards grow — measured empirically at
// ~31% for 81 cells down to ~22% for 1200 (the larger the board, the more room
// for an unavoidable guess). So this tracks board size rather than a flat
// percentage: fitted to the measured solvable edge (~0.55·cells^0.87) with a
// reliability margin, then clamped so the first click's 3x3 safe region always
// fits (mines = cells − 9 is the degenerate point where the opening flood reveals
// every safe cell and wins instantly). Verified across sizes at 100%
// no-guess-solvable and 0% auto-win.
export function maxMinesFor(rows: number, cols: number): number {
  const cells = rows * cols;
  const byDensity = Math.floor(0.5 * Math.pow(cells, 0.87));
  return Math.max(1, Math.min(byDensity, cells - 9));
}

// Coerce arbitrary input into a valid { rows, cols, mines } within the limits.
export function clampCustom(
  rows: unknown,
  cols: unknown,
  mines: unknown
): { rows: number; cols: number; mines: number } {
  const clamp = (v: unknown, lo: number, hi: number, fb: number): number => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : fb;
  };
  const r = clamp(rows, CUSTOM_LIMITS.rows.min, CUSTOM_LIMITS.rows.max, CUSTOM_LIMITS.rows.min);
  const c = clamp(cols, CUSTOM_LIMITS.cols.min, CUSTOM_LIMITS.cols.max, CUSTOM_LIMITS.cols.min);
  const m = clamp(mines, CUSTOM_LIMITS.minMines, maxMinesFor(r, c), CUSTOM_LIMITS.minMines);
  return { rows: r, cols: c, mines: m };
}

export const DEFAULT_CUSTOM: BoardConfig = {
  rows: 16,
  cols: 16,
  mines: 40,
  label: 'Custom',
};

// Resolve a difficulty name to its board config. 'custom' is resolved against a
// caller-supplied custom config (the live one lives in persistence/state).
export function getConfig(
  difficulty: DifficultyName,
  custom: BoardConfig = DEFAULT_CUSTOM
): BoardConfig {
  if (difficulty === 'custom') {
    return { rows: custom.rows, cols: custom.cols, mines: custom.mines, label: 'Custom' };
  }
  return DIFFICULTIES[difficulty];
}
