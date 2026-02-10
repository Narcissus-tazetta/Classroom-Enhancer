import { CLASSROOM_PATTERNS, TARGET_SELECTORS } from "./constants";

export class ClassroomTextProcessor {
    private observer: MutationObserver | null = null;
    private readonly BROAD_SELECTORS = "a, div, span, h2";

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
        setTimeout(() => this.processAll(), 500);
        setTimeout(() => this.processAll(), 1500);
        this.startObserver();
    }

    private startObserver(): void {
        this.observer = new MutationObserver((mutationsList) => {
            let shouldProcess = false;

            for (const mutation of mutationsList) {
                if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
                    shouldProcess = true;
                } else if (mutation.type === "characterData") {
                    const target = mutation.target.parentElement;
                    if (target) this.processElement(target as HTMLElement);
                }
            }

            if (shouldProcess) {
                this.processAll();
            }
        });

        this.observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
        });
    }

    private processAll(): void {
        const selectorString = TARGET_SELECTORS.join(",");
        const targets = document.querySelectorAll(selectorString);

        targets.forEach((element) => {
            this.processElement(element as HTMLElement);
        });
    }

    private processElement(element: HTMLElement): void {
        const currentText = element.textContent || "";

        if (!currentText || currentText.length < 3) return;

        if (element.dataset.processedByHidePoster === "true" && !this.needsCleanup(currentText)) {
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
            element.dataset.processedByHidePoster = "true";
        }
    }

    private needsCleanup(text: string): boolean {
        return (
            /20\d{2}/.test(text) ||
            /ワークシート/.test(text) ||
            /WS/.test(text) ||
            /[0-9]Q/.test(text) ||
            /その他/.test(text) ||
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
    }
}
