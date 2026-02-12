import { defineBackground } from "wxt/utils/define-background";
import { CacheEntry, CacheEntrySchema, FuriganaMessageRequestSchema, FuriganaResponseSchema } from "../../lib/schemas";

const WORKER_URL = "https://classroom-enhancer.ibaragiakira2007.workers.dev/furigana";
const TIMEOUT_MS = 5000;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<string | null>>();

async function fetchWithTimeout(input: RequestInfo, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(input, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timeoutId);
    }
}

async function fetchFurigana(text: string): Promise<string | null> {
    const response = await fetchWithTimeout(
        WORKER_URL,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ q: text }),
        },
        TIMEOUT_MS,
    );

    if (!response.ok) {
        return null;
    }

    const rawData = await response.json();
    const parseResult = FuriganaResponseSchema.safeParse(rawData);

    if (!parseResult.success) {
        console.error("Worker response validation failed:", parseResult.error);
        return null;
    }

    return parseResult.data.furigana || null;
}

function getCached(text: string): string | null {
    const entry = cache.get(text);
    if (!entry) {
        return null;
    }

    const parseResult = CacheEntrySchema.safeParse(entry);
    if (!parseResult.success) {
        console.warn("Invalid cache entry, removing:", text);
        cache.delete(text);
        return null;
    }

    if (Date.now() - parseResult.data.ts > CACHE_TTL_MS) {
        cache.delete(text);
        return null;
    }
    return parseResult.data.value;
}

function setCached(text: string, value: string): void {
    cache.set(text, { value, ts: Date.now() });
}

export default defineBackground(() => {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        const parseResult = FuriganaMessageRequestSchema.safeParse(message);
        if (!parseResult.success) {
            console.warn("Invalid message format:", parseResult.error);
            return;
        }

        const text = parseResult.data.text.normalize("NFKC").trim();
        if (!text) {
            sendResponse({ furigana: "" });
            return;
        }

        const cached = getCached(text);
        if (cached) {
            sendResponse({ furigana: cached });
            return;
        }

        let pending = inflight.get(text);
        if (!pending) {
            pending = fetchFurigana(text)
                .then(furigana => {
                    if (furigana) {
                        setCached(text, furigana);
                    }
                    return furigana;
                })
                .finally(() => inflight.delete(text));
            inflight.set(text, pending);
        }

        pending
            .then(furigana => sendResponse({ furigana: furigana ?? "" }))
            .catch(() => sendResponse({ furigana: "" }));

        return true;
    });
});
