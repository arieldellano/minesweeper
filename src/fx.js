// Confetti burst on a full-screen canvas overlay. Self-contained.

const fx = document.getElementById('fx');
const ctx = fx.getContext('2d');
let particles = [];
let fxActive = false;

export function launchConfetti() {
  fx.width = window.innerWidth;
  fx.height = window.innerHeight;
  const colors = ['#ff4d6d', '#ffb23a', '#4ade80', '#5ea0ff', '#c084fc', '#ffffff'];
  particles = [];
  for (let i = 0; i < 150; i++) {
    particles.push({
      x: Math.random() * fx.width,
      y: -20 - Math.random() * fx.height * 0.4,
      vx: (Math.random() - 0.5) * 3,
      vy: 2.5 + Math.random() * 4,
      size: 5 + Math.random() * 7,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.35,
      color: colors[i % colors.length],
    });
  }
  if (!fxActive) { fxActive = true; requestAnimationFrame(tick); }
}

function tick() {
  ctx.clearRect(0, 0, fx.width, fx.height);
  let alive = 0;
  for (const p of particles) {
    p.x += p.vx; p.y += p.vy; p.vy += 0.06; p.rot += p.vr;
    if (p.y < fx.height + 30) alive++;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
    ctx.restore();
  }
  if (alive > 0) { requestAnimationFrame(tick); }
  else { ctx.clearRect(0, 0, fx.width, fx.height); fxActive = false; }
}
