import {
  toggleFocusMode,
  toggleBlockTypesHelp,
  toggleChapterTypesHelp,
  toggleHotkeysModal,
  toggleCommandPalette,
  toggleSettingsModal,
  returnToPicker,
} from '@/store/ui-state';
import { openContextMenuAt, type ContextMenuItem } from '@/ui/shared/contextMenu';
import { IconDots } from '@/ui/shared/icons';
import { openFeedback } from '@/ui/shared/feedback';
import { t } from '@/i18n';
import { SidebarChapterList } from './sidebar/SidebarChapterList';
import { SidebarCharacterList } from './sidebar/SidebarCharacterList';
import { SidebarExportMenu } from './sidebar/SidebarExportMenu';
import { useSidebarCollapse } from './sidebar/useSidebarCollapse';

export const Sidebar = () => {
  const { isCollapsed, toggleCollapse } = useSidebarCollapse();

  const openOverflow = (e: MouseEvent) => {
    const items: ContextMenuItem[] = [
      { label: t('sidebar.documents'), onSelect: returnToPicker },
      { label: t('sidebar.blockTypesHelp'), onSelect: toggleBlockTypesHelp },
      { label: t('sidebar.chapterTypesHelp'), onSelect: toggleChapterTypesHelp },
      { label: t('sidebar.hotkeys'), onSelect: toggleHotkeysModal, hint: 'F1' },
      { label: t('sidebar.settings'), onSelect: toggleSettingsModal },
      { kind: 'divider' },
      { label: t('sidebar.sendFeedback'), onSelect: openFeedback },
    ];
    openContextMenuAt(e.currentTarget as HTMLElement, items, { align: 'right' });
  };

  return (
    <div class="h-full bg-white dark:bg-stone-800 rounded-2xl border border-stone-200 dark:border-stone-700 p-4 overflow-auto flex flex-col gap-5">
      <SidebarChapterList
        collapsed={isCollapsed('chapters')}
        onToggleCollapsed={() => toggleCollapse('chapters')}
      />

      <SidebarCharacterList
        collapsed={isCollapsed('characters')}
        onToggleCollapsed={() => toggleCollapse('characters')}
      />

      <SidebarExportMenu
        collapsed={isCollapsed('export')}
        onToggleCollapsed={() => toggleCollapse('export')}
      />

      {/* --- Workspace --- Collapsed to two primary actions + overflow. */}
      <div class="mt-auto pt-3 border-t border-stone-200 dark:border-stone-700 flex items-center gap-1">
        <button
          type="button"
          onClick={toggleFocusMode}
          class="flex-1 px-2 py-1 text-xs text-stone-600 dark:text-stone-300 hover:text-violet-500 hover:bg-stone-100 dark:hover:bg-stone-700 rounded transition-colors text-left"
          title={t('sidebar.focus')}
        >
          {t('sidebar.focus')}
        </button>
        <button
          type="button"
          onClick={toggleCommandPalette}
          class="flex-1 px-2 py-1 text-xs text-stone-500 dark:text-stone-400 hover:text-violet-500 hover:bg-stone-100 dark:hover:bg-stone-700 rounded transition-colors text-left flex items-center justify-between"
          title={t('sidebar.moreTitle')}
        >
          <span>{t('sidebar.more')}</span>
          <span class="font-mono text-[10px] text-stone-400">⌘K</span>
        </button>
        <button
          type="button"
          onClick={openOverflow}
          class="w-6 h-6 rounded text-stone-400 hover:text-violet-500 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors flex items-center justify-center shrink-0"
          title={t('sidebar.overflowTitle')}
          aria-label={t('sidebar.overflowTitle')}
        >
          <IconDots size={14} />
        </button>
      </div>
    </div>
  );
};
