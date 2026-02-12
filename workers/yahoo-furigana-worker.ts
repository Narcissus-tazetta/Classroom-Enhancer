import { FuriganaRequestSchema, YahooFuriganaResponseSchema } from "../lib/schemas";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
} as const;

export default {
    async fetch(request: Request, env: { YAHOO_APP_ID: string; }, ctx: ExecutionContext): Promise<Response> {
        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        let q = "";

        if (request.method === "GET") {
            const url = new URL(request.url);
            const queryParam = url.searchParams.get("q");
            const parseResult = FuriganaRequestSchema.safeParse({ q: queryParam });
            if (!parseResult.success) {
                return new Response(JSON.stringify({ error: "Invalid query", details: parseResult.error.issues }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }
            q = parseResult.data.q;
        } else if (request.method === "POST") {
            let body: unknown = null;
            try {
                body = await request.json();
            } catch {
                return new Response("Invalid JSON", { status: 400, headers: corsHeaders });
            }
            const parseResult = FuriganaRequestSchema.safeParse(body);
            if (!parseResult.success) {
                return new Response(JSON.stringify({ error: "Invalid body", details: parseResult.error.issues }), {
                    status: 400,
                    headers: { ...corsHeaders, "Content-Type": "application/json" },
                });
            }
            q = parseResult.data.q;
        } else {
            return new Response("Method not allowed", { status: 405, headers: corsHeaders });
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

        const rawData = await yahooResponse.json();
        const parseResult = YahooFuriganaResponseSchema.safeParse(rawData);

        const words = parseResult.success ? (parseResult.data.result?.word ?? []) : [];
        if (!parseResult.success) {
            console.error("Yahoo API response validation failed:", parseResult.error);
        }
        const reading = words
            .map(word => {
                if (typeof word.furigana === "string" && word.furigana.length > 0) {
                    return word.furigana;
                }
                if (Array.isArray(word.subword) && word.subword.length > 0) {
                    return word.subword
                        .map(sub =>
                            typeof sub.furigana === "string" && sub.furigana.length > 0 ?
                                sub.furigana :
                                (sub.surface ?? "")
                        )
                        .join("");
                }
                return word.surface ?? "";
            })
            .join("");

        const response = new Response(JSON.stringify({ result: { word: words }, furigana: reading }), {
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
