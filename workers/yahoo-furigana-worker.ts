export default {
    async fetch(request: Request, env: { YAHOO_APP_ID: string }, ctx: ExecutionContext): Promise<Response> {
        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        };

        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        if (request.method !== "POST") {
            return new Response("Method not allowed", { status: 405, headers: corsHeaders });
        }

        let body: { q?: unknown } | null = null;
        try {
            body = (await request.json()) as { q?: unknown };
        } catch {
            return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
        }

        const q = typeof body?.q === "string" ? body.q.trim() : "";
        if (!q) {
            return new Response("Missing query", { status: 400, headers: corsHeaders });
        }

        const url = new URL(request.url);
        const cacheKey = new Request(`${url.origin}${url.pathname}?q=${encodeURIComponent(q)}`);
        const cache = caches.default;
        const cached = await cache.match(cacheKey);
        if (cached) {
            return cached;
        }

        const yahooResponse = await fetch("https://jlp.yahooapis.jp/FuriganaService/V2/furigana", {
            method: "POST",
            headers: {
                "User-Agent": `Yahoo AppID: ${env.YAHOO_APP_ID}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                id: "1",
                jsonrpc: "2.0",
                method: "jlp.furiganaservice.furigana",
                params: {
                    q,
                    grade: 1,
                },
            }),
        });

        if (!yahooResponse.ok) {
            return new Response(`Yahoo API Error: ${yahooResponse.status}`, { status: 502, headers: corsHeaders });
        }

        const data = (await yahooResponse.json()) as {
            result?: {
                word?: Array<{
                    surface?: string;
                    furigana?: string;
                    subword?: Array<{ surface?: string; furigana?: string }>;
                }>;
            };
        };

        const words = data.result?.word ?? [];
        const reading = words
            .map((word) => {
                if (typeof word.furigana === "string" && word.furigana.length > 0) {
                    return word.furigana;
                }
                if (Array.isArray(word.subword) && word.subword.length > 0) {
                    return word.subword
                        .map((sub) =>
                            typeof sub.furigana === "string" && sub.furigana.length > 0
                                ? sub.furigana
                                : (sub.surface ?? ""),
                        )
                        .join("");
                }
                return word.surface ?? "";
            })
            .join("");

        const response = new Response(JSON.stringify({ furigana: reading }), {
            headers: {
                ...corsHeaders,
                "Content-Type": "application/json",
                "Cache-Control": "s-maxage=604800",
            },
        });

        ctx.waitUntil(cache.put(cacheKey, response.clone()));
        return response;
    },
};
