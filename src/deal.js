// One-shot "deal-in" entrance: every tile drops and settles into place
// independently.
//
// Performance: animating up to 480 DOM cells at once means hundreds of
// simultaneous compositor layers + style recalcs — that is the jank we are
// avoiding. Instead the whole entrance runs on a SINGLE <canvas> overlaid on
// the board. Every tile looks identical, so we pre-render ONE tile to an
// offscreen sprite and blit it per tile per frame with drawImage (a GPU-cheap
// operation). One element, one requestAnimationFrame loop, and cost that is flat
// regardless of difficulty — while each tile still animates on its own timeline.
//
// The real DOM cells are kept hidden (`.board.dealing .cell { opacity: 0 }`)
// until the sweep finishes, then revealed in the same frame the canvas is
// removed, so the swap is seamless.

const DROP = 18;      // px each tile falls from
const DURATION = 230; // ms of motion per tile
const STAGGER = 9;    // ms added per diagonal step (r + c), so tiles cascade

let rafId = 0;
let canvas = null;

// Stop any running deal, remove the overlay, and optionally reveal the cells.
export function cancelDeal(onReveal) {
  if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  if (canvas) { canvas.remove(); canvas = null; }
  if (onReveal) onReveal();
}

const easeOut = (t) => 1 - Math.pow(1 - t, 3);
// Overshoot slightly past the target so tiles "settle" into place.
const easeBack = (t) => {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

function roundRectPath(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// Pre-render a single tile that mirrors the CSS `.cell` look (rounded rect,
// diagonal gradient, top highlight + bottom shade from the inset shadows).
function makeSprite(size, dpr, radius) {
  const s = document.createElement('canvas');
  s.width = s.height = Math.ceil(size * dpr);
  const g = s.getContext('2d');
  g.scale(dpr, dpr);
  roundRectPath(g, 0.5, 0.5, size - 1, size - 1, radius);
  const grad = g.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#49527a');
  grad.addColorStop(1, '#383f60');
  g.fillStyle = grad;
  g.fill();
  g.clip(); // keep the edge lines inside the rounded corners
  g.strokeStyle = 'rgba(255,255,255,0.15)';
  g.lineWidth = 1;
  g.beginPath(); g.moveTo(0, 1); g.lineTo(size, 1); g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.22)';
  g.beginPath(); g.moveTo(0, size - 1.5); g.lineTo(size, size - 1.5); g.stroke();
  return s;
}

// Animate the entrance. `board` is the .board element; `reveal` is called once
// to show the real DOM cells when the sweep completes.
export function runDeal(board, cols, rows, cell, gap, reveal) {
  cancelDeal(); // clear any previous run without revealing yet

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = cols * cell + (cols - 1) * gap;
  const h = rows * cell + (rows - 1) * gap;

  canvas = document.createElement('canvas');
  canvas.className = 'deal-canvas';
  canvas.width = Math.ceil(w * dpr);
  canvas.height = Math.ceil(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  board.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const sprite = makeSprite(cell, dpr, 5);
  const step = cell + gap;
  const total = (rows + cols - 2) * STAGGER + DURATION;
  let start = 0;

  const frame = (now) => {
    if (!start) start = now;
    const t = now - start;
    ctx.clearRect(0, 0, w, h);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const local = (t - (r + c) * STAGGER) / DURATION;
        if (local <= 0) continue; // this tile has not started falling yet
        const p = local >= 1 ? 1 : local;
        const cx = c * step + cell / 2;
        const cy = r * step + cell / 2;
        const yoff = (1 - easeOut(p)) * -DROP;          // fall from above
        const scale = 0.55 + 0.45 * (p >= 1 ? 1 : easeBack(p));
        const sz = cell * scale;
        ctx.globalAlpha = p < 0.4 ? p / 0.4 : 1;        // quick fade-in
        ctx.drawImage(sprite, cx - sz / 2, cy + yoff - sz / 2, sz, sz);
      }
    }
    ctx.globalAlpha = 1;

    if (t < total) rafId = requestAnimationFrame(frame);
    else cancelDeal(reveal);
  };
  rafId = requestAnimationFrame(frame);
}
