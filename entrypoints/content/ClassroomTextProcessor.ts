import { ProcessedElement } from "./types";
import { CLASSROOM_PATTERNS, TARGET_SELECTORS } from "./constants";

export class ClassroomTextProcessor {
    private observer: MutationObserver | null = null;

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
        this.processElementsInNode(document.body);
        this.startObserver();
    }

    private startObserver(): void {
        this.observer = new MutationObserver((mutationsList) => {
            for (const mutation of mutationsList) {
                if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
                    for (const node of Array.from(mutation.addedNodes)) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            this.processElementsInNode(node as HTMLElement);
                        }
                    }
                } else if (mutation.type === "characterData" || mutation.type === "attributes") {
                    const target = mutation.target;
                    if (target.nodeType === Node.ELEMENT_NODE) {
                        this.processTextInElement(target as ProcessedElement);
                    } else if (target.parentNode && target.parentNode.nodeType === Node.ELEMENT_NODE) {
                        this.processTextInElement(target.parentNode as ProcessedElement);
                    }
                }
            }
        });

        this.observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
        });
    }

    private processElementsInNode(node: HTMLElement): void {
        const potentialMessageElements = node.querySelectorAll(TARGET_SELECTORS);
        const allSpansAndDivs = node.querySelectorAll("span, div");
        const allElements = new Set<Element>([...Array.from(potentialMessageElements), ...Array.from(allSpansAndDivs)]);

        for (const element of allElements) {
            if (element.tagName === "SPAN" || element.tagName === "DIV") {
                const text = element.textContent || "";

                if (text.length > 5 && text.includes("さんが")) {
                    const hasChildWithSanga = Array.from(element.children).some(
                        (child) => child.textContent && child.textContent.includes("さんが"),
                    );

                    if (
                        element.childNodes.length === 0 ||
                        Array.from(element.childNodes).some(
                            (childNode) =>
                                childNode.nodeType === Node.TEXT_NODE && childNode.textContent?.includes("さんが"),
                        ) ||
                        (!hasChildWithSanga && text.includes("さんが"))
                    ) {
                        this.processTextInElement(element as ProcessedElement);
                    }
                }
            }
        }
    }

    private processTextInElement(element: ProcessedElement): void {
        const originalText = element.textContent || "";

        if (!originalText.includes("さんが")) {
            return;
        }

        if (element.dataset.processedByHidePoster === "true" && !originalText.includes("さんが")) {
            return;
        }

        let processed = false;

        for (let i = 0; i < CLASSROOM_PATTERNS.length; i++) {
            const pattern = CLASSROOM_PATTERNS[i];
            const match = originalText.match(pattern);

            if (match) {
                let newText = "";

                switch (i) {
                    case 0:
                        newText = match[3] || "";
                        break;
                    case 1:
                    case 2:
                        newText = match[4] || match[3] || "";
                        break;
                    case 3:
                        newText = match[3] || "";
                        break;
                    case 4:
                        newText = (match[3] && match[3].trim()) || match[2] || "";
                        break;
                    default:
                        newText = match[2] || "";
                        break;
                }

                element.textContent = newText;
                element.dataset.processedByHidePoster = "true";
                processed = true;
                break;
            }
        }

        if (!processed) {
            const sangaIndex = originalText.indexOf("さんが");
            if (sangaIndex !== -1) {
                const afterSanga = originalText.substring(sangaIndex + 3).trim();
                if (afterSanga.length > 0) {
                    element.textContent = afterSanga;
                    element.dataset.processedByHidePoster = "true";
                    processed = true;
                }
            }
        }

        if (element.dataset.processedByHidePoster === "true") {
            element.textContent = this.cleanupText(element.textContent || "");
        }
    }

    private cleanupText(text: string): string {
        text = text.replace(/^20\d{2}年[_＿\s]?/g, "");
        text = text.replace(/20\d{2}年[_＿\s]/g, "");
        text = text.replace(/20\d{2}[_＿\s]/g, "");
        text = text.replace(/[_＿\s]20\d{2}年?/g, "");
        text = text.replace(/[_＿]20\d{2}/g, "");
        text = text.replace(/_?ワークシート$/, "");
        text = text.replace(/ワークシート$/, "");
        text = text.replace(/^ワークシート[_＿\s]?/, "");
        text = text.replace(/[_＿\s]ワークシート[_＿\s]?/g, "");
        text = text.replace(/^[_＿\s]+/, "");
        text = text.replace(/[_＿\s]+$/, "");
        text = text.replace(/[_＿]{2,}/g, "_");
        text = text.replace(/[_＿\s]{2,}/g, " ");
        text = text.trim();
        text = text.replace(/^[_＿\-\s]+/, "");
        text = text.replace(/[_＿\-\s]+$/, "");
        return text;
    }

    public destroy(): void {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    }
}
