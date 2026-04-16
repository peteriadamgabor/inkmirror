# InkMirror — Data Model & TypeScript Interfaces

> This file defines the complete data structure. Every AI agent and developer works from this.

---

## Principles

1. **Block = atomic unit.** The document consists of blocks, not continuous text.
2. **Soft-delete everywhere.** Nothing is permanently deleted — everything goes to the graveyard.
3. **Rich metadata.** Every block has a type, and the type determines the metadata.
4. **IDs are UUID v4.** Every entity has a globally unique identifier.
5. **Timestamps are ISO 8601.** All timestamps are in UTC, ISO format.

---

## Core Types

```typescript
// ============================================================
// IDENTIFIERS
// ============================================================

/** UUID v4 string */
type UUID = string;

/** ISO 8601 datetime string (UTC) */
type ISODateTime = string;

// ============================================================
// BLOCK TYPES
// ============================================================

/** The four possible block types */
type BlockType = 'text' | 'dialogue' | 'scene' | 'note';

/** Metadata for the dialogue block */
interface DialogueMetadata {
  speaker_id: UUID;        // character ID
  speaker_name: string;    // denormalized name (for fast display)
}

/** Metadata for the scene block */
interface SceneMetadata {
  location: string;
  time: string;
  character_ids: UUID[];
  mood: string;
}

/** Metadata for the note block */
interface NoteMetadata {
  color?: string;          // optional color (hex)
}

/** Union type: the block's metadata depends on the type */
type BlockMetadata =
  | { type: 'text' }
  | { type: 'dialogue'; data: DialogueMetadata }
  | { type: 'scene'; data: SceneMetadata }
  | { type: 'note'; data: NoteMetadata };

// ============================================================
// BLOCK
// ============================================================

/** A block — the atomic unit of the document */
interface Block {
  id: UUID;
  chapter_id: UUID;
  type: BlockType;
  content: string;           // the text content (plain text)
  order: number;             // order within the chapter
  metadata: BlockMetadata;
  
  // Soft-delete
  deleted_at: ISODateTime | null;
  deleted_from: {
    chapter_id: UUID;
    chapter_title: string;
    position: number;
  } | null;
  
  // Timestamps
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

// ============================================================
// CHAPTER
// ============================================================

/** A chapter — an ordered group of blocks */
interface Chapter {
  id: UUID;
  document_id: UUID;
  title: string;
  order: number;             // order within the document
  
  // Derived values (not stored, computed)
  // word_count: number;
  // block_count: number;
  
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

// ============================================================
// DOCUMENT
// ============================================================

/** A document — the top-level entity */
interface Document {
  id: UUID;
  title: string;
  author: string;
  synopsis: string;          // short summary
  
  // Settings
  settings: DocumentSettings;
  
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

interface DocumentSettings {
  font_family: string;       // editor font
  font_size: number;         // px
  line_height: number;       // e.g. 1.8
  editor_width: number;      // px, width of the editor column
  theme: 'light' | 'dark' | 'system';
  sonification_enabled: boolean;
  sonification_volume: number; // 0-1
  focus_mode: 'full' | 'focus' | 'zen';
}

// ============================================================
// CHARACTER
// ============================================================

/** A character — structured profile */
interface Character {
  id: UUID;
  document_id: UUID;
  name: string;
  aliases: string[];
  description: string;
  
  appearance: {
    physical: string;
    details: Record<string, string>;
  };
  
  traits: string[];
  
  voice: {
    speech_pattern: string;
    vocabulary_level: 'simple' | 'everyday' | 'refined' | 'slang';
    catchphrases: string[];
  };
  
  arc: {
    motivation: string;
    flaw: string;
    growth: string;
  };
  
  // Automatically maintained by AI
  appearances: CharacterAppearance[];
  
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

interface CharacterAppearance {
  chapter_id: UUID;
  block_ids: UUID[];
  first_mention_block: UUID;
  last_mention_block: UUID;
  mention_count: number;
}

// ============================================================
// CHARACTER RELATIONSHIP (Graph Edge)
// ============================================================

/** Relationship between two characters */
interface CharacterRelationship {
  id: UUID;
  from_character_id: UUID;
  to_character_id: UUID;
  type: 'friend' | 'enemy' | 'lover' | 'family' | 'colleague' | 'rival' | 'mentor' | 'other';
  description: string;
  since_chapter_id: UUID | null;
  
  created_at: ISODateTime;
  updated_at: ISODateTime;
}

// ============================================================
// WRITER PULSE (Keystroke Tracking)
// ============================================================

/** A single keystroke event (aggregated in the Web Worker) */
interface KeystrokeEvent {
  timestamp: number;         // performance.now()
  type: 'insert' | 'delete' | 'navigate' | 'pause';
  block_id: UUID;
  char_count: number;        // how many characters affected
}

/** Aggregated snapshot (per second) */
interface WriterPulseSnapshot {
  timestamp: ISODateTime;
  wpm: number;               // words per minute (average of the last 30 s)
  cpm: number;               // characters per minute
  delete_ratio: number;      // 0-1, deletion ratio vs. all keystrokes
  pause_duration_avg: number; // average pause length (ms)
  flow_score: number;        // 0-1 (high typing + low deletion + few pauses)
  active_block_id: UUID;
  session_duration: number;  // ms, since the current session started
}

/** Summary of an entire session */
interface WritingSession {
  id: UUID;
  document_id: UUID;
  started_at: ISODateTime;
  ended_at: ISODateTime;
  total_words_written: number;
  total_words_deleted: number;
  net_words: number;         // written - deleted
  avg_wpm: number;
  peak_wpm: number;
  total_pauses: number;
  longest_flow: number;      // ms, longest uninterrupted typing
  blocks_created: number;
  blocks_deleted: number;
  chapters_worked_on: UUID[];
}

// ============================================================
// STORY PULSE (AI Analysis)
// ============================================================

/** AI analysis of a block */
interface StoryPulseMetrics {
  block_id: UUID;
  tension: number;           // 0-1
  pace: number;              // 0-1 (0 = slow, 1 = fast)
  emotion_intensity: number; // 0-1
  dominant_mood: MoodType;
  avg_sentence_length: number;
  dialogue_ratio: number;    // 0-1
  analyzed_at: ISODateTime;
}

/** Mood types for the heatmap */
type MoodType =
  | 'conflict'     // red
  | 'tension'      // coral
  | 'nostalgia'    // amber
  | 'calm'         // teal
  | 'hope'         // blue
  | 'mystery'      // violet
  | 'romance'      // pink
  | 'humor'        // green
  | 'grief'        // gray
  | 'neutral';     // pale gray

/** Mood-color mapping */
const MOOD_COLORS: Record<MoodType, string> = {
  conflict:  '#E24B4A',
  tension:   '#D85A30',
  nostalgia: '#BA7517',
  calm:      '#1D9E75',
  hope:      '#378ADD',
  mystery:   '#7F77DD',
  romance:   '#D4537E',
  humor:     '#639922',
  grief:     '#888780',
  neutral:   '#B4B2A9',
};

// ============================================================
// SONIFICATION
// ============================================================

/** Parameters for the Tone.js synthesizer */
interface SonificationParams {
  base_frequency: number;     // Hz, depends on tension
  tempo: number;              // BPM, from the text's pace
  sustain: number;            // 0-1, sentence length → legato/staccato
  volume: number;             // dB
  reverb: number;             // 0-1
  filter_cutoff: number;      // Hz, emotion intensity
  oscillator_type: 'sine' | 'triangle' | 'sawtooth';
}

// ============================================================
// GHOST READER
// ============================================================

/** Ghost reader feedback for a chapter */
interface GhostReaderFeedback {
  chapter_id: UUID;
  overall_engagement: number; // 0-1
  
  annotations: GhostReaderAnnotation[];
  
  summary: string;            // 3-5 sentences from the "reader's" perspective
  analyzed_at: ISODateTime;
}

interface GhostReaderAnnotation {
  block_id: UUID;
  type: 'lost_thread' | 'surprise' | 'boredom' | 'confusion' | 'attachment';
  message: string;
  severity: number;           // 0-1
}

// ============================================================
// PRETEXT MEASUREMENT
// ============================================================

/** Input for the pretext measurer */
interface MeasureInput {
  text: string;
  font: string;              // CSS font string, e.g. "16px Georgia"
  width: number;             // available width (px)
  line_height: number;       // e.g. 1.8
}

/** Output from the pretext measurer */
interface MeasureResult {
  height: number;            // px
  line_count: number;
  line_breaks: number[];     // character indexes where line breaks occur
}

/** Block size cache — for virtualization */
interface BlockMeasurement {
  block_id: UUID;
  height: number;            // px
  measured_at: number;       // performance.now()
  content_hash: string;      // if content changed, it needs remeasuring
}

// ============================================================
// APP STATE (Solid.js Store)
// ============================================================

/** The full application state (Solid.js createStore) */
interface AppState {
  // Current document
  document: Document | null;
  chapters: Chapter[];
  blocks: Record<UUID, Block>;   // blocks indexed by ID (fast lookup)
  characters: Character[];
  
  // UI state
  ui: {
    active_chapter_id: UUID | null;
    active_block_id: UUID | null;
    sidebar_open: boolean;
    right_panel_open: boolean;
    focus_mode: 'full' | 'focus' | 'zen';
    command_palette_open: boolean;
    graveyard_open: boolean;
  };
  
  // Pulse
  writer_pulse: WriterPulseSnapshot | null;
  story_pulse: Record<UUID, StoryPulseMetrics>;
  
  // Virtualization
  measurements: Record<UUID, BlockMeasurement>;
  viewport: {
    scroll_top: number;
    visible_height: number;
    first_visible_block: number;  // index
    last_visible_block: number;
  };
}
```

---

## Relationship Diagram

```
Document 1──* Chapter 1──* Block
    │                         │
    │                         ├── DialogueMetadata ──> Character
    │                         ├── SceneMetadata ──> Character[]
    │                         └── StoryPulseMetrics
    │
    └──* Character *──* CharacterRelationship
```

---

## SurrealDB Query Examples

```sql
-- All active (non-deleted) blocks of a chapter, in order
SELECT * FROM block
  WHERE chapter = chapter:abc123
    AND deleted_at IS NONE
  ORDER BY order ASC;

-- All mentions of a character in the document
SELECT * FROM block
  WHERE document = document:xyz
    AND (metadata.data.speaker_id = character:marton
         OR character:marton IN metadata.data.character_ids)
    AND deleted_at IS NONE;

-- Relationship graph: who knows whom
SELECT *, ->knows->character AS targets
  FROM character
  WHERE document = document:xyz;

-- Graveyard: the last 20 deleted blocks
SELECT * FROM block
  WHERE deleted_at IS NOT NONE
  ORDER BY deleted_at DESC
  LIMIT 20;

-- Word count per chapter
SELECT chapter, count() AS block_count, math::sum(string::len(content)) AS char_count
  FROM block
  WHERE document = document:xyz
    AND deleted_at IS NONE
  GROUP BY chapter;
```
