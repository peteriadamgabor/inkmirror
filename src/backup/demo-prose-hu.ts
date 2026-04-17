/**
 * Magyar próza a demo-csomaghoz — Csehov "Rothschild hegedűje" InkMirror-
 * fordítás. A blokk-id-k egy az egyben párosulnak a demo-bundle.ts-ben
 * levő szerkezettel.
 *
 * Első piszkozat. Egy anyanyelvi polírozási kör még hasznos — pár
 * ritmus és szóválasztás kifejezetten fordításízű, ezeket a szerző
 * (Péteri Ádám Gábor) fogja a saját hangjára igazítani.
 */

export const demoMetaHu = {
  title: 'Rothschild hegedűje — egy demó',
  author: 'Anton Pavlovics Csehov · fordítás InkMirror számára',
  synopsis:
    'Egy haldokló orosz városka koporsókészítője gondosan vezeti a veszteségei könyvét. A végén kiderül, hogy az igazi veszteség az az élet volt, amit elmulasztott észrevenni. Rövid történet a gyászról, a megbánásról és egy dallam öröklődéséről.',

  'character.yakov.name': 'Jakov Ivanov',
  'character.yakov.aliases': ['Jakov', 'Jakov Matvejevics', 'Bronz'],
  'character.rothschild.name': 'Rothschild',
  'character.rothschild.aliases': ['a fuvolás', 'Moisej Iljics'],

  'scene1.location': 'Jakov műhelye és háza',
  'scene1.time': 'téli este',
  'scene1.mood': 'komor',
  'scene2.location': 'A folyópart a rozstábla mögött',
  'scene2.time': 'késő délután, a temetés után',
  'scene2.mood': 'gyengéd',
  'scene3.location': 'Jakov háza — az utolsó nap',
  'scene3.time': 'szürkület',
  'scene3.mood': 'melankolikus',

  'parens.barelyLooking': 'alig felnézve',
  'parens.withoutOpeningEyes': 'a szemét ki sem nyitva',
  'parens.aloudNoOne': 'hangosan, senkinek',
  'parens.outOfBreath': 'lihegve',
  'parens.atWindow': 'az ablaknál',
  'parens.quietly': 'csendesen',

  'graveyard.fromCh2': 'Kettő — a folyópart',
  'graveyard.fromCh3': 'Három — a hegedű',
} as const;

export const demoChapterTitlesHu = {
  ch1: 'Egy — veszteségek',
  ch2: 'Kettő — a folyópart',
  ch3: 'Három — a hegedű',
} as const;

export const demoProseHu: Record<string, string> = {
  // ---------- Első fejezet ----------
  'demo-blk-01':
    'Ez egy mintadokumentum, amit az InkMirrorral együtt szállítunk. Szerkeszd, rendezd át a blokkokat, állíts át párbeszéd-beszélőket, próbáld ki az exportmenüt, és töröld az egészet a dokumentumválasztóból, amikor végeztél. Semmi, amit itt teszel, nem hat semmi másra ezen a böngészőn kívül.',

  'demo-blk-03':
    'A város kicsi volt, kisebb mint egy falu, és lakói többnyire öregek. Olyan ritkán haltak meg, hogy az egyenesen bosszantó volt. Jakov Ivanov, a koporsókészítő, pontosan vezetett egy könyvet arról, hogy az egyes halálesetek mibe kerültek neki, és egy másikat arról, hogy mely halálesetek nem következtek be — ezeket nevezte veszteségeinek. Az év számadásai között tartotta őket.',

  'demo-blk-04':
    'Magas, szikár, hetvenéves ember volt, hatalmas kezekkel és fehér szakállal, és a városiak Bronznak hívták, bár a név oka feledésbe merült. Mesterségére nézve koporsókészítő volt, esténként pedig hegedűs. Amikor a városban lakodalmat tartottak, a zsidó zenekar őt is felfogadta, mert jól és olcsón hegedült. A zenekar fuvolása egy vékony, vörös hajú ember volt, akit Rothschildnak hívtak, s akit Jakov nem bírt elviselni. Minden rubel, amit Rothschild kapott, Jakov könyvében elveszett rubel volt — mert a zenekar keresete elosztásra került, és amit Rothschild megkeresett, azt Jakov nem.',

  'demo-blk-05':
    'A felesége, Marfa, némán végezte kis házuk munkáját. Ötvenkét éve voltak házasok. Jakov ezen idő alatt soha nem gondolt rá másként, mint egy berendezési tárgyra — a teáskanna, a pad, a seprű. Szidta, amikor rossz kedve volt, ami gyakran előfordult, és "haszontalan vénasszonynak" nevezte, amikor a kályha füstölt, ami néha az ő hibája volt, néha az asszonyé. Marfa válasz nélkül tűrte.',

  'demo-blk-06':
    'Egyszer volt egy gyermekük, egy szőke hajú kislány. Jakov már nem emlékezett rá. Amikor megpróbálta, csak a koporsót látta, amit neki csinált, és az kicsi volt. A gyermek régen meghalt, és ez is veszteség volt, de Jakov elfelejtette, milyenfajta.',

  'demo-blk-07':
    'Félre az útból, haszontalan vénasszony.',

  'demo-blk-08':
    'Egy késő téli estén Marfa nem kelt föl főzni. A kemencén feküdt, ahol aludni szokott, és a mellkasában szorult a lélegzet. Jakov bejött a műhelyből, és nem talált vacsorát. Öklével az asztalra csapott, aztán odament a kemencéhez.',

  'demo-blk-09':
    'Mi bajod van?',

  'demo-blk-10':
    'Nos? Süket vagy?',

  'demo-blk-11':
    'Marfa kinyitotta a szemét. Nagyon tiszta szemei voltak. Ugyanazon a hétköznapi hangon mondta, amelyen bármilyen megbízatásról beszélt volna:',

  'demo-blk-12':
    'Meghalok, Jakov. Ma éjjel vagy holnap meghalok.',

  'demo-blk-13':
    'Jakov kiment, és hazahozta a városból Makszim Nyikolajicsot, a felcsert. A fiatalember egy összesodort papíron keresztül hallgatta Marfa mellkasát, megnézte a nyelvét, és azt mondta, nincs mit tenni. Láz. Öregség. Jakov a latyakos úton vele gyalogolt haza, és fizetett neki fél rubelt. Fél rubel, gondolta. Aztán a koporsó: saját munkájából fél rubel megy a földbe. Nem gyászolt. Még azon éjjel, gyertyafénynél, elkészítette a koporsót, és reggel lemérte az asszonyt.',

  'demo-blk-14':
    'Jakov.',

  'demo-blk-15':
    'Igen.',

  'demo-blk-16':
    'Hosszú ideig nem szólt. Aztán nagyon halkan, mintha egy régen ismert ember felől érdeklődne, megkérdezte:',

  'demo-blk-17':
    'Emlékszel? Ötven évvel ezelőtt az Isten küldött nekünk egy kislányt, szőke hajjal. A folyóparton üldögéltünk, a fűzfa alatt — te, én és a gyermek — és énekeltünk.',

  'demo-blk-18':
    'Jakov bámulta. Nem emlékezett semmilyen fűzfára, semmilyen folyóra, semmilyen éneklő szőke gyermekre. De az asszony olyan bizonyossággal mondta — mint valami olyasmit, ami nem egyszer, hanem sokszor történt, talán minden nyáron —, hogy hideg futott végig rajta. Marfa aznap este meghalt. Jakov felöltöztette, belefektette a koporsóba, amit elkészített, és nézte, ahogy a pap eljön és elmegy. Nem sírt. Csak a fél rubel elvesztését érezte, és még egy másvalamit, amit nem tudott megnevezni, ami egy meg nem látott dolog alakja volt.',

  // ---------- Második fejezet ----------
  'demo-blk-20':
    'A temetés után nem ment haza. A városból a rozstáblán át vezető úton gyalogolt ki — a tábla itt-ott még fehér volt —, és egy folyóhoz ért, széles és lassú folyású volt, fűzfák hajoltak a víz fölé. És ott, hirtelen, visszatért minden.',

  'demo-blk-21':
    'Ötven évvel ezelőtt állt ezen a parton, karjában egy szőke hajú gyermekkel. A fűzfa ugyanaz a fűzfa volt. A gyermek kicsi kezét a vízbe mártotta, és nevetett, és Marfa énekelt — Marfa, aki sehol máshol nem énekelt, aki a házban csak egy berendezési tárgy volt —, egy kis nótát énekelt egy halról. Gyakran jártak ide, ő és Marfa és a kislány, minden nyáron néhány éven át. Jakov teljesen elfelejtette.',

  'demo-blk-22':
    'Leült egy tuskóra a víz mellett, és sírt. Egyszerre tört rá, és nem tudta abbahagyni. Kezei, melyek annyi koporsót készítettek, reszkettek a térdén.',

  'demo-blk-23':
    'Mennyi veszteség volt.',

  'demo-blk-24':
    'Gondolt házasságának ötven évére — ötven évre, melyek alatt nem nézett a felesége arcára, nem fogta meg a kezét, a semmiért szidta, és hallgatását bolondságnak vette. Gondolt a gyermekre, akit elfelejtett. Gondolt a folyóra, amelyhez azóta sem járt. Gondolt a tucatnyi lakodalomra, melyeken fizettek neki, miközben ő gyűlölte a mellette ülő fuvolást. Mit csinált ez alatt az ötven év alatt? Koporsókat csinált. Számolta a veszteségeit. Most, késő tiszta látással, megértette, hogy egész élete egy veszteségféle volt, és hogy ő volt, aki veszített.',

  'demo-blk-25':
    'A folyó tovább folyt. A fűzfák tovább hajoltak. A víz fölött egyetlen gém állt, tökéletesen mozdulatlanul, aztán úgy fordította el a fejét, mintha hallott volna valamit, amit senki más nem hallott.',

  'demo-blk-26':
    'A város felé vezető úton találkozott Rothschilddal, a fuvolással, aki a faluból sietett egy üzenettel. A vörös hajú fuvolás félt Jakovtól, mint mindig, és néhány lépésnyire megállt, a kezét tördelve.',

  'demo-blk-27':
    'Jakov Matvejevics! Saksz — a lakodalom — a zenekar keres — —',

  'demo-blk-28':
    'Takarodj a közelemből.',

  'demo-blk-29':
    'Felemelte a kezét. Megütötte volna a fuvolást — húsz éven át, minden vasárnap szerette volna —, de csak elfordult, és elment mellette a háza felé, ami most üres volt, és üres is maradna.',

  'demo-blk-gr1':
    '(Még egyszer meg akart átkozódni hátra a fuvolás felé, de amikor megfordult, Rothschild már a rozsban futott.)',

  // ---------- Harmadik fejezet ----------
  'demo-blk-31':
    'Azon éjjel nem aludt. Reggelre keze remegett, délutánra pedig nem tudott lábra állni. Felfeküdt a téglakemencére, ahol Marfa feküdt volt, és érezte, ahogy a láz felkúszik a mellébe — ugyanaz a láz, gondolta, pontosan ugyanaz —, és megértette, hogy a felcserért nem fognak elszaladni, senki nem fog fél rubelt fizetni érte, és hogy ma éjjel vagy holnap meg fog halni ebben a házban.',

  'demo-blk-32':
    'A hegedűjére gondolt. Sokáig gondolt rá, mintha egy személy volna. Aztán lassan leakasztotta a szegről, visszavitte a kemencéhez, és a térdén keresztbefektetve maga mellé ültette.',

  'demo-blk-33':
    'Kicsi hegedű volt, nagyon régi. A nyaka elkopott ott, ahol ötven éve fogta a keze. Hangolt rajta — sokáig tartott, mert remegett a keze —, aztán játszani kezdett.',

  'demo-blk-34':
    'Nem azokat a nótákat játszotta, amelyeket a lakodalmakon szokott — sosem szerette igazán azokat. Valami mást játszott. Egy dallamot, ami anélkül jött ki belőle, hogy kérte volna, hosszú volt és lassú, és nyilvánvalóan szomorú; dallam a folyóról, talán, vagy a fűzfáról, vagy a fél rubelről, vagy a szőke hajú lányról, vagy az ötven évről, vagy a fuvolásról, vagy mindegyikükről együtt. Az ablaka alatt, az úton, valaki, aki éppen elhaladt, megállt, hogy hallgassa.',

  'demo-blk-35':
    'Jakov Matvejevics. Mit játszol ott?',

  'demo-blk-36':
    'Gyere be.',

  'demo-blk-37':
    'Rothschild belépett, rémülten. Húsz év alatt soha nem hívták be ebbe a házba másért, mint veszekedésre. Sapkáját a kezében tartva állt az ajtóban, nem tudta, leüljön-e.',

  'demo-blk-38':
    'Fogd a hegedűt.',

  'demo-blk-39':
    'Mit?',

  'demo-blk-40':
    'Fogd. Meghalok, mielőtt a pap ideér. Fogd a hegedűt, és játssz.',

  'demo-blk-41':
    'A fuvolás kezébe nyomta a hegedűt és a vonót. Rothschild szó nélkül vette el, mert nem tudta, mit mondjon. A két férfi először nézett egymás szemébe úgy, mint két férfi, és nem mint egy zenekar számadásában két rubel.',

  'demo-blk-42':
    'Az a dallam, amit játszottam. Emlékszel rá?',

  'demo-blk-43':
    'Emlékszem rá.',

  'demo-blk-44':
    'Jakov lehunyta a szemét. A pap este érkezett. Jakov reggelre meghalt.',

  'demo-blk-45':
    'Rothschild megtartotta a hegedűt. A fuvolát félretette — húsz évig játszott rajta, és nem ért hozzá többé —, és megtanulta azt a dallamot, amit Jakov tanított meg neki élete utolsó napján. A város lakói, hallva, azt mondták, a legszebb dolog, amit valaha hallottak: olyan dallam, ami egyszerre hangzott sírásnak és vigasztalásnak. Kérték, hogy minden lakodalomban játssza el. Játszotta. Soha nem mondta el, honnan tanulta.',

  'demo-blk-46':
    'És a dallam tovább szólt.',

  'demo-blk-gr2':
    '(Jakov utolsó gondolata, ha megtartotta volna, az a fél rubel lett volna, amit nem tett félre a saját koporsójára.)',
};
