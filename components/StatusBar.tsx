import { RefObject } from 'react';
import { pad3 } from '@/lib/format';

interface StatusBarProps {
  muted: boolean;
  onToggleMute: () => void;
  onOpenOptions: () => void;
  statusText: string;
  statusClass: '' | 'win' | 'lose';
  best: number | null;
  isNewBest: boolean;
  rootRef: RefObject<HTMLDivElement | null>;
}

export function StatusBar({
  muted,
  onToggleMute,
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
