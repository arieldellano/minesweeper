// All event wiring: mouse, touch, keyboard and the toolbar buttons. Translates
// raw input into board.js actions and render.js previews. Kept separate so the
// game logic has no knowledge of how a move was entered.

import { game } from './state.js';
import { newGame, revealCell, chord, cycleFlag } from './board.js';
import {
  els, pressPreview, clearPressed, setFace, endDeal, fitBoard, updateSoundBtn,
} from './render.js';
import { ensureAudio, toggleMute, isMuted } from './sound.js';

export function initInput() {
  wireMouse();
  wireTouch();
  wireButtons();
  wireAudioUnlock();
  wireResize();
}

// ---- Mouse ----
function wireMouse() {
  const board = els.board;

  board.addEventListener('mousedown', (e) => {
    if (game.gameOver) return;
    endDeal(); // first interaction tears down the entrance sweep
    const target = e.target.closest('.cell');
    if (!target) return;
    const r = +target.dataset.row, c = +target.dataset.col;

    if (e.button === 0) {
      game.mouseDown = true;
      setFace('😮');
      pressPreview(r, c);
    } else if (e.button === 2) {
      cycleFlag(r, c);
    }
  });

  board.addEventListener('mouseover', (e) => {
    if (!game.mouseDown || game.gameOver) return;
    const target = e.target.closest('.cell');
    if (!target) return;
    pressPreview(+target.dataset.row, +target.dataset.col);
  });

  board.addEventListener('mouseup', (e) => {
    if (game.gameOver || e.button !== 0) return;
    game.mouseDown = false;
    clearPressed();
    const target = e.target.closest('.cell');
    if (target) {
      const r = +target.dataset.row, c = +target.dataset.col;
      if (game.grid[r][c].revealed) chord(r, c); else revealCell(r, c);
    }
    if (!game.gameOver) setFace('🙂');
  });

  board.addEventListener('mouseleave', () => {
    if (game.mouseDown && !game.gameOver) {
      game.mouseDown = false;
      clearPressed();
      setFace('🙂');
    }
  });

  board.addEventListener('contextmenu', (e) => e.preventDefault());
  board.addEventListener('selectstart', (e) => e.preventDefault());
}

// ---- Touch (tap = reveal/chord, long-press = cycle flag) ----
function wireTouch() {
  const board = els.board;
  let touchTimer = null, touchCell = null, touchMoved = false, longPressed = false;

  board.addEventListener('touchstart', (e) => {
    if (game.gameOver || e.touches.length !== 1) return;
    endDeal();
    const target = e.target.closest('.cell');
    if (!target) return;
    touchCell = target;
    touchMoved = false;
    longPressed = false;
    const r = +target.dataset.row, c = +target.dataset.col;
    pressPreview(r, c);
    touchTimer = setTimeout(() => {
      longPressed = true;
      clearPressed();
      if (navigator.vibrate) navigator.vibrate(28);
      cycleFlag(r, c);
    }, 350);
  }, { passive: true });

  board.addEventListener('touchmove', () => {
    touchMoved = true;
    clearTimeout(touchTimer);
    clearPressed();
  }, { passive: true });

  board.addEventListener('touchend', (e) => {
    clearTimeout(touchTimer);
    clearPressed();
    if (!touchCell) return;
    if (!touchMoved) e.preventDefault(); // suppress the emulated mouse click
    if (!game.gameOver && !longPressed && !touchMoved) {
      const r = +touchCell.dataset.row, c = +touchCell.dataset.col;
      if (game.grid[r][c].revealed) chord(r, c); else revealCell(r, c);
    }
    touchCell = null;
  }, { passive: false });
}

// ---- Toolbar buttons + keyboard ----
function wireButtons() {
  els.reset.addEventListener('click', () => newGame(game.difficulty));
  els.reset.addEventListener('mousedown', () => { if (!game.gameOver) setFace('😮'); });
  els.reset.addEventListener('mouseup', () => { if (!game.gameOver) setFace('🙂'); });

  els.difficulty.forEach((btn) => {
    btn.addEventListener('click', () => newGame(btn.dataset.diff));
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'r' || e.key === 'R') newGame(game.difficulty);
  });

  els.sound.addEventListener('click', () => updateSoundBtn(toggleMute()));
  updateSoundBtn(isMuted());
}

// ---- Audio unlock: keep the context awake ----
// Not `once`: a backgrounded tab or the autoplay policy can re-suspend the
// AudioContext, and only a fresh user gesture can resume it. ensureAudio() is a
// cheap no-op once the context is already running.
function wireAudioUnlock() {
  const wake = () => ensureAudio();
  ['pointerdown', 'touchend', 'keydown'].forEach((ev) =>
    document.addEventListener(ev, wake, { passive: true }));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) ensureAudio(); });
}

// ---- Resize: re-fit the board (throttled to one rAF) ----
function wireResize() {
  let resizeRAF = null;
  window.addEventListener('resize', () => {
    if (resizeRAF) return;
    resizeRAF = requestAnimationFrame(() => {
      resizeRAF = null;
      endDeal(); // a running deal-in was sized to the old geometry — drop it
      fitBoard();
    });
  });
}
