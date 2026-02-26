const fs = require("fs");
const path = require("path");

const root = process.env.FIX_OUTPUT_ROOT ? path.resolve(process.env.FIX_OUTPUT_ROOT) : path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");

let projectVersion = null;
try {
    const pkgPath = path.join(root, "package.json");
    if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        projectVersion = pkg.version || null;
    }
} catch {}

function inspectManifestDir(dirPath) {
    const manifestPath = path.join(dirPath, "manifest.json");
    if (!fs.existsSync(manifestPath)) return null;
    try {
        const raw = fs.readFileSync(manifestPath, "utf8");
        const manifest = JSON.parse(raw);
        return manifest;
    } catch {
        return null;
    }
}

function getBuiltFolders() {
    if (!fs.existsSync(distDir)) {
        throw new Error("dist directory not found");
    }

    const dirs = fs.readdirSync(distDir).filter((d) => {
        const fullPath = path.join(distDir, d);
        return fs.lstatSync(fullPath).isDirectory();
    });

    return dirs;
}

function identifyBrowser(folderName, manifest) {
    if (manifest) {
        if (manifest.browser_specific_settings && manifest.browser_specific_settings.gecko) {
            return "firefox";
        }
        if (manifest.manifest_version === 2) {
            return "firefox";
        }
        if (manifest.manifest_version === 3) {
            return "chrome";
        }
        if (manifest.background && manifest.background.service_worker) {
            return "chrome";
        }
        if (manifest.browser_action && !manifest.action) {
            return "firefox";
        }
        if (manifest.action && !manifest.browser_action) {
            return "chrome";
        }
    }

    if (folderName.includes("firefox")) return "firefox";
    if (folderName.includes("chrome")) return "chrome";
    if (folderName.includes("mv2")) return "firefox";
    if (folderName.includes("mv3")) return "chrome";

    return null;
}

function scoreCandidate(folderName, manifest, browser) {
    let score = 0;
    if (manifest) {
        score += 20;
        if (manifest.manifest_version === 3 && browser === "chrome") {
            score += 10;
        }
        if (manifest.manifest_version === 2 && browser === "firefox") {
            score += 10;
        }
        if (manifest.action && browser === "chrome") {
            score += 5;
        }
    }

    if (folderName === `${browser}-mv3` || folderName === `${browser}-mv2`) {
        score += 100;
    }
    if (folderName.includes("-mv")) {
        score += 80;
    }
    if (folderName === browser) {
        score += 40;
    }

    return score;
}

function reorganizeDist() {
    try {
        const folders = getBuiltFolders();
        console.log("Found folders:", folders);

        const candidates = { chrome: [], firefox: [] };

        for (const folder of folders) {
            const fullPath = path.join(distDir, folder);
            const manifest = inspectManifestDir(fullPath);
            let browser = identifyBrowser(folder, manifest);

            if (!browser) {
                if (folder.includes("chrome")) browser = "chrome";
                else if (folder.includes("firefox")) browser = "firefox";
            }

            if (browser === "firefox" && folder.includes("chrome") && !renames.chrome) {
                browser = "chrome";
            }
            if (!browser) {
                if (!renames.chrome) {
                    browser = "chrome";
                } else {
                    browser = "firefox";
                }
            }

            candidates[browser].push({
                folder,
                score: scoreCandidate(folder, manifest, browser),
            });
        }

        const renames = {};
        for (const browser of ["chrome", "firefox"]) {
            const sorted = candidates[browser].sort((a, b) => b.score - a.score);
            if (sorted.length > 0) {
                renames[browser] = sorted[0].folder;
            }
        }

        console.log("Determined renames:", renames);

        for (const [targetName, sourceFolder] of Object.entries(renames)) {
            const sourceFullPath = path.join(distDir, sourceFolder);
            const targetFullPath = path.join(distDir, targetName);

            if (sourceFolder !== targetName) {
                if (fs.existsSync(targetFullPath)) {
                    fs.rmSync(targetFullPath, { recursive: true });
                }
                fs.renameSync(sourceFullPath, targetFullPath);
                console.log(`Renamed ${sourceFolder} -> ${targetName}`);
            }
        }

        const finalFolders = fs.readdirSync(distDir).filter((d) => {
            const fullPath = path.join(distDir, d);
            return fs.lstatSync(fullPath).isDirectory();
        });

        for (const folder of finalFolders) {
            if (folder !== "chrome" && folder !== "firefox") {
                const fullPath = path.join(distDir, folder);
                fs.rmSync(fullPath, { recursive: true });
                console.log(`Removed extra folder: ${folder}`);
            }
        }

        console.log("Successfully reorganized dist folder");
    } catch (e) {
        console.error("Failed to reorganize:", e.message || e);
        process.exit(1);
    }
}

function patchManifests() {
    for (const b of ["chrome", "firefox"]) {
        const mPath = path.join(distDir, b, "manifest.json");
        if (!fs.existsSync(mPath)) continue;
        try {
            const raw = fs.readFileSync(mPath, "utf8");
            const manifest = JSON.parse(raw);

            if (manifest.content_scripts && Array.isArray(manifest.content_scripts)) {
                const groups = new Map();
                for (const entry of manifest.content_scripts) {
                    const key = JSON.stringify(entry.matches || []);
                    const existing = groups.get(key) || { matches: entry.matches || [], run_at: null, js: new Set() };
                    if (entry.run_at) existing.run_at = existing.run_at || entry.run_at;
                    for (const j of entry.js || []) {
                        existing.js.add(j);
                    }
                    groups.set(key, existing);
                }

                const normalized = [];
                for (const g of groups.values()) {
                    if (g.js.has("content-scripts/content.js")) {
                        g.js.delete("content.js");
                        g.js.add("content-scripts/content.js");
                    }
                    normalized.push({ matches: g.matches, run_at: g.run_at, js: Array.from(g.js) });
                }

                manifest.content_scripts = normalized;
            }

            if (manifest.manifest_version == null) {
                manifest.manifest_version = b === "chrome" ? 3 : 2;
                console.log(`Patched manifest_version=${manifest.manifest_version} in ${mPath}`);
            }

            if (
                b === "firefox" &&
                (!manifest.browser_specific_settings ||
                    !manifest.browser_specific_settings.gecko ||
                    !manifest.browser_specific_settings.gecko.id)
            ) {
                manifest.browser_specific_settings = manifest.browser_specific_settings || {};
                manifest.browser_specific_settings.gecko = manifest.browser_specific_settings.gecko || {};
                manifest.browser_specific_settings.gecko.id = "classroom-hide-author@example.com";
                console.log(`Patched browser_specific_settings.gecko.id in ${mPath}`);
            }

            if (
                manifest.manifest_version === 2 &&
                Array.isArray(manifest.host_permissions) &&
                manifest.host_permissions.length > 0
            ) {
                manifest.permissions = Array.isArray(manifest.permissions) ? manifest.permissions : [];
                for (const hp of manifest.host_permissions) {
                    if (!manifest.permissions.includes(hp)) manifest.permissions.push(hp);
                }
                delete manifest.host_permissions;
                console.log(`Moved host_permissions -> permissions in ${mPath} for MV2 compatibility`);
            }

            if (projectVersion) {
                manifest.version = projectVersion;
                console.log(`Patched manifest.version=${projectVersion} in ${mPath}`);
            }

            fs.writeFileSync(mPath, JSON.stringify(manifest, null, 4), "utf8");
        } catch (e) {
            console.warn("Failed to patch manifest:", mPath, e.message || e);
        }
    }
}

function repackZips() {
    try {
        const browsers = ["chrome", "firefox"];
        for (const b of browsers) {
            const zipPath = path.join(distDir, `${b}.zip`);
            const dirPath = path.join(distDir, b);
            if (!fs.existsSync(dirPath)) continue;
            if (fs.existsSync(zipPath)) fs.rmSync(zipPath);

            const tmpZip = `${zipPath}.tmp`;
            if (fs.existsSync(tmpZip)) fs.rmSync(tmpZip);

            try {
                const cmd = `cd ${dirPath} && zip -r ${tmpZip} * -x "__MACOSX/*"`;
                require("child_process").execSync(cmd, { stdio: "inherit" });
                fs.renameSync(tmpZip, zipPath);
                console.log(`Created ${zipPath} with manifest at root`);
            } catch (e) {
                console.warn(`zip command failed for ${b}:`, e.message || e);
            }
        }
    } catch (e) {
        console.warn("Failed to repack zips:", e.message || e);
    }
}

if (require.main === module) {
    reorganizeDist();
    patchManifests();
    repackZips();
}

module.exports = { reorganizeDist, patchManifests, repackZips, identifyBrowser, inspectManifestDir };
