'use client';

// Full-screen confetti burst, triggered by a changing `nonce`. Self-contained
// canvas overlay; runs a rAF loop until every particle falls off-screen.

import { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rot: number;
  vr: number;
  color: string;
}

const COLORS = ['#ff4d6d', '#ffb23a', '#4ade80', '#5ea0ff', '#c084fc', '#ffffff'];

export function Confetti({ nonce }: { nonce: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef(0);
  const particlesRef = useRef<Particle[]>([]);
  const activeRef = useRef(false);

  useEffect(() => {
    if (nonce === 0) return; // no win yet
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const parts: Particle[] = [];
    for (let i = 0; i < 150; i++) {
      parts.push({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * canvas.height * 0.4,
        vx: (Math.random() - 0.5) * 3,
        vy: 2.5 + Math.random() * 4,
        size: 5 + Math.random() * 7,
        rot: Math.random() * Math.PI * 2,
        vr: (Math.random() - 0.5) * 0.35,
        color: COLORS[i % COLORS.length],
      });
    }
    particlesRef.current = parts;

    const tick = () => {
      const cv = canvasRef.current;
      if (!cv) return;
      ctx.clearRect(0, 0, cv.width, cv.height);
      let alive = 0;
      for (const p of particlesRef.current) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.06;
        p.rot += p.vr;
        if (p.y < cv.height + 30) alive++;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }
      if (alive > 0) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, cv.width, cv.height);
        activeRef.current = false;
      }
    };
    if (!activeRef.current) {
      activeRef.current = true;
      rafRef.current = requestAnimationFrame(tick);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [nonce]);

  return <canvas ref={canvasRef} id="fx" />;
}
