import { createSignal } from 'solid-js';

/**
 * Per-section collapse state for the sidebar (chapters / characters /
 * export), persisted to localStorage so the user's chrome preference
 * survives reloads. Each `key` is an arbitrary section identifier; the
 * map of `{ section → collapsed }` is serialized as one JSON blob.
 */

const COLLAPSE_KEY = 'inkmirror.sidebar.collapsed';

function loadCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSE_KEY) || '{}');
  } catch {
    return {};
  }
}

export interface SidebarCollapseHandle {
  isCollapsed: (key: string) => boolean;
  toggleCollapse: (key: string) => void;
}

export function useSidebarCollapse(): SidebarCollapseHandle {
  const [collapsed, setCollapsed] = createSignal<Record<string, boolean>>(loadCollapsed());

  const isCollapsed = (key: string) => collapsed()[key] ?? false;

  const toggleCollapse = (key: string) => {
    const next = { ...collapsed(), [key]: !isCollapsed(key) };
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSE_KEY, JSON.stringify(next));
    } catch {
      /* localStorage may be quota-exhausted in private mode; chrome state is non-critical. */
    }
  };

  return { isCollapsed, toggleCollapse };
}
