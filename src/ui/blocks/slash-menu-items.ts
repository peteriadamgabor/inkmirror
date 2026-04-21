import type { BlockType } from '@/types';
import { t } from '@/i18n';

export interface SlashMenuItem {
  type: BlockType;
  label: string;
  hint: string;
}

const ORDER: BlockType[] = ['text', 'dialogue', 'scene', 'note'];

export function slashMenuItems(): SlashMenuItem[] {
  return ORDER.map((type) => ({
    type,
    label: t(`block.types.${type}`),
    hint: t(`block.hints.${type}`),
  }));
}

/**
 * Prefix filter, case-insensitive. Matches either the translated label
 * (e.g. "di" → Dialogue) or the raw type key (same in every language),
 * so keyboard muscle memory survives a language switch.
 */
export function filterSlashItems(
  items: SlashMenuItem[],
  filter: string,
): SlashMenuItem[] {
  if (!filter) return items;
  const f = filter.toLowerCase();
  return items.filter(
    (i) => i.label.toLowerCase().startsWith(f) || i.type.startsWith(f),
  );
}
