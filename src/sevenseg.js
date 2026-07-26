// Seven-segment numeric display (LED/LCD electronic-watch style), drawn entirely
// with CSS segments — no font to load. Each digit is a fixed set of 7 segment
// elements (a–g); updating just toggles the `on` class per segment, so the
// per-tick cost is a handful of class flips. Off segments stay faintly visible
// (the classic "ghost" of a real segmented display). Styling lives in styles.css
// under `.seg-display`.

// Which segments are lit for each character.
//    aaa
//   f   b
//   f   b
//    ggg
//   e   c
//   e   c
//    ddd
const SEGMENTS = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abged',
  '3': 'abgcd',
  '4': 'fgbc',
  '5': 'afgcd',
  '6': 'afgedc',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcfgd',
  '-': 'g',
  ' ': '',
};
const ALL = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

// Build `count` digit cells inside `el` and return an update(str) function that
// right-aligns `str` across them.
export function createDisplay(el, count) {
  el.classList.add('seg-display');
  el.textContent = '';
  const digits = [];

  for (let i = 0; i < count; i++) {
    const cell = document.createElement('span');
    cell.className = 'seg-digit';
    const segs = {};
    for (const s of ALL) {
      const seg = document.createElement('span');
      seg.className = 'seg seg-' + s;
      cell.appendChild(seg);
      segs[s] = seg;
    }
    el.appendChild(cell);
    digits.push(segs);
  }

  return function update(str) {
    const s = String(str).slice(-count).padStart(count, ' ');
    for (let i = 0; i < count; i++) {
      const lit = SEGMENTS[s[i]] || '';
      const segs = digits[i];
      for (const seg of ALL) segs[seg].classList.toggle('on', lit.includes(seg));
    }
  };
}
