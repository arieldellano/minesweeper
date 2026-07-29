// LED-style 3-digit formatting; handles negatives (-5 -> "-05").
export function pad3(n: number): string {
  if (n < 0) {
    const a = Math.min(99, -n);
    return '-' + (a < 10 ? '0' + a : '' + a);
  }
  n = Math.min(999, n);
  return n < 10 ? '00' + n : n < 100 ? '0' + n : '' + n;
}
