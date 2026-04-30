import { lang } from './index';

/**
 * Per-locale release notes. Each entry has a stable `id` (sortable
 * date-string). The highest id is the "latest" entry, and the
 * unread badge fires when that id differs from the one persisted
 * in localStorage.
 *
 * IDs must be hand-bumped when adding a real entry users should
 * notice; build-SHA changes alone don't trigger the badge (that
 * would be too noisy across point deploys).
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
    id: '2026-04-28b',
    title: 'v0.2.1: Privacy page',
    items: [
      'New Privacy page (top nav, Privacy): plain-language breakdown of what stays in your browser, what (encrypted) leaves it via sync, what we never see, the sub-processors involved, and how to reach us at privacy@inkmirror.cc / security@inkmirror.cc. Linked from the picker footer, the editor sidebar (overflow, Privacy), and Settings, Sync too.',
    ],
  },
  {
    id: '2026-04-28',
    title: "v0.2.0: What's new tabs, word-count filter",
    items: [
      "What's new panel is tabbed now: each version gets its own tab so older releases stay one click away instead of scrolling forever.",
      'Word count has a block-type filter: toggle text / dialogue / scene to focus the totals on the kind of writing you care about.',
      'Faster first paint when sync is off: the sync settings tab loads on demand instead of riding in the main bundle.',
    ],
  },
  {
    id: '2026-04-27',
    title: 'v0.1.0: Sync, unique titles, and this panel',
    items: [
      'Sync is live: opt-in, end-to-end encrypted. Pair devices with a passphrase from Settings, Sync; the server only sees ciphertext.',
      'Per-document conflict resolution: when two devices edit the same chapter, you choose which version wins or save yours as a copy.',
      'Orphan detection: if the server forgets your circle, the picker offers a one-click reset and re-pair.',
      'Document titles are now unique on this device: duplicates are blocked on create/rename and auto-numbered when arriving via sync or import.',
      'Picker shows the last-sync timestamp per document so you can tell at a glance what travelled.',
      "What's new panel: the sparkle button next to the language picker. A violet dot appears when there's something fresh.",
    ],
  },
];

const hu: WhatsNewEntry[] = [
  {
    id: '2026-04-28b',
    title: 'v0.2.1: Adatvédelem oldal',
    items: [
      'Új Adatvédelem oldal (felső menü, Adatvédelem): közérthető összefoglaló arról, mi marad a böngésződben, mi (titkosítva) kerül a szerverre szinkronizáláson keresztül, mit nem látunk soha, kik az alvállalkozók, és milyen címen érsz el minket: privacy@inkmirror.cc / security@inkmirror.cc. A dokumentum-választó láblécéből, a szerkesztő oldalsávjából (…, Adatvédelem) és a Beállítások, Szinkronizálás fülről is elérhető.',
    ],
  },
  {
    id: '2026-04-28',
    title: 'v0.2.0: Újdonságok-fülek, szószám-szűrő',
    items: [
      'Az Újdonságok panel mostantól füles: minden verzió saját fülre kerül, így a régebbi kiadások is egy kattintásra vannak; nem kell végiggörgetni a teljes listát.',
      'A szószám-panelben blokktípus-szűrő is van: kapcsold be vagy ki a szöveg / párbeszéd / jelenet típust, hogy az aktuálisan érdekelt írásmódra koncentrálhass.',
      'Gyorsabb első megjelenés szinkron nélkül: a szinkron-beállítások fül csak akkor töltődik be, amikor megnyitod, nem indít a fő bundle-lel.',
    ],
  },
  {
    id: '2026-04-27',
    title: 'v0.1.0: szinkronizálás, egyedi címek és ez a panel',
    items: [
      'Élesedett a szinkronizálás: opcionális, végpontok közötti titkosítással. A párosítás a Beállítások, Szinkronizálás menüben jelmondattal történik; a szerver csak titkosított adatot lát.',
      'Dokumentumonkénti ütközéskezelés: ha két eszközön szerkesztetted ugyanazt a fejezetet, te döntöd el, melyik változat marad, vagy elmented a sajátot másolatként.',
      'Árvult kör érzékelése: ha a szerver elfelejtette a szinkronkörödet, a választó egy kattintással felajánlja a helyreállítást és újrapárosítást.',
      'A dokumentumcímek mostantól egyediek ezen az eszközön: duplikátum létrehozásakor/átnevezésekor figyelmeztetünk, szinkronon vagy importon érkezőket automatikusan sorszámozzuk.',
      'A választóban dokumentumonként látszik az utolsó szinkronizálás ideje, hogy egy pillantással lásd, mi került át.',
      'Újdonságok panel: a csillámgomb a nyelvválasztó mellett. Lila pont jelzi, ha van új tartalom.',
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
