const PARTNUMBER_KEYWORDS = [
  "partnumber",
  "part number",
  "part_no",
  "partno",
  "p/n",
  "pn",
  "sku",
  "codigo",
  "cod",
  "productcode",
  "product code",
  "item",
  "\u6599\u53f7", // ??
  "\u54c1\u53f7", // ??
  "\u578b\u53f7", // ??
  "\u7269\u6599\u53f7" // ???
];

const UNITPRICE_KEYWORDS = [
  "unit price",
  "unitprice",
  "price",
  "preco",
  "preco unitario",
  "valor",
  "valor unitario",
  "unitario",
  "\u5355\u4ef7", // ??
  "\u4ef7\u683c" // ??
];

const DESCRIPTION_KEYWORDS = [
  "quantities and descriptions",
  "quantities and description",
  "quantities",
  "descriptions",
  "description",
  "descricao",
  "descri\u00e7\u00e3o"
];

export type HeaderMapping = {
  partNumber?: string;
  unitPrice?: string;
  confidence: {
    partNumber: number;
    unitPrice: number;
  };
};

export function detectHeaderMapping(headers: string[]): HeaderMapping {
  const normalizedHeaders = headers.map((header) => ({
    raw: header,
    normalized: normalizeHeaderValue(header)
  }));

  const partNumberMatch = findBestHeader(normalizedHeaders, PARTNUMBER_KEYWORDS);
  const unitPriceMatch = findBestHeader(normalizedHeaders, UNITPRICE_KEYWORDS);

  return {
    partNumber: partNumberMatch?.raw,
    unitPrice: unitPriceMatch?.raw,
    confidence: {
      partNumber: partNumberMatch?.score ?? 0,
      unitPrice: unitPriceMatch?.score ?? 0
    }
  };
}

function normalizeHeader(value: string): string {
  return normalizeHeaderValue(value);
}

export function normalizeHeaderValue(value: string): string {
  return value
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\-]/g, " ")
    .replace(/\s+/g, " ");
}

type HeaderCandidate = { raw: string; normalized: string };

type ScoredHeader = { raw: string; score: number };

function findBestHeader(headers: HeaderCandidate[], keywords: string[]): ScoredHeader | null {
  let best: ScoredHeader | null = null;

  for (const header of headers) {
    let score = 0;
    for (const keyword of keywords) {
      const normalizedKeyword = normalizeHeader(keyword);
      if (header.normalized.includes(normalizedKeyword)) {
        score = Math.max(score, 1);
      } else {
        score = Math.max(score, similarity(header.normalized, normalizedKeyword));
      }
    }

    if (!best || score > best.score) {
      best = { raw: header.raw, score };
    }
  }

  return best;
}

export function findDescriptionHeader(headers: string[]): string | null {
  const normalizedHeaders = headers.map((header) => ({
    raw: header,
    normalized: normalizeHeaderValue(header)
  }));

  for (const header of normalizedHeaders) {
    if (isDescriptionHeader(header.normalized)) {
      return header.raw;
    }
  }

  return null;
}

export function isDescriptionHeader(header: string) {
  const normalized = normalizeHeaderValue(header);
  return (
    normalized.includes("description") ||
    normalized.includes("descriptions") ||
    normalized.includes("quantities")
  );
}

function similarity(a: string, b: string): number {
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
