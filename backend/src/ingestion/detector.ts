export type Competence = { year: number; month: number };
export type FullDate = { year: number; month: number; day: number };

const DATE_PATTERNS: RegExp[] = [
  /(?<year>20\d{2})[\/-_.](?<month>0?[1-9]|1[0-2])/,
  /(?<month>0?[1-9]|1[0-2])[\/-_.](?<year>20\d{2})/,
  /(?<year>20\d{2})(?<month>0[1-9]|1[0-2])/, // YYYYMM
  /(?<year>20\d{2})\u5e74(?<month>0?[1-9]|1[0-2])\u6708/ // YYYY?MM?
];

const MONTH_NAME_PATTERN = /(?<month_name>jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z\\.\\s,]*(?<year>20\\d{2})/i;
const MONTH_NAME_PATTERN_ALT = /(?<year>20\\d{2})[a-z\\.\\s,]*(?<month_name>jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)/i;
const MONTH_NAME_MAP: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  sept: 9,
  oct: 10,
  nov: 11,
  dec: 12
};

export function detectCompetenceFromText(text: string): Competence | null {
  if (!text) {
    return null;
  }

  for (const pattern of DATE_PATTERNS) {
    const match = pattern.exec(text);
    if (match?.groups?.year && match?.groups?.month) {
      const year = Number.parseInt(match.groups.year, 10);
      const month = Number.parseInt(match.groups.month, 10);
      if (Number.isFinite(year) && Number.isFinite(month) && month >= 1 && month <= 12) {
        return { year, month };
      }
    }
  }

  const nameMatch = MONTH_NAME_PATTERN.exec(text) ?? MONTH_NAME_PATTERN_ALT.exec(text);
  if (nameMatch?.groups?.month_name && nameMatch?.groups?.year) {
    const monthName = nameMatch.groups.month_name.toLowerCase();
    const month = MONTH_NAME_MAP[monthName];
    const year = Number.parseInt(nameMatch.groups.year, 10);
    if (month && Number.isFinite(year)) {
      return { year, month };
    }
  }

  return null;
}

const FULL_DATE_PATTERNS: RegExp[] = [
  /(?<month>0?[1-9]|1[0-2])[\/\-_.](?<day>0?[1-9]|[12]\d|3[01])[\/\-_.](?<year>20\d{2})/,
  /(?<day>0?[1-9]|[12]\d|3[01])[\/\-_.](?<month>0?[1-9]|1[0-2])[\/\-_.](?<year>20\d{2})/
];

const MONTH_WORD_PATTERN = /(?<monthWord>jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z\\.\\s,]*(?<day>0?[1-9]|[12]\\d|3[01])[a-z,\\s]*(?<year>20\\d{2})/i;

export function detectFullDateFromText(text: string): FullDate | null {
  if (!text) {
    return null;
  }

  const normalized = text.toString();
  for (const pattern of FULL_DATE_PATTERNS) {
    const match = pattern.exec(normalized);
    if (match?.groups?.year && match?.groups?.month && match?.groups?.day) {
      const year = Number(match.groups.year);
      const month = Number(match.groups.month);
      const day = Number(match.groups.day);
      if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
        return { year, month, day };
      }
    }
  }

  const wordMatch = MONTH_WORD_PATTERN.exec(normalized);
  if (wordMatch?.groups?.monthWord && wordMatch?.groups?.year && wordMatch?.groups?.day) {
    const monthName = wordMatch.groups.monthWord.toLowerCase();
    const month = MONTH_NAME_MAP[monthName];
    const year = Number(wordMatch.groups.year);
    const day = Number(wordMatch.groups.day);
    if (month && Number.isFinite(year) && Number.isFinite(day)) {
      return { year, month, day };
    }
  }

  return null;
}

export function formatFullDate(date: FullDate): string {
  const month = date.month.toString().padStart(2, "0");
  const day = date.day.toString().padStart(2, "0");
  const year = date.year.toString().padStart(4, "0");
  return `${year}-${month}-${day}`;
}
