import { onMount } from 'solid-js';
import { App } from '@/ui/App';
import { loadSyntheticDoc } from '@/store/document';
import type { SyntheticDoc } from '@/engine/synthetic';

function starterDoc(): SyntheticDoc {
  const now = new Date().toISOString();
  const docId = crypto.randomUUID();
  const chapterId = crypto.randomUUID();
  return {
    document: {
      id: docId,
      title: 'Untitled',
      author: '',
      synopsis: '',
      settings: {
        font_family: 'Georgia, serif',
        font_size: 16,
        line_height: 1.8,
        editor_width: 680,
        theme: 'light',
      },
      created_at: now,
      updated_at: now,
    },
    chapters: [
      {
        id: chapterId,
        document_id: docId,
        title: 'Chapter 1',
        order: 0,
        created_at: now,
        updated_at: now,
      },
    ],
    blocks: [
      {
        id: crypto.randomUUID(),
        chapter_id: chapterId,
        type: 'text',
        content: 'Start writing here. Press Enter for a new block, Backspace at the start to merge with the previous one.',
        order: 0,
        metadata: { type: 'text' },
        deleted_at: null,
        deleted_from: null,
        created_at: now,
        updated_at: now,
      },
    ],
  };
}

export const EditorRoute = () => {
  onMount(() => loadSyntheticDoc(starterDoc()));
  return <App />;
};
