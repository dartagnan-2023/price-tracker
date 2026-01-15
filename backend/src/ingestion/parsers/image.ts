import { createWorker, PSM } from "tesseract.js";
import { Jimp, JimpMime } from "jimp";
import { ParsedFile } from "./types.js";

const OCR_LANG = "chi_sim+eng";
const HEADER_KEYWORDS = ["unit price", "amount", "quantities and descriptions", "quantities", "description", "marks"];
const STANDARD_HEADERS = [
  "Marks & Nos.",
  "Quantities and Descriptions",
  "Unit Price",
  "Amount"
];

export async function parseImage(filePath: string): Promise<ParsedFile> {
  const worker = await createWorker();
  const api = worker as any;
  await api.loadLanguage(OCR_LANG);
  await api.initialize(OCR_LANG);
  await api.setParameters({
    tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    preserve_interword_spaces: "1",
    user_defined_dpi: "300"
  });

  const original = await api.recognize(filePath);
  const preprocessedBuffer = await preprocessImage(filePath);
  const preprocessed = preprocessedBuffer
    ? await api.recognize(preprocessedBuffer)
    : null;
  await worker.terminate();

  const originalParsed = buildParsedFile(original.data?.text ?? "", original.data?.confidence ?? 0);
  const preprocessedParsed = preprocessed
    ? buildParsedFile(preprocessed.data?.text ?? "", preprocessed.data?.confidence ?? 0)
    : null;

  const selected = pickBestParsed(originalParsed, preprocessedParsed);
  return selected;
}

function buildParsedFile(text: string, confidence: number): ParsedFile {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) {
    return { headers: [], rows: [], confidence, rawText: text, rawLines: lines };
  }

  const headerIndex = findHeaderIndex(lines);
  const headerLine = headerIndex >= 0 ? lines[headerIndex] : lines[0];
  const dataLines = headerIndex >= 0 ? lines.slice(headerIndex + 1) : lines.slice(1);

  const useStandardLayout = headerIndex >= 0 || looksLikeStandardLayout(lines);
  const headers = useStandardLayout ? STANDARD_HEADERS : buildHeaders(headerLine);

  const rows = dataLines.flatMap((line) => {
    if (useStandardLayout) {
      const parsed = parseStandardInvoiceLine(line);
      if (!parsed) {
        return [];
      }
      return [{
        [STANDARD_HEADERS[0]]: parsed.marks,
        [STANDARD_HEADERS[1]]: parsed.description,
        [STANDARD_HEADERS[2]]: parsed.unitPrice,
        [STANDARD_HEADERS[3]]: parsed.amount
      }];
    }

    const cells = splitLine(line);
    if (!cells.length) {
      return [];
    }
    const record: Record<string, string> = {};
    const normalizedCells = normalizeCellsForHeaders(headers, cells);
    headers.forEach((header, index) => {
      record[header] = normalizedCells[index] ?? "";
    });
    return [record];
  });

  const normalizedHeaders = headers === STANDARD_HEADERS ? headers.slice() : headers;

  return {
    headers: normalizedHeaders,
    rows,
    confidence,
    rawText: text,
    rawLines: lines,
    headerIndex: headerIndex >= 0 ? headerIndex : undefined
  };
}

function pickBestParsed(primary: ParsedFile, secondary: ParsedFile | null) {
  if (!secondary) {
    return primary;
  }

  if (secondary.rows.length > primary.rows.length) {
    return secondary;
  }

  if (secondary.rows.length === primary.rows.length && secondary.confidence > primary.confidence) {
    return secondary;
  }

  return primary;
}

function splitLine(line: string): string[] {
  const tabSplit = line.split(/\t+/).map((item) => item.trim()).filter(Boolean);
  if (tabSplit.length > 1) {
    return tabSplit;
  }

  const multiSpaceSplit = line.split(/\s{2,}/).map((item) => item.trim()).filter(Boolean);
  if (multiSpaceSplit.length > 1) {
    return multiSpaceSplit;
  }

  return line.split(/\s+/).map((item) => item.trim()).filter(Boolean);
}

function findHeaderIndex(lines: string[]) {
  for (let i = 0; i < lines.length; i += 1) {
    const normalized = normalizeLine(lines[i]);
    const alpha = normalizeAlpha(lines[i]);
    if (
      HEADER_KEYWORDS.some((keyword) => normalized.includes(keyword))
      || hasHeaderSignature(alpha)
    ) {
      return i;
    }

    if (i < lines.length - 1) {
      const nextAlpha = normalizeAlpha(lines[i + 1]);
      if (hasHeaderSignature(alpha + nextAlpha)) {
        return i;
      }
    }
  }
  return -1;
}

function normalizeLine(value: string) {
  return value
    .toString()
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_\-]/g, " ")
    .replace(/\s+/g, " ");
}

function buildHeaders(headerLine: string) {
  const normalized = normalizeLine(headerLine);
  const alpha = normalizeAlpha(headerLine);
  if (
    hasHeaderSignature(alpha)
  ) {
    return STANDARD_HEADERS;
  }
  return splitLine(headerLine);
}

function normalizeCellsForHeaders(headers: string[], cells: string[]) {
  if (headers !== STANDARD_HEADERS) {
    return cells;
  }

  const parsed = parseStandardInvoiceLine(cells.join(" "));
  if (parsed) {
    return [parsed.marks, parsed.description, parsed.unitPrice, parsed.amount];
  }

  if (cells.length === 3) {
    return ["", cells[0], cells[1], cells[2]];
  }

  if (cells.length >= 4) {
    const first = cells[0];
    const second = cells[1];
    const unitPrice = cells[cells.length - 2];
    const amount = cells[cells.length - 1];
    const looksLikePart = looksLikePartNumber(first);
    const hasQty = /\bPCS\b|\bPC\b/i.test(second);

    if (looksLikePart && hasQty) {
      return ["", `${first} ${second}`.trim(), unitPrice, amount];
    }

    const marks = first;
    const description = cells.slice(1, cells.length - 2).join(" ");
    return [marks, description, unitPrice, amount];
  }

  return cells;
}

function looksLikePartNumber(value: string) {
  return /[A-Za-z]/.test(value) && /\d/.test(value) && /[-/]/.test(value);
}

function parseStandardInvoiceLine(line: string) {
  const cleanedLine = normalizeInvoiceLine(line);
  const normalized = normalizeLine(cleanedLine);
  const alpha = normalizeAlpha(cleanedLine);
  if (!line || !normalized) {
    return null;
  }

  if (alpha.includes("fobningbo") || alpha.includes("indicator") || alpha.includes("indicadores") || alpha.includes("ncm")) {
    return null;
  }

  const priceTokens = extractPriceTokens(cleanedLine);
  if (!priceTokens.length) {
    return null;
  }

  const unitPrice = priceTokens.length >= 2
    ? priceTokens[priceTokens.length - 2]
    : priceTokens[0];
  const amount = priceTokens.length >= 2 ? priceTokens[priceTokens.length - 1] : "";
  const description = extractDescription(cleanedLine);

  if (!unitPrice) {
    return null;
  }

  return {
    marks: "",
    description,
    unitPrice: `US$${unitPrice}`,
    amount: amount ? `US$${amount}` : ""
  };
}

function extractDescription(line: string) {
  const upper = line.toUpperCase();
  const priceIndex = upper.indexOf("US");
  const trimmed = priceIndex > 0 ? line.slice(0, priceIndex) : line;
  return trimmed
    .replace(/\b\d+\s*(?:PCS|PC|PES)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractPriceTokens(line: string) {
  const candidate = line.replace(/O/g, "0");
  const usMatches = candidate.match(/U\s*S\s*\$?\s*\d+(?:[.,]\d+)?/gi) ?? [];
  const cleaned = usMatches.map((match) => match.replace(/[^0-9.,]/g, "")).filter(Boolean);
  if (cleaned.length) {
    return cleaned;
  }
  return candidate.match(/\d+[.,]\d+/g) ?? [];
}

function normalizeAlpha(value: string) {
  return value.toString().trim().toLowerCase().replace(/[^a-z]/g, "");
}

function normalizeInvoiceLine(line: string) {
  return line
    .replace(/([A-Z0-9/-]{4,})(\d{2,5}\s*(?:PCS|PC|PES))/gi, "$1 $2")
    .replace(/(\d)(US)/gi, "$1 US")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeStandardLayout(lines: string[]) {
  return lines.some((line) => {
    const alpha = normalizeAlpha(line);
    return hasHeaderSignature(alpha);
  });
}

function hasHeaderSignature(alpha: string) {
  const hasMarks = alpha.includes("marks");
  const hasQuantities = alpha.includes("quantities") || alpha.includes("quantity");
  const hasPrice = alpha.includes("price") || alpha.includes("prlce") || alpha.includes("pr1ce") || alpha.includes("prce");
  const hasAmount = alpha.includes("amount") || alpha.includes("amoun") || alpha.includes("amunt");

  return (hasMarks && hasQuantities)
    || (hasQuantities && hasPrice)
    || (hasMarks && hasPrice)
    || (hasPrice && hasAmount);
}

async function preprocessImage(filePath: string): Promise<Buffer | null> {
  try {
    const image = await Jimp.read(filePath);
    const width = image.bitmap.width;
    if (width < 1400) {
      image.scale(2);
    } else if (width < 2000) {
      image.scale(1.5);
    }

    image
      .greyscale()
      .contrast(0.35)
      .brightness(0.05)
      .normalize()
      .threshold({ max: 200 });

    return await (image as any).getBufferAsync(JimpMime.png);
  } catch {
    return null;
  }
}
