// Synthesized sound effects via the Web Audio API (no external assets).
//
// The AudioContext is created lazily and resumed on demand. Browsers block audio
// until a user gesture, so every play call routes through ensureAudio() — which
// both creates the context and resumes it if suspended. Because plays are always
// triggered from within gesture handlers (click / tap / keydown), this reliably
// unlocks audio.

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let muted = false;

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

export function setMuted(value: boolean): void {
  muted = value;
}
export function getMuted(): boolean {
  return muted;
}

// Create the context if needed and resume it whenever it is not running. Safe to
// call from any user-gesture handler (call it on EVERY gesture, not once — a
// backgrounded tab or autoplay policy can re-suspend the context). Returns the
// context, or null if Web Audio is unavailable.
export function ensureAudio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AC = window.AudioContext || (window as WebkitWindow).webkitAudioContext;
    if (!AC) return null;
    try {
      audioCtx = new AC();
      masterGain = audioCtx.createGain();
      masterGain.gain.value = 0.55;
      masterGain.connect(audioCtx.destination);
    } catch {
      audioCtx = null;
      return null;
    }
  }
  if (audioCtx.state !== 'running') {
    audioCtx.resume().catch(() => {});
    // Nudge a 1-sample silent buffer through — fully unlocks stubborn engines.
    try {
      const s = audioCtx.createBufferSource();
      s.buffer = audioCtx.createBuffer(1, 1, audioCtx.sampleRate);
      s.connect(audioCtx.destination);
      s.start(0);
    } catch {
      /* ignore */
    }
  }
  return audioCtx;
}

// A short oscillator blip, optionally sliding in pitch. Safari-safe: schedule a
// hair in the future and use a linear attack rather than an exponential ramp up.
function tone(
  freq: number,
  dur: number,
  type: OscillatorType,
  vol: number,
  slideTo?: number | null,
  delay?: number
): void {
  if (muted) return;
  const ctx = ensureAudio();
  if (!ctx || !masterGain) return;
  const t = ctx.currentTime + 0.02 + (delay || 0);
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type || 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol || 0.3, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g);
  g.connect(masterGain);
  o.start(t);
  o.stop(t + dur + 0.05);
}

// Filtered white-noise burst (the body of the explosion).
function noiseBurst(dur: number, vol: number): void {
  if (muted) return;
  const ctx = ensureAudio();
  if (!ctx || !masterGain) return;
  const t = ctx.currentTime + 0.02;
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(1200, t);
  filt.frequency.exponentialRampToValueAtTime(90, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol || 0.4, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(filt);
  filt.connect(g);
  g.connect(masterGain);
  src.start(t);
  src.stop(t + dur);
}

export const sound = {
  reveal: () => tone(300, 0.06, 'triangle', 0.16, 440),
  flag: () => tone(520, 0.05, 'square', 0.12, 720),
  unflag: () => tone(320, 0.05, 'sine', 0.1, 200),
  question: () => tone(440, 0.05, 'sine', 0.1),
  explode: () => {
    noiseBurst(0.55, 0.5);
    tone(170, 0.5, 'sawtooth', 0.35, 38);
  },
  win: () =>
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.2, 'triangle', 0.25, null, i * 0.12)),
  newgame: () => tone(400, 0.08, 'sine', 0.12, 620),
  undo: () => tone(560, 0.09, 'triangle', 0.13, 300), // downward "rewind" blip
};
