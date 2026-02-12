import { z } from "zod";

// Yahoo API関連のスキーマ
export const YahooSubwordSchema = z.object({
    surface: z.string().optional(),
    furigana: z.string().optional(),
});

export const YahooWordSchema = z.object({
    surface: z.string().optional(),
    furigana: z.string().optional(),
    roman: z.string().optional(),
    subword: z.array(YahooSubwordSchema).optional(),
});

export const YahooFuriganaResponseSchema = z.object({
    result: z.object({
        word: z.array(YahooWordSchema).optional(),
    }).optional(),
});

// Workers API リクエスト/レスポンス
export const FuriganaRequestSchema = z.object({
    q: z.string().min(1).max(1000),
});

export const FuriganaResponseSchema = z.object({
    result: z.object({
        word: z.array(YahooWordSchema),
    }).optional(),
    furigana: z.string(),
});

// Chrome Extension Messages
export const FuriganaMessageRequestSchema = z.object({
    type: z.literal("furigana"),
    text: z.string(),
});

export const FuriganaMessageResponseSchema = z.object({
    furigana: z.string(),
});

// Cache Entry
export const CacheEntrySchema = z.object({
    value: z.string(),
    ts: z.number(),
});

// Dropdown Usage Tracking
export const DropdownUsageSchema = z.record(z.string(), z.number());

// 型推論
export type YahooSubword = z.infer<typeof YahooSubwordSchema>;
export type YahooWord = z.infer<typeof YahooWordSchema>;
export type YahooFuriganaResponse = z.infer<typeof YahooFuriganaResponseSchema>;
export type FuriganaRequest = z.infer<typeof FuriganaRequestSchema>;
export type FuriganaResponse = z.infer<typeof FuriganaResponseSchema>;
export type FuriganaMessageRequest = z.infer<typeof FuriganaMessageRequestSchema>;
export type FuriganaMessageResponse = z.infer<typeof FuriganaMessageResponseSchema>;
export type CacheEntry = z.infer<typeof CacheEntrySchema>;
export type DropdownUsage = z.infer<typeof DropdownUsageSchema>;
