import { defineContentScript } from "wxt/utils/define-content-script";
import {
    CLEANUP_ENABLED_DEFAULT,
    CLEANUP_ENABLED_KEY,
    CLEANUP_PATTERN_FLAGS_KEY,
    CLEANUP_PATTERN_KEYS,
    CLEANUP_PATTERNS_TOGGLE_MESSAGE,
    CLEANUP_TOGGLE_MESSAGE,
    CleanupPatternFlags,
    DEFAULT_CLEANUP_PATTERN_FLAGS,
} from "../shared/settings";
import { ClassroomTextProcessor } from "./ClassroomTextProcessor";
import { DropdownSearchEnhancer } from "./DropdownSearchEnhancer";
import { DropdownUsageTracker } from "./DropdownUsageTracker";

const normalizePatternFlags = (value: unknown): CleanupPatternFlags => {
    const normalized: CleanupPatternFlags = { ...DEFAULT_CLEANUP_PATTERN_FLAGS };
    if (!value || typeof value !== "object") {
        return normalized;
    }
    for (const key of CLEANUP_PATTERN_KEYS) {
        const candidate = (value as Record<string, unknown>)[key];
        if (typeof candidate === "boolean") {
            normalized[key] = candidate;
        }
    }
    return normalized;
};

export default defineContentScript({
    matches: ["https://classroom.google.com/*"],
    main() {
        let textProcessor: ClassroomTextProcessor | null = null;
        let changeVersion = 0;
        let currentEnabled: boolean | null = null;
        let currentPatternFlags = JSON.stringify(DEFAULT_CLEANUP_PATTERN_FLAGS);

        const enableCleanup = () => {
            if (!textProcessor) {
                textProcessor = new ClassroomTextProcessor();
            }
        };

        const disableCleanup = () => {
            if (textProcessor) {
                textProcessor.destroy(true);
                textProcessor = null;
            }
        };

        const applyCleanupState = (enabled: boolean) => {
            if (currentEnabled === enabled) {
                return;
            }
            currentEnabled = enabled;
            ClassroomTextProcessor.setGlobalEnabled(enabled);
            if (enabled) {
                enableCleanup();
            } else {
                disableCleanup();
            }
        };

        const applyCleanupPatternFlags = (flags: CleanupPatternFlags) => {
            const nextSerialized = JSON.stringify(flags);
            if (nextSerialized === currentPatternFlags) {
                return;
            }
            currentPatternFlags = nextSerialized;
            ClassroomTextProcessor.setPatternFlags(flags);

            if (!currentEnabled) {
                return;
            }

            if (textProcessor) {
                textProcessor.destroy(true);
                textProcessor = new ClassroomTextProcessor();
            }
        };

        const getSnapshotVersion = changeVersion;

        void chrome.storage.local.get([CLEANUP_ENABLED_KEY, CLEANUP_PATTERN_FLAGS_KEY]).then(result => {
            if (changeVersion !== getSnapshotVersion) {
                return;
            }
            const flags = normalizePatternFlags(result[CLEANUP_PATTERN_FLAGS_KEY]);
            applyCleanupPatternFlags(flags);
            const value = result[CLEANUP_ENABLED_KEY];
            applyCleanupState(typeof value === "boolean" ? value : CLEANUP_ENABLED_DEFAULT);
        });

        chrome.storage.onChanged.addListener((changes, areaName) => {
            if (areaName !== "local") {
                return;
            }
            changeVersion += 1;

            if (CLEANUP_PATTERN_FLAGS_KEY in changes) {
                const nextFlags = normalizePatternFlags(changes[CLEANUP_PATTERN_FLAGS_KEY]?.newValue);
                applyCleanupPatternFlags(nextFlags);
            }

            if (CLEANUP_ENABLED_KEY in changes) {
                const nextValue = changes[CLEANUP_ENABLED_KEY]?.newValue;
                applyCleanupState(typeof nextValue === "boolean" ? nextValue : CLEANUP_ENABLED_DEFAULT);
            }
        });

        chrome.runtime.onMessage.addListener(message => {
            if (message?.type === CLEANUP_TOGGLE_MESSAGE) {
                const nextValue = message?.enabled;
                applyCleanupState(typeof nextValue === "boolean" ? nextValue : CLEANUP_ENABLED_DEFAULT);
                return;
            }

            if (message?.type === CLEANUP_PATTERNS_TOGGLE_MESSAGE) {
                const nextFlags = normalizePatternFlags(message?.flags);
                applyCleanupPatternFlags(nextFlags);
            }
        });

        new DropdownSearchEnhancer();
        new DropdownUsageTracker();
    },
});
