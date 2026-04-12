import type { Block } from '@/types';

const TYPE_LABELS: Record<Block['type'], { label: string; className: string }> = {
  text:     { label: 'TEXT',     className: 'text-violet-500' },
  dialogue: { label: 'DIALOGUE', className: 'text-teal-600' },
  scene:    { label: 'SCENE',    className: 'text-orange-600' },
  note:     { label: 'NOTE',     className: 'text-stone-400' },
};

export const BlockView = (props: { block: Block }) => {
  const meta = () => TYPE_LABELS[props.block.type];
  return (
    <div class="py-2" data-block-id={props.block.id}>
      <div class={`text-[10px] uppercase tracking-wider font-medium mb-1 ${meta().className}`}>
        {meta().label}
      </div>
      <div class="font-serif text-base leading-[1.8] text-stone-900 dark:text-stone-100 whitespace-pre-wrap">
        {props.block.content}
      </div>
    </div>
  );
};
