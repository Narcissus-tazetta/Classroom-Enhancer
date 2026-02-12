const fs = require("fs");
const path = require("path");
const os = require("os");
const assert = require("assert");

function writeJSON(p, obj) {
    fs.writeFileSync(p, JSON.stringify(obj, null, 4), "utf8");
}

try {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fix-output-test-"));
    const root = tmp;
    const dist = path.join(root, "dist");
    fs.mkdirSync(dist);

    const chromeSrc = path.join(dist, 'chrome-mv({ browser }) => browser === "firefox" ? 2 : 3');
    const firefoxSrc = path.join(dist, 'firefox-mv({ browser }) => browser === "firefox" ? 2 : 3');
    fs.mkdirSync(chromeSrc, { recursive: true });
    fs.mkdirSync(firefoxSrc, { recursive: true });

    const matches = ["https://classroom.google.com/*"];

    const chromeManifest = {
        content_scripts: [
            { matches, js: ["content.js"], run_at: "document_end" },
            { matches, js: ["content-scripts/content.js"] },
        ],
        permissions: ["activeTab"],
    };

    const firefoxManifest = {
        content_scripts: [
            { matches, js: ["content.js"], run_at: "document_end" },
            { matches, js: ["content-scripts/content.js"] },
        ],
        permissions: ["storage"],
    };

    writeJSON(path.join(chromeSrc, "manifest.json"), chromeManifest);
    writeJSON(path.join(firefoxSrc, "manifest.json"), firefoxManifest);

    process.env.FIX_OUTPUT_ROOT = root;

    const fix = require("./fix-output");

    fix.reorganizeDist();
    fix.patchManifests();
    const chromeFinal = JSON.parse(fs.readFileSync(path.join(root, "dist", "chrome", "manifest.json"), "utf8"));
    assert.strictEqual(chromeFinal.manifest_version, 3, "Chrome manifest_version should be 3");
    assert.ok(Array.isArray(chromeFinal.content_scripts), "chrome.content_scripts should be array");
    const chromeEntry = chromeFinal.content_scripts.find((e) => JSON.stringify(e.matches) === JSON.stringify(matches));
    assert.ok(chromeEntry, "chrome content_scripts entry exists");
    assert.ok(chromeEntry.js.includes("content-scripts/content.js"), "chrome should prefer content-scripts/content.js");
    assert.ok(
        !chromeEntry.js.includes("content.js") || chromeEntry.js.length === 1,
        "no duplicate content.js when content-scripts exists",
    );

    const firefoxFinal = JSON.parse(fs.readFileSync(path.join(root, "dist", "firefox", "manifest.json"), "utf8"));
    assert.strictEqual(firefoxFinal.manifest_version, 2, "Firefox manifest_version should be 2");
    assert.ok(
        firefoxFinal.browser_specific_settings &&
            firefoxFinal.browser_specific_settings.gecko &&
            firefoxFinal.browser_specific_settings.gecko.id,
        "Firefox should have gecko id",
    );

    console.log("OK");
    process.exit(0);
} catch (e) {
    console.error("TEST FAILED:", (e && e.message) || e);
    process.exit(1);
}
