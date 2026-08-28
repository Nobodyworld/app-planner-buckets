import type { PlannerData } from '../types';
import { createId, loadPlannerData, savePlannerData } from '../storage/plannerStorage';
import {
    forwardPlannerSaveToRuntime,
    getPlannerStorageRuntimeBootstrap,
} from '../storage/plannerStorageBridge';
import type { BucketV2, PlannerDataV2 } from '../types/v2';
import { createInitialPlannerDataV2 } from '../types/v2';
import { migrateV1toV2 } from '../types/migration';
import { isValidPlannerDataV1, isValidPlannerDataV2, validatePlannerDataV2Integrity } from '../types/validators';

export const PLANNER_STORAGE_KEY_V1 = 'planner-buckets:data:v1';
export const PLANNER_STORAGE_KEY_V2 = 'planner-buckets:data:v2';
export const PLANNER_STORAGE_KEY_V2_RECOVERY = 'planner-buckets:data:v2:recovery';

export type PlannerDataV2LoadSource = 'v2' | 'migrated-v1' | 'new';

export interface PlannerDataV2LoadResult {
    data: PlannerDataV2;
    source: PlannerDataV2LoadSource;
    warning: string | null;
}

const parseStoredJson = (raw: string): unknown => JSON.parse(raw);

const createInvalidStorageWarning = (versionLabel: string, recoveryKey: string | null = null): string => {
    if (recoveryKey) {
        return `Stored ${versionLabel} planner data could not be loaded. The exact raw value was preserved at ${recoveryKey}; recovery used the next available fallback.`;
    }

    return `Stored ${versionLabel} planner data could not be loaded. Recovery used the next available fallback.`;
};

const getAvailableRecoveryKey = (): string => {
    if (localStorage.getItem(PLANNER_STORAGE_KEY_V2_RECOVERY) === null) {
        return PLANNER_STORAGE_KEY_V2_RECOVERY;
    }

    let counter = 2;
    while (localStorage.getItem(`${PLANNER_STORAGE_KEY_V2_RECOVERY}:${counter}`) !== null) {
        counter += 1;
    }

    return `${PLANNER_STORAGE_KEY_V2_RECOVERY}:${counter}`;
};

export const preserveMalformedV2ForRecovery = (raw: string): string => {
    const recoveryKey = getAvailableRecoveryKey();
    localStorage.setItem(recoveryKey, raw);
    return recoveryKey;
};

const createUniqueRuntimeId = (existingIds: Set<string>, createUniqueId: () => string): string => {
    let id = createUniqueId();
    while (existingIds.has(id)) {
        id = createUniqueId();
    }
    existingIds.add(id);
    return id;
};

export const createRuntimeInitialPlannerDataV2 = (
    createTimestamp: () => string = () => new Date().toISOString(),
    createUniqueId: () => string = createId,
): PlannerDataV2 => {
    const timestamp = createTimestamp();
    const data = createInitialPlannerDataV2(timestamp);
    const existingIds = new Set<string>(data.projects.map((project) => project.id));
    const createBucket = (name: string, pinned: boolean): BucketV2 => ({
        id: createUniqueRuntimeId(existingIds, createUniqueId),
        projectId: data.projects[0].id,
        name,
        description: '',
        templateDefinitionId: null,
        priority: 0,
        pinned,
        createdAt: timestamp,
        updatedAt: timestamp,
    });

    return {
        ...data,
        buckets: [
            createBucket('To Do', true),
            createBucket('In Progress', false),
        ],
    };
};

/**
 * Browser adapter: Load planner data from localStorage.
 * Intentional side effect: reads from browser storage.
 * Returns data from storage, or creates initial data if not found.
 * @throws if storage access fails
 */
export const loadFromLocalStorage = (): PlannerData => {
    return loadPlannerData();
};

/**
 * Browser adapter: Save planner data to localStorage.
 * Intentional side effect: writes to browser storage.
 * @throws if write fails
 */
export const saveToLocalStorage = (data: PlannerData): void => {
    savePlannerData(data);
};

/**
 * Browser adapter: Load v2 planner data from localStorage.
 *
 * Loading order:
 * 1. Runtime bootstrap supplied before React mounts (desktop or browser startup)
 * 2. Valid v2 data from the v2 key
 * 3. Valid v1 data from the v1 key, migrated deterministically and saved to v2
 * 4. New v2 data using a runtime timestamp
 *
 * The v1 key is never deleted or overwritten here.
 */
export const loadPlannerDataV2FromLocalStorage = (
    createTimestamp: () => string = () => new Date().toISOString(),
): PlannerDataV2LoadResult => {
    const runtimeBootstrap = getPlannerStorageRuntimeBootstrap();
    if (runtimeBootstrap) {
        return {
            data: runtimeBootstrap.data,
            source: 'v2',
            warning: runtimeBootstrap.warning,
        };
    }

    let warning: string | null = null;
    const rawV2 = localStorage.getItem(PLANNER_STORAGE_KEY_V2);

    if (rawV2) {
        try {
            const parsedV2 = parseStoredJson(rawV2);
            if (isValidPlannerDataV2(parsedV2)) {
                return { data: parsedV2 as PlannerDataV2, source: 'v2', warning: null };
            }
            const recoveryKey = preserveMalformedV2ForRecovery(rawV2);
            warning = createInvalidStorageWarning('v2', recoveryKey);
        } catch {
            const recoveryKey = preserveMalformedV2ForRecovery(rawV2);
            warning = createInvalidStorageWarning('v2', recoveryKey);
        }
    }

    const rawV1 = localStorage.getItem(PLANNER_STORAGE_KEY_V1);
    if (rawV1) {
        try {
            const parsedV1 = parseStoredJson(rawV1);
            if (isValidPlannerDataV1(parsedV1)) {
                const migrated = migrateV1toV2(parsedV1);
                validatePlannerDataV2Integrity(migrated);
                savePlannerDataV2ToLocalStorage(migrated);
                return { data: migrated, source: 'migrated-v1', warning };
            }
            warning = warning ?? createInvalidStorageWarning('v1');
        } catch {
            warning = warning ?? createInvalidStorageWarning('v1');
        }
    }

    const data = createRuntimeInitialPlannerDataV2(createTimestamp);
    validatePlannerDataV2Integrity(data);
    return { data, source: 'new', warning };
};

/**
 * Save validated v2 planner data through the active runtime.
 *
 * Browser mode writes the established localStorage key. Desktop mode forwards
 * to the durable file adapter and deliberately leaves legacy WebView storage
 * unchanged after one-time migration.
 */
export const savePlannerDataV2ToLocalStorage = (data: PlannerDataV2): void => {
    if (!isValidPlannerDataV2(data)) {
        throw new Error('Cannot save invalid v2 planner data');
    }
    if (forwardPlannerSaveToRuntime(data)) {
        return;
    }
    localStorage.setItem(PLANNER_STORAGE_KEY_V2, JSON.stringify(data));
};
