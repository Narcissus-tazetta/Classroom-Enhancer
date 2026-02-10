import { CLASSROOM_PATTERNS, TARGET_SELECTORS } from "./constants";

export class ClassroomTextProcessor {
    private observer: MutationObserver | null = null;
    private pendingElements = new Set<HTMLElement>();
    private processedElements = new WeakSet<HTMLElement>();
    private rafId: number | null = null;

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
        this.startObserver();
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
        if (!element.isConnected) return;

        const currentText = element.textContent || "";
        if (currentText.length < 3) return;

        if (this.processedElements.has(element) && !this.needsCleanup(currentText)) {
            return;
        }

        if (!this.needsCleanup(currentText)) {
            return;
        }

        let newText = currentText;
        let processed = false;

        if (newText.includes("さんが")) {
            for (const pattern of CLASSROOM_PATTERNS) {
                const match = newText.match(pattern);
                if (match) {
                    const extracted = match[3] || match[4] || match[2];
                    if (extracted) {
                        newText = extracted.trim();
                        processed = true;
                    }
                    break;
                }
            }
            if (!processed) {
                const sangaIndex = newText.indexOf("さんが");
                if (sangaIndex !== -1) {
                    const parts = newText.split(/[:：]/);
                    if (parts.length > 1) {
                        newText = parts[parts.length - 1].trim();
                    } else {
                        const afterSanga = newText
                            .substring(sangaIndex + 3)
                            .replace(/.*投稿しました\.?/, "")
                            .trim();
                        if (afterSanga.length > 0) newText = afterSanga;
                    }
                    processed = true;
                }
            }
        }

        const cleanedText = this.cleanupText(newText);
        if (cleanedText !== newText) {
            newText = cleanedText;
            processed = true;
        }

        if (processed && element.textContent !== newText) {
            element.textContent = newText;
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
        if (!text) return "";

        text = text.replace(/20\d{2}年度?[_＿\s]?/g, "");
        text = text.replace(/[1-4]Q\d{0,2}[_＿\s]?/g, "");
        text = text.replace(/第\d{1,2}回[_＿\s]?/g, "");

        text = text.replace(/ワークシート/g, "");
        text = text.replace(/\bWS\b/g, "");
        text = text.replace(/資料[＆&]?/g, "");
        text = text.replace(/配布資料/g, "");
        text = text.replace(/解説資料/g, "");
        text = text.replace(/授業用資料/g, "");
        text = text.replace(/その他/g, "");
        text = text.replace(/アーカイブ/g, "");

        text = text.replace(/[_＿\s]{2,}/g, " ");
        text = text.replace(/^[_＿\s]+/, "");
        text = text.replace(/[_＿\s]+$/, "");

        text = text.replace(/\(\s*\)/g, "");
        text = text.replace(/（\s*）/g, "");
        text = text.replace(/【\s*】/g, "");
        text = text.replace(/\[\s*\]/g, "");

        return text.trim();
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
    }
}
