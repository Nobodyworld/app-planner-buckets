export const BOARD_ZOOM_PERCENTAGES = [
    70,
    75,
    80,
    85,
    90,
    95,
    100,
    105,
    110,
] as const;

export type BoardZoomPercent = (typeof BOARD_ZOOM_PERCENTAGES)[number];

export const DEFAULT_BOARD_ZOOM_PERCENT: BoardZoomPercent = 90;
export const BOARD_ZOOM_STORAGE_KEY = 'planner-buckets:board-zoom-percent';
export const LEGACY_BOARD_ZOOM_STORAGE_KEY = 'planner-buckets:board-zoom-index';

const LEGACY_BOARD_ZOOM_PERCENTAGES = [
    90,
    95,
    105,
    110,
    110,
] as const satisfies readonly BoardZoomPercent[];

type BoardZoomReader = Pick<Storage, 'getItem'>;
type BoardZoomWriter = Pick<Storage, 'setItem'>;

const parseStoredInteger = (raw: string | null): number | null => {
    if (raw === null || raw.trim() === '') return null;
    const value = Number(raw);
    return Number.isInteger(value) ? value : null;
};

export const isBoardZoomPercent = (value: number): value is BoardZoomPercent => (
    BOARD_ZOOM_PERCENTAGES.includes(value as BoardZoomPercent)
);

export const parseBoardZoomPercent = (raw: string | null): BoardZoomPercent | null => {
    const value = parseStoredInteger(raw);
    return value !== null && isBoardZoomPercent(value) ? value : null;
};

export const migrateLegacyBoardZoomIndex = (raw: string | null): BoardZoomPercent | null => {
    const index = parseStoredInteger(raw);
    if (index === null || index < 0 || index >= LEGACY_BOARD_ZOOM_PERCENTAGES.length) {
        return null;
    }
    return LEGACY_BOARD_ZOOM_PERCENTAGES[index];
};

export const loadBoardZoomPreference = (
    storage: BoardZoomReader = localStorage,
): BoardZoomPercent => {
    try {
        const storedPercent = storage.getItem(BOARD_ZOOM_STORAGE_KEY);
        if (storedPercent !== null) {
            return parseBoardZoomPercent(storedPercent) ?? DEFAULT_BOARD_ZOOM_PERCENT;
        }

        return migrateLegacyBoardZoomIndex(
            storage.getItem(LEGACY_BOARD_ZOOM_STORAGE_KEY),
        ) ?? DEFAULT_BOARD_ZOOM_PERCENT;
    } catch {
        return DEFAULT_BOARD_ZOOM_PERCENT;
    }
};

export const saveBoardZoomPreference = (
    percent: BoardZoomPercent,
    storage: BoardZoomWriter = localStorage,
): boolean => {
    try {
        storage.setItem(BOARD_ZOOM_STORAGE_KEY, String(percent));
        return true;
    } catch {
        return false;
    }
};

export const stepBoardZoom = (
    current: BoardZoomPercent,
    direction: -1 | 1,
): BoardZoomPercent => {
    const currentIndex = BOARD_ZOOM_PERCENTAGES.indexOf(current);
    const nextIndex = Math.max(
        0,
        Math.min(BOARD_ZOOM_PERCENTAGES.length - 1, currentIndex + direction),
    );
    return BOARD_ZOOM_PERCENTAGES[nextIndex];
};
