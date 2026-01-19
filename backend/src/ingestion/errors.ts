export class IngestionError extends Error {
  constructor(public message: string, public code: string, public details?: any) {
    super(message);
    this.name = "IngestionError";
  }
}

export const IngestionErrorCodes = {
  UNSUPPORTED_FILE_TYPE: "UNSUPPORTED_FILE_TYPE",
  DUPLICATE_FILE: "DUPLICATE_FILE",
  FILE_NOT_FOUND: "FILE_NOT_FOUND",
  COMPETENCE_NOT_DETECTED: "COMPETENCE_NOT_DETECTED",
  PARSING_FAILED: "PARSING_FAILED",
  STORAGE_ERROR: "STORAGE_ERROR",
} as const;
