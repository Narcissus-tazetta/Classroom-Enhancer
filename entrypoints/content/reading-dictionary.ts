import * as wanakana from "wanakana";
import { CacheEntry, CacheEntrySchema, FuriganaResponseSchema } from "../../lib/schemas";

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_PREFIX = "furigana:";
const memoryCache = new Map<string, CacheEntry>();

async function getStorageCache(key: string): Promise<CacheEntry | null> {
    return new Promise(resolve => {
        chrome.storage.local.get([key], result => {
            const entry = result[key];
            const parseResult = CacheEntrySchema.safeParse(entry);
            if (!parseResult.success) {
                console.warn("Invalid storage cache entry:", key);
                resolve(null);
                return;
            }
            resolve(parseResult.data);
        });
    });
}

async function setStorageCache(key: string, entry: CacheEntry): Promise<void> {
    return new Promise(resolve => {
        chrome.storage.local.set({ [key]: entry }, () => resolve());
    });
}

function getMemoryCache(key: string): CacheEntry | null {
    const entry = memoryCache.get(key);
    if (!entry) {
        return null;
    }

    const parseResult = CacheEntrySchema.safeParse(entry);
    if (!parseResult.success) {
        memoryCache.delete(key);
        return null;
    }

    if (Date.now() - parseResult.data.ts > CACHE_TTL_MS) {
        memoryCache.delete(key);
        return null;
    }
    return parseResult.data;
}

function setMemoryCache(key: string, value: string): void {
    memoryCache.set(key, { value, ts: Date.now() });
}

async function requestFurigana(text: string): Promise<string | null> {
    const API_URL = "https://classroom-enhancer.ibaragiakira2007.workers.dev";

    try {
        const response = await fetch(`${API_URL}?q=${encodeURIComponent(text)}`);

        if (!response.ok) {
            return null;
        }

        const rawData = await response.json();
        const parseResult = FuriganaResponseSchema.safeParse(rawData);

        if (!parseResult.success) {
            console.error("API response validation failed:", parseResult.error);
            return null;
        }

        if (parseResult.data.result?.word) {
            return parseResult.data.result.word.map(w => w.roman ?? w.surface ?? "").join("");
        }

        return null;
    } catch (error) {
        console.error("Furigana fetch failed:", error);
        return null;
    }
}
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
    let timeoutId: number | undefined;
    const timeoutPromise = new Promise<null>(resolve => {
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
