/**
 * Store-layer facade for the AI surface that the UI is allowed to touch.
 *
 * Per CLAUDE.md the import rule is `ui/ → store/ → ai/`. UI code must
 * not reach directly into `@/ai/*` — it goes through this module so
 * the AI internals can be reshaped without touching every component.
 *
 * Anything pure and AI-classification-adjacent (label hex / valence /
 * i18n keys) lives in `@/engine/labels`, not here, because the engine
 * layer has no AI runtime dependencies and is fine to import from UI.
 */

export {
  getAiClient,
  resetAiClient,
  scheduleAiPreload,
  backfillSentiments,
} from '@/ai';
export type {
  AiClientHandle,
  LanguageResult,
  SentimentResult,
} from '@/ai';

export {
  profile,
  setStoredProfile,
  getStoredProfile,
  detectBackend,
} from '@/ai/profile';
export type { AiBackend, AiProfile } from '@/ai/profile';

export { runConsistencyScan, isScanRunning } from '@/ai/inconsistency';
export type { ScanOptions } from '@/ai/inconsistency';
