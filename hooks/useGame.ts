'use client';

// The single game hook: owns GameState, the timer, persistence, sound, best
// times and the deal-in / confetti triggers. Components call its action methods
// (reveal / chord / toggleFlag / newGame / startCustom) and render its state.

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BestRecord,
  BoardConfig,
  DifficultyName,
  GameState,
  PendingRecord,
} from '@/lib/types';
import { DEFAULT_CUSTOM, DIFFICULTIES, getConfig } from '@/lib/difficulty';
import { chord as chordFn, clearTransientFlags, createGame, cycleFlag, revealCell } from '@/lib/game';
import {
  getBest,
  loadCustomConfig,
  loadGame,
  loadMuted,
  loadPlayerName,
  loadSettings,
  saveCustomConfig,
  saveGame,
  saveMuted,
  normalizeName,
  savePlayerName,
  saveSettings,
  setBest,
  setBestName,
} from '@/lib/persistence';
import { ensureAudio, setMuted, sound } from '@/lib/sound';

export interface UseGame {
  state: GameState;
  custom: BoardConfig;
  muted: boolean;
  best: BestRecord | null;
  isNewBest: boolean;
  pendingRecord: PendingRecord | null;
  playerName: string;
  dealNonce: number;
  winNonce: number;
  defaultDifficulty: DifficultyName;
  solvableOnly: boolean;
  guaranteeOpening: boolean;
  undoEnabled: boolean;
  canUndo: boolean;
  newGame: (difficulty: DifficultyName) => void;
  startCustom: (rows: number, cols: number, mines: number) => void;
  reveal: (r: number, c: number) => void;
  chord: (r: number, c: number) => void;
  toggleFlag: (r: number, c: number) => void;
  undo: () => void;
  nameRecord: (name: string) => void;
  skipRecordName: () => void;
  toggleMute: () => void;
  setDefaultDifficulty: (difficulty: DifficultyName) => void;
  setSolvableOnly: (value: boolean) => void;
  setGuaranteeOpening: (value: boolean) => void;
  setUndoEnabled: (value: boolean) => void;
  refreshBest: () => void;
}

// How many moves back undo can reach. Snapshots share their untouched rows with
// the live grid (copy-on-write), so a deep stack stays cheap.
const MAX_UNDO = 100;

export function useGame(): UseGame {
  const [state, setState] = useState<GameState>(() =>
    createGame('beginner', DIFFICULTIES.beginner, 0)
  );
  const [custom, setCustom] = useState<BoardConfig>(DEFAULT_CUSTOM);
  const [muted, setMutedState] = useState(false);
  const [best, setBestState] = useState<BestRecord | null>(null);
  const [isNewBest, setIsNewBest] = useState(false);
  const [pendingRecord, setPendingRecord] = useState<PendingRecord | null>(null);
  const [playerName, setPlayerNameState] = useState('');
  const [dealNonce, setDealNonce] = useState(0);
  const [winNonce, setWinNonce] = useState(0);
  const [defaultDifficulty, setDefaultDifficultyState] = useState<DifficultyName>('beginner');
  const [solvableOnly, setSolvableOnlyState] = useState(true);
  const [guaranteeOpening, setGuaranteeOpeningState] = useState(false);
  const [undoEnabled, setUndoEnabledState] = useState(true);
  const [canUndo, setCanUndo] = useState(false);

  // Refs so the stable action callbacks always see the latest values.
  const stateRef = useRef(state);
  stateRef.current = state;
  const customRef = useRef(custom);
  customRef.current = custom;
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const solvableOnlyRef = useRef(solvableOnly);
  solvableOnlyRef.current = solvableOnly;
  const guaranteeOpeningRef = useRef(guaranteeOpening);
  guaranteeOpeningRef.current = guaranteeOpening;
  const defaultDifficultyRef = useRef(defaultDifficulty);
  defaultDifficultyRef.current = defaultDifficulty;
  const undoEnabledRef = useRef(undoEnabled);
  undoEnabledRef.current = undoEnabled;
  const pendingRecordRef = useRef(pendingRecord);
  pendingRecordRef.current = pendingRecord;
  // Undo stack of pre-move snapshots. In-memory only: a reload restores the
  // board but not its history.
  const historyRef = useRef<GameState[]>([]);
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

  // ---- Undo history --------------------------------------------------------
  // Record the state a move is about to replace. Called only once the move is
  // known to have changed something, so undo never burns on a no-op click.
  const pushHistory = useCallback((snapshot: GameState) => {
    if (!undoEnabledRef.current) return;
    const stack = historyRef.current;
    stack.push(snapshot);
    if (stack.length > MAX_UNDO) stack.shift();
    setCanUndo(true);
  }, []);

  const resetHistory = useCallback(() => {
    historyRef.current = [];
    setCanUndo(false);
  }, []);

  const persistSettings = useCallback(() => {
    saveSettings({
      defaultDifficulty: defaultDifficultyRef.current,
      solvableOnly: solvableOnlyRef.current,
      guaranteeOpening: guaranteeOpeningRef.current,
      undoEnabled: undoEnabledRef.current,
    });
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
    setGuaranteeOpeningState(settings.guaranteeOpening);
    guaranteeOpeningRef.current = settings.guaranteeOpening;
    setUndoEnabledState(settings.undoEnabled);
    undoEnabledRef.current = settings.undoEnabled;
    setPlayerNameState(loadPlayerName());

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
      guaranteeOpeningRef.current = restored.guaranteeOpening;
      setGuaranteeOpeningState(restored.guaranteeOpening);
      apply(restored);
      setBestState(getBest(restored.difficulty, c));
    } else {
      // No saved game: start a fresh board at the configured default difficulty.
      if (!freshRef.current) {
        const dd = settings.defaultDifficulty;
        freshRef.current = createGame(
          dd,
          getConfig(dd, c),
          nextGameId(),
          settings.solvableOnly,
          settings.guaranteeOpening
        );
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
        const isNew = prevBest == null || state.timer < prevBest.time;
        if (isNew) {
          // Bank the record straight away as anonymous, then ask who set it —
          // dismissing the prompt loses the name, never the time.
          setBest(state.difficulty, customRef.current, state.timer);
          setBestState({ time: state.timer, name: null });
          setPendingRecord({
            difficulty: state.difficulty,
            config: customRef.current,
            time: state.timer,
          });
        } else {
          setBestState(prevBest);
        }
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
      const next = createGame(
        difficulty,
        config,
        nextGameId(),
        solvableOnlyRef.current,
        guaranteeOpeningRef.current
      );
      resetHistory(); // undo never reaches back into a previous board
      apply(next);
      setBestState(getBest(difficulty, customRef.current));
      setIsNewBest(false);
      setDealNonce((n) => n + 1);
      if (!silent) sound.newgame();
    },
    [apply, resetHistory]
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
      pushHistory(prev);
      apply(next);
      if (!next.gameOver) sound.reveal();
    },
    [apply, pushHistory]
  );

  const chord = useCallback(
    (r: number, c: number) => {
      const prev = stateRef.current;
      if (prev.gameOver) return;
      const next = chordFn(prev, r, c);
      if (next === prev) return;
      pushHistory(prev); // one snapshot per chord: undo takes back the whole opening
      apply(next);
      if (!next.gameOver) sound.reveal();
    },
    [apply, pushHistory]
  );

  const toggleFlag = useCallback(
    (r: number, c: number) => {
      const prev = stateRef.current;
      const next = cycleFlag(prev, r, c);
      if (next === prev) return;
      pushHistory(prev);
      apply(next);
      const f = next.grid[r][c].flagged;
      if (f === 1) sound.flag();
      else if (f === 2) sound.question();
      else sound.unflag();
    },
    [apply, pushHistory]
  );

  // Step back one move — including the fatal click, which is the whole point.
  // The clock is deliberately not rewound: undoing a mistake shouldn't hand back
  // the time it cost.
  const undo = useCallback(() => {
    if (!undoEnabledRef.current) return;
    const stack = historyRef.current;
    const snapshot = stack.pop();
    if (!snapshot) return;
    setCanUndo(stack.length > 0);
    apply({
      ...snapshot,
      grid: clearTransientFlags(snapshot.grid),
      timer: stateRef.current.timer,
    });
    setIsNewBest(false);
    sound.undo();
  }, [apply]);

  // ---- New-record naming ---------------------------------------------------
  const nameRecord = useCallback((name: string) => {
    const pending = pendingRecordRef.current;
    setPendingRecord(null);
    if (!pending) return;
    const clean = normalizeName(name);
    if (!clean) return; // blank submit is the same as skipping
    if (!setBestName(pending.difficulty, pending.config, pending.time, clean)) return;
    savePlayerName(clean);
    setPlayerNameState(clean);
    // Reflect it in the status bar, unless the record has moved on since.
    setBestState((prev) => (prev && prev.time === pending.time ? { ...prev, name: clean } : prev));
  }, []);

  const skipRecordName = useCallback(() => setPendingRecord(null), []);

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
      defaultDifficultyRef.current = difficulty;
      setDefaultDifficultyState(difficulty);
      persistSettings();
      // If the current board is untouched, switch to the new default right away so
      // the choice is visible immediately (a started game is left alone).
      const cur = stateRef.current;
      if (!cur.minesPlaced && cur.flagsPlaced === 0 && !cur.gameOver) {
        startBoard(difficulty, getConfig(difficulty, customRef.current), true);
      }
    },
    [persistSettings, startBoard]
  );

  const setSolvableOnly = useCallback(
    (value: boolean) => {
      solvableOnlyRef.current = value;
      setSolvableOnlyState(value);
      persistSettings();
      // Apply to the current board if its mines haven't been placed yet, so the
      // toggle takes effect on the very next click without needing a new game.
      setState((prev) => {
        if (prev.minesPlaced || prev.solvableOnly === value) return prev;
        const next = { ...prev, solvableOnly: value };
        stateRef.current = next;
        return next;
      });
    },
    [persistSettings]
  );

  const setGuaranteeOpening = useCallback(
    (value: boolean) => {
      guaranteeOpeningRef.current = value;
      setGuaranteeOpeningState(value);
      persistSettings();
      // Apply to the current board if its mines haven't been placed yet, so the
      // toggle takes effect on the very next click without needing a new game.
      setState((prev) => {
        if (prev.minesPlaced || prev.guaranteeOpening === value) return prev;
        const next = { ...prev, guaranteeOpening: value };
        stateRef.current = next;
        return next;
      });
    },
    [persistSettings]
  );

  const setUndoEnabled = useCallback(
    (value: boolean) => {
      undoEnabledRef.current = value;
      setUndoEnabledState(value);
      persistSettings();
      // Drop the stack when switching off, so re-enabling can't undo across the
      // moves made while it was disabled.
      if (!value) resetHistory();
    },
    [persistSettings, resetHistory]
  );

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
    guaranteeOpening,
    undoEnabled,
    canUndo,
    pendingRecord,
    playerName,
    newGame,
    startCustom,
    reveal,
    chord,
    toggleFlag,
    undo,
    nameRecord,
    skipRecordName,
    toggleMute,
    setDefaultDifficulty,
    setSolvableOnly,
    setGuaranteeOpening,
    setUndoEnabled,
    refreshBest,
  };
}
