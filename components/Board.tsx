'use client';

// The board grid + all pointer input. Input is delegated to the board element
// (one set of listeners, not per-cell) via native addEventListener so touch
// passivity can be controlled exactly, mirroring the original vanilla game.
// Cells are memoized, so a reveal only re-renders the cells that changed.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { GameState } from '@/lib/types';
import { chordPreviewCells } from '@/lib/game';
import { Cell } from './Cell';
import { DealCanvas } from './DealCanvas';

interface BoardProps {
  state: GameState;
  cellPx: number;
  fontSize: number;
  gap: number;
  dealing: boolean;
  dealKey: number;
  onReveal: (r: number, c: number) => void;
  onChord: (r: number, c: number) => void;
  onFlag: (r: number, c: number) => void;
  onPressStart: () => void;
  onPressEnd: () => void;
  onDealEnd: () => void;
}

const key = (r: number, c: number) => r + ',' + c;

export function Board(props: BoardProps) {
  const { state, cellPx, fontSize, gap, dealing } = props;
  const boardRef = useRef<HTMLDivElement>(null);
  const [pressed, setPressed] = useState<Set<string>>(new Set());
  const pressedRef = useRef(pressed);
  pressedRef.current = pressed;

  // Latest values for the native listeners (wired once).
  const latest = useRef(props);
  latest.current = props;

  const clearPressed = () => {
    if (pressedRef.current.size) setPressed(new Set());
  };
  const showPreview = (r: number, c: number) => {
    const cells = chordPreviewCells(latest.current.state, r, c);
    setPressed(new Set(cells.map(([nr, nc]) => key(nr, nc))));
  };
  const clearRef = useRef(clearPressed);
  clearRef.current = clearPressed;
  const previewRef = useRef(showPreview);
  previewRef.current = showPreview;

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;

    const cellAt = (target: EventTarget | null): HTMLElement | null =>
      target instanceof Element ? (target.closest('.cell') as HTMLElement | null) : null;
    const rc = (el: HTMLElement) => [Number(el.dataset.row), Number(el.dataset.col)] as const;

    // ---- Mouse ----
    let mouseDown = false;
    const onMouseDown = (e: MouseEvent) => {
      const g = latest.current.state;
      if (g.gameOver) return;
      latest.current.onDealEnd(); // first interaction tears down the entrance sweep
      const el = cellAt(e.target);
      if (!el) return;
      const [r, c] = rc(el);
      if (e.button === 0) {
        mouseDown = true;
        latest.current.onPressStart();
        previewRef.current(r, c);
      } else if (e.button === 2) {
        latest.current.onFlag(r, c);
      }
    };
    const onMouseOver = (e: MouseEvent) => {
      if (!mouseDown || latest.current.state.gameOver) return;
      const el = cellAt(e.target);
      if (el) {
        const [r, c] = rc(el);
        previewRef.current(r, c);
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (latest.current.state.gameOver || e.button !== 0) return;
      mouseDown = false;
      clearRef.current();
      const el = cellAt(e.target);
      if (el) {
        const [r, c] = rc(el);
        if (latest.current.state.grid[r][c].revealed) latest.current.onChord(r, c);
        else latest.current.onReveal(r, c);
      }
      latest.current.onPressEnd();
    };
    const onMouseLeave = () => {
      if (mouseDown && !latest.current.state.gameOver) {
        mouseDown = false;
        clearRef.current();
        latest.current.onPressEnd();
      }
    };
    const onContextMenu = (e: Event) => e.preventDefault();
    const onSelectStart = (e: Event) => e.preventDefault();

    // ---- Touch (tap = reveal/chord, long-press = cycle flag) ----
    let touchTimer: ReturnType<typeof setTimeout> | null = null;
    let touchCell: HTMLElement | null = null;
    let touchMoved = false;
    let longPressed = false;
    const onTouchStart = (e: TouchEvent) => {
      const g = latest.current.state;
      if (g.gameOver || e.touches.length !== 1) return;
      latest.current.onDealEnd();
      const el = cellAt(e.target);
      if (!el) return;
      touchCell = el;
      touchMoved = false;
      longPressed = false;
      const [r, c] = rc(el);
      previewRef.current(r, c);
      touchTimer = setTimeout(() => {
        longPressed = true;
        clearRef.current();
        if (navigator.vibrate) navigator.vibrate(28);
        latest.current.onFlag(r, c);
      }, 350);
    };
    const onTouchMove = () => {
      touchMoved = true;
      if (touchTimer) clearTimeout(touchTimer);
      clearRef.current();
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (touchTimer) clearTimeout(touchTimer);
      clearRef.current();
      if (!touchCell) return;
      if (!touchMoved) e.preventDefault(); // suppress the emulated mouse click
      if (!latest.current.state.gameOver && !longPressed && !touchMoved) {
        const [r, c] = rc(touchCell);
        if (latest.current.state.grid[r][c].revealed) latest.current.onChord(r, c);
        else latest.current.onReveal(r, c);
      }
      touchCell = null;
    };

    board.addEventListener('mousedown', onMouseDown);
    board.addEventListener('mouseover', onMouseOver);
    board.addEventListener('mouseup', onMouseUp);
    board.addEventListener('mouseleave', onMouseLeave);
    board.addEventListener('contextmenu', onContextMenu);
    board.addEventListener('selectstart', onSelectStart);
    board.addEventListener('touchstart', onTouchStart, { passive: true });
    board.addEventListener('touchmove', onTouchMove, { passive: true });
    board.addEventListener('touchend', onTouchEnd, { passive: false });
    return () => {
      board.removeEventListener('mousedown', onMouseDown);
      board.removeEventListener('mouseover', onMouseOver);
      board.removeEventListener('mouseup', onMouseUp);
      board.removeEventListener('mouseleave', onMouseLeave);
      board.removeEventListener('contextmenu', onContextMenu);
      board.removeEventListener('selectstart', onSelectStart);
      board.removeEventListener('touchstart', onTouchStart);
      board.removeEventListener('touchmove', onTouchMove);
      board.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  const boardClass =
    'board' + (dealing ? ' dealing' : '') + (state.gameOver && !state.won ? ' lose' : '');

  const cells = useMemo(() => {
    const out: React.ReactNode[] = [];
    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        out.push(
          <Cell key={r * state.cols + c} cell={state.grid[r][c]} r={r} c={c} pressed={pressed.has(key(r, c))} />
        );
      }
    }
    return out;
  }, [state.grid, state.rows, state.cols, pressed]);

  return (
    <div className="board-container">
      <div
        ref={boardRef}
        className={boardClass}
        style={
          {
            gridTemplateColumns: `repeat(${state.cols}, ${cellPx}px)`,
            gridTemplateRows: `repeat(${state.rows}, ${cellPx}px)`,
            ['--fsize' as string]: `${fontSize}px`,
          } as React.CSSProperties
        }
      >
        {cells}
        {dealing && (
          <DealCanvas
            key={props.dealKey}
            rows={state.rows}
            cols={state.cols}
            cellPx={cellPx}
            gap={gap}
            onDone={props.onDealEnd}
          />
        )}
      </div>
    </div>
  );
}
