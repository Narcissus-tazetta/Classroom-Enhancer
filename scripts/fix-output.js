const fs = require("fs");
const path = require("path");

const root = process.env.FIX_OUTPUT_ROOT ? path.resolve(process.env.FIX_OUTPUT_ROOT) : path.resolve(__dirname, "..");
const distDir = path.join(root, "dist");

// Load package.json version to ensure built manifests reflect project version
let projectVersion = null;
try {
    const pkgPath = path.join(root, "package.json");
    if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        projectVersion = pkg.version || null;
    }
} catch (e) {
    // ignore
}

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
        // Check if Firefox-specific settings are present
        if (manifest.browser_specific_settings && manifest.browser_specific_settings.gecko) {
            return "firefox";
        }
        // Check manifest_version
        if (manifest.manifest_version === 2) {
            return "firefox";
        }
        if (manifest.manifest_version === 3) {
            return "chrome";
        }
        // Check for background.service_worker (MV3)
        if (manifest.background && manifest.background.service_worker) {
            return "chrome";
        }
        // Check for browser_action (MV2)
        if (manifest.browser_action && !manifest.action) {
            return "firefox";
        }
        // Check for action (MV3)
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

function reorganizeDist() {
    try {
        const folders = getBuiltFolders();
        console.log("Found folders:", folders);

        const renames = {};

        // First, identify all folders
        for (const folder of folders) {
            const fullPath = path.join(distDir, folder);
            const manifest = inspectManifestDir(fullPath);
            let browser = identifyBrowser(folder, manifest);

            // If we have conflicting identifications, use folder name as fallback
            if (!browser) {
                if (folder.includes("chrome")) browser = "chrome";
                else if (folder.includes("firefox")) browser = "firefox";
            }

            // For ambiguous cases, use order: first "chrome*" -> chrome, next -> firefox
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

            if (!renames[browser]) {
                renames[browser] = folder;
            }
        }

        console.log("Determined renames:", renames);

        // Apply renames
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

        // Remove any extra folders
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

// Ensure manifest_version present and patch Firefox gecko id if missing
function patchManifests() {
    for (const b of ["chrome", "firefox"]) {
        const mPath = path.join(distDir, b, "manifest.json");
        if (!fs.existsSync(mPath)) continue;
        try {
            const raw = fs.readFileSync(mPath, "utf8");
            const manifest = JSON.parse(raw);

            // Normalize and deduplicate content_scripts entries if present
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
                    // Prefer wxt-generated path if present
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
                manifest.browser_specific_settings.gecko.id = "classroom-enhancer@narcissus-tazetta.github.io";
                console.log(`Patched browser_specific_settings.gecko.id in ${mPath}`);
            }

            // For Manifest V2 (Firefox), move host_permissions into permissions to avoid unsupported property warnings
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

            // Ensure manifest version matches package.json
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
    // Recreate dist/*.zip so their contents are stored at the zip root (manifest.json at root)
    try {
        const browsers = ["chrome", "firefox"];
        for (const b of browsers) {
            const zipPath = path.join(distDir, `${b}.zip`);
            const dirPath = path.join(distDir, b);
            if (!fs.existsSync(dirPath)) continue;

            // Remove any old zip first to avoid accidental appending
            if (fs.existsSync(zipPath)) fs.rmSync(zipPath);

            // Create a new zip from contents of the directory (use '*' so entries are at root)
            const tmpZip = `${zipPath}.tmp`;
            if (fs.existsSync(tmpZip)) fs.rmSync(tmpZip);

            // If zip is available, use it; otherwise warn
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
