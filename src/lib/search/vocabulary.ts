// A sorted list of distinct tokens, so "every token starting with `wa`" is a binary search
// plus a short walk — not a scan of the whole vocabulary on every keystroke.

export class Vocabulary {
  private sorted: string[] = [];

  /** Replace everything (one sort, for the cold build). */
  reset(tokens: Iterable<string>): void {
    this.sorted = [...tokens].sort();
  }

  add(token: string): void {
    const i = this.lowerBound(token);
    if (this.sorted[i] !== token) this.sorted.splice(i, 0, token);
  }

  delete(token: string): void {
    const i = this.lowerBound(token);
    if (this.sorted[i] === token) this.sorted.splice(i, 1);
  }

  /** Every token that starts with `prefix`, in sorted order. */
  *withPrefix(prefix: string): Iterable<string> {
    for (let i = this.lowerBound(prefix); i < this.sorted.length && this.sorted[i].startsWith(prefix); i++) {
      yield this.sorted[i];
    }
  }

  private lowerBound(token: string): number {
    let lo = 0;
    let hi = this.sorted.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.sorted[mid] < token) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}
