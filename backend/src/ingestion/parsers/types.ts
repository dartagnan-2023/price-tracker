export type ParsedRow = Record<string, string>;

export type ParsedFile = {
  headers: string[];
  rows: ParsedRow[];
  confidence: number;
  rawText?: string;
  rawLines?: string[];
  headerIndex?: number;
};
