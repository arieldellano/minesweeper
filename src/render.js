// Everything that touches the DOM: board construction, per-cell updates, the
// header/status readouts and the chord press-preview. This is the only module
// that reads or writes elements, so game logic (board.js) and input wiring
// (input.js) never touch the DOM directly.

import { game, neighbors, pad3, getBest, GAP } from './state.js';
import { runDeal, cancelDeal } from './deal.js';
import { createDisplay } from './sevenseg.js';

const $ = (id) => document.getElementById(id);

// Cached element references, shared with input.js.
export const els = {
  board:       $('board'),
  mineCounter: $('mine-counter'),
  timer:       $('timer'),
  reset:       $('reset-btn'),
  face:        $('reset-face'),
  status:      $('status'),
  best:        $('best'),
  sound:       $('snd-btn'),
  difficulty:  Array.from(document.querySelectorAll('.difficulty-bar button')),
};

let cellPx = 28;
let pressedCells = []; // cells currently shown "pressed" during a chord preview

// Seven-segment displays for the two LED readouts (built once).
const mineDisplay = createDisplay(els.mineCounter, 3);
const timerDisplay = createDisplay(els.timer, 3);

// ---- Header / status readouts ----
// The face lives in a child span so pointer events on the glyph still target the
// button; swapping this text can't remove the mousedown target and suppress the
// button's click. See .reset-btn .face { pointer-events: none } in styles.css.
export function setFace(expr) { els.face.textContent = expr; }
export function updateMineCounter() { mineDisplay(pad3(game.totalMines - game.flagsPlaced)); }
export function updateTimer() { timerDisplay(pad3(game.timer)); }

export function setStatus(text, cls) {
  els.status.textContent = text;
  els.status.className = 'status' + (cls ? ' ' + cls : '');
}

export function renderBest(isNew) {
  const b = getBest(game.difficulty);
  els.best.innerHTML = b == null
    ? '🏆 Best: --'
    : '🏆 Best: ' + pad3(b) + (isNew ? ' <span class="new-best">NEW!</span>' : '');
}

export function setActiveDifficulty(diff) {
  els.difficulty.forEach((btn) => btn.classList.toggle('active', btn.dataset.diff === diff));
}

export function updateSoundBtn(muted) {
  els.sound.textContent = muted ? '🔇' : '🔊';
  els.sound.classList.toggle('muted', muted);
}

// ---- Board sizing ----
// Compute a cell size that fits the available viewport (accounting for gaps).
export function calcCellSize() {
  const chrome = document.querySelector('h1').offsetHeight
    + document.querySelector('.difficulty-bar').offsetHeight
    + document.querySelector('.header').offsetHeight
    + document.querySelector('.statusbar').offsetHeight;
  const availW = Math.min(window.innerWidth, 1120) - 24 - 28 - 16; // page + card + board padding
  const availH = window.innerHeight - chrome - 90;                 // gaps + paddings + breathing room
  const maxCellW = Math.floor((availW - (game.cols - 1) * GAP) / game.cols);
  const maxCellH = Math.floor((availH - (game.rows - 1) * GAP) / game.rows);
  cellPx = Math.max(16, Math.min(maxCellW, maxCellH, 46));
  const fontSize = Math.max(11, Math.min(cellPx * 0.52, 22));
  document.documentElement.style.setProperty('--fsize', fontSize + 'px');
}

export function applyGridTemplate() {
  els.board.style.gridTemplateColumns = 'repeat(' + game.cols + ', ' + cellPx + 'px)';
  els.board.style.gridTemplateRows = 'repeat(' + game.rows + ', ' + cellPx + 'px)';
}

// Recompute size + grid template together (used on resize and each new board).
export function fitBoard() { calcCellSize(); applyGridTemplate(); }

// ---- Board construction ----
// Build the DOM grid once per new game / difficulty change.
//
// Performance: the entrance animation is a single mask sweep on the board
// element (see `.board.dealing` in styles.css), NOT one keyframe animation per
// cell. So this loop writes zero per-cell animation state and the browser only
// animates one element, no matter how large the board.
// `animate` is false when restoring a saved game — the board should just appear
// in its saved state, not replay the entrance.
export function renderBoard(animate = true) {
  const board = els.board;
  cancelDeal(); // stop any in-flight deal from a previous game
  board.classList.remove('lose', 'dealing');
  board.innerHTML = '';
  fitBoard();

  const frag = document.createDocumentFragment();
  for (let r = 0; r < game.rows; r++) {
    for (let c = 0; c < game.cols; c++) {
      const el = document.createElement('div');
      el.className = 'cell';
      el.dataset.row = r;
      el.dataset.col = c;
      frag.appendChild(el);
    }
  }
  board.appendChild(frag);

  // Entrance: play the per-tile canvas deal-in while the real cells stay hidden,
  // then reveal them. Honor reduced-motion by showing the grid immediately.
  if (!animate || prefersReducedMotion()) return;
  board.classList.add('dealing');
  runDeal(board, game.cols, game.rows, cellPx, GAP, () => board.classList.remove('dealing'));
}

// Mark a wrongly-flagged (non-mine) cell with a struck-through mine.
export function markWrongFlag(r, c) {
  const el = getCellEl(r, c);
  el.className = 'cell revealed wrong-flag';
  el.textContent = '💣';
}

// Stop the deal-in immediately (first interaction / game over) so no revealed
// cell is ever held hidden behind an in-progress entrance.
export function endDeal() {
  cancelDeal(() => els.board.classList.remove('dealing'));
}

function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function getCellEl(r, c) { return els.board.children[r * game.cols + c]; }

// Sync a single cell's element to its state. `className = 'cell'` clears any
// prior state class before re-applying, so this is also the reset path.
export function updateCellEl(r, c) {
  const cell = game.grid[r][c];
  const el = getCellEl(r, c);
  el.className = 'cell';
  el.textContent = '';

  if (cell.revealed) {
    el.classList.add('revealed');
    if (cell.mine) {
      el.textContent = '💣';
      el.classList.add('mine-revealed');
    } else if (cell.adjacentMines > 0) {
      el.textContent = cell.adjacentMines;
      el.classList.add('n' + cell.adjacentMines);
    }
  } else if (cell.flagged === 1) {
    el.textContent = '⚑︎'; // ⚑ monochrome flag glyph (takes CSS color)
    el.classList.add('flagged');
  } else if (cell.flagged === 2) {
    el.textContent = '?';
    el.classList.add('question');
  }
}

// ---- Chord press-preview: highlight the neighbors a chord would reveal ----
export function clearPressed() {
  pressedCells.forEach((el) => el.classList.remove('pressed'));
  pressedCells = [];
}

export function pressPreview(r, c) {
  clearPressed();
  const cell = game.grid[r][c];
  if (cell.revealed && cell.adjacentMines > 0) {
    neighbors(r, c).forEach(([nr, nc]) => {
      const n = game.grid[nr][nc];
      if (!n.revealed && n.flagged === 0) {
        const el = getCellEl(nr, nc);
        el.classList.add('pressed');
        pressedCells.push(el);
      }
    });
  }
}

// ---- Lose shake ----
// Deferred one frame so revealed mines are guaranteed to paint first and can
// never appear "behind" the shake.
export function shakeBoard() {
  const board = els.board;
  board.classList.remove('dealing');
  requestAnimationFrame(() => {
    board.classList.remove('lose');
    void board.offsetWidth;
    board.classList.add('lose');
  });
}
