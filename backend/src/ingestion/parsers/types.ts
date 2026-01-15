export type ParsedFile = {
  headers: string[];
  rows: Array<Record<string, string>>;
  confidence: number;
  rawText?: string;
  rawLines?: string[];
  headerIndex?: number;
};
