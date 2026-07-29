// Pure game rules as state transitions: each takes a GameState and returns a new
// one, reusing unchanged cell/row references (copy-on-write) so memoized cells
// don't re-render. No DOM, no audio, no timers — the hook layer owns those.

import type { BoardConfig, CellState, DifficultyName, GameState } from './types';
import { isSolvable } from './solver';

// The first-clicked cell and its neighbors stay safe, AND the board is
// regenerated until it is fully solvable by pure logic (see solver.ts).
// Regeneration is bounded so the first click never hangs.
const MAX_ATTEMPTS = 400;
const TIME_BUDGET_MS = 1500;

function makeCell(): CellState {
  return { mine: false, revealed: false, flagged: 0, adjacent: 0 };
}

export function createGame(
  difficulty: DifficultyName,
  config: BoardConfig,
  gameId: number,
  solvableOnly = true
): GameState {
  const grid: CellState[][] = [];
  for (let r = 0; r < config.rows; r++) {
    const row: CellState[] = [];
    for (let c = 0; c < config.cols; c++) row.push(makeCell());
    grid.push(row);
  }
  return {
    difficulty,
    rows: config.rows,
    cols: config.cols,
    totalMines: config.mines,
    grid,
    minesPlaced: false,
    flagsPlaced: 0,
    revealedCount: 0,
    timer: 0,
    gameOver: false,
    won: false,
    solvableOnly,
    gameId,
  };
}

// ---- Copy-on-write grid editor -------------------------------------------
// Clones a row only when one of its cells is written, and a cell only when it
// changes. Untouched rows/cells keep their original references.
interface GridEditor {
  grid: CellState[][];
  get(r: number, c: number): CellState;
  set(r: number, c: number, patch: Partial<CellState>): void;
}

function editGrid(grid: CellState[][]): GridEditor {
  const next = grid.slice();
  const rowCopied: boolean[] = new Array(grid.length).fill(false);
  const ensureRow = (r: number) => {
    if (!rowCopied[r]) {
      next[r] = grid[r].slice();
      rowCopied[r] = true;
    }
  };
  return {
    grid: next,
    get: (r, c) => next[r][c],
    set: (r, c, patch) => {
      ensureRow(r);
      next[r][c] = { ...next[r][c], ...patch };
    },
  };
}

function neighbors(rows: number, cols: number, r: number, c: number): [number, number][] {
  const out: [number, number][] = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr,
        nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) out.push([nr, nc]);
    }
  return out;
}

// ---- Mine placement (first click safe + no-guess) ------------------------
function randomLayout(n: number, totalMines: number, safe: Set<number>): Uint8Array {
  const mines = new Uint8Array(n);
  let placed = 0;
  while (placed < totalMines) {
    const i = (Math.random() * n) | 0;
    if (!mines[i] && !safe.has(i)) {
      mines[i] = 1;
      placed++;
    }
  }
  return mines;
}

// Produce a mine layout for a first click at (safeR, safeC), commit it into a
// fresh copy of the grid, and compute adjacency counts. When state.solvableOnly
// is set, the layout is regenerated until the no-guess solver accepts it (bounded
// by an attempt + time cap); otherwise the first random safe layout is used.
function placeMines(state: GameState, safeR: number, safeC: number): CellState[][] {
  const { rows, cols, totalMines } = state;
  const n = rows * cols;
  const safe = new Set<number>();
  safe.add(safeR * cols + safeC);
  neighbors(rows, cols, safeR, safeC).forEach(([nr, nc]) => safe.add(nr * cols + nc));

  let mines = randomLayout(n, totalMines, safe);
  if (state.solvableOnly) {
    const deadline = Date.now() + TIME_BUDGET_MS;
    for (
      let attempt = 1;
      !isSolvable(mines, rows, cols, totalMines, safeR, safeC);
      attempt++
    ) {
      if (attempt >= MAX_ATTEMPTS || Date.now() > deadline) break; // fallback
      mines = randomLayout(n, totalMines, safe);
    }
  }

  // Build a brand-new grid with the mines + adjacency counts.
  const grid: CellState[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: CellState[] = [];
    for (let c = 0; c < cols; c++) {
      const mine = mines[r * cols + c] === 1;
      row.push({ mine, revealed: false, flagged: state.grid[r][c].flagged, adjacent: 0 });
    }
    grid.push(row);
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c].mine) continue;
      let count = 0;
      neighbors(rows, cols, r, c).forEach(([nr, nc]) => {
        if (grid[nr][nc].mine) count++;
      });
      grid[r][c].adjacent = count;
    }
  }
  return grid;
}

// Recompute adjacency for a grid whose mines are already set (used on restore).
export function computeAdjacency(grid: CellState[][], rows: number, cols: number): void {
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (grid[r][c].mine) continue;
      let count = 0;
      neighbors(rows, cols, r, c).forEach(([nr, nc]) => {
        if (grid[nr][nc].mine) count++;
      });
      grid[r][c].adjacent = count;
    }
}

// ---- Reveal --------------------------------------------------------------
// Iterative flood-fill for zero-adjacent cells. Returns how many were revealed.
function floodFill(ed: GridEditor, rows: number, cols: number, r: number, c: number): number {
  let revealed = 0;
  const stack: [number, number][] = [[r, c]];
  while (stack.length) {
    const [cr, cc] = stack.pop()!;
    const cell = ed.get(cr, cc);
    if (cell.revealed || cell.flagged !== 0 || cell.mine) continue;
    ed.set(cr, cc, { revealed: true });
    revealed++;
    if (cell.adjacent === 0) {
      neighbors(rows, cols, cr, cc).forEach(([nr, nc]) => stack.push([nr, nc]));
    }
  }
  return revealed;
}

// Reveal a hidden, unflagged cell. Places mines on the first reveal. Hitting a
// mine ends the game (all mines exposed). `popped` marks the clicked cell for
// the one-shot reveal animation.
export function revealCell(state: GameState, r: number, c: number, popped = true): GameState {
  if (state.gameOver) return state;
  let working = state;
  // First click: generate the (solvable) mine layout now.
  if (!state.minesPlaced) {
    const grid = placeMines(state, r, c);
    working = { ...state, grid, minesPlaced: true };
  }
  const cell = working.grid[r][c];
  if (cell.revealed || cell.flagged !== 0) return state === working ? state : working;

  if (cell.mine) return loseGame(working, r, c);

  const ed = editGrid(working.grid);
  let gained = 0;
  ed.set(r, c, { revealed: true, ...(popped ? { popped: true } : {}) });
  gained++;
  if (cell.adjacent === 0) {
    neighbors(working.rows, working.cols, r, c).forEach(([nr, nc]) => {
      gained += floodFill(ed, working.rows, working.cols, nr, nc);
    });
  }

  const next: GameState = {
    ...working,
    grid: ed.grid,
    revealedCount: working.revealedCount + gained,
  };
  return maybeWin(next);
}

// ---- Chording: reveal unrevealed neighbors when flags match the number ----
export function chord(state: GameState, r: number, c: number): GameState {
  if (state.gameOver) return state;
  const cell = state.grid[r][c];
  if (!cell.revealed || cell.adjacent === 0) return state;

  const nbrs = neighbors(state.rows, state.cols, r, c);
  let flagCount = 0;
  for (const [nr, nc] of nbrs) if (state.grid[nr][nc].flagged === 1) flagCount++;
  if (flagCount !== cell.adjacent) return state;

  // A misplaced flag turns chording into a loss on the wrongly-flagged cell.
  for (const [nr, nc] of nbrs) {
    if (state.grid[nr][nc].flagged === 1 && !state.grid[nr][nc].mine) {
      return loseGame(state, nr, nc);
    }
  }

  let next = state;
  for (const [nr, nc] of nbrs) {
    const n = next.grid[nr][nc];
    if (!n.revealed && n.flagged === 0) {
      next = revealCell(next, nr, nc, false);
      if (next.gameOver) return next;
    }
  }
  return next;
}

// ---- Flagging (cycles blank -> flag -> question) --------------------------
export function cycleFlag(state: GameState, r: number, c: number): GameState {
  const cell = state.grid[r][c];
  if (cell.revealed || state.gameOver) return state;
  const flagged = ((cell.flagged + 1) % 3) as CellState['flagged'];

  const ed = editGrid(state.grid);
  ed.set(r, c, { flagged });
  let flagsPlaced = 0;
  for (let rr = 0; rr < state.rows; rr++)
    for (let cc = 0; cc < state.cols; cc++)
      if (ed.get(rr, cc).flagged === 1) flagsPlaced++;

  return { ...state, grid: ed.grid, flagsPlaced };
}

// ---- Lose ----------------------------------------------------------------
function loseGame(state: GameState, clickedR: number, clickedC: number): GameState {
  const ed = editGrid(state.grid);
  // Expose every hidden, unflagged mine.
  for (let r = 0; r < state.rows; r++)
    for (let c = 0; c < state.cols; c++) {
      const cell = ed.get(r, c);
      if (cell.mine && !cell.revealed && cell.flagged !== 1) ed.set(r, c, { revealed: true });
      // Mark wrongly-flagged (non-mine) cells.
      if (cell.flagged === 1 && !cell.mine) ed.set(r, c, { wrongFlag: true });
    }
  ed.set(clickedR, clickedC, { revealed: true, exploded: true });

  return { ...state, grid: ed.grid, gameOver: true, won: false };
}

// ---- Win -----------------------------------------------------------------
function maybeWin(state: GameState): GameState {
  const totalSafe = state.rows * state.cols - state.totalMines;
  if (state.revealedCount !== totalSafe || state.gameOver) return state;

  const ed = editGrid(state.grid);
  let flagsPlaced = state.flagsPlaced;
  // Auto-flag the remaining mines.
  for (let r = 0; r < state.rows; r++)
    for (let c = 0; c < state.cols; c++) {
      const cell = ed.get(r, c);
      if (cell.mine && cell.flagged !== 1) {
        ed.set(r, c, { flagged: 1 });
        flagsPlaced++;
      }
    }
  return { ...state, grid: ed.grid, gameOver: true, won: true, flagsPlaced };
}

// ---- Undo support --------------------------------------------------------
// Strip the one-shot animation markers from a grid. Used when an undo restores
// an earlier snapshot: those cells already played their pop/explosion, and a
// rewound board is no longer a lost one, so nothing should replay. Non-mutating
// (snapshots share rows with the live grid) and reference-preserving, so
// untouched rows/cells stay memoized.
export function clearTransientFlags(grid: CellState[][]): CellState[][] {
  let gridTouched = false;
  const next = grid.map((row) => {
    let rowTouched = false;
    const nextRow = row.map((cell) => {
      if (!cell.exploded && !cell.wrongFlag && !cell.popped) return cell;
      rowTouched = true;
      const copy = { ...cell };
      delete copy.exploded;
      delete copy.wrongFlag;
      delete copy.popped;
      return copy;
    });
    if (!rowTouched) return row;
    gridTouched = true;
    return nextRow;
  });
  return gridTouched ? next : grid;
}

// Which unrevealed non-mine neighbors a chord would open (for the press preview).
export function chordPreviewCells(
  state: GameState,
  r: number,
  c: number
): [number, number][] {
  const cell = state.grid[r][c];
  if (!cell.revealed || cell.adjacent === 0) return [];
  return neighbors(state.rows, state.cols, r, c).filter(([nr, nc]) => {
    const n = state.grid[nr][nc];
    return !n.revealed && n.flagged === 0;
  });
}
