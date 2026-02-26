import clsx from "clsx";
import { ChevronDown, ChevronUp, CircleHelp, Monitor, Moon, Sparkles, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import {
    CLEANUP_ENABLED_DEFAULT,
    CLEANUP_ENABLED_KEY,
    CLEANUP_PATTERN_FLAGS_KEY,
    CLEANUP_PATTERN_KEYS,
    CLEANUP_PATTERNS_TOGGLE_MESSAGE,
    CLEANUP_TOGGLE_MESSAGE,
    CleanupPatternFlags,
    DEFAULT_CLEANUP_PATTERN_FLAGS,
    POPUP_THEME_MODE_DEFAULT,
    POPUP_THEME_MODE_KEY,
    POPUP_THEME_MODE_VALUES,
    PopupThemeMode,
} from "../shared/settings";

type EffectivePopupTheme = "light" | "dark";

const THEME_MODE_LABELS: Record<PopupThemeMode, string> = {
    light: "ライト",
    system: "システム",
    dark: "ダーク",
};

const isPopupThemeMode = (value: unknown): value is PopupThemeMode => {
    return typeof value === "string" && (POPUP_THEME_MODE_VALUES as readonly string[]).includes(value);
};

const resolveEffectiveTheme = (mode: PopupThemeMode, prefersDark: boolean): EffectivePopupTheme => {
    if (mode === "dark") {
        return "dark";
    }
    if (mode === "light") {
        return "light";
    }
    return prefersDark ? "dark" : "light";
};

const getCleanupEnabled = async (): Promise<boolean> => {
    const result = await chrome.storage.local.get([CLEANUP_ENABLED_KEY]);
    const value = result[CLEANUP_ENABLED_KEY];
    return typeof value === "boolean" ? value : CLEANUP_ENABLED_DEFAULT;
};

const getPopupThemeMode = async (): Promise<PopupThemeMode> => {
    const result = await chrome.storage.local.get([POPUP_THEME_MODE_KEY]);
    const value = result[POPUP_THEME_MODE_KEY];
    return isPopupThemeMode(value) ? value : POPUP_THEME_MODE_DEFAULT;
};

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

const getCleanupPatternFlags = async (): Promise<CleanupPatternFlags> => {
    const result = await chrome.storage.local.get([CLEANUP_PATTERN_FLAGS_KEY]);
    return normalizePatternFlags(result[CLEANUP_PATTERN_FLAGS_KEY]);
};

const setCleanupEnabled = async (enabled: boolean): Promise<void> => {
    await chrome.storage.local.set({ [CLEANUP_ENABLED_KEY]: enabled });
};

const setCleanupPatternFlags = async (flags: CleanupPatternFlags): Promise<void> => {
    await chrome.storage.local.set({ [CLEANUP_PATTERN_FLAGS_KEY]: flags });
};

const setPopupThemeMode = async (mode: PopupThemeMode): Promise<void> => {
    await chrome.storage.local.set({ [POPUP_THEME_MODE_KEY]: mode });
};

const notifyActiveTab = async (message: Record<string, unknown>): Promise<void> => {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];
    if (!activeTab?.id) {
        return;
    }
    try {
        await chrome.tabs.sendMessage(activeTab.id, message);
    } catch {}
};

const PATTERN_LABELS: Record<keyof CleanupPatternFlags, string> = {
    removeYearPrefix: "年度表記を削除",
    removeLeadingYear: "先頭年号を削除",
    removeWorksheetConnector: "「ワークシートと 」を削除",
    removeWorksheet: "ワークシートを削除",
    removeSheetSuffix: "末尾シートを削除",
    removeGroupWS: "グループWSを削除",
    removeWS: "WS表記を削除",
    removeMaterial: "資料を削除",
    removeHandout: "配布資料を削除",
    removeGuide: "解説資料を削除",
    removeLessonMaterial: "授業用資料を削除",
    removeOther: "その他を削除",
    removeArchive: "アーカイブを削除",
    removeUnderscoreBeforeBracket: "括弧前の_を削除",
};

const PATTERN_PREVIEWS: Record<keyof CleanupPatternFlags, { before: string; after: string }> = {
    removeYearPrefix: {
        before: "2025年_4Q_第6回_数学基礎",
        after: "4Q_第6回_数学基礎",
    },
    removeLeadingYear: {
        before: "2025_4Q_第6回_数学基礎",
        after: "4Q_第6回_数学基礎",
    },
    removeWorksheetConnector: {
        before: "書類／面接対策講座_ワークシートと面接の質問集",
        after: "書類／面接対策講座_面接の質問集",
    },
    removeWorksheet: {
        before: "第6回_ゼミナール_ワークシート",
        after: "第6回_ゼミナール",
    },
    removeSheetSuffix: {
        before: "宿題記録シート",
        after: "宿題記録",
    },
    removeGroupWS: {
        before: "TAサポート教養数学_グループWS",
        after: "TAサポート教養数学",
    },
    removeWS: {
        before: "数学基礎_WS",
        after: "数学基礎",
    },
    removeMaterial: {
        before: "面接マナー資料",
        after: "面接マナー",
    },
    removeHandout: {
        before: "配布資料",
        after: "",
    },
    removeGuide: {
        before: "解説資料",
        after: "",
    },
    removeLessonMaterial: {
        before: "授業用資料",
        after: "",
    },
    removeOther: {
        before: "その他",
        after: "",
    },
    removeArchive: {
        before: "アーカイブ",
        after: "",
    },
    removeUnderscoreBeforeBracket: {
        before: "基礎（理科）_（再配布）",
        after: "基礎（理科）（再配布）",
    },
};

type ToggleSwitchProps = {
    checked: boolean;
    onClick: () => void;
    disabled?: boolean;
    className?: string;
    ariaLabel: string;
    size?: "md" | "sm";
};

function ToggleSwitch({ checked, onClick, disabled, className, ariaLabel, size = "md" }: ToggleSwitchProps) {
    const isSmall = size === "sm";
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={ariaLabel}
            aria-pressed={checked}
            className={clsx(
                "relative inline-flex items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-50",
                isSmall ? "h-5 w-9" : "h-6 w-11",
                checked
                    ? "border-(--popup-toggle-on) bg-(--popup-toggle-on)"
                    : "border-(--popup-toggle-off-border) bg-(--popup-toggle-off-bg)",
                className,
            )}
        >
            <span
                className={clsx(
                    "inline-block transform rounded-full bg-white shadow-sm transition",
                    isSmall ? "h-3.5 w-3.5" : "h-4.5 w-4.5",
                    checked
                        ? isSmall
                            ? "translate-x-4.5"
                            : "translate-x-5.5"
                        : isSmall
                          ? "translate-x-0.5"
                          : "translate-x-1",
                )}
            />
        </button>
    );
}

export default function App() {
    const [enabled, setEnabled] = useState(CLEANUP_ENABLED_DEFAULT);
    const [patternFlags, setPatternFlags] = useState<CleanupPatternFlags>(DEFAULT_CLEANUP_PATTERN_FLAGS);
    const [themeMode, setThemeMode] = useState<PopupThemeMode>(POPUP_THEME_MODE_DEFAULT);
    const [effectiveTheme, setEffectiveTheme] = useState<EffectivePopupTheme>("light");
    const [loaded, setLoaded] = useState(false);
    const [patternsCollapsed, setPatternsCollapsed] = useState(false);

    useEffect(() => {
        void (async () => {
            const [enabledValue, patternValue, themeModeValue] = await Promise.all([
                getCleanupEnabled(),
                getCleanupPatternFlags(),
                getPopupThemeMode(),
            ]);
            setEnabled(enabledValue);
            setPatternFlags(patternValue);
            setThemeMode(themeModeValue);
            setLoaded(true);
        })();
    }, []);

    useEffect(() => {
        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        setEffectiveTheme(resolveEffectiveTheme(themeMode, mediaQuery.matches));

        if (themeMode !== "system") {
            return;
        }

        const handleMediaChange = (event: MediaQueryListEvent) => {
            setEffectiveTheme(event.matches ? "dark" : "light");
        };

        mediaQuery.addEventListener("change", handleMediaChange);
        return () => {
            mediaQuery.removeEventListener("change", handleMediaChange);
        };
    }, [themeMode]);

    const handleToggle = async () => {
        const nextValue = !enabled;
        setEnabled(nextValue);
        await setCleanupEnabled(nextValue);
        await notifyActiveTab({ type: CLEANUP_TOGGLE_MESSAGE, enabled: nextValue });
    };

    const handlePatternToggle = async (key: keyof CleanupPatternFlags) => {
        const nextFlags: CleanupPatternFlags = { ...patternFlags, [key]: !patternFlags[key] };
        setPatternFlags(nextFlags);
        await setCleanupPatternFlags(nextFlags);
        await notifyActiveTab({ type: CLEANUP_PATTERNS_TOGGLE_MESSAGE, flags: nextFlags });
    };

    const handleThemeCycle = async () => {
        const currentIndex = POPUP_THEME_MODE_VALUES.indexOf(themeMode);
        const nextMode = POPUP_THEME_MODE_VALUES[(currentIndex + 1) % POPUP_THEME_MODE_VALUES.length];
        setThemeMode(nextMode);
        await setPopupThemeMode(nextMode);
    };

    const ThemeIcon = themeMode === "light" ? Sun : themeMode === "dark" ? Moon : Monitor;

    return (
        <main data-theme={effectiveTheme} className="popup-root w-110 bg-(--popup-bg) p-4 text-(--popup-text)">
            <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                    <div className="rounded-lg bg-(--popup-brand-icon-bg) p-1.5 text-(--popup-brand-icon-text)">
                        <Sparkles className="h-4.5 w-4.5" />
                    </div>
                    <div>
                        <h1 className="popup-brand-font text-lg leading-none tracking-wide text-(--popup-title)">
                            Classroom Enhancer
                        </h1>
                        <p className="mt-1 text-[11px] text-(--popup-muted)">課題タイトルの整形をカスタマイズ</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={handleThemeCycle}
                    disabled={!loaded}
                    aria-label={`テーマ切替: 現在 ${THEME_MODE_LABELS[themeMode]}`}
                    title={`テーマ: ${THEME_MODE_LABELS[themeMode]}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-(--popup-border) bg-(--popup-card-bg) text-(--popup-muted) transition hover:bg-(--popup-hover) hover:text-(--popup-text) disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <ThemeIcon className="h-4 w-4" />
                </button>
            </div>

            <div className="mt-4 rounded-2xl border border-(--popup-border) bg-(--popup-card-bg) p-3 shadow-sm">
                <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-(--popup-text)">文字クリーンアップ</p>
                    <ToggleSwitch
                        checked={enabled}
                        onClick={handleToggle}
                        disabled={!loaded}
                        ariaLabel="文字クリーンアップ"
                    />
                </div>
                <p className="mt-2 text-xs text-(--popup-muted)">
                    切り替えは開いているClassroomタブへ即時反映されます。
                </p>
            </div>

            {enabled && (
                <div className="mt-3 rounded-2xl border border-(--popup-border) bg-(--popup-subtle-bg) p-2 shadow-sm">
                    <div className="mb-2 flex items-center justify-between px-2 py-1">
                        <p className="text-xs font-medium text-(--popup-text)">個別クリーンアップ</p>
                        <button
                            type="button"
                            onClick={() => setPatternsCollapsed((prev) => !prev)}
                            className="inline-flex items-center gap-1 rounded-md border border-(--popup-button-border) bg-(--popup-button-bg) px-2 py-1 text-[11px] font-medium text-(--popup-button-text) transition hover:bg-(--popup-button-bg-hover)"
                        >
                            {patternsCollapsed ? "展開" : "折りたたむ"}
                            {patternsCollapsed ? (
                                <ChevronDown className="h-3.5 w-3.5" />
                            ) : (
                                <ChevronUp className="h-3.5 w-3.5" />
                            )}
                        </button>
                    </div>

                    {!patternsCollapsed && (
                        <ul className="grid grid-cols-2 gap-2">
                            {CLEANUP_PATTERN_KEYS.map((key) => (
                                <li
                                    key={key}
                                    className="rounded-lg border border-(--popup-border) bg-(--popup-card-bg) px-2 py-2"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="group relative min-w-0 flex-1">
                                            <div className="flex items-start gap-1">
                                                <span className="line-clamp-2 text-xs leading-tight text-(--popup-text)">
                                                    {PATTERN_LABELS[key]}
                                                </span>
                                                <CircleHelp className="h-3.5 w-3.5 shrink-0 text-(--popup-accent-soft)" />
                                            </div>
                                            <div className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden w-72 rounded-md border border-(--popup-accent-border) bg-(--popup-tooltip-bg) p-2 text-[11px] text-(--popup-text) shadow-lg group-hover:block">
                                                <p className="font-medium text-(--popup-accent)">適用イメージ</p>
                                                <p className="mt-1 wrap-break-word text-(--popup-muted)">
                                                    変換前: {PATTERN_PREVIEWS[key].before}
                                                </p>
                                                <p className="mt-1 wrap-break-word text-(--popup-text)">
                                                    変換後: {PATTERN_PREVIEWS[key].after || "(空文字)"}
                                                </p>
                                            </div>
                                        </div>
                                        <ToggleSwitch
                                            checked={patternFlags[key]}
                                            onClick={() => handlePatternToggle(key)}
                                            disabled={!loaded}
                                            ariaLabel={PATTERN_LABELS[key]}
                                            size="sm"
                                            className="ml-1 mt-0.5 shrink-0"
                                        />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </main>
    );
}
