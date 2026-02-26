export const CLEANUP_ENABLED_KEY = "cleanupEnabled";
export const CLEANUP_ENABLED_DEFAULT = true;
export const CLEANUP_TOGGLE_MESSAGE = "cleanup:toggle";

export const POPUP_THEME_MODE_KEY = "popupThemeMode";
export const POPUP_THEME_MODE_VALUES = ["light", "system", "dark"] as const;
export type PopupThemeMode = (typeof POPUP_THEME_MODE_VALUES)[number];
export const POPUP_THEME_MODE_DEFAULT: PopupThemeMode = "light";

export const CLEANUP_PATTERN_KEYS = [
    "removeYearPrefix",
    "removeLeadingYear",
    "removeWorksheetConnector",
    "removeWorksheet",
    "removeSheetSuffix",
    "removeGroupWS",
    "removeWS",
    "removeMaterial",
    "removeHandout",
    "removeGuide",
    "removeLessonMaterial",
    "removeOther",
    "removeArchive",
    "removeUnderscoreBeforeBracket",
] as const;

export type CleanupPatternKey = (typeof CLEANUP_PATTERN_KEYS)[number];
export type CleanupPatternFlags = Record<CleanupPatternKey, boolean>;

export const CLEANUP_PATTERN_FLAGS_KEY = "cleanupPatternFlags";
export const CLEANUP_PATTERNS_TOGGLE_MESSAGE = "cleanup:patterns";

export const DEFAULT_CLEANUP_PATTERN_FLAGS: CleanupPatternFlags = {
    removeYearPrefix: true,
    removeLeadingYear: true,
    removeWorksheetConnector: true,
    removeWorksheet: true,
    removeSheetSuffix: true,
    removeGroupWS: true,
    removeWS: true,
    removeMaterial: true,
    removeHandout: true,
    removeGuide: true,
    removeLessonMaterial: true,
    removeOther: true,
    removeArchive: true,
    removeUnderscoreBeforeBracket: true,
};
