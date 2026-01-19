import { describe, it, expect } from "vitest";
import { normalizePartNumber, parsePriceToCents, centsToNumber } from "./normalizer.js";

describe("normalizer", () => {
    describe("normalizePartNumber", () => {
        it("should remove common delimiters", () => {
            expect(normalizePartNumber("AB-123")).toBe("AB123");
            expect(normalizePartNumber("AB_123")).toBe("AB123");
            expect(normalizePartNumber("AB.123")).toBe("AB123");
        });

        it("should convert to uppercase", () => {
            expect(normalizePartNumber("ab123")).toBe("AB123");
        });

        it("should trim whitespace", () => {
            expect(normalizePartNumber("  AB123  ")).toBe("AB123");
        });

        it("should handle empty or null values", () => {
            expect(normalizePartNumber("")).toBe("");
            // @ts-ignore
            expect(normalizePartNumber(null)).toBe("");
        });
    });

    describe("parsePriceToCents", () => {
        it("should parse standard decimal string", () => {
            expect(parsePriceToCents("10.50")).toBe(1050);
            expect(parsePriceToCents("100")).toBe(10000);
        });

        it("should handle comma as decimal separator", () => {
            expect(parsePriceToCents("10,50")).toBe(1050);
        });

        it("should ignore currency symbols and thousands separators", () => {
            expect(parsePriceToCents("$10,50")).toBe(1050);
            expect(parsePriceToCents("R$ 1.200,50")).toBe(120050);
        });

        it("should return null for invalid price", () => {
            expect(parsePriceToCents("not a price")).toBeNull();
            expect(parsePriceToCents("")).toBeNull();
        });
    });

    describe("centsToNumber", () => {
        it("should convert cents back to float", () => {
            expect(centsToNumber(1050)).toBe(10.5);
            expect(centsToNumber(100)).toBe(1);
        });

        it("should handle zero", () => {
            expect(centsToNumber(0)).toBe(0);
        });
    });
});
