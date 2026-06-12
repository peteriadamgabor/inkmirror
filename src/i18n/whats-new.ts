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
    id: '2026-06-12',
    title: 'v0.10.1 — The Enter key keeps its promise',
    items: [
      'Fixed: pressing Enter at the end of a block sometimes only inserted a line break instead of starting a new block — and once it happened, it kept happening in that block. It now reliably starts a new block again, and Backspace can once again remove a block you have emptied out.',
      'Fixed: deleting every block in a chapter left the document with nowhere to type and no way to add a block. A fresh empty block now always takes the place of the last deleted one, and documents already stuck in that state heal themselves the next time you open them.',
    ],
  },
  {
    id: '2026-06-11b',
    title: 'v0.10.0 — A book-shaped book, and saves you can trust',
    items: [
      'Cover, dedication, epigraph, acknowledgments and afterword chapters now export where they belong in every format — front matter before the story, back matter after, no chapter numbering, centered where a book would center them. EPUBs no longer ship two covers, and a Hungarian novel is finally tagged as Hungarian inside the EPUB.',
      'You decide which chapter titles appear in exports: each chapter\'s ⋯ menu has a "Print title in exports" toggle. An epigraph can carry its title when you want it to, and a chapter can go without — the sensible defaults stay as they are.',
      'New in the story panel: Echoes. One click scans the chapter or the whole document for overused words, close echoes (the same word twice within a breath), and repeated phrases — and clicking a finding highlights every occurrence in the manuscript. It counts, it never suggests; works in English and Hungarian prose alike.',
      'If a save ever fails (full disk, private-mode storage limits), InkMirror now tells you immediately with a red indicator and a notification — previously it could quietly claim "Saved". Nothing changed about how often it saves; it just stopped being capable of lying about it.',
      'Edits made offline now sync by themselves the moment you are back online — no more documents stuck in an error state until the next edit. Sync also stopped re-uploading documents whose content has not changed, which saves data and battery on every device in your circle.',
      'Exporting and the writing-mood AI now keep working offline once you have used them — and the landing, roadmap and privacy pages open offline too.',
      'Keyboard polish: Tab now stays inside open dialogs and returns you to where you were when they close — long overdue for screen-reader and keyboard-first writers.',
      'Importing a file shared from another app now asks for confirmation first, so nothing can slip into your library without you saying yes.',
      'Under the hood, a security hardening round: your encryption key is now stored in a form the browser cannot hand back out to anyone, the sync server enforces per-circle storage limits, and a handful of smaller server-side protections landed alongside.',
    ],
  },
  {
    id: '2026-06-11',
    title: 'v0.9.0 — Sync that keeps its word',
    items: [
      'The per-document sync switch now does exactly what it says: turning it on pushes the document right away (including edits made while it was off), turning it off stops syncing immediately. Documents sync only when their box is ticked in Settings → Sync — check your list after updating.',
      'Edits arriving from another device now appear immediately in the open editor and the document list — no more reloading the page to see them, and no more accidentally overwriting them.',
      'Setting up sync or connecting a new device now works on the spot — previously nothing actually synced until the next page reload.',
      "Sync recovers on its own after hitting the server's rate limit or losing connectivity, and re-checks the moment you're back online.",
      'Polish across the sync settings: a live "N of M documents synced" counter, last-activity time, a copy button for the pair code, an "Add another device" flow that goes straight to the code, and clear feedback for "Sync now". Also, the "Encrypting your documents…" message no longer renders upside-down — sorry about that one.',
      'Safety net underneath: importing a backup or applying a sync update is now all-or-nothing — a failure mid-way rolls everything back instead of leaving a half-written library.',
    ],
  },
  {
    id: '2026-06-10',
    title: 'v0.8.0 — Install InkMirror',
    items: [
      'Fixed: the landing, roadmap, and privacy pages were redirecting back into the app — they are reachable again, and first-time visitors no longer get caught in a flashing redirect loop.',
      'If a background save or a shared-file import fails, InkMirror now tells you with a notification instead of failing silently. Revision-history timestamps now speak your language too.',
      "Install InkMirror as a desktop or mobile app — there's an Install button on the landing page when your browser supports it (Chrome, Edge, Android Chrome). Once installed, it lives on your home screen / Dock / Start menu like a native app.",
      'Open `.inkmirror.json` bundles by double-clicking them in your file manager — installed InkMirror handles them natively, with the same Replace / Keep both / Cancel modal you already know.',
      'Share `.inkmirror.json` from another app to InkMirror via the system share sheet (Android, iOS 16+) — the bundle imports straight into your library.',
      'Right-click the installed app on Windows / long-press on Android for "New document" and "Open last document" jumplist shortcuts.',
      "New iOS splash screens for current iPhones and iPads, plus respect for notches and home indicators when you're running InkMirror standalone.",
    ],
  },
  {
    id: '2026-05-02e',
    title: 'v0.7.1: Theme toggle on the public pages',
    items: [
      'A small sun/moon button now sits in the top-right of the landing, roadmap, privacy, and 404 pages. Visitors can flip light ↔ dark without crossing into the editor first; the choice persists across pages and survives a reload.',
    ],
  },
  {
    id: '2026-05-02d',
    title: 'v0.7.0: A literary public-page recraft',
    items: [
      "The landing, roadmap, privacy, and 404 pages are recrafted in the editor's warm cream typography — serif, real small-caps, hairline rules, two-hearts color discipline. Same shape, new register.",
      "Features section is now a numbered literary list with italic Roman ordinals (i.–vi.) instead of a card grid; the privacy \"icon cards\" are replaced by editorial stanzas; the \"Everything else\" list is grouped into four thematic rooms.",
      "Hungarian copy ships as a faithful translation pending a native polish pass.",
    ],
  },
  {
    id: '2026-05-02c',
    title: 'v0.6.2: Revision history polish',
    items: [
      "The revision-history button (⟲ on each block) now shows up in the command palette. Open the palette (Ctrl/Cmd+K), type \"revision\", and the popover opens for whichever block your cursor was last sitting in.",
      "Relative timestamps inside the popover (\"12m ago\") now refresh while it stays open instead of freezing at the moment you opened it.",
    ],
  },
  {
    id: '2026-05-02b',
    title: 'v0.6.1: Mood labels with more literary weight',
    items: [
      "Three of the ten rich mood labels in the heatmap and timeline now read as the writer's vocabulary, not the dictionary's: Longing → Yearning, Wonder → Awe, Calm → Stillness. Display only — your existing scenes and chapters carry the same moods, just labelled with a touch more weight.",
    ],
  },
  {
    id: '2026-05-02',
    title: 'v0.6.0: Revision history that helps',
    items: [
      'Snapshots now fire on the order of one per minute instead of every keystroke pause, so the history list (the ⟲ button on each block) shows meaningful versions instead of near-duplicates.',
      'Each row in the popover shows what changed — added words in green, removed words struck through. Scan the list at a glance instead of clicking through to find out what differs.',
      'Click a revision to preview it in the editor with Restore and Cancel buttons. Reading an old version no longer destroys the current one — Cancel returns you to live content untouched.',
      'New Settings → Advanced → Revision history preset (Frequent / Balanced / Sparse) lets you tune how often snapshots fire. Balanced is the default; Frequent gives finer-grained history, Sparse keeps the list cleaner.',
    ],
  },
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
    id: '2026-06-12',
    title: 'v0.10.1 — Az Enter állja a szavát',
    items: [
      'Javítva: az Enter a blokk végén néha csak sortörést szúrt be új blokk helyett — és ha egyszer megtörtént, abban a blokkban onnantól mindig így viselkedett. Mostantól megbízhatóan új blokkot kezd, és a Backspace is újra törli a kiürített blokkot.',
      'Javítva: ha egy fejezet összes blokkját kitörölted, a dokumentumban nem maradt hová írni, és új blokkot sem lehetett létrehozni. Az utolsó törölt blokk helyén mostantól mindig megjelenik egy üres blokk, a már beragadt dokumentumok pedig a következő megnyitáskor maguktól rendbe jönnek.',
    ],
  },
  {
    id: '2026-06-11b',
    title: 'v0.10.0 — Könyv alakú könyv, és mentés, amiben megbízhatsz',
    items: [
      'A borító, ajánlás, mottó, köszönetnyilvánítás és utószó fejezetek mostantól minden formátumban oda kerülnek exportáláskor, ahová valók — az előzékoldalak a történet elé, a zárszavak utána, fejezetszámozás nélkül, középre igazítva ott, ahol egy könyv is középre tenné. Az EPUB nem tartalmaz többé két borítót, és egy magyar regény végre magyarként van megjelölve az EPUB belsejében is.',
      'Te döntöd el, mely fejezetcímek jelennek meg az exportban: minden fejezet ⋯ menüjében ott a „Cím nyomtatása exportáláskor" kapcsoló. Egy mottó viselheti a címét, ha úgy akarod, egy fejezet pedig elhagyhatja — az észszerű alapértelmezések maradnak.',
      'Új a történet-panelen: a Visszhangok. Egy kattintással átvizsgálja a fejezetet vagy az egész dokumentumot túlhasznált szavak, közeli visszhangok (ugyanaz a szó kétszer, egy levegőn belül) és ismétlődő kifejezések után — és egy találatra kattintva minden előfordulás kigyullad a kéziratban. Számol, sosem javasol; angol és magyar prózában egyaránt működik.',
      'Ha egy mentés valaha meghiúsul (megtelt lemez, privát mód tárhelykorlátja), az InkMirror azonnal szól: piros jelzés és értesítés — korábban előfordulhatott, hogy csendben „Mentve" feliratot mutatott. A mentések gyakorisága nem változott; csak hazudni nem tud többé róla.',
      'Az offline írt változások mostantól maguktól szinkronizálódnak, amint visszatér a net — nincs többé hibaállapotban ragadt dokumentum a következő szerkesztésig. A szinkron ráadásul nem tölti fel újra a változatlan tartalmú dokumentumokat, ami adatot és akkumulátort spórol a kör minden eszközén.',
      'Az exportálás és az írói hangulat-AI offline is működik, ha egyszer már használtad őket — és a kezdő-, ütemterv- és adatvédelmi oldalak is megnyílnak net nélkül.',
      'Billentyűzet-csiszolás: a Tab mostantól a megnyitott párbeszédablakokon belül marad, bezárásukkor pedig oda visz vissza, ahol voltál — régóta esedékes a felolvasóprogramot és billentyűzetet használó íróknak.',
      'Egy másik alkalmazásból megosztott fájl importálása mostantól megerősítést kér, így semmi sem csusszanhat be a könyvtáradba a beleegyezésed nélkül.',
      'A motorháztető alatt biztonsági megerősítő kör: a titkosítókulcsod mostantól olyan formában tárolódik, amit a böngésző senkinek sem tud kiadni, a szinkron-kiszolgáló köröként tárhelykorlátot érvényesít, és emellett több kisebb kiszolgálóoldali védelem is érkezett.',
    ],
  },
  {
    id: '2026-06-11',
    title: 'v0.9.0 — Szinkron, ami állja a szavát',
    items: [
      'A dokumentumonkénti szinkron-kapcsoló mostantól pontosan azt teszi, amit ígér: bekapcsoláskor azonnal feltölti a dokumentumot (a kikapcsolt állapotban írt változásokkal együtt), kikapcsoláskor azonnal leáll. Csak azok a dokumentumok szinkronizálódnak, amelyeknél be van pipálva a Beállítások → Szinkronizálás listában — frissítés után érdemes átnézni.',
      'A másik eszközről érkező változások azonnal megjelennek a nyitott szerkesztőben és a dokumentumlistában — nem kell többé újratölteni az oldalt, és nem írod felül őket véletlenül.',
      'A szinkron beállítása és egy új eszköz csatlakoztatása azonnal működik — korábban a következő oldalújratöltésig valójában semmi sem szinkronizálódott.',
      'A szinkron magától helyreáll, ha a kiszolgáló forgalomkorlátjába ütközik vagy megszakad a kapcsolat, és abban a pillanatban újra ellenőriz, amint visszatér a net.',
      'Csiszolás a szinkron-beállításokban: élő „N/M dokumentum szinkronizálva" számláló, utolsó aktivitás időpontja, másoló gomb a párosítókódhoz, az „Új eszköz hozzáadása" egyből a kódot mutatja, a „Szinkronizálás most" pedig világos visszajelzést ad. És a „Titkosítás folyamatban…" üzenet sem jelenik meg többé fejjel lefelé — ezt elnézést kérjük.',
      'Biztonsági háló alul: a biztonsági mentés importálása és a szinkron-frissítés alkalmazása mostantól mindent-vagy-semmit művelet — egy menet közbeni hiba mindent visszagörget, nem hagy félig megírt könyvtárat.',
    ],
  },
  {
    id: '2026-06-10',
    title: 'v0.8.0 — InkMirror telepítése',
    items: [
      'Javítva: a kezdő-, ütemterv- és adatvédelmi oldalak visszairányítottak az alkalmazásba — újra elérhetők, és az első látogatók többé nem ragadnak villogó átirányítási hurokban.',
      'Ha egy háttérmentés vagy egy megosztott fájl importálása meghiúsul, az InkMirror mostantól értesítéssel jelzi, nem csendben bukik el. A verzióelőzmények időbélyegei már a te nyelveden szólnak.',
      'Telepítsd az InkMirror-t asztali vagy mobil alkalmazásként — a Telepítés gomb megjelenik a kezdőlapon, ha a böngésződ támogatja (Chrome, Edge, Android Chrome). Telepítés után úgy él a kezdőképernyődön / Dockodban / Start-menüben, mint egy natív alkalmazás.',
      'Nyiss meg `.inkmirror.json` csomagokat dupla kattintással a fájlkezelőből — a telepített InkMirror natívan kezeli őket, ugyanazzal a Csere / Mindkettő megtartása / Mégsem párbeszédablakkal, amit már ismersz.',
      'Oszd meg a `.inkmirror.json` fájlokat más alkalmazásokból az InkMirror-ral a rendszer megosztó-paneljén keresztül (Android, iOS 16+) — a csomag egyenesen a könyvtáradba importálódik.',
      'Jobb gomb a telepített Windows-alkalmazáson / hosszú érintés Androidon: „Új dokumentum" és „Utolsó dokumentum megnyitása" gyorsmenü-bejegyzések.',
      'Új iOS indítóképek aktuális iPhone- és iPad-modellekhez, valamint figyelem a kameranyílásokra és a home-indikátorokra, amikor az InkMirror önálló módban fut.',
    ],
  },
  {
    id: '2026-05-02e',
    title: 'v0.7.1: Témaválasztó a nyilvános oldalakon',
    items: [
      'Egy kis nap/hold gomb most a landing, a roadmap, a privacy és a 404 oldal jobb felső sarkában ül. A látogatók a szerkesztő megnyitása nélkül válthatnak világos ↔ sötét között; a választás megmarad oldalak között és túléli az újratöltést.',
    ],
  },
  {
    id: '2026-05-02d',
    title: 'v0.7.0: A nyilvános oldalak irodalmi újragondolása',
    items: [
      'A landing, a roadmap, a privacy és a 404 oldal újragondolva a szerkesztő meleg krémes tipográfiájában — serif, igazi kiskapitális, hajszálvonalak, két-szív szín-fegyelem. Ugyanaz a forma, új regiszter.',
      'A funkciók szekció most számozott irodalmi lista dőlt római sorszámokkal (i.–vi.), nem kártyarács; az adatvédelmi „ikon-kártyák" helyett szerkesztői versszakok; a „Minden más" lista négy tematikus szobába rendezve.',
      'A magyar szöveg hűséges fordításként érkezik — a natív csiszolás később.',
    ],
  },
  {
    id: '2026-05-02c',
    title: 'v0.6.2: Verziótörténet finomítások',
    items: [
      'A blokkok melletti ⟲ verziótörténet gomb mostantól a parancspalettában is megjelenik. Nyisd meg a palettát (Ctrl/Cmd+K), írd be hogy „verzió”, és az előugró ablak annál a blokknál nyílik meg, amelyikben legutóbb a kurzor állt.',
      'Az előugró ablakban látható relatív időbélyegek („12 perce”) mostantól nyitva tartás közben is frissülnek, nem fagynak be a megnyitás pillanatára.',
    ],
  },
  {
    id: '2026-05-02b',
    title: 'v0.6.1: Irodalmibb hangulatcímkék',
    items: [
      'A tíz gazdag hangulatcímke irodalmibb hangzású szavakat kapott. Angolul: Longing → Yearning, Wonder → Awe, Calm → Stillness. Magyarul: Vágyódás → Vágyakozás, Csoda → Áhítat (a Nyugalom marad — már eddig is jól ülte meg a Stillness helyét). Csak megjelenés — a meglévő jelenetek és fejezetek ugyanazokat a hangulatokat hordozzák, csak egy fokkal erősebb címkével.',
    ],
  },
  {
    id: '2026-05-02',
    title: 'v0.6.0: Hasznos verziótörténet',
    items: [
      'A pillanatfelvételek mostantól körülbelül percenként készülnek, nem minden gépelési szünet után — így a verziótörténet (a blokk melletti ⟲ gomb) értelmes változatokat mutat, nem közel azonos másolatokat.',
      'A listában minden sor mutatja, mi változott — a hozzáadott szavak zölden, az eltávolítottak áthúzva. Egy pillantással átnézheted a listát, nem kell végigkattintanod, hogy lásd a különbséget.',
      'Egy verzióra kattintva a szerkesztőben láthatod azt, Visszaállítás és Mégse gombokkal. Egy régi változat megnézése már nem írja felül az aktuálisat — a Mégse gomb sértetlenül visszahoz az élő tartalomhoz.',
      'Új Beállítások → Speciális → Verziótörténet beállítás (Gyakori / Kiegyensúlyozott / Ritkás) szabályozza, milyen gyakran készüljenek a felvételek. A Kiegyensúlyozott az alapértelmezett; a Gyakori finomabb történetet ad, a Ritkás tisztább listát.',
    ],
  },
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
