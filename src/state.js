// Pure game state, constants and small data helpers. No DOM, no audio.

export const DIFFICULTIES = {
  beginner:     { rows: 9,  cols: 9,  mines: 10, label: 'Beginner' },
  intermediate: { rows: 16, cols: 16, mines: 40, label: 'Intermediate' },
  expert:       { rows: 16, cols: 30, mines: 99, label: 'Expert' },
};

export const GAP = 3; // px — keep in sync with --gap in styles.css

// The single source of truth for the game in progress.
// Each grid entry is { mine, revealed, flagged, adjacentMines }
// where flagged is 0 = blank, 1 = flag, 2 = question.
export const game = {
  difficulty: 'beginner',
  rows: 0, cols: 0, totalMines: 0,
  grid: [],
  minesPlaced: false,
  flagsPlaced: 0,
  revealedCount: 0,
  timer: 0,
  timerInterval: null,
  gameOver: false,
  won: false,
  mouseDown: false,
};

// Reset `game` to a fresh, empty board for the given difficulty.
export function resetState(difficulty) {
  const d = DIFFICULTIES[difficulty];
  game.difficulty = difficulty;
  game.rows = d.rows;
  game.cols = d.cols;
  game.totalMines = d.mines;
  game.minesPlaced = false;
  game.flagsPlaced = 0;
  game.revealedCount = 0;
  game.timer = 0;
  game.gameOver = false;
  game.won = false;
  game.mouseDown = false;

  game.grid = [];
  for (let r = 0; r < d.rows; r++) {
    game.grid[r] = [];
    for (let c = 0; c < d.cols; c++) {
      game.grid[r][c] = { mine: false, revealed: false, flagged: 0, adjacentMines: 0 };
    }
  }
}

// Coordinates of the (up to 8) neighbors of (r, c), clamped to the board.
export function neighbors(r, c) {
  const result = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < game.rows && nc >= 0 && nc < game.cols) result.push([nr, nc]);
    }
  }
  return result;
}

// LED-style 3-digit formatting; handles negatives (-5 -> "-05").
export function pad3(n) {
  if (n < 0) {
    const a = Math.min(99, -n);
    return '-' + (a < 10 ? '0' + a : '' + a);
  }
  n = Math.min(999, n);
  return n < 10 ? '00' + n : n < 100 ? '0' + n : '' + n;
}

// ---- Best times (per difficulty, persisted in localStorage) ----
const bestKey = (diff) => 'minesweeper.best.' + diff;

export function getBest(diff) {
  try { const v = localStorage.getItem(bestKey(diff)); return v ? parseInt(v, 10) : null; }
  catch (e) { return null; }
}

export function setBest(diff, t) {
  try { localStorage.setItem(bestKey(diff), t); } catch (e) {}
}
