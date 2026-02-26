import { CleanupPatternFlags, DEFAULT_CLEANUP_PATTERN_FLAGS } from "../shared/settings";
import { CLASSROOM_PATTERNS, TARGET_SELECTORS } from "./constants";

const CLEANUP_PATTERNS = [
    { key: "removeYearPrefix", regex: /20\d{2}(?:年(?:度)?|年度?)[_＿\s]*/g, replacement: "" },
    { key: "removeLeadingYear", regex: /^20\d{2}[_＿\s]+/g, replacement: "" },
    { key: "removeWorksheetConnector", regex: /ワークシートと/g, replacement: "" },
    { key: "removeWorksheet", regex: /ワークシート/g, replacement: "" },
    { key: "removeSheetSuffix", regex: /シート$/g, replacement: "" },
    { key: "removeGroupWS", regex: /グループWS/g, replacement: "" },
    { key: "removeWS", regex: /\bWS\b/g, replacement: "" },
    { key: "removeMaterial", regex: /資料[＆&]?/g, replacement: "" },
    { key: "removeHandout", regex: /配布資料/g, replacement: "" },
    { key: "removeGuide", regex: /解説資料/g, replacement: "" },
    { key: "removeLessonMaterial", regex: /授業用資料/g, replacement: "" },
    { key: "removeOther", regex: /その他/g, replacement: "" },
    { key: "removeArchive", regex: /アーカイブ/g, replacement: "" },
    { key: "removeUnderscoreBeforeBracket", regex: /[_＿]+(?=（)/g, replacement: "" },
] as const;

const EMPTY_BRACKETS_PATTERNS = [/\(\s*\)/g, /（\s*）/g, /【\s*】/g, /\[\s*\]/g] as const;

export class ClassroomTextProcessor {
    private static globallyEnabled = true;
    private static cleanupPatternFlags: CleanupPatternFlags = { ...DEFAULT_CLEANUP_PATTERN_FLAGS };
    private observer: MutationObserver | null = null;
    private pendingElements = new Set<HTMLElement>();
    private originalTextByNode = new WeakMap<Text, string>();
    private transformedTextNodes = new Set<Text>();
    private rafId: number | null = null;
    private recheckIntervalId: number | null = null;
    private recheckStopTimeoutId: number | null = null;

    constructor() {
        this.init();
    }

    public static setGlobalEnabled(enabled: boolean): void {
        ClassroomTextProcessor.globallyEnabled = enabled;
    }

    public static setPatternFlags(flags: CleanupPatternFlags): void {
        ClassroomTextProcessor.cleanupPatternFlags = { ...flags };
    }

    private init(): void {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => this.start());
        } else {
            this.start();
        }
    }

    private start(): void {
        if (!ClassroomTextProcessor.globallyEnabled) {
            return;
        }
        this.processAll();
        const delays = [500, 1500, 3000];
        delays.forEach(delay =>
            setTimeout(() => {
                if (ClassroomTextProcessor.globallyEnabled) {
                    this.processAll();
                }
            }, delay)
        );
        this.startRecheckLoop();
        this.startObserver();
    }

    private startRecheckLoop(): void {
        if (this.recheckIntervalId != null) {
            return;
        }

        this.recheckIntervalId = window.setInterval(() => {
            if (!ClassroomTextProcessor.globallyEnabled) {
                return;
            }
            this.processAll();
        }, 1000);

        this.recheckStopTimeoutId = window.setTimeout(() => {
            if (this.recheckIntervalId != null) {
                window.clearInterval(this.recheckIntervalId);
                this.recheckIntervalId = null;
            }
            this.recheckStopTimeoutId = null;
        }, 20000);
    }

    private isInteractiveOrIconElement(element: HTMLElement): boolean {
        return !!(
            element.closest(
                '[role="menu"], [role="menuitem"], [role="listbox"], [role="option"], button, [role="button"], input, textarea, select',
            ) || element.matches?.('.material-icons, [class*="material-icons"]')
        );
    }

    private extractAndCleanupText(rawText: string): string {
        let text = rawText;

        if (text.includes("さんが")) {
            for (const pattern of CLASSROOM_PATTERNS) {
                const match = text.match(pattern);
                if (match) {
                    const extracted = match[3] || match[4] || match[2];
                    if (extracted) {
                        text = extracted.trim();
                    }
                    break;
                }
            }

            if (text.includes("さんが")) {
                const sangaIndex = text.indexOf("さんが");
                if (sangaIndex !== -1) {
                    const parts = text.split(/[:：]/);
                    if (parts.length > 1) {
                        text = parts[parts.length - 1].trim();
                    } else {
                        const afterSanga = text
                            .substring(sangaIndex + 3)
                            .replace(/.*投稿しました\.?/, "")
                            .trim();
                        if (afterSanga.length > 0) {
                            text = afterSanga;
                        }
                    }
                }
            }
        }

        return this.cleanupText(text);
    }

    private startObserver(): void {
        this.observer = new MutationObserver(mutationsList => {
            if (!ClassroomTextProcessor.globallyEnabled) {
                return;
            }
            let hasChanges = false;

            for (const mutation of mutationsList) {
                if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach(node => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const element = node as HTMLElement;

                            this.pendingElements.add(element);

                            const children = element.querySelectorAll(TARGET_SELECTORS.join(","));
                            children.forEach(child => this.pendingElements.add(child as HTMLElement));

                            hasChanges = true;
                        }
                    });
                } else if (mutation.type === "characterData") {
                    const target = mutation.target.parentElement;
                    if (target) {
                        this.pendingElements.add(target as HTMLElement);
                        hasChanges = true;
                    }
                }
            }

            if (hasChanges) {
                this.scheduleBatchProcess();
            }
        });

        this.observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
        });
    }

    private scheduleBatchProcess(): void {
        if (this.rafId === null) {
            this.rafId = requestAnimationFrame(() => {
                this.processPendingElements();
                this.rafId = null;
            });
        }
    }

    private processPendingElements(): void {
        if (!ClassroomTextProcessor.globallyEnabled) {
            this.pendingElements.clear();
            return;
        }
        this.pendingElements.forEach(element => {
            this.checkAndProcess(element);
        });
        this.pendingElements.clear();
    }

    private processAll(): void {
        if (!ClassroomTextProcessor.globallyEnabled) {
            return;
        }
        const targets = document.querySelectorAll(TARGET_SELECTORS.join(","));
        targets.forEach(element => {
            this.checkAndProcess(element as HTMLElement);
        });
    }

    private checkAndProcess(element: HTMLElement): void {
        if (!ClassroomTextProcessor.globallyEnabled) {
            return;
        }
        if (!element.isConnected) {
            return;
        }

        if (this.isInteractiveOrIconElement(element)) {
            return;
        }

        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
            acceptNode: node => {
                const textNode = node as Text;
                const parent = textNode.parentElement;
                if (!parent) {
                    return NodeFilter.FILTER_REJECT;
                }
                if (this.isInteractiveOrIconElement(parent)) {
                    return NodeFilter.FILTER_REJECT;
                }
                if (parent.closest('.material-icons, [class*="material-icons"]')) {
                    return NodeFilter.FILTER_REJECT;
                }
                return NodeFilter.FILTER_ACCEPT;
            },
        });

        let changed = false;
        let textNode = walker.nextNode() as Text | null;
        while (textNode) {
            const raw = textNode.nodeValue || "";
            if (raw.trim().length >= 3 && this.needsCleanup(raw)) {
                const cleaned = this.extractAndCleanupText(raw);
                if (cleaned !== raw) {
                    if (!this.originalTextByNode.has(textNode)) {
                        this.originalTextByNode.set(textNode, raw);
                    }
                    textNode.nodeValue = cleaned;
                    this.transformedTextNodes.add(textNode);
                    changed = true;
                }
            }
            textNode = walker.nextNode() as Text | null;
        }

        if (changed) {
            element.dataset.processedByHidePoster = "true";
        }
    }

    private needsCleanup(text: string): boolean {
        return (
            /20\d{2}/.test(text) ||
            text.includes("ワークシート") ||
            text.includes("WS") ||
            /[0-9]Q/.test(text) ||
            text.includes("その他") ||
            text.includes("さんが")
        );
    }

    private cleanupText(text: string): string {
        if (!text) {
            return "";
        }

        let result = text;

        for (const { key, regex, replacement } of CLEANUP_PATTERNS) {
            if (!ClassroomTextProcessor.cleanupPatternFlags[key]) {
                continue;
            }
            result = result.replace(regex, replacement);
        }

        result = result.replace(/[_＿\s]{2,}/g, " ");
        result = result.replace(/^[_＿\s]+/, "");
        result = result.replace(/[_＿\s]+$/, "");

        for (const pattern of EMPTY_BRACKETS_PATTERNS) {
            result = result.replace(pattern, "");
        }

        return result.trim();
    }

    private restoreOriginalText(): void {
        for (const node of Array.from(this.transformedTextNodes)) {
            const original = this.originalTextByNode.get(node);
            if (typeof original === "string") {
                node.nodeValue = original;
            }
            this.transformedTextNodes.delete(node);
        }
        this.pendingElements.clear();
    }

    public destroy(restore = false): void {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        if (this.rafId != null) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        if (this.recheckIntervalId != null) {
            window.clearInterval(this.recheckIntervalId);
            this.recheckIntervalId = null;
        }
        if (this.recheckStopTimeoutId != null) {
            window.clearTimeout(this.recheckStopTimeoutId);
            this.recheckStopTimeoutId = null;
        }
        if (restore) {
            this.restoreOriginalText();
        }
    }
}
