/**
 * Inconsistency-flag CRUD — the AI consistency-scan results that surface
 * in the right panel. Status transitions (open → dismissed) live here
 * because dismissal also stamps a timestamp on the row.
 */

import type { InconsistencyFlag, InconsistencyStatus, UUID } from '@/types';
import { db } from './_repo-internal';
import { logDbError } from './errors';

export async function saveInconsistencyFlag(flag: InconsistencyFlag): Promise<void> {
  try {
    const d = await db();
    await d.inconsistencies.put(flag);
  } catch (err) {
    logDbError('repository.saveInconsistencyFlag', err);
    throw err;
  }
}

export async function loadInconsistencyFlagsByDocument(
  documentId: UUID,
): Promise<InconsistencyFlag[]> {
  try {
    const d = await db();
    return await d.inconsistencies.getAllByDocument(documentId);
  } catch (err) {
    logDbError('repository.loadInconsistencyFlagsByDocument', err);
    throw err;
  }
}

export async function loadInconsistencyFlagsByCharacter(
  characterId: UUID,
): Promise<InconsistencyFlag[]> {
  try {
    const d = await db();
    return await d.inconsistencies.getAllByCharacter(characterId);
  } catch (err) {
    logDbError('repository.loadInconsistencyFlagsByCharacter', err);
    throw err;
  }
}

export async function loadInconsistencyFlagsByBlock(
  blockId: UUID,
): Promise<InconsistencyFlag[]> {
  try {
    const d = await db();
    return await d.inconsistencies.getAllByBlock(blockId);
  } catch (err) {
    logDbError('repository.loadInconsistencyFlagsByBlock', err);
    throw err;
  }
}

export async function deleteInconsistencyFlag(id: string): Promise<void> {
  try {
    const d = await db();
    await d.inconsistencies.delete(id);
  } catch (err) {
    logDbError('repository.deleteInconsistencyFlag', err);
    throw err;
  }
}

export async function setInconsistencyFlagStatus(
  id: string,
  status: InconsistencyStatus,
): Promise<void> {
  try {
    const d = await db();
    const existing = await d.inconsistencies.get(id);
    if (!existing) return;
    existing.status = status;
    existing.dismissed_at = status === 'dismissed' ? Date.now() : null;
    await d.inconsistencies.put(existing);
  } catch (err) {
    logDbError('repository.setInconsistencyFlagStatus', err);
    throw err;
  }
}
