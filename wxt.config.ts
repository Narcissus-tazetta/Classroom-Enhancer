import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "wxt";
import common from "./manifest.common.json";
import pkg from "./package.json";

type ManifestObject = Record<string, unknown>;

function mergeManifests(base: ManifestObject, override: ManifestObject | null): ManifestObject {
    const out = JSON.parse(JSON.stringify(base)) as ManifestObject;
    for (const k of Object.keys(override || {})) {
        const v = override?.[k];
        if (Array.isArray(v)) {
            const baseArray = Array.isArray(out[k]) ? (out[k] as unknown[]) : [];
            out[k] = Array.from(new Set([...baseArray, ...v]));
        } else if (typeof v === "object" && v !== null) {
            const baseObj = typeof out[k] === "object" && out[k] !== null ? (out[k] as ManifestObject) : {};
            out[k] = Object.assign({}, baseObj, v as ManifestObject);
        } else {
            out[k] = v;
        }
    }
    return out;
}

export default defineConfig({
    manifestVersion: 3,
    outDir: "dist",

    vite: () => {
        return {
            plugins: [tailwindcss()],
            build: {
                modulePreload: false,
                minify: "esbuild",
                sourcemap: false,
                rollupOptions: {
                    output: {
                        assetFileNames: "assets/[name].[ext]",
                        chunkFileNames: "chunks/[name].js",
                        entryFileNames: "[name].js",
                    },
                },
            },
            cacheDir: ".vite-cache",
            define: {
                __DEV__: false,
            },
        };
    },

    manifest: ({ browser }) => {
        if (browser === "firefox") {
            return mergeManifests(common, {
                permissions: ["storage"],
                host_permissions: [
                    "https://classroom.google.com/*",
                    "https://classroom-enhancer.ibaragiakira2007.workers.dev/*",
                ],
                browser_specific_settings: {
                    gecko: { id: "classroom-hide-author@example.com" },
                },
                version: pkg.version,
            });
        }
        return mergeManifests(common, {
            permissions: ["activeTab", "scripting", "storage"],
            host_permissions: [
                "https://classroom.google.com/*",
                "https://classroom-enhancer.ibaragiakira2007.workers.dev/*",
            ],
            version: pkg.version,
        });
    },
});
