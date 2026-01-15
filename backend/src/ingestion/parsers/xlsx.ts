import fs from "node:fs/promises";
import XLSX from "xlsx";
import { ParsedFile } from "./types.js";

export async function parseXlsx(filePath: string): Promise<ParsedFile> {
  const buffer = await fs.readFile(filePath);
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    blankrows: false
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
