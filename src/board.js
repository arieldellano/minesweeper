// Game logic and flow control: new game, mine placement, reveal/flood-fill,
// chording, flagging, win/lose. This layer owns the rules and the timer, and
// drives the UI through render.js + sound.js + fx.js — it never touches the DOM.

import { game, resetState, neighbors, getBest, setBest, pad3, DIFFICULTIES } from './state.js';
import * as render from './render.js';
import { sound } from './sound.js';
import { launchConfetti } from './fx.js';
import { isSolvable } from './solver.js';

// ---- Timer ----
function startTimer() {
  if (game.timerInterval) return;
  game.timerInterval = setInterval(() => {
    game.timer = Math.min(game.timer + 1, 999);
    render.updateTimer();
    saveState(); // persist elapsed time each tick
  }, 1000);
}
function stopTimer() { clearInterval(game.timerInterval); game.timerInterval = null; }

// ---- Persistence (the game survives page reloads) --------------------------
const SAVE_KEY = 'minesweeper.save';

// Serialize the whole game compactly. adjacentMines is not stored — it is
// recomputed from the mine layout on restore.
function saveState() {
  try {
    let mines = '', revealed = '', flagged = '';
    for (let r = 0; r < game.rows; r++) {
      for (let c = 0; c < game.cols; c++) {
        const cell = game.grid[r][c];
        if (game.minesPlaced) mines += cell.mine ? '1' : '0';
        revealed += cell.revealed ? '1' : '0';
        flagged += cell.flagged; // 0 | 1 | 2
      }
    }
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      v: 1,
      difficulty: game.difficulty,
      minesPlaced: game.minesPlaced,
      flagsPlaced: game.flagsPlaced,
      revealedCount: game.revealedCount,
      timer: game.timer,
      gameOver: game.gameOver,
      won: game.won,
      mines: game.minesPlaced ? mines : null,
      revealed,
      flagged,
    }));
  } catch (e) { /* storage unavailable / full — play without persistence */ }
}

// Rebuild the saved game into the UI. Returns false if there is nothing valid
// to restore (caller then starts a fresh game).
export function restoreGame() {
  let data;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    data = JSON.parse(raw);
  } catch (e) { return false; }

  const d = data && DIFFICULTIES[data.difficulty];
  if (!d || data.v !== 1) return false;
  const n = d.rows * d.cols;
  if (typeof data.revealed !== 'string' || data.revealed.length !== n) return false;
  if (typeof data.flagged !== 'string' || data.flagged.length !== n) return false;
  if (data.minesPlaced && (typeof data.mines !== 'string' || data.mines.length !== n)) return false;

  stopTimer();
  render.clearPressed();
  resetState(data.difficulty);

  game.minesPlaced = !!data.minesPlaced;
  game.flagsPlaced = data.flagsPlaced | 0;
  game.revealedCount = data.revealedCount | 0;
  game.timer = data.timer | 0;
  game.gameOver = !!data.gameOver;
  game.won = !!data.won;

  for (let r = 0; r < d.rows; r++) {
    for (let c = 0; c < d.cols; c++) {
      const i = r * d.cols + c;
      const cell = game.grid[r][c];
      if (game.minesPlaced) cell.mine = data.mines[i] === '1';
      cell.revealed = data.revealed[i] === '1';
      cell.flagged = +data.flagged[i];
    }
  }
  if (game.minesPlaced) {
    for (let r = 0; r < d.rows; r++)
      for (let c = 0; c < d.cols; c++) {
        if (game.grid[r][c].mine) continue;
        let count = 0;
        neighbors(r, c).forEach(([nr, nc]) => { if (game.grid[nr][nc].mine) count++; });
        game.grid[r][c].adjacentMines = count;
      }
  }

  render.updateMineCounter();
  render.updateTimer();
  render.renderBest(false);
  render.setActiveDifficulty(data.difficulty);
  render.renderBoard(false); // rebuild the grid without the entrance animation

  for (let r = 0; r < d.rows; r++)
    for (let c = 0; c < d.cols; c++) {
      const cell = game.grid[r][c];
      if (cell.revealed || cell.flagged) render.updateCellEl(r, c);
    }

  if (game.won) {
    render.setFace('😎');
    render.setStatus('🎉 You win! Time ' + pad3(game.timer), 'win');
  } else if (game.gameOver) {
    render.setFace('😵');
    render.setStatus('💥 Boom! Game over', 'lose');
    for (let r = 0; r < d.rows; r++)
      for (let c = 0; c < d.cols; c++)
        if (game.grid[r][c].flagged === 1 && !game.grid[r][c].mine) render.markWrongFlag(r, c);
  } else {
    render.setFace('🙂');
    render.setStatus('Left-click reveals · right-click / long-press flags');
  }

  if (game.minesPlaced && !game.gameOver) startTimer(); // resume ticking
  return true;
}

// ---- New game ----
// `silent` skips the new-game blip; used for the initial bootstrap so we don't
// attempt to start audio before the first user gesture.
export function newGame(difficulty, silent) {
  stopTimer();
  render.clearPressed();
  resetState(difficulty);

  render.updateMineCounter();
  render.updateTimer();
  render.setFace('🙂');
  render.setStatus('Left-click reveals · right-click / long-press flags');
  render.renderBest(false);
  render.setActiveDifficulty(difficulty);
  render.renderBoard();

  if (!silent) sound.newgame();
  saveState();
}

// ---- Mine placement --------------------------------------------------------
// The first-clicked cell and its neighbors stay safe (so the first click always
// opens a region), AND the board is regenerated until it is fully solvable by
// pure logic — the player never needs to guess. See src/solver.js.
//
// Regeneration is bounded (attempt + time cap) so the first click never hangs.
// In the rare case no solvable board is found in time (mainly Expert), the last
// layout is used as a fallback.
const MAX_ATTEMPTS = 400;
const TIME_BUDGET_MS = 1500;

// A random mine layout as a flat Uint8Array (1 = mine), avoiding the safe set.
function randomLayout(safe) {
  const n = game.rows * game.cols;
  const mines = new Uint8Array(n);
  let placed = 0;
  while (placed < game.totalMines) {
    const i = (Math.random() * n) | 0;
    if (!mines[i] && !safe.has(i)) { mines[i] = 1; placed++; }
  }
  return mines;
}

function placeMines(safeR, safeC) {
  const { rows, cols, totalMines } = game;
  const safe = new Set();
  safe.add(safeR * cols + safeC);
  neighbors(safeR, safeC).forEach(([nr, nc]) => safe.add(nr * cols + nc));

  let mines = randomLayout(safe);
  const deadline = Date.now() + TIME_BUDGET_MS;
  for (let attempt = 1;
       !isSolvable(mines, rows, cols, totalMines, safeR, safeC);
       attempt++) {
    if (attempt >= MAX_ATTEMPTS || Date.now() > deadline) break; // fallback
    mines = randomLayout(safe);
  }

  // Commit the chosen layout into the grid and compute adjacency counts.
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      game.grid[r][c].mine = mines[r * cols + c] === 1;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (game.grid[r][c].mine) continue;
      let count = 0;
      neighbors(r, c).forEach(([nr, nc]) => { if (game.grid[nr][nc].mine) count++; });
      game.grid[r][c].adjacentMines = count;
    }
  }
  game.minesPlaced = true;
}

// ---- Reveal ----
// Flood-fill for zero-adjacent cells. Intentionally silent and pop-free so big
// cascades stay instant.
function revealZero(r, c) {
  const cell = game.grid[r][c];
  if (cell.revealed || cell.flagged !== 0 || cell.mine) return;
  cell.revealed = true;
  game.revealedCount++;
  render.updateCellEl(r, c);
  if (cell.adjacentMines === 0) {
    neighbors(r, c).forEach(([nr, nc]) => revealZero(nr, nc));
  }
}

// `silent` suppresses the per-cell reveal sound (a chord plays one sound total).
export function revealCell(r, c, silent) {
  if (game.gameOver) return;
  const cell = game.grid[r][c];
  if (cell.revealed || cell.flagged !== 0) return;
  if (!game.minesPlaced) { placeMines(r, c); startTimer(); }
  if (cell.mine) { loseGame(r, c); return; }

  cell.revealed = true;
  game.revealedCount++;
  render.updateCellEl(r, c);
  render.getCellEl(r, c).classList.add('pop'); // pop only the clicked cell (perf)
  if (!silent) sound.reveal();

  if (cell.adjacentMines === 0) {
    neighbors(r, c).forEach(([nr, nc]) => revealZero(nr, nc));
  }
  checkWin();
  if (!silent) saveState(); // chord's internal reveals are silent; it saves once itself
}

// ---- Chording: reveal unrevealed neighbors when flags match the number ----
export function chord(r, c) {
  if (game.gameOver) return;
  const cell = game.grid[r][c];
  if (!cell.revealed || cell.adjacentMines === 0) return;

  let flagCount = 0;
  neighbors(r, c).forEach(([nr, nc]) => { if (game.grid[nr][nc].flagged === 1) flagCount++; });
  if (flagCount !== cell.adjacentMines) return;

  // A misplaced flag turns chording into a loss on the wrongly-flagged cell.
  let wrongFlag = null;
  neighbors(r, c).forEach(([nr, nc]) => {
    if (game.grid[nr][nc].flagged === 1 && !game.grid[nr][nc].mine) wrongFlag = [nr, nc];
  });
  if (wrongFlag) { loseGame(wrongFlag[0], wrongFlag[1]); return; }

  neighbors(r, c).forEach(([nr, nc]) => {
    if (!game.grid[nr][nc].revealed && game.grid[nr][nc].flagged === 0) revealCell(nr, nc, true);
  });
  if (!game.gameOver) sound.reveal();
  checkWin();
  saveState();
}

// ---- Flagging (cycles blank -> flag -> question) ----
export function cycleFlag(r, c) {
  const cell = game.grid[r][c];
  if (cell.revealed || game.gameOver) return;
  cell.flagged = (cell.flagged + 1) % 3;

  game.flagsPlaced = 0;
  for (let rr = 0; rr < game.rows; rr++)
    for (let cc = 0; cc < game.cols; cc++)
      if (game.grid[rr][cc].flagged === 1) game.flagsPlaced++;

  render.updateMineCounter();
  render.updateCellEl(r, c);
  if (cell.flagged === 1) sound.flag();
  else if (cell.flagged === 2) sound.question();
  else sound.unflag();
  saveState();
}

// ---- Lose ----
function loseGame(clickedR, clickedC) {
  game.gameOver = true;
  stopTimer();
  render.clearPressed();
  render.endDeal();
  sound.explode();
  render.setFace('😵');
  render.setStatus('💥 Boom! Game over', 'lose');

  // Reveal every hidden mine (unflagged ones).
  for (let r = 0; r < game.rows; r++) {
    for (let c = 0; c < game.cols; c++) {
      const cell = game.grid[r][c];
      if (cell.mine && !cell.revealed && cell.flagged !== 1) {
        cell.revealed = true;
        render.updateCellEl(r, c);
      }
    }
  }

  const clickedEl = render.getCellEl(clickedR, clickedC);
  if (clickedEl) clickedEl.classList.add('mine-clicked');

  // Mark wrongly-flagged (non-mine) cells with a struck-through mine.
  for (let r = 0; r < game.rows; r++) {
    for (let c = 0; c < game.cols; c++) {
      const cell = game.grid[r][c];
      if (cell.flagged === 1 && !cell.mine) render.markWrongFlag(r, c);
    }
  }

  render.shakeBoard();
  saveState();
}

// ---- Win ----
function checkWin() {
  const totalSafe = game.rows * game.cols - game.totalMines;
  if (game.revealedCount !== totalSafe || game.gameOver) return;

  game.gameOver = true;
  game.won = true;
  stopTimer();
  render.endDeal();
  sound.win();
  render.setFace('😎');

  // Auto-flag the remaining mines.
  for (let r = 0; r < game.rows; r++) {
    for (let c = 0; c < game.cols; c++) {
      if (game.grid[r][c].mine && game.grid[r][c].flagged !== 1) {
        game.grid[r][c].flagged = 1;
        game.flagsPlaced++;
        render.updateCellEl(r, c);
      }
    }
  }
  render.updateMineCounter();

  const prev = getBest(game.difficulty);
  const isNew = prev == null || game.timer < prev;
  if (isNew) setBest(game.difficulty, game.timer);
  render.renderBest(isNew);

  render.setStatus('🎉 You win! Time ' + pad3(game.timer), 'win');
  launchConfetti();
  saveState();
}
