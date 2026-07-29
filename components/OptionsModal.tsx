'use client';

// Options dialog: default difficulty, sound, "generate solvable games only",
// undo, and a read-out of the best times per preset difficulty (with a clear
// action).
// Matches the card + modal look. Rendered only while open.

import { useCallback, useEffect, useState } from 'react';
import type { BestRecord, DifficultyName } from '@/lib/types';
import { DIFFICULTIES } from '@/lib/difficulty';
import { pad3 } from '@/lib/format';
import { clearBests, getBest } from '@/lib/persistence';
import { Toggle } from './Toggle';

interface OptionsModalProps {
  open: boolean;
  defaultDifficulty: DifficultyName;
  muted: boolean;
  solvableOnly: boolean;
  guaranteeOpening: boolean;
  undoEnabled: boolean;
  onClose: () => void;
  onChangeDefault: (difficulty: DifficultyName) => void;
  onToggleSound: () => void;
  onToggleSolvable: (value: boolean) => void;
  onToggleOpening: (value: boolean) => void;
  onToggleUndo: (value: boolean) => void;
  onRecordsCleared: () => void;
}

const PRESETS: Exclude<DifficultyName, 'custom'>[] = ['beginner', 'intermediate', 'expert'];

const DIFFS: { key: DifficultyName; label: string }[] = [
  { key: 'beginner', label: 'Beginner' },
  { key: 'intermediate', label: 'Intermediate' },
  { key: 'expert', label: 'Expert' },
  { key: 'custom', label: 'Custom' },
];

export function OptionsModal({
  open,
  defaultDifficulty,
  muted,
  solvableOnly,
  guaranteeOpening,
  undoEnabled,
  onClose,
  onChangeDefault,
  onToggleSound,
  onToggleSolvable,
  onToggleOpening,
  onToggleUndo,
  onRecordsCleared,
}: OptionsModalProps) {
  const [records, setRecords] = useState<Record<string, BestRecord | null>>({});

  const readRecords = useCallback(() => {
    const next: Record<string, BestRecord | null> = {};
    // custom is excluded (its bests are keyed by dimensions); the custom arg is
    // unused for presets.
    for (const d of PRESETS) next[d] = getBest(d, { rows: 0, cols: 0, mines: 0, label: '' });
    setRecords(next);
  }, []);

  useEffect(() => {
    if (open) readRecords();
  }, [open, readRecords]);

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

  const handleClear = () => {
    clearBests();
    readRecords();
    onRecordsCleared();
  };

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="options-title">
        <h2 id="options-title">Options</h2>

        <div className="opt-select">
          <span className="opt-heading">Default difficulty</span>
          <div className="opt-seg" role="group" aria-label="Default difficulty">
            {DIFFS.map((d) => (
              <button
                key={d.key}
                type="button"
                className={defaultDifficulty === d.key ? 'active' : undefined}
                aria-pressed={defaultDifficulty === d.key}
                onClick={() => onChangeDefault(d.key)}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div className="opt-row">
          <div className="opt-label">
            <span>Sound</span>
            <small>Effects &amp; win/lose cues</small>
          </div>
          <Toggle checked={!muted} onChange={onToggleSound} label="Sound" />
        </div>

        <div className="opt-row">
          <div className="opt-label">
            <span>Generate solvable games only</span>
            <small>No-guess boards</small>
          </div>
          <Toggle checked={solvableOnly} onChange={onToggleSolvable} label="Generate solvable games only" />
        </div>

        <div className="opt-row">
          <div className="opt-label">
            <span>Guarantee an opening region</span>
            <small>First click always opens a blank area</small>
          </div>
          <Toggle
            checked={guaranteeOpening}
            onChange={onToggleOpening}
            label="Guarantee an opening region"
          />
        </div>
        {/* Without this the option looks broken: a no-guess board needs a blank
            opening to deduce from, so the generator produces one regardless. */}
        {!guaranteeOpening && solvableOnly && (
          <p className="opt-note">
            No-guess boards always open a blank area anyway. Turn off “Generate solvable games
            only” to get numbered first clicks.
          </p>
        )}

        <div className="opt-row">
          <div className="opt-label">
            <span>Undo</span>
            <small>Take back your last move — even a fatal one</small>
          </div>
          <Toggle checked={undoEnabled} onChange={onToggleUndo} label="Undo" />
        </div>

        <div className="opt-records">
          <h3>Best times</h3>
          {PRESETS.map((d) => {
            const rec = records[d];
            return (
              <div className="rec-row" key={d}>
                <span className="rec-name">{DIFFICULTIES[d].label}</span>
                <span className="rec-holder">{rec?.name ?? (rec ? 'Anonymous' : '')}</span>
                <span className={'rec-time' + (rec == null ? ' none' : '')}>
                  {rec == null ? '—' : pad3(rec.time)}
                </span>
              </div>
            );
          })}
          <button type="button" className="link-btn" onClick={handleClear}>
            Clear records
          </button>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
