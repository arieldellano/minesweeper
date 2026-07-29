import { RefObject } from 'react';
import type { DifficultyName } from '@/lib/types';

interface DifficultyBarProps {
  active: DifficultyName;
  onSelect: (difficulty: DifficultyName) => void;
  onCustom: () => void;
  rootRef: RefObject<HTMLDivElement | null>;
}

const PRESETS: { key: Exclude<DifficultyName, 'custom'>; label: string }[] = [
  { key: 'beginner', label: 'Beginner' },
  { key: 'intermediate', label: 'Intermediate' },
  { key: 'expert', label: 'Expert' },
];

export function DifficultyBar({ active, onSelect, onCustom, rootRef }: DifficultyBarProps) {
  return (
    <div className="difficulty-bar" ref={rootRef}>
      {PRESETS.map(({ key, label }) => (
        <button
          key={key}
          className={active === key ? 'active' : undefined}
          onClick={() => onSelect(key)}
        >
          {label}
        </button>
      ))}
      <button className={active === 'custom' ? 'active' : undefined} onClick={onCustom}>
        Custom
      </button>
    </div>
  );
}
