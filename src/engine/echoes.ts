/**
 * Echoes — repeated-language analysis. Pure functions, UI-independent:
 * given block texts, find (1) overused words, (2) close echoes (the same
 * word recurring within a short window — the thing a reader's ear
 * catches), and (3) repeated multi-word phrases.
 *
 * Mirror, not pen: the report only counts what's written. No synonyms,
 * no suggestions, no style score.
 *
 * Language notes: the tokenizer is Unicode-aware so Hungarian accents
 * survive; the stopword list merges en + hu because the prose language
 * and the UI language are independent. Hungarian agglutination means
 * exact-token matching undercounts inflected repeats — accepted for v1.
 */

export interface EchoInputBlock {
  id: string;
  text: string;
}

export interface OverusedWord {
  term: string;
  count: number;
  /** Occurrences per 1000 words — stable across scope sizes. */
  perThousand: number;
}

export interface EchoCluster {
  term: string;
  /** Occurrences that sit inside echo windows (not the global count). */
  count: number;
  /** Blocks containing the clustered occurrences, in document order. */
  blockIds: string[];
  /** Smallest token gap between two clustered occurrences. */
  minGapTokens: number;
}

export interface RepeatedPhrase {
  phrase: string;
  count: number;
  blockIds: string[];
}

export interface EchoReport {
  totalWords: number;
  overused: OverusedWord[];
  echoes: EchoCluster[];
  phrases: RepeatedPhrase[];
}

/** Same word again within this many tokens reads as an echo. */
const ECHO_WINDOW = 60;
const MIN_WORD_LEN = 3;
const MAX_OVERUSED = 12;
const MAX_ECHOES = 15;
const MAX_PHRASES = 10;

/**
 * Function words that repeat by grammar, not by habit. Merged en + hu —
 * misfires are harmless (a stopword can't be reported, that's all).
 */
const STOPWORDS = new Set<string>([
  // English
  'the', 'a', 'an', 'and', 'or', 'but', 'nor', 'so', 'yet', 'for', 'of',
  'to', 'in', 'on', 'at', 'by', 'with', 'from', 'into', 'onto', 'over',
  'under', 'about', 'after', 'before', 'between', 'through', 'during',
  'above', 'below', 'against', 'among', 'around', 'behind', 'beside',
  'down', 'off', 'out', 'up', 'near', 'than', 'then', 'once', 'here',
  'there', 'where', 'when', 'while', 'why', 'how', 'what', 'which', 'who',
  'whom', 'whose', 'this', 'that', 'these', 'those', 'all', 'any', 'both',
  'each', 'few', 'more', 'most', 'other', 'some', 'such', 'not', 'only',
  'own', 'same', 'too', 'very', 'just', 'now', 'ever', 'never', 'also',
  'again', 'still', 'even', 'i', 'me', 'my', 'mine', 'myself', 'we', 'us',
  'our', 'ours', 'ourselves', 'you', 'your', 'yours', 'yourself', 'he',
  'him', 'his', 'himself', 'she', 'her', 'hers', 'herself', 'it', 'its',
  'itself', 'they', 'them', 'their', 'theirs', 'themselves', 'am', 'is',
  'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'having', 'do', 'does', 'did', 'doing', 'will', 'would', 'shall',
  'should', 'can', 'could', 'may', 'might', 'must', 'as', 'if', 'because',
  'until', 'unless', 'although', 'though', 'whether', 'one', 'two', 'no',
  'yes', 'dont', "don't", 'didnt', "didn't", 'wasnt', "wasn't", 'isnt',
  "isn't", 'im', "i'm", 'ive', "i've", 'id', "i'd", 'hed', "he'd", 'shed',
  "she'd", 'youre', "you're", 'its', "it's", 'thats', "that's",
  // Hungarian
  'az', 'egy', 'és', 'is', 'hogy', 'nem', 'igen', 'de', 'ha', 'mint',
  'mert', 'vagy', 'csak', 'már', 'még', 'majd', 'most', 'itt', 'ott',
  'így', 'úgy', 'aki', 'ami', 'amely', 'amelyik', 'amikor', 'ahol',
  'ahogy', 'akkor', 'azután', 'aztán', 'ezért', 'azért', 'ezzel', 'azzal',
  'ebben', 'abban', 'erre', 'arra', 'ezt', 'azt', 'ennek', 'annak',
  'ehhez', 'ahhoz', 'ettől', 'attól', 'ezen', 'azon', 'én', 'te', 'ő',
  'mi', 'ti', 'ők', 'engem', 'téged', 'őt', 'minket', 'titeket', 'őket',
  'nekem', 'neked', 'neki', 'nekünk', 'nektek', 'nekik', 'velem', 'veled',
  'vele', 'velünk', 'veletek', 'velük', 'bennem', 'benned', 'benne',
  'rám', 'rád', 'rá', 'ránk', 'rátok', 'rájuk', 'tőlem', 'tőled', 'tőle',
  'enyém', 'tiéd', 'övé', 'mienk', 'tietek', 'övék', 'magam', 'magad',
  'maga', 'magát', 'magunk', 'magatok', 'maguk', 'van', 'vannak', 'volt',
  'voltak', 'lesz', 'lesznek', 'lett', 'lettek', 'lenne', 'lennének',
  'volna', 'legyen', 'vagyok', 'vagy', 'vagyunk', 'vagytok', 'voltam',
  'voltál', 'voltunk', 'voltatok', 'nincs', 'nincsenek', 'sincs', 'sem',
  'se', 'ne', 'nem', 'meg', 'el', 'fel', 'le', 'ki', 'be', 'át', 'rá',
  'oda', 'ide', 'vissza', 'össze', 'szét', 'mind', 'minden', 'mindig',
  'soha', 'semmi', 'senki', 'valami', 'valaki', 'bármi', 'bárki', 'olyan',
  'ilyen', 'amilyen', 'milyen', 'mennyi', 'hány', 'hol', 'hova', 'honnan',
  'mikor', 'miért', 'hogyan', 'ezek', 'azok', 'pedig', 'hanem', 'illetve',
  'valamint', 'tehát', 'hiszen', 'ugyanis', 'viszont', 'azonban', 'mégis',
  'éppen', 'épp', 'talán', 'szinte', 'nagyon', 'kissé', 'kicsit', 'alig',
  'inkább', 'aztán', 'után', 'előtt', 'alatt', 'fölött', 'felett',
  'mellett', 'között', 'körül', 'nélkül', 'ellen', 'iránt', 'miatt',
  'helyett', 'szerint', 'által', 'felé', 'óta', 'túl', 'belül', 'kívül',
]);

const WORD_RE = /\p{L}+(?:['’-]\p{L}+)*/gu;

interface TokenOccurrence {
  /** Global token index across the ordered block stream. */
  pos: number;
  blockId: string;
}

function isContentWord(term: string): boolean {
  return term.length >= MIN_WORD_LEN && !STOPWORDS.has(term);
}

export function analyzeEchoes(
  blocks: readonly EchoInputBlock[],
  excludeTerms: readonly string[] = [],
): EchoReport {
  const exclude = new Set(excludeTerms.map((t) => t.toLowerCase()));

  // Single tokenization pass. Token positions are global across blocks
  // (in the given order) so echo windows span block boundaries; n-grams
  // stay within a block so phrases never bridge a paragraph break.
  const occurrences = new Map<string, TokenOccurrence[]>();
  const phraseCounts = new Map<string, { count: number; blockIds: string[] }>();
  let pos = 0;
  let totalWords = 0;

  for (const block of blocks) {
    const tokens: string[] = [];
    for (const m of block.text.toLowerCase().matchAll(WORD_RE)) {
      tokens.push(m[0]);
    }
    totalWords += tokens.length;

    for (const term of tokens) {
      if (isContentWord(term) && !exclude.has(term)) {
        const list = occurrences.get(term);
        if (list) list.push({ pos, blockId: block.id });
        else occurrences.set(term, [{ pos, blockId: block.id }]);
      }
      pos += 1;
    }

    // Per-block n-grams (4 first so 3-gram subsets can be subsumed).
    for (const n of [4, 3] as const) {
      for (let i = 0; i + n <= tokens.length; i += 1) {
        const gram = tokens.slice(i, i + n);
        if (!gram.some((w) => isContentWord(w) && !exclude.has(w))) continue;
        const key = `${n}:${gram.join(' ')}`;
        const entry = phraseCounts.get(key);
        if (entry) {
          entry.count += 1;
          if (entry.blockIds[entry.blockIds.length - 1] !== block.id) {
            entry.blockIds.push(block.id);
          }
        } else {
          phraseCounts.set(key, { count: 1, blockIds: [block.id] });
        }
      }
    }
  }

  // --- Overused words: high global count, scaled to scope size. ---
  const minOverusedCount = Math.max(5, Math.ceil(totalWords / 1200));
  const overused: OverusedWord[] = [];
  for (const [term, occ] of occurrences) {
    if (occ.length < minOverusedCount) continue;
    overused.push({
      term,
      count: occ.length,
      perThousand: totalWords > 0 ? (occ.length / totalWords) * 1000 : 0,
    });
  }
  overused.sort((a, b) => b.count - a.count || a.term.localeCompare(b.term));
  overused.length = Math.min(overused.length, MAX_OVERUSED);
  const overusedTerms = new Set(overused.map((o) => o.term));

  // --- Close echoes: the same word again within ECHO_WINDOW tokens. ---
  const echoes: EchoCluster[] = [];
  for (const [term, occ] of occurrences) {
    if (overusedTerms.has(term)) continue; // already reported above
    const clustered = new Set<number>();
    let minGap = Number.POSITIVE_INFINITY;
    for (let i = 1; i < occ.length; i += 1) {
      const gap = occ[i].pos - occ[i - 1].pos;
      if (gap <= ECHO_WINDOW) {
        clustered.add(i - 1);
        clustered.add(i);
        if (gap < minGap) minGap = gap;
      }
    }
    if (clustered.size < 2) continue;
    const blockIds: string[] = [];
    for (const idx of [...clustered].sort((a, b) => a - b)) {
      const id = occ[idx].blockId;
      if (blockIds[blockIds.length - 1] !== id) blockIds.push(id);
    }
    echoes.push({ term, count: clustered.size, blockIds, minGapTokens: minGap });
  }
  echoes.sort(
    (a, b) =>
      b.count - a.count || a.minGapTokens - b.minGapTokens || a.term.localeCompare(b.term),
  );
  echoes.length = Math.min(echoes.length, MAX_ECHOES);

  // --- Repeated phrases: 4-grams twice, 3-grams three times. Collect
  // the 4-gram findings first so a 3-gram living entirely inside one
  // (with the same count — i.e. no occurrences of its own) is subsumed
  // rather than double-reported. ---
  const phrases: RepeatedPhrase[] = [];
  const reportedFourGrams: Array<{ phrase: string; count: number }> = [];
  for (const [key, entry] of phraseCounts) {
    if (!key.startsWith('4:') || entry.count < 2) continue;
    const phrase = key.slice(2);
    phrases.push({ phrase, count: entry.count, blockIds: entry.blockIds });
    reportedFourGrams.push({ phrase, count: entry.count });
  }
  for (const [key, entry] of phraseCounts) {
    if (!key.startsWith('3:') || entry.count < 3) continue;
    const phrase = key.slice(2);
    const subsumed = reportedFourGrams.some(
      (four) => four.count === entry.count && four.phrase.includes(phrase),
    );
    if (subsumed) continue;
    phrases.push({ phrase, count: entry.count, blockIds: entry.blockIds });
  }
  phrases.sort(
    (a, b) =>
      b.count - a.count ||
      b.phrase.length - a.phrase.length ||
      a.phrase.localeCompare(b.phrase),
  );
  phrases.length = Math.min(phrases.length, MAX_PHRASES);

  return { totalWords, overused, echoes, phrases };
}
