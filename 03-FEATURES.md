# InkMirror — Features

> Every feature starts from a single question: "What does a novelist need that no one has given them yet?"

---

## Feature Map

```
CORE FEATURES (Phase 1-2)
├── Block-based editor
│   ├── text (prose/plot)
│   ├── dialogue
│   ├── scene (scene metadata)
│   └── note (writer's comment)
├── Chapter navigation (sidebar)
├── Drag-and-drop block reordering
├── Focus mode
└── Dead Text Graveyard (soft-delete system)

ANALYTICS (Phase 2-3)
├── Dual Pulse System
│   ├── Writer's pulse (typing metrics)
│   └── Story's pulse (text analysis)
├── Mood heatmap
└── Text sonification (Tone.js)

AI FEATURES (Phase 3-4)
├── Character card system + relationship graph
├── Inconsistency detection
├── Ghost reader (reader experience simulation)
├── Character simulator ("What if...")
└── Plot timeline

EXPORT & SAAS (Phase 4+)
├── Export: EPUB, DOCX, PDF, Fountain
├── Authentication (Clerk / Auth.js)
├── Device sync (SurrealDB Cloud)
└── Stripe subscription
```

---

## 1. Block-Based Editor

### Description
The document consists of `Block`s, not continuous text. Every block is a standalone unit with a type, content, and metadata.

### Block types

**Text**
- Purpose: descriptive prose, plot, inner monologue
- Appearance: serif font, normal typesetting
- Label color: violet (`violet-500`)
- No extra metadata

**Dialogue**
- Purpose: speech between characters
- Appearance: `speaker` name at the top of the block, em dash prefix
- Label color: teal (`teal-600`)
- Metadata: `speaker` (character ID reference)
- The AI knows which character is speaking based on `speaker`

**Scene**
- Purpose: scene opener that provides visual and contextual framing
- Appearance: italic, faded text, visually separated
- Label color: coral (`orange-600`)
- Metadata:
  - `location: string` — location
  - `time: string` — time (free text: "early morning", "summer of 1987")
  - `characters: string[]` — present character IDs
  - `mood: string` — dominant mood

**Note**
- Purpose: the writer's own comments (not included in export)
- Appearance: yellowish background, smaller font
- Label color: gray (`stone-400`)
- Metadata: `color` (optional, the note's color)

### Block operations
- Insert new block (Enter → type selector)
- Change block type (from the floating toolbar)
- Delete block (→ goes to the graveyard)
- Move block (drag-and-drop)
- Merge / split blocks

### Keyboard shortcuts
```
Enter          → New block (default: text)
Shift+Enter    → Line break within the block
Ctrl/Cmd+D     → Duplicate the block
Ctrl/Cmd+Del   → Delete the block (to graveyard)
Ctrl/Cmd+↑/↓   → Move block up/down
/              → Command palette (change block type)
Ctrl/Cmd+K     → AI command palette
```

---

## 2. Dead Text Graveyard

### Concept
Every deleted paragraph, abandoned chapter, and written-out character does not vanish — it goes into a visual "graveyard". The graveyard is a complete creative journal of what you sacrificed for your novel.

### How it works
- Deletion is soft-delete: the block gets a `deleted_at` field but stays in the database
- The graveyard is a separate view (floating island) that shows all deleted blocks
- Every "tombstone" shows:
  - The deleted text (or the beginning of it)
  - Where it was deleted from (chapter, position)
  - When it was deleted
  - The block's type
- The user can "resurrect" the block (restoring it to its original position or to the current cursor position)

### AI integration
The AI watches the graveyard and warns:
- "You wrote Béla out 3 weeks ago, but you still reference him in chapter 7."
- "This deleted paragraph resembles what you're writing now — intentional?"
- "There are 12,000 words in the graveyard — more than chapter 3. Worth reviewing."

### Data structure
```typescript
interface DeletedBlock extends Block {
  deleted_at: Date;
  deleted_from: {
    chapter_id: string;
    position: number;       // which block number it was
    chapter_title: string;  // context for display
  };
}
```

---

## 3. Dual Pulse System

### Philosophy
"Two hearts, one soul." The app measures two independent but connected metrics: the writer's human rhythm and the text's literary rhythm.

### 3a. Writer Pulse

**What it measures:**
- Typing speed (characters/minute, words/minute)
- Deletion ratio (how many characters deleted vs. written)
- Thinking pauses (>5 seconds of inactivity)
- Session length and intensity
- Flow state detection (sustained, high-intensity typing with minimal deletion)

**How it collects data:**
```typescript
interface KeystrokeEvent {
  timestamp: number;
  type: 'insert' | 'delete' | 'navigate' | 'pause';
  block_id: string;
  char_count: number;
}

// The Web Worker aggregates in the background:
interface WriterPulseSnapshot {
  timestamp: number;
  wpm: number;              // words per minute
  delete_ratio: number;     // 0-1, how much is deletion
  pause_duration: number;   // average pause (ms)
  flow_score: number;       // 0-1, how much in flow
  session_duration: number; // session time so far (ms)
}
```

**Visualization:**
- ECG-like line at the bottom of the editor (real-time)
- Session summary at the end of work
- Long-term patterns ("You are 3× more productive on Tuesday evenings")

### 3b. Story Pulse

**What it analyzes (with AI):**
- Sentence length variation (short sentences = fast pacing, long = slow)
- Tension level (conflict words, exclamations, shortening sentences)
- Emotional tone (sentiment analysis per block)
- Dialogue/description ratio
- Character-presence intensity

**How it works:**
```typescript
interface StoryPulseMetrics {
  block_id: string;
  tension: number;          // 0-1
  pace: number;             // 0-1 (0 = slow, 1 = fast)
  emotion: number;          // 0-1 (intensity)
  dominant_mood: string;    // e.g. "tense", "nostalgic"
  avg_sentence_length: number;
  dialogue_ratio: number;   // 0-1, how much is dialogue
}
```

**Visualization:**
- ECG-like line on the editor's right panel
- Mood heatmap: the whole novel from a bird's-eye view

### 3c. Mood Heatmap

The entire novel as a single visual strip. Each column is a scene, the color is the dominant mood, the height is the intensity.

**Mood-color map:**
```
conflict    → red      (#E24B4A)
tension     → coral    (#D85A30)
nostalgia   → amber    (#BA7517)
calm        → teal     (#1D9E75)
hope        → blue     (#378ADD)
mystery     → violet   (#7F77DD)
romance     → pink     (#D4537E)
```

**Zoom levels:**
- Chapter view: each column is a chapter
- Scene view: each column is a scene
- Page view: each column is ~250 words

### 3d. Connecting the two pulses

The real value is when you overlay the two pulses:
- "You wrote this part slowly, with many deletions, but the text pulse shows high intensity" → **The struggle was worth it**
- "You wrote this fast, in flow, but the text pulse is flat" → **It might have come too easily — worth rereading**
- "You wrote this scene after a long break, and the tension builds perfectly" → **The thinking paid off**

---

## 4. Text Sonification

### Concept
Every sentence has rhythm. The app generates ambient sound in real time from the writing's rhythm and the text's emotional tone. Essentially synesthesia for writing.

### How it works
1. The Transformers.js sentiment engine analyzes the current block
2. From sentence lengths and writing tempo, rhythmic parameters are generated
3. Tone.js synthesizers produce sound in real time

### Sound parameter map

| Text property | Sound parameter |
|---------------|-----------------|
| Sentence length | Note sustain (legato vs. staccato) |
| Tension | Base pitch (low = tense) |
| Pace | Rhythm speed |
| Emotion intensity | Volume and enrichment |
| Dialogue | Rhythmic clicking / percussion |
| Descriptive passage | Pad / sustain sounds |

### Examples
- **Tense scene:** Deep drone, slowly pulsing, dissonant harmonics
- **Fast dialogue:** Rhythmic, light, snappy sounds, like a typewriter
- **Nostalgic description:** Warm, slow pad, with high-frequency overtones
- **Climax:** Growing intensity, more layers, rising volume

### User controls
- Toggle on/off (off by default)
- Volume control
- "Ambient type" selector: minimal, atmospheric, rhythmic

---

## 5. Character Card System

### Description
Every character is a structured data sheet that the AI automatically maintains and indexes.

### Character data model
```typescript
interface Character {
  id: string;
  name: string;
  aliases: string[];           // nicknames, aliases
  description: string;
  
  appearance: {
    physical: string;          // free-text physical description
    details: Record<string, string>; // e.g. { eye_color: "brown", hair: "short" }
  };
  
  traits: string[];            // personality traits
  
  voice: {
    speech_pattern: string;    // how they speak (concise, in long sentences...)
    vocabulary_level: string;  // vocabulary level
    catchphrases: string[];    // characteristic turns of phrase
  };
  
  arc: {
    motivation: string;        // what they want
    flaw: string;              // what their weakness is
    growth: string;            // how they grow
  };
  
  appearances: {               // auto-filled by AI
    chapter_id: string;
    block_ids: string[];
    first_mention: string;     // block ID
    last_mention: string;
  }[];
  
  relationships: {
    character_id: string;
    type: string;              // "friend", "enemy", "lover", "relative"
    description: string;
    since_chapter: string;
  }[];
}
```

### AI functions for characters
- **Auto-detection:** The AI recognizes new character names in the text
- **Scene indexing:** Automatically tracks who is present in which scene
- **Inconsistency warning:** "Réka has brown eyes in chapter 1, green in chapter 7"
- **Relationship graph visualization:** Graph view of relationships between characters

---

## 6. Ghost Reader (Invisible First Reader)

### Concept
The AI simulates a reader who is reading your novel for the first time. It's not editorial feedback — it's a reader-experience simulation.

### Feedback types
- **Lost thread:** "Réka hasn't appeared for 12 pages here, I may have forgotten who she is"
- **Surprise:** "This twist was unexpected — there's no hint of it in chapter 3"
- **Boredom:** "This descriptive part is 3 pages long — the reader's patience may run out here"
- **Confusion:** "It's unclear who is speaking in this dialogue"
- **Attachment:** "The emotional weight is noticeably strong in this scene"

### Visualization
- Attention heatmap: projected across the whole novel, where attention is held or lost
- End-of-chapter summary: 3-5 sentences from the "reader's" perspective

---

## 7. Character Simulator ("What if...")

### Concept
You mark a character, give them a situation, and the local AI — based on their character card and past dialogue — generates 3 possible reactions.

### Usage
```
User: "Márton finds out that Réka lied"

AI (in Márton's voice, based on his past patterns):

1. ANGRY REACTION:
   — So that was the truth. And I, like a fool...
   
2. RESTRAINED REACTION:
   — You know... I suspected. I just thought if I didn't ask, maybe it wouldn't be true.
   
3. SURPRISING REACTION:
   — Réka, everyone lies. The question is why are you telling me now.
```

### Technical implementation
Few-shot prompting from the character's past dialogue. The local AI model is given:
1. The character profile (traits, voice, arc)
2. Their last 5-10 dialogues (as samples)
3. The new situation

---

## 8. Plot Timeline

### Description
A visual timeline view of the scenes. It is drawn based on the metadata of scene blocks (`scene`).

### Features
- Horizontal timeline of scenes from chapters
- Parallel threads (if multiple storylines run at once)
- Drag-and-drop: drag the event to another position → the app reorders the chapters
- Character filter: show only scenes where Márton is present

---

## 9. Focus Mode

### Description
With a single keystroke, everything disappears — only the text remains. The floating island style animates naturally: the floating panels "sink" into the background one by one.

### Levels
1. **Full view:** Sidebar + editor + right panel
2. **Focus:** Just the editor (sidebar and panel disappear)
3. **Zen mode:** Just the current block, everything else fades out

### Keyboard shortcut
```
Ctrl/Cmd+\  → Toggle focus mode
Ctrl/Cmd+Shift+\  → Zen mode
Esc  → Back to full view
```

---

## 10. Export

### Supported formats

| Format | Usage | Note |
|--------|-------|------|
| EPUB | E-book, self-publishing | Standard EPUB3 |
| DOCX | Sending to publisher | Standard manuscript format |
| PDF | Print, final | Custom typography |
| Fountain | Screenplay | Industry standard |
| Markdown | Version control, backup | Simple, portable |
| JSON | Full export | App's internal format, including metadata |

### Export rules
- `note` type blocks are **not** included in export
- `scene` blocks follow the conventions of the given format
- Character data is optionally exportable (attachment / appendix)
- Graveyard contents are NOT exported (unless the user explicitly requests it)

---

## Pricing Model (SaaS phase)

| Tier | Price | Contents |
|------|-------|----------|
| Free | €0 | Full offline app, local AI, unlimited documents |
| Pro | ~€8/month | Device sync, E2E backup, stronger AI models (API) |
| Team | ~€15/month/user | Shared project, comments, beta-reader invitation |
