'use client';

// New-record dialog: shown right after a win that beat the standing best time,
// asking who set it. The record itself is already banked by then — this only
// attaches a name, so skipping is always safe. Matches the card + modal look.

import { useEffect, useRef, useState } from 'react';
import type { PendingRecord } from '@/lib/types';
import { MAX_NAME_LENGTH } from '@/lib/types';
import { DIFFICULTIES } from '@/lib/difficulty';
import { pad3 } from '@/lib/format';

interface RecordModalProps {
  record: PendingRecord | null;
  initialName: string;
  onSubmit: (name: string) => void;
  onSkip: () => void;
}

export function RecordModal({ record, initialName, onSubmit, onSkip }: RecordModalProps) {
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement>(null);

  // Prefill with the last-used name and focus the field each time it opens.
  useEffect(() => {
    if (!record) return;
    setName(initialName);
    const id = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(id);
  }, [record, initialName]);

  // Escape skips (the time is already recorded).
  useEffect(() => {
    if (!record) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onSkip();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [record, onSkip]);

  if (!record) return null;

  const label =
    record.difficulty === 'custom'
      ? `Custom ${record.config.cols}×${record.config.rows}`
      : DIFFICULTIES[record.difficulty].label;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(name);
  };

  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onSkip()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="record-title">
        <h2 id="record-title">New Record!</h2>
        <div className="record-brag">
          <span className="record-diff">{label}</span>
          <span className="record-time">{pad3(record.time)}</span>
        </div>
        <form onSubmit={submit}>
          <label className="field field-wide">
            <span>Your name</span>
            <small>Shown with the record</small>
            <input
              ref={inputRef}
              type="text"
              autoComplete="off"
              spellCheck={false}
              maxLength={MAX_NAME_LENGTH}
              placeholder="Anonymous"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <div className="modal-actions">
            <button type="button" className="btn-ghost" onClick={onSkip}>
              Skip
            </button>
            <button type="submit" className="btn-primary">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
