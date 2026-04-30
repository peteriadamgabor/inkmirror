// src/sync/index.ts
//
// Public API surface for the sync feature. ui/ and store/ MUST go through
// this barrel — they MUST NOT import from engine.ts, client.ts, etc. directly
// (per the layering rule in CLAUDE.md).

export {
  SYNC_FEATURE,
  startSync,
  stopSync,
  syncNow,
  markDirty,
  resolveConflict,
} from './engine-bootstrap';

export type { StartSyncOptions } from './engine-bootstrap';

export { initCircle, issuePaircode, redeemPaircode, destroyCircle } from './pairing';
export type {
  InitCircleArgs,
  IssuePaircodeArgs,
  RedeemPaircodeArgs,
  DestroyCircleArgs,
  DestroyCircleResult,
} from './pairing';

export { forceClearLocally } from './pending-deletion';

export { circleStatus, docStatusFor } from './state';
export type { CircleStatus, DocSyncStatus } from './state';

export type { ConflictResolution } from './engine';

export { SyncHttpError } from './client';
