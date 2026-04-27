import { lang } from './index';

/**
 * Per-locale release notes. Each entry has a stable `id` (sortable
 * date-string) — the highest id is the "latest" entry, and the
 * unread badge fires when that id differs from the one persisted
 * in localStorage.
 *
 * IDs must be hand-bumped when adding a real entry users should
 * notice; build-SHA changes alone don't trigger the badge — that
 * would be too noisy across point deploys.
 *
 * Adding an entry:
 *   1. Add `{ id: '2026-MM-DD', title, items: [...] }` at the top
 *      of every locale array. Same id across locales.
 *   2. The badge will appear for users whose lastSeen id is older.
 */
export interface WhatsNewEntry {
  id: string;
  title: string;
  items: string[];
}

const en: WhatsNewEntry[] = [
  {
    id: '2026-04-27',
    title: 'v0.1.0 — Sync, unique titles, and this panel',
    items: [
      'Sync is live — opt-in, end-to-end encrypted. Pair devices with a passphrase from Settings → Sync; the server only sees ciphertext.',
      'Per-document conflict resolution: when two devices edit the same chapter, you choose which version wins or save yours as a copy.',
      'Orphan detection — if the server forgets your circle, the picker offers a one-click reset and re-pair.',
      'Document titles are now unique on this device — duplicates are blocked on create/rename and auto-numbered when arriving via sync or import.',
      'Picker shows the last-sync timestamp per document so you can tell at a glance what travelled.',
      "What's new panel — the sparkle button next to the language picker. A violet dot appears when there's something fresh.",
    ],
  },
];

const hu: WhatsNewEntry[] = [
  {
    id: '2026-04-27',
    title: 'v0.1.0 — szinkronizálás, egyedi címek és ez a panel',
    items: [
      'Élesedett a szinkronizálás — opcionális, végpontok közötti titkosítással. A párosítás a Beállítások → Szinkronizálás menüben jelmondattal történik; a szerver csak titkosított adatot lát.',
      'Dokumentumonkénti ütközéskezelés: ha két eszközön szerkesztetted ugyanazt a fejezetet, te döntöd el, melyik változat marad, vagy elmented a sajátot másolatként.',
      'Árvult kör érzékelése — ha a szerver elfelejtette a szinkronkörödet, a választó egy kattintással felajánlja a helyreállítást és újrapárosítást.',
      'A dokumentumcímek mostantól egyediek ezen az eszközön — duplikátum létrehozásakor/átnevezésekor figyelmeztetünk, szinkronon vagy importon érkezőket automatikusan sorszámozzuk.',
      'A választóban dokumentumonként látszik az utolsó szinkronizálás ideje, hogy egy pillantással lásd, mi került át.',
      'Újdonságok panel — a csillámgomb a nyelvválasztó mellett. Lila pont jelzi, ha van új tartalom.',
    ],
  },
];

const ENTRIES: Record<string, WhatsNewEntry[]> = { en, hu };

/** Reactive accessor — re-runs when `lang()` changes. Empty fallback for unknown locales. */
export function whatsNewEntries(): WhatsNewEntry[] {
  return ENTRIES[lang()] ?? ENTRIES.en;
}

/** Highest id across all locales — locale-independent so the badge state survives a language swap. */
export const LATEST_WHATS_NEW_ID: string = (() => {
  let latest = '';
  for (const list of Object.values(ENTRIES)) {
    for (const entry of list) {
      if (entry.id > latest) latest = entry.id;
    }
  }
  return latest;
})();
