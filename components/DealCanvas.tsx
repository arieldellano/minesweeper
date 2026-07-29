'use client';

// One-shot "deal-in" entrance: every tile drops and settles into place on its
// own timeline, but the whole animation runs on a SINGLE <canvas> overlay — one
// pre-rendered tile sprite blitted per tile per frame — so cost is flat no matter
// the board size. Mounted only while dealing; unmount cancels the loop.

import { useEffect, useRef } from 'react';

const DROP = 18; // px each tile falls from
const DURATION = 230; // ms of motion per tile
const STAGGER = 9; // ms added per diagonal step (r + c)

interface DealCanvasProps {
  rows: number;
  cols: number;
  cellPx: number;
  gap: number;
  onDone: () => void;
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
const easeBack = (t: number) => {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

function roundRectPath(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// Pre-render a single tile that mirrors the CSS `.cell` look.
function makeSprite(size: number, dpr: number, radius: number): HTMLCanvasElement {
  const s = document.createElement('canvas');
  s.width = s.height = Math.ceil(size * dpr);
  const g = s.getContext('2d')!;
  g.scale(dpr, dpr);
  roundRectPath(g, 0.5, 0.5, size - 1, size - 1, radius);
  const grad = g.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#49527a');
  grad.addColorStop(1, '#383f60');
  g.fillStyle = grad;
  g.fill();
  g.clip();
  g.strokeStyle = 'rgba(255,255,255,0.15)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(0, 1);
  g.lineTo(size, 1);
  g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.22)';
  g.beginPath();
  g.moveTo(0, size - 1.5);
  g.lineTo(size, size - 1.5);
  g.stroke();
  return s;
}

export function DealCanvas({ rows, cols, cellPx, gap, onDone }: DealCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = cols * cellPx + (cols - 1) * gap;
    const h = rows * cellPx + (rows - 1) * gap;
    canvas.width = Math.ceil(w * dpr);
    canvas.height = Math.ceil(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);
    const sprite = makeSprite(cellPx, dpr, 5);
    const step = cellPx + gap;
    const total = (rows + cols - 2) * STAGGER + DURATION;

    let raf = 0;
    let start = 0;
    let finished = false;
    const frame = (now: number) => {
      if (!start) start = now;
      const t = now - start;
      ctx.clearRect(0, 0, w, h);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const local = (t - (r + c) * STAGGER) / DURATION;
          if (local <= 0) continue;
          const p = local >= 1 ? 1 : local;
          const cx = c * step + cellPx / 2;
          const cy = r * step + cellPx / 2;
          const yoff = (1 - easeOut(p)) * -DROP;
          const scale = 0.55 + 0.45 * (p >= 1 ? 1 : easeBack(p));
          const sz = cellPx * scale;
          ctx.globalAlpha = p < 0.4 ? p / 0.4 : 1;
          ctx.drawImage(sprite, cx - sz / 2, cy + yoff - sz / 2, sz, sz);
        }
      }
      ctx.globalAlpha = 1;
      if (t < total) {
        raf = requestAnimationFrame(frame);
      } else {
        finished = true;
        doneRef.current();
      }
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      // If we were cancelled early (first interaction), still reveal the cells.
      if (!finished) doneRef.current();
    };
  }, [rows, cols, cellPx, gap]);

  return <canvas ref={canvasRef} className="deal-canvas" />;
}
