// Seven-segment numeric display (LED/LCD electronic-watch style), drawn entirely
// with CSS segments — no font to load. Off segments stay faintly visible (the
// classic "ghost" of a real segmented display). Styling lives in globals.css.

//    aaa
//   f   b
//   f   b
//    ggg
//   e   c
//   e   c
//    ddd
const SEGMENTS: Record<string, string> = {
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
const ALL = ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const;

interface SevenSegProps {
  text: string; // already right-formatted (e.g. "010", "-05")
  digits?: number;
}

export function SevenSeg({ text, digits = 3 }: SevenSegProps) {
  const s = String(text).slice(-digits).padStart(digits, ' ');
  return (
    <span className="counter seg-display" aria-hidden="true">
      {Array.from({ length: digits }, (_, i) => {
        const lit = SEGMENTS[s[i]] ?? '';
        return (
          <span className="seg-digit" key={i}>
            {ALL.map((seg) => (
              <span
                key={seg}
                className={`seg seg-${seg}${lit.includes(seg) ? ' on' : ''}`}
              />
            ))}
          </span>
        );
      })}
    </span>
  );
}
