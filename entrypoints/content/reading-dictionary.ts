import * as wanakana from "wanakana";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_PREFIX = "furigana:";
const memoryCache = new Map<string, { value: string; ts: number }>();

function isValidCacheEntry(entry: unknown): entry is { value: string; ts: number } {
    if (!entry || typeof entry !== "object") {
        return false;
    }
    const typed = entry as { value?: unknown; ts?: unknown };
    return typeof typed.value === "string" && typeof typed.ts === "number";
}

async function getStorageCache(key: string): Promise<{ value: string; ts: number } | null> {
    return new Promise((resolve) => {
        chrome.storage.local.get([key], (result) => {
            const entry = result[key];
            if (!isValidCacheEntry(entry)) {
                resolve(null);
                return;
            }
            resolve(entry);
        });
    });
}

async function setStorageCache(key: string, entry: { value: string; ts: number }): Promise<void> {
    return new Promise((resolve) => {
        chrome.storage.local.set({ [key]: entry }, () => resolve());
    });
}

function getMemoryCache(key: string): { value: string; ts: number } | null {
    const entry = memoryCache.get(key);
    if (!entry) {
        return null;
    }
    if (Date.now() - entry.ts > CACHE_TTL_MS) {
        memoryCache.delete(key);
        return null;
    }
    return entry;
}

function setMemoryCache(key: string, value: string): void {
    memoryCache.set(key, { value, ts: Date.now() });
}

async function requestFurigana(text: string): Promise<string | null> {
    const API_URL = "https://classroom-enhancer.ibaragiakira2007.workers.dev";

    try {
        const response = await fetch(`${API_URL}?q=${encodeURIComponent(text)}`);

        if (!response.ok) return null;

        const data = await response.json();

        if (data.result && data.result.word) {
            return data.result.word.map((w: any) => w.roman || w.surface).join("");
        }

        return null;
    } catch (error) {
        console.error("Furigana fetch failed:", error);
        return null;
    }
}
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
    let timeoutId: number | undefined;
    const timeoutPromise = new Promise<null>((resolve) => {
        timeoutId = window.setTimeout(() => resolve(null), timeoutMs);
    });
    const result = await Promise.race([promise, timeoutPromise]);
    if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
    }
    return result as T | null;
}

export async function getReadingWithFallback(text: string): Promise<string> {
    const normalized = text.normalize("NFKC").trim();

    const cacheKey = `${CACHE_PREFIX}${normalized}`;
    const memoryEntry = getMemoryCache(cacheKey);
    if (memoryEntry) {
        return memoryEntry.value;
    }

    const storedEntry = await getStorageCache(cacheKey);
    if (storedEntry && Date.now() - storedEntry.ts <= CACHE_TTL_MS) {
        setMemoryCache(cacheKey, storedEntry.value);
        return storedEntry.value;
    }

    const fallback = wanakana.toHiragana(normalized);
    const fetched = await withTimeout(requestFurigana(normalized), 2000);
    if (fetched) {
        setMemoryCache(cacheKey, fetched);
        await setStorageCache(cacheKey, { value: fetched, ts: Date.now() });
        return fetched;
    }

    return fallback;
}
