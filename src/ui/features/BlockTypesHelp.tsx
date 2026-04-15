import { For, Show } from 'solid-js';
import { uiState, setBlockTypesHelpOpen } from '@/store/ui-state';

interface TypeDoc {
  name: string;
  accent: string;
  icon: string;
  tagline: string;
  useFor: string[];
  notes: string[];
}

const DOCS: TypeDoc[] = [
  {
    name: 'Text',
    accent: 'text-violet-500 border-violet-500/30',
    icon: '¶',
    tagline: 'Plain prose. The default block.',
    useFor: [
      'Narration and description',
      'Exposition, action beats, interior monologue',
      'Anything that isn\'t dialogue or a scene header',
    ],
    notes: [
      'Exported as paragraphs in every format.',
      'Counted in the word count.',
      'Runs through sentiment analysis and feeds the Story Pulse ECG and document mood heatmap.',
    ],
  },
  {
    name: 'Dialogue',
    accent: 'text-teal-600 border-teal-500/30',
    icon: '“”',
    tagline: 'Character speech, rendered as a chat bubble.',
    useFor: [
      'Anything a character says out loud',
      'Interleaved turns in a conversation — press Enter to start the next speaker\'s line',
    ],
    notes: [
      'Click the speaker chip in the block header to pick a character, or type "Name: Hello" and the prefix auto-strips + assigns.',
      'When the block sits after a Scene with a defined cast, the picker lists that cast first.',
      'Each speaker has their own color — the bubble background and left border come from the character card.',
      'Rename a character and every dialogue block they own updates automatically. Delete them and their blocks become "unassigned" without losing the text.',
      'Exported with speaker name in Markdown, DOCX, EPUB; uppercase speaker cue in Fountain.',
    ],
  },
  {
    name: 'Scene',
    accent: 'text-orange-600 border-orange-500/30',
    icon: '◇',
    tagline: 'Structural marker with location, time, mood, and cast.',
    useFor: [
      'Starting a new scene in your story',
      'Tagging which characters are present — downstream dialogue blocks narrow their speaker picker to this cast',
      'Marking time of day or emotional register for the Plot Timeline',
    ],
    notes: [
      'The inline metadata editor below the block header lets you fill in location / time / mood and toggle the cast chips.',
      'Feeds the Plot Timeline view (sidebar → Plot timeline) — every scene shows up chronologically grouped by chapter.',
      'The cast selection is what makes the Dialogue speaker picker show "Speaker (scene cast)" — put scenes *above* your dialogue for the shortcut to work.',
      'Exported with an italic heading in Markdown/DOCX/EPUB and a full INT./EXT. line in Fountain.',
    ],
  },
  {
    name: 'Note',
    accent: 'text-stone-400 border-stone-400/30',
    icon: '★',
    tagline: 'Private author notes. Not exported.',
    useFor: [
      'TODO reminders ("fix timeline here")',
      'Research snippets or URL stubs',
      'Questions to yourself',
      'Anything you\'d want pinned in the draft but NOT in the finished book',
    ],
    notes: [
      'Never included in any export — EPUB, DOCX, PDF, Markdown, JSON, Fountain all skip note blocks.',
      'Not counted in the word count.',
      'Not analyzed for sentiment or character mentions.',
      'For your eyes only.',
    ],
  },
];

export const BlockTypesHelp = () => (
  <Show when={uiState.blockTypesHelpOpen}>
    <div
      class="fixed inset-0 z-40 flex items-center justify-center bg-stone-900/40 backdrop-blur-sm"
      onClick={() => setBlockTypesHelpOpen(false)}
    >
      <div
        class="w-[640px] max-w-[92vw] max-h-[85vh] bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div class="flex items-center justify-between px-5 py-3 border-b border-stone-200 dark:border-stone-700">
          <div>
            <div class="text-[10px] uppercase tracking-wider text-stone-400">Help</div>
            <div class="font-serif text-lg text-stone-800 dark:text-stone-100">
              Block types
            </div>
          </div>
          <button
            type="button"
            onClick={() => setBlockTypesHelpOpen(false)}
            class="w-7 h-7 rounded text-stone-400 hover:text-stone-800 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
            aria-label="Close help"
          >
            ×
          </button>
        </div>

        <div class="flex-1 overflow-auto px-5 py-4 flex flex-col gap-5">
          <div class="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
            StoryForge is a block-based editor. Every block has a type that
            tells the app what to do with it — how to render it, whether to
            count its words, whether to include it in exports. Change a
            block's type any time from its <code class="font-mono text-[11px] px-1 rounded bg-stone-100 dark:bg-stone-700">⋯</code>{' '}
            menu.
          </div>

          <For each={DOCS}>
            {(doc) => (
              <div class={`rounded-xl border p-4 ${doc.accent}`}>
                <div class="flex items-baseline gap-3 mb-2">
                  <span class="font-serif text-2xl">{doc.icon}</span>
                  <div>
                    <div class="text-[10px] uppercase tracking-wider font-medium">
                      {doc.name}
                    </div>
                    <div class="font-serif text-base text-stone-800 dark:text-stone-100">
                      {doc.tagline}
                    </div>
                  </div>
                </div>
                <div class="mt-3">
                  <div class="text-[10px] uppercase tracking-wider text-stone-400 mb-1">
                    Use it for
                  </div>
                  <ul class="text-xs text-stone-700 dark:text-stone-300 list-disc pl-5 space-y-0.5">
                    <For each={doc.useFor}>{(s) => <li>{s}</li>}</For>
                  </ul>
                </div>
                <div class="mt-3">
                  <div class="text-[10px] uppercase tracking-wider text-stone-400 mb-1">
                    How it behaves
                  </div>
                  <ul class="text-xs text-stone-600 dark:text-stone-400 list-disc pl-5 space-y-0.5">
                    <For each={doc.notes}>{(s) => <li>{s}</li>}</For>
                  </ul>
                </div>
              </div>
            )}
          </For>

          <div class="text-[11px] text-stone-400 italic text-center pt-1">
            Tip: you can convert between types at any time without losing content.
          </div>
        </div>
      </div>
    </div>
  </Show>
);
