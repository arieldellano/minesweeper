// localStorage persistence: the in-progress game (survives reloads), per-config
// best times, and the last-used custom board. All client-only and defensively
// wrapped so private-mode / disabled storage just plays without persistence.

import type {
  BestRecord,
  BoardConfig,
  CellState,
  DifficultyName,
  GameState,
  Settings,
} from './types';
import { MAX_NAME_LENGTH } from './types';
import { DIFFICULTIES, DEFAULT_CUSTOM, clampCustom, getConfig } from './difficulty';
import { computeAdjacency } from './game';

const SAVE_KEY = 'minesweeper.save';
const CUSTOM_KEY = 'minesweeper.custom';
const MUTED_KEY = 'minesweeper.muted';
const SETTINGS_KEY = 'minesweeper.settings';
const PLAYER_KEY = 'minesweeper.player';

export const DEFAULT_SETTINGS: Settings = {
  defaultDifficulty: 'beginner',
  solvableOnly: true,
  guaranteeOpening: false,
  undoEnabled: true,
};

function ls(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

// ---- Custom board config --------------------------------------------------
export function loadCustomConfig(): BoardConfig {
  const store = ls();
  if (!store) return { ...DEFAULT_CUSTOM };
  try {
    const raw = store.getItem(CUSTOM_KEY);
    if (!raw) return { ...DEFAULT_CUSTOM };
    const parsed = JSON.parse(raw);
    const c = clampCustom(parsed.rows, parsed.cols, parsed.mines);
    return { ...c, label: 'Custom' };
  } catch {
    return { ...DEFAULT_CUSTOM };
  }
}

export function saveCustomConfig(config: BoardConfig): void {
  const store = ls();
  if (!store) return;
  try {
    store.setItem(
      CUSTOM_KEY,
      JSON.stringify({ rows: config.rows, cols: config.cols, mines: config.mines })
    );
  } catch {
    /* ignore */
  }
}

// ---- Best times -----------------------------------------------------------
// Custom bests are keyed by their exact dimensions so different custom boards
// keep separate records.
function bestKey(difficulty: DifficultyName, custom: BoardConfig): string {
  if (difficulty === 'custom') {
    return `minesweeper.best.custom.${custom.cols}x${custom.rows}x${custom.mines}`;
  }
  return `minesweeper.best.${difficulty}`;
}

// Trim a player-supplied name to something storable. Returns null for anything
// blank, so "no name" has exactly one representation.
export function normalizeName(name: string): string | null {
  const clean = name.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME_LENGTH);
  return clean || null;
}

// Records are stored as {"t":time,"n":name}. Records written before names
// existed are a bare number string, and still read fine as anonymous.
function parseBest(raw: string | null): BestRecord | null {
  if (!raw) return null;
  const legacy = Number(raw);
  if (Number.isFinite(legacy)) return { time: legacy, name: null };
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.t !== 'number' || !Number.isFinite(parsed.t)) return null;
    return { time: parsed.t, name: typeof parsed.n === 'string' ? normalizeName(parsed.n) : null };
  } catch {
    return null;
  }
}

export function getBest(difficulty: DifficultyName, custom: BoardConfig): BestRecord | null {
  const store = ls();
  if (!store) return null;
  try {
    return parseBest(store.getItem(bestKey(difficulty, custom)));
  } catch {
    return null;
  }
}

export function setBest(
  difficulty: DifficultyName,
  custom: BoardConfig,
  time: number,
  name: string | null = null
): void {
  const store = ls();
  if (!store) return;
  try {
    store.setItem(bestKey(difficulty, custom), JSON.stringify({ t: time, n: name }));
  } catch {
    /* ignore */
  }
}

// Attach a name to an already-saved record. Guarded on the time so a stale
// prompt can never relabel a record someone else has since beaten.
export function setBestName(
  difficulty: DifficultyName,
  custom: BoardConfig,
  time: number,
  name: string | null
): boolean {
  const current = getBest(difficulty, custom);
  if (!current || current.time !== time) return false;
  setBest(difficulty, custom, time, name);
  return true;
}

// ---- Player name (prefilled into the new-record prompt) -------------------
export function loadPlayerName(): string {
  const store = ls();
  if (!store) return '';
  try {
    return normalizeName(store.getItem(PLAYER_KEY) || '') || '';
  } catch {
    return '';
  }
}

export function savePlayerName(name: string): void {
  const store = ls();
  if (!store) return;
  try {
    const clean = normalizeName(name);
    if (clean) store.setItem(PLAYER_KEY, clean);
    else store.removeItem(PLAYER_KEY);
  } catch {
    /* ignore */
  }
}

// ---- Sound mute -----------------------------------------------------------
export function loadMuted(): boolean {
  const store = ls();
  if (!store) return false;
  try {
    return store.getItem(MUTED_KEY) === '1';
  } catch {
    return false;
  }
}

export function saveMuted(muted: boolean): void {
  const store = ls();
  if (!store) return;
  try {
    store.setItem(MUTED_KEY, muted ? '1' : '0');
  } catch {
    /* ignore */
  }
}

// ---- Settings (default difficulty, solvable-only, undo) -------------------
export function loadSettings(): Settings {
  const store = ls();
  if (!store) return { ...DEFAULT_SETTINGS };
  try {
    const raw = store.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    const dd = parsed.defaultDifficulty;
    const valid = dd === 'beginner' || dd === 'intermediate' || dd === 'expert' || dd === 'custom';
    return {
      defaultDifficulty: valid ? dd : DEFAULT_SETTINGS.defaultDifficulty,
      solvableOnly: typeof parsed.solvableOnly === 'boolean' ? parsed.solvableOnly : true,
      guaranteeOpening:
        typeof parsed.guaranteeOpening === 'boolean' ? parsed.guaranteeOpening : false,
      undoEnabled: typeof parsed.undoEnabled === 'boolean' ? parsed.undoEnabled : true,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  const store = ls();
  if (!store) return;
  try {
    store.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

// Clear the best-time records for the preset difficulties (custom bests are
// keyed by dimensions and left as-is).
export function clearBests(): void {
  const store = ls();
  if (!store) return;
  try {
    (['beginner', 'intermediate', 'expert'] as const).forEach((d) =>
      store.removeItem(`minesweeper.best.${d}`)
    );
  } catch {
    /* ignore */
  }
}

// ---- In-progress game -----------------------------------------------------
interface SavePayload {
  v: 1;
  difficulty: DifficultyName;
  custom: { rows: number; cols: number; mines: number } | null;
  minesPlaced: boolean;
  flagsPlaced: number;
  revealedCount: number;
  timer: number;
  gameOver: boolean;
  won: boolean;
  solvableOnly: boolean;
  guaranteeOpening?: boolean;
  mines: string | null;
  revealed: string;
  flagged: string;
}

export function saveGame(state: GameState): void {
  const store = ls();
  if (!store) return;
  try {
    let mines = '',
      revealed = '',
      flagged = '';
    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        const cell = state.grid[r][c];
        if (state.minesPlaced) mines += cell.mine ? '1' : '0';
        revealed += cell.revealed ? '1' : '0';
        flagged += cell.flagged;
      }
    }
    const payload: SavePayload = {
      v: 1,
      difficulty: state.difficulty,
      custom:
        state.difficulty === 'custom'
          ? { rows: state.rows, cols: state.cols, mines: state.totalMines }
          : null,
      minesPlaced: state.minesPlaced,
      flagsPlaced: state.flagsPlaced,
      revealedCount: state.revealedCount,
      timer: state.timer,
      gameOver: state.gameOver,
      won: state.won,
      solvableOnly: state.solvableOnly,
      guaranteeOpening: state.guaranteeOpening,
      mines: state.minesPlaced ? mines : null,
      revealed,
      flagged,
    };
    store.setItem(SAVE_KEY, JSON.stringify(payload));
  } catch {
    /* storage unavailable / full — play without persistence */
  }
}

export function clearSave(): void {
  const store = ls();
  if (!store) return;
  try {
    store.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

// Rebuild a saved game into a GameState. Returns null when there is nothing
// valid to restore.
export function loadGame(gameId: number): GameState | null {
  const store = ls();
  if (!store) return null;
  let data: SavePayload;
  try {
    const raw = store.getItem(SAVE_KEY);
    if (!raw) return null;
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || data.v !== 1) return null;

  let config: BoardConfig;
  if (data.difficulty === 'custom') {
    if (!data.custom) return null;
    const c = clampCustom(data.custom.rows, data.custom.cols, data.custom.mines);
    config = { ...c, label: 'Custom' };
  } else {
    config = DIFFICULTIES[data.difficulty as Exclude<DifficultyName, 'custom'>];
    if (!config) return null;
  }

  const { rows, cols } = config;
  const n = rows * cols;
  if (typeof data.revealed !== 'string' || data.revealed.length !== n) return null;
  if (typeof data.flagged !== 'string' || data.flagged.length !== n) return null;
  if (data.minesPlaced && (typeof data.mines !== 'string' || data.mines.length !== n)) return null;

  const grid: CellState[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: CellState[] = [];
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const mine = data.minesPlaced && data.mines ? data.mines[i] === '1' : false;
      row.push({
        mine,
        revealed: data.revealed[i] === '1',
        flagged: Number(data.flagged[i]) as CellState['flagged'],
        adjacent: 0,
      });
    }
    grid.push(row);
  }
  if (data.minesPlaced) computeAdjacency(grid, rows, cols);

  // On a lost game, re-mark wrongly-flagged cells so the restored view matches.
  if (data.gameOver && !data.won) {
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const cell = grid[r][c];
        if (cell.flagged === 1 && !cell.mine) cell.wrongFlag = true;
      }
  }

  return {
    difficulty: data.difficulty,
    rows,
    cols,
    totalMines: config.mines,
    grid,
    minesPlaced: !!data.minesPlaced,
    flagsPlaced: data.flagsPlaced | 0,
    revealedCount: data.revealedCount | 0,
    timer: data.timer | 0,
    gameOver: !!data.gameOver,
    won: !!data.won,
    solvableOnly: typeof data.solvableOnly === 'boolean' ? data.solvableOnly : true,
    guaranteeOpening: typeof data.guaranteeOpening === 'boolean' ? data.guaranteeOpening : false,
    gameId,
  };
}

export { getConfig };
