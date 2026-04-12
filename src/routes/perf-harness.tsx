import { onMount } from 'solid-js';
import { App } from '@/ui/App';
import { generateSyntheticDoc } from '@/engine/synthetic';
import { loadSyntheticDoc } from '@/store/document';

export const PerfHarnessRoute = () => {
  onMount(() => {
    const doc = generateSyntheticDoc({
      chapterCount: 10,
      blocksPerChapter: 50,
      wordsPerBlock: 200,
      typeDistribution: { text: 0.6, dialogue: 0.25, scene: 0.1, note: 0.05 },
      seed: 42,
    });
    loadSyntheticDoc(doc);
  });

  return <App />;
};
