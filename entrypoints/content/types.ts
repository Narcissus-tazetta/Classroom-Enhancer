export interface ProcessedElement extends HTMLElement {
    dataset: DOMStringMap & {
        processedByHidePoster?: string;
    };
}

export interface NormalizedItem {
    element: HTMLElement;
    original: string;
    hiragana: string;
    romaji: string;
    romajiVariants: string[];
    normalized: string;
}
