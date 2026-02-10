export class DropdownUsageTracker {
    private usage: Record<string, number> = {};
    private observer: MutationObserver | null = null;
    private processedItems = new WeakSet<HTMLElement>();
    private reorderedDropdowns = new WeakSet<HTMLElement>();

    constructor() {
        this.loadUsage();
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
        this.startObserver();
        this.processExistingDropdowns();
    }

    private loadUsage(): void {
        try {
            const data = localStorage.getItem("gc_dropdown_usage");
            if (data) {
                this.usage = JSON.parse(data);
            }
        } catch {}
    }

    private saveUsage(): void {
        try {
            localStorage.setItem("gc_dropdown_usage", JSON.stringify(this.usage));
        } catch {}
    }

    private getKey(element: HTMLElement): string {
        try {
            const text = element.textContent?.normalize("NFKC").trim() || "";
            return text;
        } catch {
            return "";
        }
    }

    private incrementUsage(element: HTMLElement): void {
        try {
            const key = this.getKey(element);
            if (!key) return;
            this.usage[key] = (this.usage[key] || 0) + 1;
            this.saveUsage();
        } catch {}
    }

    private reorderDropdown(dropdown: HTMLElement): void {
        try {
            const items = Array.from(dropdown.querySelectorAll('[role="option"], [role="menuitem"]')) as HTMLElement[];
            if (items.length <= 3) return;

            const scored = items.map((el, index) => ({
                el,
                score: this.usage[this.getKey(el)] || 0,
                originalIndex: index,
            }));

            if (!scored.some((s) => s.score > 0)) return;

            scored.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.originalIndex - b.originalIndex));

            dropdown.style.display = "flex";
            dropdown.style.flexDirection = "column";

            scored.forEach((s, index) => {
                s.el.style.order = String(index);
            });
        } catch {}
    }

    private startObserver(): void {
        this.observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
                    for (const node of Array.from(mutation.addedNodes)) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const element = node as HTMLElement;
                            this.checkAndSetupDropdown(element);
                            const dropdowns = element.querySelectorAll('[role="listbox"], [role="menu"]');
                            dropdowns.forEach((dd) => this.checkAndSetupDropdown(dd as HTMLElement));
                        }
                    }
                }
            }
        });

        this.observer.observe(document.body, {
            childList: true,
            subtree: true,
        });
    }

    private processExistingDropdowns(): void {
        const dropdowns = document.querySelectorAll('[role="listbox"], [role="menu"]');
        dropdowns.forEach((dd) => this.checkAndSetupDropdown(dd as HTMLElement));
    }

    private checkAndSetupDropdown(element: HTMLElement): void {
        if (!element.matches || !element.matches('[role="listbox"], [role="menu"]')) {
            return;
        }

        this.setupDropdown(element);
    }

    private setupDropdown(dropdown: HTMLElement): void {
        const items = dropdown.querySelectorAll('[role="option"], [role="menuitem"]');

        items.forEach((item) => {
            if (this.processedItems.has(item as HTMLElement)) return;

            item.addEventListener(
                "mousedown",
                () => {
                    try {
                        this.incrementUsage(item as HTMLElement);
                    } catch {}
                },
                true,
            );
            this.processedItems.add(item as HTMLElement);
        });

        if (!this.reorderedDropdowns.has(dropdown)) {
            this.reorderedDropdowns.add(dropdown);
            setTimeout(() => this.reorderDropdown(dropdown), 100);
        }
    }

    public destroy(): void {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    }
}
