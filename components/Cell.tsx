import { memo } from 'react';
import type { CellState } from '@/lib/types';

interface CellProps {
  cell: CellState;
  r: number;
  c: number;
  pressed: boolean;
}

const FLAG = '⚑︎'; // ⚑ monochrome flag glyph (takes CSS color)

function classesFor(cell: CellState, pressed: boolean): string {
  const cls = ['cell'];
  if (cell.wrongFlag) {
    cls.push('revealed', 'wrong-flag');
  } else if (cell.revealed) {
    cls.push('revealed');
    if (cell.mine) {
      cls.push('mine-revealed');
      if (cell.exploded) cls.push('mine-clicked');
    } else if (cell.adjacent > 0) {
      cls.push('n' + cell.adjacent);
    }
    if (cell.popped) cls.push('pop');
  } else if (cell.flagged === 1) {
    cls.push('flagged');
  } else if (cell.flagged === 2) {
    cls.push('question');
  }
  if (pressed) cls.push('pressed');
  return cls.join(' ');
}

function contentFor(cell: CellState): string {
  if (cell.wrongFlag) return '💣';
  if (cell.revealed) {
    if (cell.mine) return '💣';
    return cell.adjacent > 0 ? String(cell.adjacent) : '';
  }
  if (cell.flagged === 1) return FLAG;
  if (cell.flagged === 2) return '?';
  return '';
}

function CellImpl({ cell, r, c, pressed }: CellProps) {
  return (
    <div className={classesFor(cell, pressed)} data-row={r} data-col={c}>
      {contentFor(cell)}
    </div>
  );
}

export const Cell = memo(CellImpl);
