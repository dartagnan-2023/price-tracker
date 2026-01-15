export type MatchResult = {
  match: string;
  score: number;
};

export function findBestMatch(target: string, candidates: string[]): MatchResult | null {
  if (!candidates.length) {
    return null;
  }

  let best: MatchResult | null = null;
  for (const candidate of candidates) {
    const score = similarity(target, candidate);
    if (!best || score > best.score) {
      best = { match: candidate, score };
    }
  }

  return best;
}

export function similarity(a: string, b: string): number {
  if (a === b) {
    return 1;
  }
  if (!a || !b) {
    return 0;
  }

  const distance = levenshtein(a, b);
  return 1 - distance / Math.max(a.length, b.length);
}

function levenshtein(a: string, b: string): number {
  const matrix: number[][] = Array.from({ length: a.length + 1 }, () => []);

  for (let i = 0; i <= a.length; i += 1) {
    matrix[i][0] = i;
  }
  for (let j = 0; j <= b.length; j += 1) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}
