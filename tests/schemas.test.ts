import { describe, expect, it } from "bun:test";
import {
    CacheEntrySchema,
    DropdownUsageSchema,
    FuriganaMessageRequestSchema,
    FuriganaRequestSchema,
    FuriganaResponseSchema,
    YahooFuriganaResponseSchema,
} from "../lib/schemas";

describe("Schema Validation Tests", () => {
    describe("CacheEntrySchema", () => {
        it("should validate valid cache entry", () => {
            const valid = { value: "test", ts: Date.now() };
            const result = CacheEntrySchema.safeParse(valid);
            expect(result.success).toBe(true);
        });

        it("should reject invalid cache entry", () => {
            const invalid = { value: 123, ts: "not-a-number" };
            const result = CacheEntrySchema.safeParse(invalid);
            expect(result.success).toBe(false);
        });

        it("should reject missing fields", () => {
            const result = CacheEntrySchema.safeParse({ value: "test" });
            expect(result.success).toBe(false);
        });
    });

    describe("DropdownUsageSchema", () => {
        it("should validate valid usage data", () => {
            const valid = { item1: 5, item2: 10 };
            const result = DropdownUsageSchema.safeParse(valid);
            expect(result.success).toBe(true);
        });

        it("should validate empty object", () => {
            const result = DropdownUsageSchema.safeParse({});
            expect(result.success).toBe(true);
        });

        it("should reject non-number values", () => {
            const invalid = { item1: "not-a-number" };
            const result = DropdownUsageSchema.safeParse(invalid);
            expect(result.success).toBe(false);
        });
    });

    describe("FuriganaRequestSchema", () => {
        it("should validate valid request", () => {
            const valid = { q: "テスト" };
            const result = FuriganaRequestSchema.safeParse(valid);
            expect(result.success).toBe(true);
        });

        it("should reject empty query", () => {
            const result = FuriganaRequestSchema.safeParse({ q: "" });
            expect(result.success).toBe(false);
        });

        it("should reject too long query", () => {
            const longString = "a".repeat(1001);
            const result = FuriganaRequestSchema.safeParse({ q: longString });
            expect(result.success).toBe(false);
        });

        it("should reject missing query", () => {
            const result = FuriganaRequestSchema.safeParse({});
            expect(result.success).toBe(false);
        });
    });

    describe("FuriganaMessageRequestSchema", () => {
        it("should validate valid message", () => {
            const valid = { type: "furigana", text: "テスト" };
            const result = FuriganaMessageRequestSchema.safeParse(valid);
            expect(result.success).toBe(true);
        });

        it("should reject wrong type", () => {
            const invalid = { type: "other", text: "テスト" };
            const result = FuriganaMessageRequestSchema.safeParse(invalid);
            expect(result.success).toBe(false);
        });

        it("should reject missing text", () => {
            const result = FuriganaMessageRequestSchema.safeParse({ type: "furigana" });
            expect(result.success).toBe(false);
        });
    });

    describe("YahooFuriganaResponseSchema", () => {
        it("should validate valid Yahoo API response", () => {
            const valid = {
                result: {
                    word: [
                        { surface: "漢字", furigana: "かんじ", roman: "kanji" },
                        { surface: "です", furigana: "です" },
                    ],
                },
            };
            const result = YahooFuriganaResponseSchema.safeParse(valid);
            expect(result.success).toBe(true);
        });

        it("should validate response with subwords", () => {
            const valid = {
                result: {
                    word: [
                        {
                            surface: "東京",
                            subword: [
                                { surface: "東", furigana: "とう" },
                                { surface: "京", furigana: "きょう" },
                            ],
                        },
                    ],
                },
            };
            const result = YahooFuriganaResponseSchema.safeParse(valid);
            expect(result.success).toBe(true);
        });

        it("should validate empty result", () => {
            const result = YahooFuriganaResponseSchema.safeParse({});
            expect(result.success).toBe(true);
        });
    });

    describe("FuriganaResponseSchema", () => {
        it("should validate valid response", () => {
            const valid = {
                result: { word: [] },
                furigana: "てすと",
            };
            const result = FuriganaResponseSchema.safeParse(valid);
            expect(result.success).toBe(true);
        });

        it("should require furigana field", () => {
            const invalid = { result: { word: [] } };
            const result = FuriganaResponseSchema.safeParse(invalid);
            expect(result.success).toBe(false);
        });

        it("should accept empty furigana", () => {
            const valid = {
                result: { word: [] },
                furigana: "",
            };
            const result = FuriganaResponseSchema.safeParse(valid);
            expect(result.success).toBe(true);
        });
    });
});
