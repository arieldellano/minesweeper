'use client';

// Top-level game orchestrator: wires the useGame hook to the view, derives the
// face + status readouts, manages the board sizing, the deal-in trigger and the
// custom-board modal.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DifficultyName } from '@/lib/types';
import { GAP } from '@/lib/difficulty';
import { pad3 } from '@/lib/format';
import { useGame } from '@/hooks/useGame';
import { useBoardMetrics } from '@/hooks/useBoardMetrics';
import { Board } from './Board';
import { Confetti } from './Confetti';
import { CustomModal } from './CustomModal';
import { DifficultyBar } from './DifficultyBar';
import { Header } from './Header';
import { OptionsModal } from './OptionsModal';
import { RecordModal } from './RecordModal';
import { StatusBar } from './StatusBar';

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function Minesweeper() {
  const game = useGame();
  const { state } = game;

  const titleRef = useRef<HTMLHeadingElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);

  const measureChrome = useCallback(() => {
    const h = (el: HTMLElement | null) => (el ? el.offsetHeight : 0);
    return (
      h(titleRef.current) + h(barRef.current) + h(headerRef.current) + h(statusRef.current)
    );
  }, []);
  const { cellPx, fontSize } = useBoardMetrics(state.rows, state.cols, measureChrome);

  const [dealing, setDealing] = useState(false);
  const [pressing, setPressing] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);

  // Trigger the deal-in entrance whenever the hook bumps the deal nonce.
  useEffect(() => {
    if (game.dealNonce === 0) return;
    if (prefersReducedMotion()) return;
    setDealing(true);
  }, [game.dealNonce]);
  const endDeal = useCallback(() => setDealing(false), []);

  // Keyboard: R restarts the current difficulty, Ctrl/⌘+Z undoes the last move
  // (both ignored while a modal is up — otherwise typing a name would restart
  // the game).
  const anyModalOpen = modalOpen || optionsOpen || game.pendingRecord !== null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (anyModalOpen) return;
      if ((e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        game.undo();
        return;
      }
      if (e.key === 'r' || e.key === 'R') game.newGame(state.difficulty);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [game, state.difficulty, anyModalOpen]);

  const face = state.won ? '😎' : state.gameOver ? '😵' : pressing ? '😮' : '🙂';
  let statusText: string;
  let statusClass: '' | 'win' | 'lose';
  if (state.won) {
    statusText = '🎉 You win! Time ' + pad3(state.timer);
    statusClass = 'win';
  } else if (state.gameOver) {
    statusText = '💥 Boom! Game over';
    statusClass = 'lose';
  } else {
    statusText = 'Left-click reveals · right-click / long-press flags';
    statusClass = '';
  }

  const onSelect = useCallback((d: DifficultyName) => game.newGame(d), [game]);

  return (
    <>
      <Confetti nonce={game.winNonce} />
      <div id="app">
        <h1 ref={titleRef}>Minesweeper</h1>
        <DifficultyBar
          active={state.difficulty}
          onSelect={onSelect}
          onCustom={() => setModalOpen(true)}
          rootRef={barRef}
        />
        <div className="card">
          <Header
            minesRemaining={state.totalMines - state.flagsPlaced}
            timer={state.timer}
            face={face}
            onReset={() => game.newGame(state.difficulty)}
            onFacePress={setPressing}
            rootRef={headerRef}
          />
          <Board
            state={state}
            cellPx={cellPx}
            fontSize={fontSize}
            gap={GAP}
            dealing={dealing}
            dealKey={game.dealNonce}
            onReveal={game.reveal}
            onChord={game.chord}
            onFlag={game.toggleFlag}
            onPressStart={() => setPressing(true)}
            onPressEnd={() => setPressing(false)}
            onDealEnd={endDeal}
          />
          <StatusBar
            muted={game.muted}
            undoEnabled={game.undoEnabled}
            canUndo={game.canUndo}
            onToggleMute={game.toggleMute}
            onUndo={game.undo}
            onOpenOptions={() => setOptionsOpen(true)}
            statusText={statusText}
            statusClass={statusClass}
            best={game.best}
            isNewBest={game.isNewBest}
            rootRef={statusRef}
          />
        </div>
      </div>
      <CustomModal
        open={modalOpen}
        initial={game.custom}
        onStart={(r, c, m) => {
          game.startCustom(r, c, m);
          setModalOpen(false);
        }}
        onClose={() => setModalOpen(false)}
      />
      <OptionsModal
        open={optionsOpen}
        defaultDifficulty={game.defaultDifficulty}
        muted={game.muted}
        solvableOnly={game.solvableOnly}
        guaranteeOpening={game.guaranteeOpening}
        undoEnabled={game.undoEnabled}
        onClose={() => setOptionsOpen(false)}
        onChangeDefault={game.setDefaultDifficulty}
        onToggleSound={game.toggleMute}
        onToggleSolvable={game.setSolvableOnly}
        onToggleOpening={game.setGuaranteeOpening}
        onToggleUndo={game.setUndoEnabled}
        onRecordsCleared={game.refreshBest}
      />
      <RecordModal
        record={game.pendingRecord}
        initialName={game.playerName}
        onSubmit={game.nameRecord}
        onSkip={game.skipRecordName}
      />
    </>
  );
}
