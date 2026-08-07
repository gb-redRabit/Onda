export function topN<T>(items: T[], n: number, score: (t: T) => number): T[] {
  const out: T[] = [];
  for (const item of items) {
    const s = score(item);
    if (out.length < n) {
      let i = out.length;
      out.push(item);
      while (i > 0 && score(out[i - 1]) < s) {
        out[i] = out[i - 1];
        i--;
      }
      out[i] = item;
    } else if (s > score(out[out.length - 1])) {
      let i = out.length - 1;
      while (i > 0 && score(out[i - 1]) < s) {
        out[i] = out[i - 1];
        i--;
      }
      out[i] = item;
    }
  }
  return out;
}
