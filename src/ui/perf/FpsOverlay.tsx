import { createSignal, onCleanup, onMount } from 'solid-js';

export const FpsOverlay = () => {
  const [fps, setFps] = createSignal(0);

  onMount(() => {
    let frames: number[] = [];
    let rafId = 0;

    const tick = (now: number) => {
      frames.push(now);
      // Keep only frames from the last second.
      const cutoff = now - 1000;
      while (frames.length > 0 && frames[0] < cutoff) frames.shift();
      setFps(frames.length);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    onCleanup(() => cancelAnimationFrame(rafId));
  });

  return (
    <div class="fixed bottom-4 right-4 px-2 py-1 rounded-lg bg-stone-900/80 text-stone-100 text-xs font-mono pointer-events-none">
      {fps()} fps
    </div>
  );
};
