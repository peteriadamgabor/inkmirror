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
    id: '2026-05-01d',
    title: 'v0.5.1: Multi-line text inside a single block sticks now',
    items: [
      'Pressing Enter in the middle of a block (most often inside an Epigraph or Dedication, where a quote runs across two visible lines) used to drop the line break on reload — your two-line text quietly collapsed back to one. Fixed: the line break now survives the round-trip through storage in every block type.',
    ],
  },
  {
    id: '2026-05-01c',
    title: 'v0.5.0: Optional crash reports',
    items: [
      'New opt-in toggle in Settings → Privacy: send sanitised crash reports to our self-hosted GlitchTip server. Off by default — nothing is sent until you flip it on. The reports include build version, error message, stack trace, and browser info; the manuscript, character names, document titles, and sync identifiers are stripped before anything leaves your browser.',
      'GlitchTip is a self-hosted, Sentry-protocol-compatible error tracker — no third-party SaaS involved. New sub-processor row on the Privacy tab and updated CSP reflect that.',
    ],
  },
  {
    id: '2026-05-01b',
    title: 'v0.4.1: Pick any color for any character',
    items: [
      'Character profile page now has a color picker. Choose from a curated palette tuned to read on both light and dark, or click the rainbow swatch for a free-form custom color. The choice flows everywhere: speaker pill, dialogue tint, mention dot, and the character arcs chart.',
    ],
  },
  {
    id: '2026-05-01',
    title: 'v0.4.0: Privacy tab, announcements channel, harder encryption keys',
    items: [
      'New Settings → Privacy tab. Plain-language summary of what InkMirror sees, who processes data on our behalf, and a slot for future opt-in features (error reporting, telemetry) — off by default when they ship.',
      'Announcements channel. Anonymous, pull-only — InkMirror occasionally checks for breaking changes, planned downtime, or new-feature heads-ups. Critical notices block until acknowledged; routine ones land as toasts. No identifier is sent.',
      'Sync encryption keys are now non-extractable in memory. A compromise of the page (XSS, malicious dependency) can no longer dump your encryption key out of memory to an attacker; it can only be used in place. Storage-side hardening (wrapping the bytes still in IndexedDB) is a separate follow-up.',
    ],
  },
  {
    id: '2026-04-30b',
    title: 'v0.3.1: Storage durability — see your quota, harden against eviction',
    items: [
      "New Settings → Advanced tab. Shows how much room your manuscripts and history are taking in this browser, and whether the browser may evict your data under disk pressure.",
      "InkMirror now asks the browser for eviction protection the first time you export — exporting is the moment you signal you care about durability. With protection on, eviction needs an explicit user action (clearing browsing data, uninstalling the PWA). Some browsers grant silently; Firefox asks once. If you missed the prompt, hit Request protection in Settings → Advanced.",
    ],
  },
  {
    id: '2026-04-30',
    title: 'v0.3.0: Stale-tab nudge, crash diagnostics, honest sync deletion',
    items: [
      "When a new version of InkMirror ships, the open tab now nudges you with a Reload button instead of silently caching the old code forever. Click when it's convenient — your in-flight edits stay safe.",
      "Crash screen got a Copy diagnostic info button. Pastes a sanitised summary (build, locale, error, last document id) — no manuscript content, no character names, no titles — straight to the clipboard for the feedback form.",
      "Disabling sync while offline no longer silently leaves your encrypted backup on the server. The deletion is queued, retried automatically when you reconnect, and the Settings → Sync panel shows you where things stand. You can also force-clear locally if you ever want out, even when the server is unreachable.",
    ],
  },
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
    id: '2026-05-01d',
    title: 'v0.5.1: A többsoros szöveg egy blokkon belül már megmarad',
    items: [
      'Ha egy blokkon belül (leggyakrabban Mottó vagy Ajánlás fejezetben, ahol egy idézet két látható sorra fut) az Enter-t a sor közepén ütötted le, az újratöltés után a sortörés eltűnt — a két sorod csendben egy sorrá omlott össze. Javítva: a sortörés mostantól minden blokktípusban túléli a tárolási oda-vissza utat.',
    ],
  },
  {
    id: '2026-05-01c',
    title: 'v0.5.0: Választható hibajelentések',
    items: [
      'Új, választható kapcsoló a Beállítások → Adatvédelem fülön: küldj megtisztított hibajelentéseket a saját üzemeltetésű GlitchTip szerverünkre. Alapértelmezetten kikapcsolva — semmi nem kerül elküldésre, amíg te magad nem engedélyezed. A jelentés tartalmazza a verziószámot, a hibaüzenetet, a stack trace-t és a böngésző-adatokat; a kéziratod, a karakternevek, a dokumentumcímek és a szinkronizációs azonosítók sosem hagyják el a böngésződet.',
      'A GlitchTip egy saját üzemeltetésű, Sentry-protokollal kompatibilis hibakövető — nincs harmadik féltől származó SaaS. Új alfeldolgozói sor az Adatvédelem fülön és frissített CSP tükrözi mindezt.',
    ],
  },
  {
    id: '2026-05-01b',
    title: 'v0.4.1: Bármilyen szín, bármelyik karakterhez',
    items: [
      'A karakterlapon mostantól van színválasztó. Választhatsz a világos és sötét háttérre is hangolt palettáról, vagy a szivárvány-mintázatra kattintva tetszőleges egyedi színt vehetsz fel. A választás mindenhova átfut: beszélő-jelvény, párbeszéd-árnyalat, említés-pont és karakter-ívek grafikon.',
    ],
  },
  {
    id: '2026-05-01',
    title: 'v0.4.0: Adatvédelem fül, közlemények csatorna, erősebb titkosítási kulcsok',
    items: [
      'Új Beállítások → Adatvédelem fül. Közérthető összefoglaló arról, mit lát az InkMirror, kik dolgoznak fel adatot a nevünkben, és egy hely a jövőbeli választható funkcióknak (hibajelentés, telemetria) — ezek alapértelmezetten kikapcsolva érkeznek.',
      'Közlemények csatorna. Névtelen, csak letöltés irányú — az InkMirror időnként ellenőrzi, hogy van-e törésszerű változás, tervezett leállás vagy új funkció bejelentése. A kritikus közlemények addig blokkolnak, amíg tudomásul nem veszed; a rutin közlemények toastként érkeznek. Semmilyen azonosítót nem küldünk.',
      'A szinkron titkosítási kulcsai a memóriában már nem kiolvashatók. Ha az oldal kompromittálódna (XSS, rosszindulatú függőség), a támadó nem tudja kiolvasni a titkosítási kulcsodat a memóriából; csak helyben tudja felhasználni. A háttértár-szintű erősítés (a kulcs csomagolása az IndexedDB-ben is) külön jövőbeli feladat.',
    ],
  },
  {
    id: '2026-04-30b',
    title: 'v0.3.1: Tárhely-tudatosság — keret, foglaltság és eltávolítás-védelem',
    items: [
      'Új Beállítások → Speciális fül. Megmutatja, mennyi helyet foglalnak a kéziratok és az előzmények ebben a böngészőben, és hogy lemeznyomás esetén a böngésző törölheti-e az adataidat.',
      'Az InkMirror az első exportálás alkalmával eltávolítás-védelmet kér a böngészőtől — az exportálás az a pillanat, amikor jelzed, hogy számít a tartósság. A védelem bekapcsolásával az eltávolításhoz kifejezett felhasználói művelet (böngészőadatok törlése, PWA eltávolítása) szükséges. Egyes böngészők csendben adják meg, a Firefox egyszer rákérdez. Ha lemaradtál róla, kattints a Védelem kérése gombra a Beállítások → Speciális fülön.',
    ],
  },
  {
    id: '2026-04-30',
    title: 'v0.3.0: Frissítési értesítés, hiba-diagnosztika, őszinte szinkron-letiltás',
    items: [
      'Ha új verzió érkezik, a nyitva tartó lap mostantól figyelmeztet egy Újratöltés gombbal, ahelyett hogy csendben a régi kódot futtatná tovább. Akkor kattints, amikor neked alkalmas — a folyamatban lévő szerkesztések biztonságban maradnak.',
      'A hibaképernyőre került egy „Diagnosztikai adatok másolása” gomb. Egy szűrt összegzést másol (verzió, nyelv, hiba, utolsó dokumentum azonosítója) a vágólapra — kéziratszöveg, karakternevek, dokumentumcímek nélkül —, amit egyszerűen beilleszthetsz a visszajelzésbe.',
      'Ha offline kapcsolod ki a szinkront, az nem hagyja többé csendben a szerveren a titkosított biztonsági mentésedet. A törlés várólistára kerül, és újrapróbálkozunk, amint újra elérhetők vagyunk; a Beállítások → Szinkronizálás fül mutatja az aktuális állapotot. Akár kényszertörléssel is leállíthatod helyileg, ha a szerver nem érhető el.',
    ],
  },
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
