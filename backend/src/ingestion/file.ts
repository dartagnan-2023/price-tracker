import path from "node:path";
import { FileType } from "../constants.js";
import { parseCsv } from "./parsers/csv.js";
import { parseImage } from "./parsers/image.js";
import { parseXlsx } from "./parsers/xlsx.js";
import { ParsedFile } from "./parsers/types.js";

export async function parseFile(filePath: string, fileType: FileType): Promise<ParsedFile> {
  switch (fileType) {
    case FileType.CSV:
      return parseCsv(filePath);
    case FileType.XLSX:
    case FileType.XLS:
      return parseXlsx(filePath);
    case FileType.PNG:
    case FileType.JPG:
    case FileType.JPEG:
      return parseImage(filePath);
    default:
      return { headers: [], rows: [], confidence: 0 };
  }
}

export function detectFileType(filePath: string): FileType | null {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".csv":
      return FileType.CSV;
    case ".xlsx":
      return FileType.XLSX;
    case ".xls":
      return FileType.XLS;
    case ".png":
      return FileType.PNG;
    case ".jpg":
      return FileType.JPG;
    case ".jpeg":
      return FileType.JPEG;
    default:
      return null;
  }
}
