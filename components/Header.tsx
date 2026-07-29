import { RefObject } from 'react';
import { pad3 } from '@/lib/format';
import { SevenSeg } from './SevenSeg';

interface HeaderProps {
  minesRemaining: number;
  timer: number;
  face: string;
  onReset: () => void;
  onFacePress: (pressed: boolean) => void;
  rootRef: RefObject<HTMLDivElement | null>;
}

export function Header({ minesRemaining, timer, face, onReset, onFacePress, rootRef }: HeaderProps) {
  return (
    <div className="header" ref={rootRef}>
      <div className="led">
        <span className="ico">💣</span>
        <SevenSeg text={pad3(minesRemaining)} />
      </div>
      <button
        className="reset-btn"
        title="New game"
        aria-label="New game"
        onClick={onReset}
        onMouseDown={() => onFacePress(true)}
        onMouseUp={() => onFacePress(false)}
        onMouseLeave={() => onFacePress(false)}
      >
        <span className="face">{face}</span>
      </button>
      <div className="led">
        <span className="ico">⏱️</span>
        <SevenSeg text={pad3(timer)} />
      </div>
    </div>
  );
}
