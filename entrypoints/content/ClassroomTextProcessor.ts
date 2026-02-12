import { CLASSROOM_PATTERNS, TARGET_SELECTORS } from "./constants";

const CLEANUP_PATTERNS = [
    { regex: /20\d{2}(?:年(?:度)?|年度?)[_＿\s]*/g, replacement: "" },
    { regex: /^20\d{2}[_＿\s]+/g, replacement: "" },
    { regex: /ワークシート/g, replacement: "" },
    { regex: /シート$/g, replacement: "" },
    { regex: /\bWS\b/g, replacement: "" },
    { regex: /資料[＆&]?/g, replacement: "" },
    { regex: /配布資料/g, replacement: "" },
    { regex: /解説資料/g, replacement: "" },
    { regex: /授業用資料/g, replacement: "" },
    { regex: /その他/g, replacement: "" },
    { regex: /アーカイブ/g, replacement: "" },
] as const;

const EMPTY_BRACKETS_PATTERNS = [/\(\s*\)/g, /（\s*）/g, /【\s*】/g, /\[\s*\]/g] as const;

export class ClassroomTextProcessor {
    private observer: MutationObserver | null = null;
    private pendingElements = new Set<HTMLElement>();
    private processedElements = new WeakSet<HTMLElement>();
    private rafId: number | null = null;
    private recheckIntervalId: number | null = null;
    private recheckStopTimeoutId: number | null = null;

    constructor() {
        this.init();
    }

    private init(): void {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => this.start());
        } else {
            this.start();
        }
    }

    private start(): void {
        this.processAll();
        const delays = [500, 1500, 3000];
        delays.forEach((delay) => setTimeout(() => this.processAll(), delay));
        this.startRecheckLoop();
        this.startObserver();
    }

    private startRecheckLoop(): void {
        if (this.recheckIntervalId != null) {
            return;
        }

        this.recheckIntervalId = window.setInterval(() => {
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

    private containsInteractiveOrIconDescendants(element: HTMLElement): boolean {
        return !!element.querySelector(
            'button, [role="button"], [role="menu"], [role="menuitem"], [role="listbox"], [role="option"], input, textarea, select, .material-icons, [class*="material-icons"]',
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
        this.observer = new MutationObserver((mutationsList) => {
            let hasChanges = false;

            for (const mutation of mutationsList) {
                if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const element = node as HTMLElement;

                            this.pendingElements.add(element);

                            const children = element.querySelectorAll(TARGET_SELECTORS.join(","));
                            children.forEach((child) => this.pendingElements.add(child as HTMLElement));

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
        this.pendingElements.forEach((element) => {
            this.checkAndProcess(element);
        });
        this.pendingElements.clear();
    }

    private processAll(): void {
        const targets = document.querySelectorAll(TARGET_SELECTORS.join(","));
        targets.forEach((element) => {
            this.checkAndProcess(element as HTMLElement);
        });
    }

    private checkAndProcess(element: HTMLElement): void {
        if (!element.isConnected) {
            return;
        }

        if (this.isInteractiveOrIconElement(element)) {
            return;
        }

        const hasInteractiveDescendants = this.containsInteractiveOrIconDescendants(element);

        if (hasInteractiveDescendants) {
            const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
                acceptNode: (node) => {
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
            let textNode: Text | null;
            while ((textNode = walker.nextNode() as Text | null)) {
                const raw = textNode.nodeValue || "";
                if (raw.trim().length < 3) {
                    continue;
                }
                if (!this.needsCleanup(raw)) {
                    continue;
                }

                const cleaned = this.extractAndCleanupText(raw);
                if (cleaned !== raw) {
                    textNode.nodeValue = cleaned;
                    changed = true;
                }
            }

            if (changed) {
                this.processedElements.add(element);
                element.dataset.processedByHidePoster = "true";
            }
            return;
        }

        const currentText = element.textContent || "";
        if (currentText.length < 3) {
            return;
        }

        if (this.processedElements.has(element) && !this.needsCleanup(currentText)) {
            return;
        }

        if (!this.needsCleanup(currentText)) {
            return;
        }

        const cleaned = this.extractAndCleanupText(currentText);
        if (cleaned !== currentText && element.textContent !== cleaned) {
            element.textContent = cleaned;
            this.processedElements.add(element);
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

        for (const { regex, replacement } of CLEANUP_PATTERNS) {
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

    public destroy(): void {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        if (this.rafId) {
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
    }
}
