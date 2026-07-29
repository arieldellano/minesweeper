'use client';

// The single game hook: owns GameState, the timer, persistence, sound, best
// times and the deal-in / confetti triggers. Components call its action methods
// (reveal / chord / toggleFlag / newGame / startCustom) and render its state.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { BoardConfig, DifficultyName, GameState } from '@/lib/types';
import { DEFAULT_CUSTOM, DIFFICULTIES, getConfig } from '@/lib/difficulty';
import { chord as chordFn, createGame, cycleFlag, revealCell } from '@/lib/game';
import {
  getBest,
  loadCustomConfig,
  loadGame,
  loadMuted,
  loadSettings,
  saveCustomConfig,
  saveGame,
  saveMuted,
  saveSettings,
  setBest,
} from '@/lib/persistence';
import { ensureAudio, setMuted, sound } from '@/lib/sound';

export interface UseGame {
  state: GameState;
  custom: BoardConfig;
  muted: boolean;
  best: number | null;
  isNewBest: boolean;
  dealNonce: number;
  winNonce: number;
  defaultDifficulty: DifficultyName;
  solvableOnly: boolean;
  newGame: (difficulty: DifficultyName) => void;
  startCustom: (rows: number, cols: number, mines: number) => void;
  reveal: (r: number, c: number) => void;
  chord: (r: number, c: number) => void;
  toggleFlag: (r: number, c: number) => void;
  toggleMute: () => void;
  setDefaultDifficulty: (difficulty: DifficultyName) => void;
  setSolvableOnly: (value: boolean) => void;
  refreshBest: () => void;
}

export function useGame(): UseGame {
  const [state, setState] = useState<GameState>(() =>
    createGame('beginner', DIFFICULTIES.beginner, 0)
  );
  const [custom, setCustom] = useState<BoardConfig>(DEFAULT_CUSTOM);
  const [muted, setMutedState] = useState(false);
  const [best, setBestState] = useState<number | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);
  const [dealNonce, setDealNonce] = useState(0);
  const [winNonce, setWinNonce] = useState(0);
  const [defaultDifficulty, setDefaultDifficultyState] = useState<DifficultyName>('beginner');
  const [solvableOnly, setSolvableOnlyState] = useState(true);

  // Refs so the stable action callbacks always see the latest values.
  const stateRef = useRef(state);
  stateRef.current = state;
  const customRef = useRef(custom);
  customRef.current = custom;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const solvableOnlyRef = useRef(solvableOnly);
  solvableOnlyRef.current = solvableOnly;
  const defaultDifficultyRef = useRef(defaultDifficulty);
  defaultDifficultyRef.current = defaultDifficulty;
  const gameIdRef = useRef(0);
  const hydratedRef = useRef(false);
  // Cached restore payload. `undefined` = not attempted yet; read exactly once so
  // StrictMode's double-mount (which can transiently rewrite storage) still
  // restores the real game rather than a clobbered placeholder.
  const restoredRef = useRef<GameState | null | undefined>(undefined);
  // Cached initial fresh board (when there's nothing to restore), so StrictMode's
  // double-mount doesn't create two boards.
  const freshRef = useRef<GameState | null>(null);
  const nextGameId = () => (gameIdRef.current += 1);

  const apply = useCallback((next: GameState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  // ---- Mount: load prefs, restore a saved game, wire audio unlock ----------
  useEffect(() => {
    const m = loadMuted();
    setMuted(m);
    setMutedState(m);
    const c = loadCustomConfig();
    customRef.current = c;
    setCustom(c);
    const settings = loadSettings();
    setDefaultDifficultyState(settings.defaultDifficulty);
    setSolvableOnlyState(settings.solvableOnly);
    solvableOnlyRef.current = settings.solvableOnly;

    // Only restore a board the player has actually engaged with (revealed or
    // flagged). An untouched board is discarded so the default difficulty applies.
    if (restoredRef.current === undefined) {
      const raw = loadGame(nextGameId());
      restoredRef.current = raw && (raw.minesPlaced || raw.flagsPlaced > 0) ? raw : null;
    }
    const restored = restoredRef.current;
    if (restored) {
      solvableOnlyRef.current = restored.solvableOnly;
      setSolvableOnlyState(restored.solvableOnly);
      apply(restored);
      setBestState(getBest(restored.difficulty, c));
    } else {
      // No saved game: start a fresh board at the configured default difficulty.
      if (!freshRef.current) {
        const dd = settings.defaultDifficulty;
        freshRef.current = createGame(dd, getConfig(dd, c), nextGameId(), settings.solvableOnly);
      }
      apply(freshRef.current);
      setBestState(getBest(freshRef.current.difficulty, c));
      setDealNonce((n) => n + 1); // animate the initial board's entrance
    }
    hydratedRef.current = true;

    // Keep the audio context awake — every gesture, not once (a backgrounded
    // tab or the autoplay policy can re-suspend it).
    const wake = () => ensureAudio();
    const events: (keyof DocumentEventMap)[] = ['pointerdown', 'touchend', 'keydown'];
    events.forEach((ev) => document.addEventListener(ev, wake, { passive: true }));
    const onVis = () => {
      if (!document.hidden) ensureAudio();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      events.forEach((ev) => document.removeEventListener(ev, wake));
      document.removeEventListener('visibilitychange', onVis);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Persist on every change (after hydration) ---------------------------
  useEffect(() => {
    if (!hydratedRef.current) return;
    // While a restore is pending, don't let the pre-restore placeholder overwrite
    // the saved game. Once the restored state lands, stop gating.
    const pending = restoredRef.current;
    if (pending) {
      if (state.gameId !== pending.gameId) return;
      restoredRef.current = null;
    }
    saveGame(state);
  }, [state]);

  // ---- Timer: tick while a placed board is in play -------------------------
  useEffect(() => {
    if (!state.minesPlaced || state.gameOver) return;
    const id = setInterval(() => {
      setState((prev) => {
        if (prev.gameOver) return prev;
        const next = { ...prev, timer: Math.min(prev.timer + 1, 999) };
        stateRef.current = next;
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [state.minesPlaced, state.gameOver, state.gameId]);

  // ---- Terminal side-effects: win/lose sound, confetti, best time ----------
  const terminalRef = useRef({ gameId: state.gameId, gameOver: state.gameOver });
  useEffect(() => {
    const prev = terminalRef.current;
    const sameGame = prev.gameId === state.gameId;
    if (sameGame && state.gameOver && !prev.gameOver) {
      if (state.won) {
        sound.win();
        setWinNonce((n) => n + 1);
        const prevBest = getBest(state.difficulty, customRef.current);
        const isNew = prevBest == null || state.timer < prevBest;
        if (isNew) setBest(state.difficulty, customRef.current, state.timer);
        setBestState(isNew ? state.timer : prevBest);
        setIsNewBest(isNew);
      } else {
        sound.explode();
      }
    }
    terminalRef.current = { gameId: state.gameId, gameOver: state.gameOver };
  }, [state]);

  // ---- Actions -------------------------------------------------------------
  const startBoard = useCallback(
    (difficulty: DifficultyName, config: BoardConfig, silent = false) => {
      const next = createGame(difficulty, config, nextGameId(), solvableOnlyRef.current);
      apply(next);
      setBestState(getBest(difficulty, customRef.current));
      setIsNewBest(false);
      setDealNonce((n) => n + 1);
      if (!silent) sound.newgame();
    },
    [apply]
  );

  const newGame = useCallback(
    (difficulty: DifficultyName) => {
      startBoard(difficulty, getConfig(difficulty, customRef.current));
    },
    [startBoard]
  );

  const startCustom = useCallback(
    (rows: number, cols: number, mines: number) => {
      const cfg: BoardConfig = { rows, cols, mines, label: 'Custom' };
      saveCustomConfig(cfg);
      customRef.current = cfg;
      setCustom(cfg);
      startBoard('custom', cfg);
    },
    [startBoard]
  );

  const reveal = useCallback(
    (r: number, c: number) => {
      const prev = stateRef.current;
      if (prev.gameOver) return;
      const cell = prev.grid[r][c];
      if (cell.revealed || cell.flagged !== 0) return;
      const next = revealCell(prev, r, c);
      if (next === prev) return;
      apply(next);
      if (!next.gameOver) sound.reveal();
    },
    [apply]
  );

  const chord = useCallback(
    (r: number, c: number) => {
      const prev = stateRef.current;
      if (prev.gameOver) return;
      const next = chordFn(prev, r, c);
      if (next === prev) return;
      apply(next);
      if (!next.gameOver) sound.reveal();
    },
    [apply]
  );

  const toggleFlag = useCallback(
    (r: number, c: number) => {
      const prev = stateRef.current;
      const next = cycleFlag(prev, r, c);
      if (next === prev) return;
      apply(next);
      const f = next.grid[r][c].flagged;
      if (f === 1) sound.flag();
      else if (f === 2) sound.question();
      else sound.unflag();
    },
    [apply]
  );

  const toggleMute = useCallback(() => {
    const nextMuted = !mutedRef.current;
    mutedRef.current = nextMuted;
    setMuted(nextMuted);
    setMutedState(nextMuted);
    saveMuted(nextMuted);
    if (!nextMuted) sound.flag(); // confirmation blip when unmuting
  }, []);

  const setDefaultDifficulty = useCallback(
    (difficulty: DifficultyName) => {
      setDefaultDifficultyState(difficulty);
      saveSettings({ defaultDifficulty: difficulty, solvableOnly: solvableOnlyRef.current });
      // If the current board is untouched, switch to the new default right away so
      // the choice is visible immediately (a started game is left alone).
      const cur = stateRef.current;
      if (!cur.minesPlaced && cur.flagsPlaced === 0 && !cur.gameOver) {
        startBoard(difficulty, getConfig(difficulty, customRef.current), true);
      }
    },
    [startBoard]
  );

  const setSolvableOnly = useCallback((value: boolean) => {
    solvableOnlyRef.current = value;
    setSolvableOnlyState(value);
    saveSettings({ defaultDifficulty: defaultDifficultyRef.current, solvableOnly: value });
    // Apply to the current board if its mines haven't been placed yet, so the
    // toggle takes effect on the very next click without needing a new game.
    setState((prev) => {
      if (prev.minesPlaced || prev.solvableOnly === value) return prev;
      const next = { ...prev, solvableOnly: value };
      stateRef.current = next;
      return next;
    });
  }, []);

  // Re-read the best time for the current difficulty (e.g. after clearing records).
  const refreshBest = useCallback(() => {
    setBestState(getBest(stateRef.current.difficulty, customRef.current));
    setIsNewBest(false);
  }, []);

  return {
    state,
    custom,
    muted,
    best,
    isNewBest,
    dealNonce,
    winNonce,
    defaultDifficulty,
    solvableOnly,
    newGame,
    startCustom,
    reveal,
    chord,
    toggleFlag,
    toggleMute,
    setDefaultDifficulty,
    setSolvableOnly,
    refreshBest,
  };
}
