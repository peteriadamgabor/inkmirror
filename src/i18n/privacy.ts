import { lang } from './index';

/**
 * Privacy page content, per locale. Lives outside en.ts / hu.ts because
 * it's long-form structured prose (tables, nested lists, mailto-anchors)
 * that would balloon the strict-mirror Messages tree. Pattern mirrors
 * `whats-new.ts`: per-locale data + reactive accessor.
 *
 * Adding a language: add an entry to LOCALES with the same shape.
 *
 * NOTE: HU is a first-pass translation modelled on the existing HU strings.
 * User intends a native-speaker polish pass before public release — same
 * status as the Chekhov demo prose.
 */
export interface PrivacyContent {
  pageTitle: string;
  lastUpdated: string;
  intro: string;

  whereLivesH: string;
  whereLivesIntro: string;
  whereLivesBullets: string[];
  whereLivesAfterBullets: string;
  whereLivesOption1Name: string;
  whereLivesOption1Body: string;
  whereLivesOption2Name: string;
  whereLivesOption2Body: string;

  neverSeeH: string;
  neverSeeBullets: string[];
  neverSeeCloser: string;

  syncH: string;
  syncIntro: string;

  syncKeysH: string;
  syncKeysSteps: string[];

  syncPairingH: string;
  syncPairingSteps: string[];
  syncPairingNote: string;

  syncMetadataH: string;
  syncMetadataIntro: string;
  syncMetadataVisible: string[];
  syncMetadataCannotIntro: string;
  syncMetadataCannot: string[];

  syncForgottenH: string;
  syncForgottenBody: string;

  syncNotSyncedH: string;
  syncNotSyncedItems: Array<{ name: string; body: string }>;

  syncDeleteH: string;
  syncDeleteBody: string;
  syncDeleteOfflineNote: string;

  feedbackH: string;
  feedbackIntro: string;
  feedbackFields: string[];
  feedbackCloserBefore: string;
  feedbackCloserAfter: string;

  aiH: string;
  aiP1: string;
  aiP2: string;

  subprocessorsH: string;
  subprocessorsColProvider: string;
  subprocessorsColRole: string;
  subprocessorsColSees: string;
  subprocessorsRows: Array<{ provider: string; role: string; sees: string }>;

  controlsH: string;
  controlsItems: Array<{ name: string; body: string }>;

  securityH: string;
  securityBefore: string;
  securityAfter: string;

  changesH: string;
  changesIntro: string;
  changesBullets: string[];
  changesCloser: string;
}

const en: PrivacyContent = {
  pageTitle: 'Privacy — InkMirror',
  lastUpdated: 'Last updated: 2026-04-28',
  intro:
    "InkMirror is built around one promise: your manuscript never leaves your browser unless you decide it should. Below is exactly what that means in practice, and what happens when you opt into the things that do talk to a server.",

  whereLivesH: 'Where your work lives',
  whereLivesIntro:
    "Everything you write is stored in your browser's IndexedDB, on the device you wrote it on. That includes:",
  whereLivesBullets: [
    'Documents, chapters, blocks (text, dialogue, scenes, notes).',
    'Characters, sentiments, undo history, soft-deleted blocks (the Dead Text Graveyard).',
    'Your settings, hotkeys, language, and theme.',
  ],
  whereLivesAfterBullets:
    "None of this is sent anywhere by default. Closing the tab does not lose it. Clearing your browser's site data does. For cross-device or cross-browser portability, you have two options:",
  whereLivesOption1Name: 'File-based backup',
  whereLivesOption1Body:
    'Settings → Backup → Export. You get a .inkmirror.json (one document) or .inkmirror.backup.json (everything). Move the file yourself.',
  whereLivesOption2Name: 'Sync',
  whereLivesOption2Body: 'Opt-in, end-to-end encrypted. Detailed below.',

  neverSeeH: 'What we never see',
  neverSeeBullets: [
    'Your manuscript text.',
    'Your character names, dialogue, scenes, or notes.',
    'Your document titles.',
    'Your editing patterns, keystrokes, or word counts.',
  ],
  neverSeeCloser:
    'This is true regardless of whether you use sync. Sync changes where your encrypted data is stored, not what we can read.',

  syncH: 'Sync (opt-in, end-to-end encrypted)',
  syncIntro: 'If you turn on sync in Settings → Sync, here is the full picture.',

  syncKeysH: 'How keys work',
  syncKeysSteps: [
    'You choose a passphrase. We never see it. It never leaves your browser.',
    'Your browser generates a random 16-byte salt.',
    'Your browser derives an encryption key (K_enc) from your passphrase + salt using Argon2id, a slow, memory-hard function specifically designed to resist brute-force.',
    'The same derivation produces an authentication key (K_auth). We store the SHA-256 hash of K_auth so we can verify that your device knows the passphrase, without ever seeing the passphrase or K_enc.',
    'Every document is encrypted in your browser with AES-256-GCM using K_enc before it leaves. We receive ciphertext only.',
  ],

  syncPairingH: 'Adding another device',
  syncPairingSteps: [
    'On your first device, generate a 6-character pairing code (valid for 2 minutes, single use).',
    'On the second device, enter the code. The server returns the salt for your sync circle.',
    'Enter the same passphrase on the second device. It derives the same keys locally and decrypts your documents.',
  ],
  syncPairingNote:
    "If both pieces (passphrase and pairing code) aren't available, the second device cannot decrypt anything.",

  syncMetadataH: 'What the server can observe',
  syncMetadataIntro:
    'Even though content is encrypted, some metadata is necessarily visible:',
  syncMetadataVisible: [
    "Your circle ID — a random 16-byte value with no link to your name, email, or anything else identifying. We don't have your email.",
    'The size of each encrypted document.',
    'Timestamps of when you sync.',
    "Your IP address, via Cloudflare access logs (subject to Cloudflare's retention policy).",
  ],
  syncMetadataCannotIntro: 'The server cannot determine:',
  syncMetadataCannot: [
    'Document content.',
    'Document titles.',
    'Character names.',
    'Whether one circle belongs to one person or several.',
  ],

  syncForgottenH: 'Forgotten passphrase',
  syncForgottenBody:
    "There is no recovery. We cannot help you. Your synced data is gone. This is not a policy choice — we simply don't have the key.",

  syncNotSyncedH: 'What is not synced',
  syncNotSyncedItems: [
    {
      name: 'Undo history',
      body:
        "Each device keeps its own undo stack. If you switch devices, you can't undo edits made on the other one.",
    },
    {
      name: 'App settings, hotkeys, language, theme',
      body: 'These stay local to each device.',
    },
  ],

  syncDeleteH: 'Deleting your synced data',
  syncDeleteBody:
    'Settings → Sync → Disable sync. This deletes your circle and all encrypted blobs from the server, and wipes your local sync keys.',
  syncDeleteOfflineNote:
    "If you're offline when you click this, the local keys are wiped immediately, but the server-side blobs may persist until your device reconnects and the deletion call completes. If you want to be certain the blobs are gone, reconnect and confirm there's no error.",

  feedbackH: 'Feedback',
  feedbackIntro:
    'If you submit feedback through the in-app form, this is sent to a private Discord channel:',
  feedbackFields: [
    'Your message (capped at 4000 characters).',
    'Your name (optional, capped at 200 characters).',
    'Your contact (optional — usually email — capped at 200 characters).',
    'The page you submitted from.',
    "Your browser's User-Agent.",
    'The submission timestamp.',
    'Your IP address (Cloudflare access logs).',
  ],
  feedbackCloserBefore:
    'We do not keep a copy of feedback outside Discord. If you want a feedback message removed, email ',
  feedbackCloserAfter: '.',

  aiH: 'AI features (entirely local)',
  aiP1:
    'Sentiment analysis, character mood tracking, the Story Pulse ECG, and the inconsistency scanner all run inside your browser using a Web Worker. No text is sent to any server for AI processing.',
  aiP2:
    'The first time you use AI, your browser downloads a multilingual DistilBERT sentiment model from Hugging Face, proxied through our Cloudflare Worker for CORS reasons. The proxy sees the model request, not your content. Hugging Face sees our Worker, not you.',

  subprocessorsH: 'Sub-processors',
  subprocessorsColProvider: 'Provider',
  subprocessorsColRole: 'Role',
  subprocessorsColSees: 'What they see',
  subprocessorsRows: [
    {
      provider: 'Cloudflare',
      role: 'Hosting (Workers), encrypted-blob storage (R2), metadata (KV), access logs',
      sees: 'Ciphertext, circle IDs, IPs, timestamps',
    },
    {
      provider: 'Discord',
      role: 'Feedback message storage, only if you submit feedback',
      sees: 'Whatever you typed',
    },
    {
      provider: 'Hugging Face',
      role: 'AI model weight hosting',
      sees: "Our Worker's request, not you",
    },
  ],

  controlsH: 'Your controls',
  controlsItems: [
    { name: 'Export everything', body: 'Settings → Backup → Export full database.' },
    { name: 'Delete synced data', body: 'Settings → Sync → Disable sync.' },
    {
      name: 'Delete local data',
      body: 'Clear IndexedDB for inkmirror.cc in your browser, or Settings → … → Reset everything.',
    },
  ],

  securityH: 'Security disclosure',
  securityBefore: 'Found a vulnerability? Email ',
  securityAfter: '. We respond within 72 hours.',

  changesH: 'Changes',
  changesIntro: 'If we ever:',
  changesBullets: [
    'add a new sub-processor,',
    'send any new category of data to a server, or',
    'change the encryption scheme,',
  ],
  changesCloser:
    "…we will update this page, add a notice in the in-app \"What's new\" panel, and bump the version. Pure refactors and bug fixes don't trigger a notice.",
};

const hu: PrivacyContent = {
  pageTitle: 'Adatvédelem — InkMirror',
  lastUpdated: 'Utoljára frissítve: 2026-04-28',
  intro:
    'Az InkMirror egyetlen ígéret köré épül: a kéziratod nem hagyja el a böngésződet, hacsak te magad nem döntesz másképp. Az alábbiakban pontosan leírjuk, mit jelent ez a gyakorlatban, és mi történik, ha bekapcsolod azokat a funkciókat, amelyek mégiscsak szervert érintenek.',

  whereLivesH: 'Hol van a munkád',
  whereLivesIntro:
    'Minden, amit írsz, a böngésződ IndexedDB tárolójában él, azon az eszközön, ahol írtad. Ide tartozik:',
  whereLivesBullets: [
    'Dokumentumok, fejezetek, blokkok (szöveg, párbeszéd, jelenetek, jegyzetek).',
    'Szereplők, hangulatok, visszavonási történet, törölt blokkok (a Dead Text Graveyard).',
    'A beállításaid, gyorsbillentyűid, nyelved, témád.',
  ],
  whereLivesAfterBullets:
    'Ezekből alapértelmezetten semmi sem kerül sehova. A fül bezárása nem törli őket. A böngésző oldal-adatainak törlése igen. Eszközök vagy böngészők közötti hordozhatósághoz két út áll rendelkezésre:',
  whereLivesOption1Name: 'Fájl alapú biztonsági mentés',
  whereLivesOption1Body:
    'Beállítások → Biztonsági mentés → Exportálás. Egy .inkmirror.json (egyetlen dokumentum) vagy .inkmirror.backup.json (minden) fájlt kapsz. A fájlt magad mozgatod.',
  whereLivesOption2Name: 'Szinkronizálás',
  whereLivesOption2Body: 'Opcionális, végpontok közötti titkosítással. Részletek lent.',

  neverSeeH: 'Amit sosem látunk',
  neverSeeBullets: [
    'A kéziratod szövegét.',
    'A szereplőid neveit, párbeszédeit, jeleneteit, jegyzeteit.',
    'A dokumentumaid címét.',
    'A szerkesztési mintáidat, billentyűleütéseidet, szószámodat.',
  ],
  neverSeeCloser:
    'Ez attól függetlenül igaz, hogy használod-e a szinkronizálást. A szinkron csak azt változtatja, hogy a titkosított adat hol van tárolva — azt nem, hogy mit látunk belőle.',

  syncH: 'Szinkronizálás (opcionális, végpontok közötti titkosítással)',
  syncIntro:
    'Ha bekapcsolod a szinkronizálást a Beállítások → Szinkronizálás menüben, ez történik pontosan.',

  syncKeysH: 'Hogyan működnek a kulcsok',
  syncKeysSteps: [
    'Választasz egy jelmondatot. Mi sosem látjuk. Soha nem hagyja el a böngésződet.',
    'A böngésződ generál egy véletlen 16-bájtos sót.',
    'A böngésződ a jelmondatból + sóból Argon2id-vel — egy lassú, memóriaigényes függvénnyel, amelyet kifejezetten a brute-force támadásokra terveztek — levezet egy titkosító kulcsot (K_enc).',
    'Ugyanez a levezetés egy hitelesítő kulcsot is előállít (K_auth). Ennek SHA-256 hash-ét tároljuk a szerveren, hogy ellenőrizni tudjuk: az eszközöd ismeri a jelmondatot — anélkül, hogy valaha látnánk a jelmondatot vagy a K_enc-et.',
    'Minden dokumentum AES-256-GCM-mel titkosítva hagyja el a böngésződet, K_enc kulccsal. A szerver csak titkosított adatot lát.',
  ],

  syncPairingH: 'Másik eszköz hozzáadása',
  syncPairingSteps: [
    'Az első eszközön generálsz egy 6 karakteres párosító kódot (2 percig érvényes, egyszer használható).',
    'A második eszközön beírod a kódot. A szerver visszaadja a szinkronkörödhöz tartozó sót.',
    'Beírod ugyanazt a jelmondatot a második eszközön. Az helyben levezeti ugyanazokat a kulcsokat, és visszafejti a dokumentumaidat.',
  ],
  syncPairingNote:
    'Ha mindkét darab (jelmondat és párosító kód) nincs meg, a második eszköz semmit sem tud visszafejteni.',

  syncMetadataH: 'Mit lát a szerver',
  syncMetadataIntro:
    'Bár a tartalom titkosított, néhány metaadat szükségszerűen látható:',
  syncMetadataVisible: [
    'A szinkronkör azonosítójádat — egy véletlen 16-bájtos érték, amely nem köthető a nevedhez, e-mail-címedhez vagy bármi máshoz, ami azonosítana. Az e-mail-címed sincs birtokunkban.',
    'Az egyes titkosított dokumentumok méretét.',
    'A szinkronizálások időbélyegeit.',
    'Az IP-címedet a Cloudflare hozzáférési naplóin keresztül (a Cloudflare adatmegőrzési szabályzata szerint).',
  ],
  syncMetadataCannotIntro: 'A szerver nem tudja megállapítani:',
  syncMetadataCannot: [
    'A dokumentumok tartalmát.',
    'A dokumentumok címét.',
    'A szereplők neveit.',
    'Hogy egy szinkronkör egy emberhez vagy többhöz tartozik-e.',
  ],

  syncForgottenH: 'Elfelejtett jelmondat',
  syncForgottenBody:
    'Nincs helyreállítás. Nem tudunk segíteni. A szinkronizált adatod elveszett. Ez nem szabályzati döntés — egyszerűen nincs meg nálunk a kulcs.',

  syncNotSyncedH: 'Amit nem szinkronizálunk',
  syncNotSyncedItems: [
    {
      name: 'Visszavonási történet',
      body:
        'Minden eszköz a saját visszavonási vermét tartja. Ha eszközt váltasz, a másikon végzett szerkesztéseket nem tudod visszavonni.',
    },
    {
      name: 'App-beállítások, gyorsbillentyűk, nyelv, téma',
      body: 'Ezek minden eszközön helyben maradnak.',
    },
  ],

  syncDeleteH: 'A szinkronizált adatod törlése',
  syncDeleteBody:
    'Beállítások → Szinkronizálás → Szinkron kikapcsolása. Ez törli a szinkronkörödet és minden titkosított adatot a szerverről, valamint a helyi szinkronkulcsaidat.',
  syncDeleteOfflineNote:
    'Ha offline állapotban kattintasz erre, a helyi kulcsok azonnal törlődnek, de a szerveroldali titkosított csomagok addig megmaradhatnak, amíg az eszközöd újra nem csatlakozik és a törlési hívás be nem fejeződik. Ha biztos akarsz lenni abban, hogy a csomagok eltűntek, csatlakozz újra, és győződj meg róla, hogy nem érkezett hibajelzés.',

  feedbackH: 'Visszajelzés',
  feedbackIntro:
    'Ha az alkalmazáson belüli űrlapon visszajelzést küldesz, a következő adatok kerülnek egy privát Discord-csatornára:',
  feedbackFields: [
    'Az üzeneted (legfeljebb 4000 karakter).',
    'A neved (opcionális, legfeljebb 200 karakter).',
    'Elérhetőséged (opcionális — általában e-mail —, legfeljebb 200 karakter).',
    'Az oldal, ahonnan küldted.',
    'A böngésződ User-Agent karakterlánca.',
    'A küldés időbélyege.',
    'Az IP-címed (Cloudflare hozzáférési naplók).',
  ],
  feedbackCloserBefore:
    'A Discord-on kívül nem őrzünk meg másolatot. Ha szeretnéd, hogy egy visszajelzés-üzenet törlődjön, írj a következő címre: ',
  feedbackCloserAfter: '.',

  aiH: 'AI funkciók (teljesen helyben)',
  aiP1:
    'A hangulatelemzés, a szereplői hangulatkövetés, a Story Pulse EKG és az ellentmondás-kereső is a böngésződben fut, egy Web Workerben. Az AI-feldolgozáshoz semmilyen szöveg nem kerül szerverre.',
  aiP2:
    'Az AI első használatakor a böngésződ letölt egy többnyelvű DistilBERT hangulatmodellt a Hugging Face-ről, a saját Cloudflare Worker-ünkön keresztül proxyzva (CORS-okok miatt). A proxy a modell-kérést látja, a tartalmadat nem. A Hugging Face a Worker-ünket látja, téged nem.',

  subprocessorsH: 'Alvállalkozók',
  subprocessorsColProvider: 'Szolgáltató',
  subprocessorsColRole: 'Szerep',
  subprocessorsColSees: 'Mit látnak',
  subprocessorsRows: [
    {
      provider: 'Cloudflare',
      role: 'Hoszting (Workers), titkosított csomagok tárolása (R2), metaadatok (KV), hozzáférési naplók',
      sees: 'Titkosított adat, szinkronkör-azonosítók, IP-címek, időbélyegek',
    },
    {
      provider: 'Discord',
      role: 'Visszajelzés-üzenetek tárolása, kizárólag akkor, ha küldesz visszajelzést',
      sees: 'Amit beírtál',
    },
    {
      provider: 'Hugging Face',
      role: 'AI-modell súlyok tárolása',
      sees: 'A Worker-ünk kérését — téged nem',
    },
  ],

  controlsH: 'A te kezedben',
  controlsItems: [
    {
      name: 'Mindent exportálni',
      body: 'Beállítások → Biztonsági mentés → Teljes adatbázis exportálása.',
    },
    {
      name: 'Szinkronizált adat törlése',
      body: 'Beállítások → Szinkronizálás → Szinkron kikapcsolása.',
    },
    {
      name: 'Helyi adat törlése',
      body:
        'Töröld az inkmirror.cc IndexedDB-jét a böngésződben, vagy Beállítások → … → Mindent visszaállítani.',
    },
  ],

  securityH: 'Sebezhetőség bejelentése',
  securityBefore: 'Találtál egy sebezhetőséget? Írj a következő címre: ',
  securityAfter: '. 72 órán belül válaszolunk.',

  changesH: 'Változások',
  changesIntro: 'Ha valaha:',
  changesBullets: [
    'új alvállalkozót veszünk be,',
    'új típusú adatot küldünk a szerverre, vagy',
    'megváltoztatjuk a titkosítási sémát,',
  ],
  changesCloser:
    '…frissítjük ezt az oldalt, jelzést teszünk az alkalmazáson belüli „Újdonságok" panelbe, és verziót emelünk. A tisztán refaktoráló és hibajavító kiadások nem váltanak ki értesítést.',
};

const LOCALES: Record<string, PrivacyContent> = { en, hu };

/** Reactive accessor — re-runs when `lang()` changes. Falls back to English. */
export function privacyContent(): PrivacyContent {
  return LOCALES[lang()] ?? LOCALES.en;
}

export const PRIVACY_CONTACT_EMAIL = 'privacy@inkmirror.cc';
export const PRIVACY_SECURITY_EMAIL = 'security@inkmirror.cc';
