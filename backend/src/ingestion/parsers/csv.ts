import { parse } from "csv-parse/sync";
import fs from "node:fs/promises";
import { ParsedFile } from "./types.js";

export async function parseCsv(filePath: string): Promise<ParsedFile> {
  const content = await fs.readFile(filePath, "utf8");
  const rows = parse(content, {
    delimiter: [",", ";"],
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true
  }) as string[][];

  if (!rows.length) {
    return { headers: [], rows: [], confidence: 100 };
  }

  const headerRow = rows[0].map((cell) => cell?.toString() ?? "");
  const dataRows = rows.slice(1);

  const records = dataRows.map((row) => {
    const record: Record<string, string> = {};
    headerRow.forEach((header, index) => {
      record[header] = row[index]?.toString() ?? "";
    });
    return record;
  });

  return { headers: headerRow, rows: records, confidence: 100 };
}
