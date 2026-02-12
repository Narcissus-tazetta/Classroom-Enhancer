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
    console.log("[DEBUG-BG] fetchFurigana called for:", text);

    try {
        const postResponse = await fetchWithTimeout(
            WORKER_URL,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ q: text }),
            },
            TIMEOUT_MS,
        );

        console.log("[DEBUG-BG] POST Worker response status:", postResponse.status);
        const postWorkerVersion = postResponse.headers.get("X-Worker-Version");
        if (postWorkerVersion) {
            console.log("[DEBUG-BG] POST Worker X-Worker-Version:", postWorkerVersion);
        }

        if (postResponse.ok) {
            const rawData = await postResponse.json();
            console.log("[DEBUG-BG] POST Worker response data:", rawData);
            const parseResult = FuriganaResponseSchema.safeParse(rawData);
            if (parseResult.success) {
                console.log("[DEBUG-BG] Parsed furigana (POST):", parseResult.data.furigana);
                return parseResult.data.furigana || null;
            }
            console.error("[DEBUG-BG] Worker response validation failed (POST):", parseResult.error);
        } else {
            let textBody = "";
            try {
                textBody = await postResponse.text();
            } catch (e) {
                textBody = String(e);
            }
            console.warn("[DEBUG-BG] Worker POST not ok:", postResponse.status, postResponse.statusText, textBody);

            if (typeof textBody === "string" && /Missing query/i.test(textBody)) {
                console.warn(
                    "[DEBUG-BG] Worker POST returned 'Missing query'. This may indicate an outdated worker is deployed. Please redeploy the worker (e.g. `wrangler publish`).",
                );
            }
        }
        console.log("[DEBUG-BG] Trying GET fallback for:", text);
        const getResponse = await fetchWithTimeout(
            `${WORKER_URL}?q=${encodeURIComponent(text)}`,
            { method: "GET" },
            TIMEOUT_MS,
        );
        console.log("[DEBUG-BG] GET Worker response status:", getResponse.status);

        if (!getResponse.ok) {
            let getText = "";
            try {
                getText = await getResponse.text();
            } catch (e) {
                getText = String(e);
            }
            console.warn("[DEBUG-BG] Worker GET not ok:", getResponse.status, getResponse.statusText, getText);
            return null;
        }

        try {
            const rawData = await getResponse.json();
            console.log("[DEBUG-BG] GET Worker response data:", rawData);
            const parseResult = FuriganaResponseSchema.safeParse(rawData);
            if (parseResult.success) {
                console.log("[DEBUG-BG] Parsed furigana (GET):", parseResult.data.furigana);
                return parseResult.data.furigana || null;
            }

            // ここでフォールバック: Worker が Yahoo の生レスポンスを返している可能性があるため
            // rawData.result.word から読みを生成してみる
            try {
                console.warn("[DEBUG-BG] Worker response validation failed (GET):", parseResult.error);
                const yahooWords: any[] | undefined = rawData?.result?.word;
                console.log("[DEBUG-BG] Yahoo-style word count:", Array.isArray(yahooWords) ? yahooWords.length : 0);
                if (Array.isArray(yahooWords) && yahooWords.length > 0) {
                    // sample shape のログ（最大3つ）
                    console.log(
                        "[DEBUG-BG] Yahoo word sample:",
                        yahooWords.slice(0, 3).map((w) => (typeof w === "object" ? JSON.stringify(w) : String(w))),
                    );

                    const reading = (yahooWords || [])
                        .map((word: any) => {
                            // furigana が文字列
                            if (typeof word?.furigana === "string" && word.furigana.length > 0) {
                                return word.furigana;
                            }
                            // furigana が配列
                            if (Array.isArray(word?.furigana)) {
                                return word.furigana.map((x: any) => String(x ?? "")).join("");
                            }
                            // furigana がオブジェクト等
                            if (word && typeof word?.furigana === "object") {
                                try {
                                    const flat = JSON.stringify(word.furigana);
                                    return flat;
                                } catch {
                                    // fallthrough
                                }
                            }
                            // subword 対応
                            if (Array.isArray(word?.subword) && word.subword.length > 0) {
                                return word.subword
                                    .map((sub: any) => {
                                        if (typeof sub?.furigana === "string" && sub.furigana.length > 0)
                                            return sub.furigana;
                                        if (Array.isArray(sub?.furigana))
                                            return sub.furigana.map((x: any) => String(x ?? "")).join("");
                                        return sub.surface ?? "";
                                    })
                                    .join("");
                            }
                            return word?.surface ?? "";
                        })
                        .join("");

                    console.log("[DEBUG-BG] Best-effort extracted reading from Yahoo-style response:", reading);
                    if (reading && reading.length > 0) {
                        return reading;
                    }
                } else {
                    console.log("[DEBUG-BG] No yahooWords found in response.result.word");
                }
            } catch (ex) {
                console.warn("[DEBUG-BG] Best-effort extraction from Yahoo-style response failed:", ex);
            }

            return null;
        } catch (e) {
            console.error("[DEBUG-BG] Failed to parse GET response as JSON:", e);
            return null;
        }
    } catch (error) {
        console.error("[DEBUG-BG] fetchFurigana error:", error);
        return null;
    }
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

console.log("[DEBUG-BG] Background script loaded - setting up listener");

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    console.log("[DEBUG-BG] Message received:", message);

    const parseResult = FuriganaMessageRequestSchema.safeParse(message);
    if (!parseResult.success) {
        console.warn("[DEBUG-BG] Invalid message format:", parseResult.error);
        sendResponse({ furigana: "" });
        return true;
    }

    const text = parseResult.data.text.normalize("NFKC").trim();
    console.log("[DEBUG-BG] Normalized text:", text);

    if (!text) {
        console.log("[DEBUG-BG] Empty text, returning empty string");
        sendResponse({ furigana: "" });
        return true;
    }

    const cached = getCached(text);
    if (cached) {
        console.log("[DEBUG-BG] Cache HIT:", text, "=>", cached);
        sendResponse({ furigana: cached });
        return true;
    }

    console.log("[DEBUG-BG] Cache MISS, fetching:", text);

    let pending = inflight.get(text);
    if (!pending) {
        pending = fetchFurigana(text)
            .then((furigana) => {
                console.log("[DEBUG-BG] Fetch result:", text, "=>", furigana);
                if (furigana) {
                    setCached(text, furigana);
                }
                return furigana;
            })
            .catch((error) => {
                console.error("[DEBUG-BG] Fetch error:", error);
                return null;
            })
            .finally(() => inflight.delete(text));
        inflight.set(text, pending);
    }

    pending
        .then((furigana) => {
            console.log("[DEBUG-BG] Sending response:", furigana ?? "");
            sendResponse({ furigana: furigana ?? "" });
        })
        .catch((error) => {
            console.error("[DEBUG-BG] Response error:", error);
            sendResponse({ furigana: "" });
        });

    return true;
});

console.log("[DEBUG-BG] Listener registered successfully");

export default defineBackground(() => {
    console.log("[DEBUG-BG] defineBackground called");
});
