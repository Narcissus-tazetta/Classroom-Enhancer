import * as wanakana from "wanakana";
import { NormalizedItem } from "./types";
import { ROMAJI_REPLACEMENTS, DROPDOWN_SELECTORS, ITEM_SELECTORS } from "./constants";
import { getReadingWithFallback } from "./reading-dictionary";

export class DropdownSearchEnhancer {
    private observer: MutationObserver | null = null;
    private enhancedDropdowns = new WeakSet<HTMLElement>();
    private debounceTimers = new WeakMap<HTMLElement, number>();
    private itemCache = new WeakMap<HTMLElement, NormalizedItem[]>();

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
        this.enhanceExistingDropdowns();
        this.startObserver();

        setInterval(() => {
            const allListboxes = document.querySelectorAll('ul[role="listbox"]');
            if (allListboxes.length > 0) {
                allListboxes.forEach((lb) => {
                    const listbox = lb as HTMLElement;
                    if (this.enhancedDropdowns.has(listbox)) {
                        return;
                    }
                    if (this.isValidDropdown(listbox)) {
                        this.enhanceDropdown(listbox);
                        this.enhancedDropdowns.add(listbox);
                    }
                });
            }
        }, 1000);
    }

    private startObserver(): void {
        this.observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
                    for (const node of Array.from(mutation.addedNodes)) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const element = node as HTMLElement;
                            if (element.matches && element.matches('ul[role="listbox"]')) {
                                this.enhanceDropdownsInNode(element);
                            } else {
                                this.enhanceDropdownsInNode(element);
                            }
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

    private enhanceExistingDropdowns(): void {
        this.enhanceDropdownsInNode(document.body);
    }

    private enhanceDropdownsInNode(node: HTMLElement): void {
        for (const selector of DROPDOWN_SELECTORS) {
            const dropdowns = node.matches?.(selector)
                ? [node]
                : Array.from(node.querySelectorAll<HTMLElement>(selector));

            for (const dropdown of dropdowns) {
                if (!this.enhancedDropdowns.has(dropdown) && this.isValidDropdown(dropdown)) {
                    this.enhanceDropdown(dropdown);
                    this.enhancedDropdowns.add(dropdown);
                }
            }
        }
    }

    private isValidDropdown(dropdown: HTMLElement): boolean {
        const items = this.getDropdownItems(dropdown);
        if (items.length <= 3) return false;

        if (this.isPersistentContainer(dropdown)) return false;

        if (!this.isOverlayDropdown(dropdown)) return false;

        return true;
    }

    private isPersistentContainer(el: HTMLElement): boolean {
        return !!el.closest('[data-is-persistent="true"], [role="navigation"], nav, aside');
    }

    private isOverlayDropdown(dropdown: HTMLElement): boolean {
        try {
            let el: HTMLElement | null = dropdown;
            while (el && el !== document.body) {
                const pos = window.getComputedStyle(el).position;
                if (pos === "absolute" || pos === "fixed" || pos === "sticky") return true;
                el = el.parentElement;
            }
        } catch (e) {
            return false;
        }
        return false;
    }

    private getDropdownItems(dropdown: HTMLElement): HTMLElement[] {
        const items: HTMLElement[] = [];
        for (const selector of ITEM_SELECTORS) {
            const found = Array.from(dropdown.querySelectorAll<HTMLElement>(selector));
            if (found.length > 0) {
                items.push(...found);
            }
        }
        const allItems =
            items.length > 0 ? items : Array.from(dropdown.querySelectorAll<HTMLElement>('li, div[role="option"]'));
        return allItems.filter(
            (item) => !item.hasAttribute("data-gc-search-item") && !item.querySelector(".gc-search-wrapper"),
        );
    }

    private enhanceDropdown(dropdown: HTMLElement): void {
        if (dropdown.querySelector(".gc-search-wrapper")) {
            return;
        }

        const searchLi = this.createSearchElement();
        const input = searchLi.querySelector(".gc-search-input") as HTMLInputElement;

        dropdown.insertBefore(searchLi, dropdown.firstChild);

        this.setupSearchProtection(searchLi, dropdown);
        this.setupSearchHandlers(input, dropdown);
        this.setupDropdownObserver(input, dropdown);
        this.injectStyles();
    }

    private createSearchElement(): HTMLElement {
        const li = document.createElement("li");
        li.setAttribute("role", "presentation");
        li.className = "gc-search-li";
        li.setAttribute("data-gc-search-item", "true");
        li.style.cssText =
            "position: sticky !important; top: 0 !important; z-index: 999 !important; background: white !important; padding: 8px !important; margin: 0 !important; list-style: none !important; pointer-events: auto !important;";

        const wrapper = document.createElement("div");
        wrapper.className = "gc-search-wrapper";
        wrapper.setAttribute("data-gc-search", "true");

        const input = document.createElement("input");
        input.type = "search";
        input.className = "gc-search-input";
        input.placeholder = "フィルタ...";
        input.setAttribute("aria-label", "ドロップダウンを検索");
        input.setAttribute("autocomplete", "off");
        input.setAttribute("spellcheck", "false");

        wrapper.appendChild(input);
        li.appendChild(wrapper);

        return li;
    }

    private setupSearchProtection(searchLi: HTMLElement, dropdown: HTMLElement): void {
        const originalParent = dropdown;

        const protectElement = () => {
            if (searchLi.parentElement !== originalParent) {
                originalParent.insertBefore(searchLi, originalParent.firstChild);
            }
            if (searchLi.getAttribute("role") !== "presentation") {
                searchLi.setAttribute("role", "presentation");
            }
            if (!searchLi.className.includes("gc-search-li")) {
                searchLi.className = "gc-search-li";
            }
            const wrapper = searchLi.querySelector(".gc-search-wrapper");
            if (!wrapper) {
                searchLi.innerHTML = "";
                const newSearchEl = this.createSearchElement();
                Array.from(newSearchEl.childNodes).forEach((node) => searchLi.appendChild(node));
                const newInput = searchLi.querySelector(".gc-search-input") as HTMLInputElement;
                if (newInput) {
                    this.setupSearchHandlers(newInput, dropdown);
                }
            }
        };

        const observer = new MutationObserver(() => protectElement());
        observer.observe(searchLi, {
            attributes: true,
            childList: true,
            subtree: true,
            attributeFilter: ["role", "class", "data-value"],
        });
        observer.observe(dropdown, {
            childList: true,
        });
    }

    private setupSearchHandlers(input: HTMLInputElement, dropdown: HTMLElement): void {
        const filterHandler = () => this.filterDropdown(dropdown, input);

        input.addEventListener("input", () => {
            const existingTimer = this.debounceTimers.get(dropdown);
            if (existingTimer !== undefined) {
                window.clearTimeout(existingTimer);
            }
            const timer = window.setTimeout(filterHandler, 150);
            this.debounceTimers.set(dropdown, timer);
        });

        input.addEventListener("keydown", (ev) => this.handleKeyboard(ev, dropdown));
    }

    private setupDropdownObserver(input: HTMLInputElement, dropdown: HTMLElement): void {
        const observer = new MutationObserver(() => {
            if (!dropdown.offsetParent) {
                input.value = "";
                this.resetFilter(dropdown);
            }
        });
        observer.observe(dropdown, { attributes: true, attributeFilter: ["style", "class"] });
    }

    private async filterDropdown(dropdown: HTMLElement, input: HTMLInputElement): Promise<void> {
        const rawQuery = input.value.trim();
        if (!rawQuery) {
            this.resetFilter(dropdown);
            return;
        }

        const normalizedItems = await this.getNormalizedItems(dropdown);
        const searchPatterns = this.generateSearchPatterns(rawQuery);

        const matched = new Set<HTMLElement>();

        for (const item of normalizedItems) {
            const searchTargets = [
                item.normalized,
                item.original.toLowerCase(),
                item.hiragana,
                item.romaji,
                ...item.romajiVariants,
            ];

            const isMatch = searchPatterns.some((pattern) => searchTargets.some((target) => target.includes(pattern)));

            if (isMatch) {
                matched.add(item.element);
            }
        }

        for (const item of normalizedItems) {
            if (matched.has(item.element)) {
                item.element.style.display = "";
                this.highlightText(item.element, rawQuery);
            } else {
                item.element.style.display = "none";
                item.element.classList.remove("gc-active");
            }
        }
    }

    private generateSearchPatterns(query: string): string[] {
        const patterns = new Set<string>();
        const normalized = this.normalizeQuery(query);

        patterns.add(normalized);
        patterns.add(query.toLowerCase());

        const hiragana = wanakana.toHiragana(normalized);
        patterns.add(hiragana);

        const katakana = wanakana.toKatakana(normalized);
        patterns.add(katakana);

        const romaji = wanakana.toRomaji(hiragana);
        patterns.add(romaji.toLowerCase());

        const romajiVariants = this.generateRomajiVariants(romaji.toLowerCase());
        romajiVariants.forEach((v) => patterns.add(v));

        const tokens = this.tokenizeRomaji(normalized);
        tokens.forEach((token) => {
            patterns.add(wanakana.toHiragana(token));
            patterns.add(wanakana.toKatakana(token));
        });

        return Array.from(patterns).filter((p) => p.length > 0);
    }

    private tokenizeRomaji(text: string): string[] {
        const tokens: string[] = [];
        const romanChars = /[a-z]+/gi;
        let match;

        while ((match = romanChars.exec(text)) !== null) {
            tokens.push(match[0]);
        }

        return tokens;
    }

    private normalizeQuery(query: string): string {
        const normalized = query.normalize("NFKC").toLowerCase().trim();
        return normalized;
    }

    private async getNormalizedItems(dropdown: HTMLElement): Promise<NormalizedItem[]> {
        if (this.itemCache.has(dropdown)) {
            return this.itemCache.get(dropdown)!;
        }

        const items = this.getDropdownItems(dropdown);
        const normalized: NormalizedItem[] = [];

        for (const el of items) {
            const text = this.getItemText(el);
            const normalizedText = text.normalize("NFKC");

            const textWithReading = getReadingWithFallback(normalizedText);

            const hiragana = wanakana.toHiragana(textWithReading);
            const allHiragana = this.extractAllHiraganaFromText(textWithReading);
            const finalHiragana = allHiragana || hiragana;

            const romaji = wanakana.toRomaji(finalHiragana).toLowerCase();
            const romajiVariants = this.generateRomajiVariants(romaji);

            normalized.push({
                element: el,
                original: text,
                hiragana: finalHiragana,
                romaji: romaji,
                romajiVariants: romajiVariants,
                normalized: normalizedText.toLowerCase(),
            });
        }

        this.itemCache.set(dropdown, normalized);
        return normalized;
    }

    private extractAllHiraganaFromText(text: string): string {
        const converted = wanakana.toHiragana(text, { passRomaji: true });
        const hiraganaOnly = converted.replace(/[^\u3040-\u309F]/g, "");
        return hiraganaOnly;
    }

    private generateRomajiVariants(romaji: string): string[] {
        const variants = new Set<string>([romaji]);
        const results = new Set<string>([romaji]);

        for (const [from, to] of ROMAJI_REPLACEMENTS) {
            const currentResults = Array.from(results);
            for (const result of currentResults) {
                if (result.includes(from)) {
                    let temp = result;
                    let index = 0;
                    while ((index = temp.indexOf(from, index)) !== -1) {
                        const replaced = temp.slice(0, index) + to + temp.slice(index + from.length);
                        results.add(replaced);
                        variants.add(replaced);
                        index += from.length;
                    }
                }
            }
        }

        return Array.from(variants);
    }

    private resetFilter(dropdown: HTMLElement): void {
        const items = this.getDropdownItems(dropdown);
        for (const item of items) {
            item.style.display = "";
            this.removeHighlight(item);
            item.classList.remove("gc-active");
        }
    }

    private getItemText(item: HTMLElement): string {
        const originalText = item.getAttribute("data-gc-original-text");
        if (originalText !== null) {
            return originalText;
        }
        const text = item.textContent || "";
        item.setAttribute("data-gc-original-text", text);
        return text;
    }

    private highlightText(item: HTMLElement, query: string): void {
        if (!query) {
            this.removeHighlight(item);
            return;
        }

        const walker = document.createTreeWalker(item, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => {
                if (node.parentElement?.closest(".gc-highlight")) {
                    return NodeFilter.FILTER_REJECT;
                }
                return node.textContent?.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            },
        });

        const textNodes: Text[] = [];
        let node: Node | null;
        while ((node = walker.nextNode())) {
            textNodes.push(node as Text);
        }

        for (const textNode of textNodes) {
            const text = textNode.textContent || "";
            const lowerText = text.toLowerCase();
            const index = lowerText.indexOf(query);

            if (index !== -1) {
                const before = text.substring(0, index);
                const match = text.substring(index, index + query.length);
                const after = text.substring(index + query.length);

                const fragment = document.createDocumentFragment();
                if (before) fragment.appendChild(document.createTextNode(before));

                const highlight = document.createElement("span");
                highlight.className = "gc-highlight";
                highlight.textContent = match;
                fragment.appendChild(highlight);

                if (after) fragment.appendChild(document.createTextNode(after));

                textNode.parentNode?.replaceChild(fragment, textNode);
            }
        }
    }

    private removeHighlight(item: HTMLElement): void {
        const highlights = item.querySelectorAll(".gc-highlight");
        for (const highlight of Array.from(highlights)) {
            const text = highlight.textContent || "";
            const textNode = document.createTextNode(text);
            highlight.parentNode?.replaceChild(textNode, highlight);
        }
        item.normalize();
    }

    private handleKeyboard(ev: KeyboardEvent, dropdown: HTMLElement): void {
        const items = this.getDropdownItems(dropdown).filter((item) => item.offsetParent !== null);
        if (items.length === 0) return;

        const active = dropdown.querySelector<HTMLElement>(".gc-active");
        let currentIndex = active ? items.indexOf(active) : -1;

        if (ev.key === "ArrowDown") {
            ev.preventDefault();
            if (active) active.classList.remove("gc-active");
            currentIndex = currentIndex < items.length - 1 ? currentIndex + 1 : 0;
            items[currentIndex].classList.add("gc-active");
            items[currentIndex].scrollIntoView({ block: "nearest", behavior: "smooth" });
        } else if (ev.key === "ArrowUp") {
            ev.preventDefault();
            if (active) active.classList.remove("gc-active");
            currentIndex = currentIndex > 0 ? currentIndex - 1 : items.length - 1;
            items[currentIndex].classList.add("gc-active");
            items[currentIndex].scrollIntoView({ block: "nearest", behavior: "smooth" });
        } else if (ev.key === "Escape") {
            ev.preventDefault();
            (ev.target as HTMLInputElement).value = "";
            this.resetFilter(dropdown);
        }
    }

    private injectStyles(): void {
        if (document.getElementById("gc-search-styles")) return;

        const style = document.createElement("style");
        style.id = "gc-search-styles";
        style.textContent = `
.gc-search-li {
    list-style: none !important;
    margin: 0 !important;
    padding: 0 !important;
    position: sticky !important;
    top: 0 !important;
    z-index: 999 !important;
    background: white !important;
    display: block !important;
    visibility: visible !important;
    opacity: 1 !important;
}
.gc-search-wrapper {
    padding: 8px 12px !important;
    border-bottom: 1px solid rgba(0, 0, 0, 0.12) !important;
    background: #fff !important;
    display: block !important;
    visibility: visible !important;
}
.gc-search-input {
    width: 100% !important;
    padding: 8px 12px !important;
    box-sizing: border-box !important;
    border-radius: 4px !important;
    border: 1px solid rgba(0, 0, 0, 0.24) !important;
    font-size: 14px !important;
    font-family: inherit !important;
    outline: none !important;
    transition: border-color 0.2s !important;
    display: block !important;
    visibility: visible !important;
}
.gc-search-input:focus {
    border-color: #1a73e8 !important;
    box-shadow: 0 0 0 2px rgba(26, 115, 232, 0.1) !important;
}
.gc-highlight {
    background: #fff176 !important;
    border-radius: 2px !important;
    padding: 0 2px !important;
    font-weight: 500 !important;
}
[role="option"].gc-active,
[role="menuitem"].gc-active {
    background: rgba(26, 115, 232, 0.08) !important;
}
        `;
        document.head.appendChild(style);
    }

    public destroy(): void {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    }
}
