import { describe, expect, it, vi } from 'vitest';
import {
    BOARD_ZOOM_PERCENTAGES,
    BOARD_ZOOM_STORAGE_KEY,
    DEFAULT_BOARD_ZOOM_PERCENT,
    LEGACY_BOARD_ZOOM_STORAGE_KEY,
    loadBoardZoomPreference,
    migrateLegacyBoardZoomIndex,
    parseBoardZoomPercent,
    saveBoardZoomPreference,
    stepBoardZoom,
} from './boardZoom';

describe('board zoom preference', () => {
    it('defines the documented percentage scale and default', () => {
        expect(BOARD_ZOOM_PERCENTAGES).toEqual([
            70,
            75,
            80,
            85,
            90,
            95,
            100,
            105,
            110,
        ]);
        expect(DEFAULT_BOARD_ZOOM_PERCENT).toBe(90);
    });

    it.each(BOARD_ZOOM_PERCENTAGES)('parses supported percentage %i', (percent) => {
        expect(parseBoardZoomPercent(String(percent))).toBe(percent);
    });

    it.each([null, '', ' ', '69', '72', '111', '90.5', 'nope'])(
        'rejects invalid percentage %s',
        (raw) => {
            expect(parseBoardZoomPercent(raw)).toBeNull();
        },
    );

    it.each([
        ['0', 90],
        ['1', 95],
        ['2', 105],
        ['3', 110],
        ['4', 110],
    ] as const)('maps legacy index %s to %i%%', (raw, percent) => {
        expect(migrateLegacyBoardZoomIndex(raw)).toBe(percent);
    });

    it.each([null, '', ' ', '-1', '5', '1.5', 'nope'])(
        'rejects invalid legacy index %s',
        (raw) => {
            expect(migrateLegacyBoardZoomIndex(raw)).toBeNull();
        },
    );

    it('uses the new percentage preference before a legacy index', () => {
        const storage = {
            getItem: vi.fn((key: string) => (
                key === BOARD_ZOOM_STORAGE_KEY ? '75' : '4'
            )),
        };

        expect(loadBoardZoomPreference(storage)).toBe(75);
        expect(storage.getItem).toHaveBeenCalledOnce();
    });

    it('migrates a legacy index only when the new key is absent', () => {
        const storage = {
            getItem: vi.fn((key: string) => (
                key === BOARD_ZOOM_STORAGE_KEY ? null : '2'
            )),
        };

        expect(loadBoardZoomPreference(storage)).toBe(105);
        expect(storage.getItem).toHaveBeenNthCalledWith(1, BOARD_ZOOM_STORAGE_KEY);
        expect(storage.getItem).toHaveBeenNthCalledWith(2, LEGACY_BOARD_ZOOM_STORAGE_KEY);
    });

    it('uses the default for absent or invalid current preferences', () => {
        const absentStorage = { getItem: vi.fn(() => null) };
        const invalidStorage = { getItem: vi.fn(() => 'not-a-zoom') };

        expect(loadBoardZoomPreference(absentStorage)).toBe(90);
        expect(loadBoardZoomPreference(invalidStorage)).toBe(90);
    });

    it('falls back safely when preference reads fail', () => {
        const storage = {
            getItem: vi.fn(() => {
                throw new Error('storage blocked');
            }),
        };

        expect(loadBoardZoomPreference(storage)).toBe(90);
    });

    it('writes only the new percentage key and reports storage failures', () => {
        const setItem = vi.fn();

        expect(saveBoardZoomPreference(85, { setItem })).toBe(true);
        expect(setItem).toHaveBeenCalledWith(BOARD_ZOOM_STORAGE_KEY, '85');

        expect(saveBoardZoomPreference(85, {
            setItem: () => {
                throw new Error('storage blocked');
            },
        })).toBe(false);
    });

    it('steps through the scale and stays within the endpoints', () => {
        expect(stepBoardZoom(70, -1)).toBe(70);
        expect(stepBoardZoom(70, 1)).toBe(75);
        expect(stepBoardZoom(90, -1)).toBe(85);
        expect(stepBoardZoom(90, 1)).toBe(95);
        expect(stepBoardZoom(110, -1)).toBe(105);
        expect(stepBoardZoom(110, 1)).toBe(110);
    });
});
