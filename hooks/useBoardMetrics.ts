'use client';

// Computes a cell size that fits the board into the available viewport, the same
// way the original imperative game did: subtract the measured chrome (title,
// difficulty bar, header, status bar) from the window, then fit rows x cols.
// Initial value matches on server and client (no hydration mismatch); the real
// measurement runs after mount.

import { useLayoutEffect, useState } from 'react';
import { GAP } from '@/lib/difficulty';

export interface BoardMetrics {
  cellPx: number;
  fontSize: number;
}

const DEFAULT_CELL = 28;

export function useBoardMetrics(
  rows: number,
  cols: number,
  measureChrome: () => number
): BoardMetrics {
  const [metrics, setMetrics] = useState<BoardMetrics>({
    cellPx: DEFAULT_CELL,
    fontSize: Math.round(DEFAULT_CELL * 0.52),
  });

  useLayoutEffect(() => {
    const measure = () => {
      const chrome = measureChrome();
      const availW = Math.min(window.innerWidth, 1120) - 24 - 28 - 16;
      const availH = window.innerHeight - chrome - 90;
      const maxW = Math.floor((availW - (cols - 1) * GAP) / cols);
      const maxH = Math.floor((availH - (rows - 1) * GAP) / rows);
      const cellPx = Math.max(16, Math.min(maxW, maxH, 46));
      const fontSize = Math.max(11, Math.min(cellPx * 0.52, 22));
      setMetrics((prev) =>
        prev.cellPx === cellPx && prev.fontSize === fontSize ? prev : { cellPx, fontSize }
      );
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [rows, cols, measureChrome]);

  return metrics;
}
