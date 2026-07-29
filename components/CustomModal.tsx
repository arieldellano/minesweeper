'use client';

// Custom-board dialog: choose columns / rows / mines with live clamping to safe
// limits, then start a game at those dimensions. Matches the card + segmented
// control look. Rendered only while open, so the entrance animation replays.

import { useEffect, useRef, useState } from 'react';
import type { BoardConfig } from '@/lib/types';
import { CUSTOM_LIMITS, clampCustom, maxMinesFor } from '@/lib/difficulty';

interface CustomModalProps {
  open: boolean;
  initial: BoardConfig;
  onStart: (rows: number, cols: number, mines: number) => void;
  onClose: () => void;
}

function clampDim(value: string, lim: { min: number; max: number }): number {
  const n = Math.round(parseInt(value, 10));
  if (!Number.isFinite(n)) return lim.min;
  return Math.max(lim.min, Math.min(lim.max, n));
}

export function CustomModal({ open, initial, onStart, onClose }: CustomModalProps) {
  const [cols, setCols] = useState(String(initial.cols));
  const [rows, setRows] = useState(String(initial.rows));
  const [mines, setMines] = useState(String(initial.mines));
  const colsRef = useRef<HTMLInputElement>(null);

  // Reset to the current config and focus the first field each time it opens.
  useEffect(() => {
    if (!open) return;
    setCols(String(initial.cols));
    setRows(String(initial.rows));
    setMines(String(initial.mines));
    const id = requestAnimationFrame(() => {
      colsRef.current?.focus();
      colsRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, [open, initial.cols, initial.rows, initial.mines]);

  // Close on Escape while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const rNum = clampDim(rows, CUSTOM_LIMITS.rows);
  const cNum = clampDim(cols, CUSTOM_LIMITS.cols);
  const maxMines = maxMinesFor(rNum, cNum);
  const mNum = clampDim(mines, { min: CUSTOM_LIMITS.minMines, max: maxMines });
  const density = Math.round((mNum / (rNum * cNum)) * 100);

  const reflect = (
    value: string,
    lim: { min: number; max: number },
    set: (v: string) => void
  ) => set(String(clampDim(value, lim)));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const cfg = clampCustom(rows, cols, mines);
    onStart(cfg.rows, cfg.cols, cfg.mines);
  };

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="custom-title">
        <h2 id="custom-title">Custom Board</h2>
        <form onSubmit={submit}>
          <label className="field">
            <span>Columns</span>
            <small>
              {CUSTOM_LIMITS.cols.min}–{CUSTOM_LIMITS.cols.max}
            </small>
            <input
              ref={colsRef}
              type="number"
              inputMode="numeric"
              min={CUSTOM_LIMITS.cols.min}
              max={CUSTOM_LIMITS.cols.max}
              value={cols}
              onChange={(e) => setCols(e.target.value)}
              onBlur={() => reflect(cols, CUSTOM_LIMITS.cols, setCols)}
            />
          </label>
          <label className="field">
            <span>Rows</span>
            <small>
              {CUSTOM_LIMITS.rows.min}–{CUSTOM_LIMITS.rows.max}
            </small>
            <input
              type="number"
              inputMode="numeric"
              min={CUSTOM_LIMITS.rows.min}
              max={CUSTOM_LIMITS.rows.max}
              value={rows}
              onChange={(e) => setRows(e.target.value)}
              onBlur={() => reflect(rows, CUSTOM_LIMITS.rows, setRows)}
            />
          </label>
          <label className="field">
            <span>Mines</span>
            <small>
              {CUSTOM_LIMITS.minMines}–{maxMines}
            </small>
            <input
              type="number"
              inputMode="numeric"
              min={CUSTOM_LIMITS.minMines}
              max={maxMines}
              value={mines}
              onChange={(e) => setMines(e.target.value)}
              onBlur={() => reflect(mines, { min: CUSTOM_LIMITS.minMines, max: maxMines }, setMines)}
            />
          </label>
          <div className="modal-summary">
            {cNum} × {rNum} · {mNum} {mNum === 1 ? 'mine' : 'mines'} · {density}% density
          </div>
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary">
              Start
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
