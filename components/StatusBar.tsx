import { RefObject } from 'react';
import { pad3 } from '@/lib/format';

interface StatusBarProps {
  muted: boolean;
  undoEnabled: boolean;
  canUndo: boolean;
  onToggleMute: () => void;
  onUndo: () => void;
  onOpenOptions: () => void;
  statusText: string;
  statusClass: '' | 'win' | 'lose';
  best: number | null;
  isNewBest: boolean;
  rootRef: RefObject<HTMLDivElement | null>;
}

export function StatusBar({
  muted,
  undoEnabled,
  canUndo,
  onToggleMute,
  onUndo,
  onOpenOptions,
  statusText,
  statusClass,
  best,
  isNewBest,
  rootRef,
}: StatusBarProps) {
  return (
    <div className="statusbar" ref={rootRef}>
      <div className="sb-left">
        <button
          className={'icon-btn' + (muted ? ' muted' : '')}
          title="Toggle sound"
          aria-label="Toggle sound"
          onClick={onToggleMute}
        >
          {muted ? '🔇' : '🔊'}
        </button>
        {undoEnabled && (
          <button
            className="icon-btn"
            title="Undo last move (Ctrl/⌘ + Z)"
            aria-label="Undo last move"
            onClick={onUndo}
            disabled={!canUndo}
          >
            ↩️
          </button>
        )}
        <button
          className="icon-btn"
          title="Options"
          aria-label="Options"
          onClick={onOpenOptions}
        >
          ⚙️
        </button>
        <div className={'status' + (statusClass ? ' ' + statusClass : '')}>{statusText}</div>
      </div>
      <div className="best">
        {best == null ? (
          '🏆 Best: --'
        ) : (
          <>
            🏆 Best: {pad3(best)}
            {isNewBest && <span className="new-best">NEW!</span>}
          </>
        )}
      </div>
    </div>
  );
}
