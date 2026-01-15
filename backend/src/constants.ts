export const BatchStatus = {
  PENDING_REVIEW: "PENDING_REVIEW",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED"
} as const;

export type BatchStatus = typeof BatchStatus[keyof typeof BatchStatus];

export const FileType = {
  CSV: "CSV",
  XLSX: "XLSX",
  XLS: "XLS",
  PNG: "PNG",
  JPG: "JPG",
  JPEG: "JPEG"
} as const;

export type FileType = typeof FileType[keyof typeof FileType];

export const CorrectionStatus = {
  NONE: "NONE",
  AUTO_CORRECTED: "AUTO_CORRECTED",
  NEEDS_REVIEW: "NEEDS_REVIEW",
  RESOLVED: "RESOLVED"
} as const;

export type CorrectionStatus = typeof CorrectionStatus[keyof typeof CorrectionStatus];
