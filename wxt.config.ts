import { defineConfig } from "wxt";
import common from "./manifest.common.json";
import pkg from "./package.json";

function mergeManifests(base: any, override: any) {
    const out = JSON.parse(JSON.stringify(base));
    for (const k of Object.keys(override || {})) {
        const v = override[k];
        if (Array.isArray(v)) {
            out[k] = Array.from(new Set([...(out[k] || []), ...v]));
        } else if (typeof v === "object" && v !== null) {
            out[k] = Object.assign({}, out[k] || {}, v);
        } else {
            out[k] = v;
        }
    }
    return out;
}

export default defineConfig({
    manifestVersion: ({ browser }) => (browser === "firefox" ? 2 : 3),
    outDir: "dist",

    vite: () => {
        return {
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
                permissions: ["storage", "https://classroom.google.com/*"],
                browser_specific_settings: {
                    gecko: { id: "classroom-enhancer@narcissus-tazetta.github.io" },
                },
                version: pkg.version,
            });
        }
        return mergeManifests(common, {
            permissions: ["activeTab", "scripting", "storage"],
            host_permissions: ["https://classroom.google.com/*"],
            version: pkg.version,
        });
    },
});
