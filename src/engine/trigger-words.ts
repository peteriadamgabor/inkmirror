/**
 * Curated trigger-word lists for inconsistency detection pruning.
 *
 * The goal isn't linguistic completeness — it's coverage of the nouns
 * most likely to carry attribute claims about a character. Two sentences
 * that share (a) a tracked character and (b) a trigger word from the
 * same category are deemed worth an NLI call; everything else is
 * pruned to keep the O(n²) pairwise scan tractable.
 *
 * Lists can grow. Kept lower-case; matching is case-insensitive and
 * uses Unicode word boundaries so Hungarian accented forms work.
 */

import type { TriggerCategory } from '@/types';

type TriggerLang = 'en' | 'hu';

export const TRIGGER_WORDS: Record<TriggerLang, Record<TriggerCategory, string[]>> = {
  en: {
    kinship: [
      'father', 'mother', 'brother', 'sister', 'son', 'daughter',
      'uncle', 'aunt', 'cousin', 'niece', 'nephew',
      'grandfather', 'grandmother', 'grandson', 'granddaughter',
      'husband', 'wife', 'spouse', 'fiance', 'fiancee',
      'stepfather', 'stepmother', 'stepson', 'stepdaughter',
      'stepbrother', 'stepsister',
      'twin', 'sibling', 'in-law',
    ],
    body: [
      'eye', 'eyes', 'hair', 'beard', 'moustache', 'mustache',
      'skin', 'face', 'cheek', 'cheeks', 'jaw', 'chin', 'nose', 'mouth', 'lips',
      'tooth', 'teeth', 'tongue', 'ear', 'ears',
      'hand', 'hands', 'finger', 'fingers', 'arm', 'arms',
      'leg', 'legs', 'foot', 'feet', 'knee', 'knees',
      'height', 'tall', 'short', 'scar', 'scars', 'birthmark',
      'tattoo', 'tattoos', 'freckles',
    ],
    profession: [
      'doctor', 'nurse', 'physician', 'surgeon',
      'teacher', 'professor', 'student',
      'soldier', 'officer', 'captain', 'sergeant', 'general', 'colonel',
      'priest', 'nun', 'monk', 'rabbi',
      'farmer', 'miller', 'baker', 'carpenter', 'blacksmith',
      'merchant', 'shopkeeper', 'innkeeper', 'butcher',
      'lawyer', 'judge', 'policeman', 'sheriff',
      'sailor', 'fisherman', 'hunter',
      'writer', 'poet', 'painter', 'musician', 'fiddler', 'actor',
      'king', 'queen', 'prince', 'princess', 'lord', 'lady',
    ],
  },
  hu: {
    kinship: [
      'apa', 'anya', 'apja', 'anyja',
      'fia', 'fiú', 'lány', 'lánya',
      'báty', 'bátyja', 'öcs', 'öccse', 'nővér', 'nővére', 'húg', 'húga',
      'testvér', 'testvére', 'ikertestvér', 'ikerpár',
      'nagybácsi', 'nagynéni', 'unokatestvér', 'unoka',
      'nagyapa', 'nagyanya', 'nagypapa', 'nagymama',
      'férj', 'felesége', 'feleség', 'férje',
      'mostohaapa', 'mostohaanya',
    ],
    body: [
      'szem', 'szeme', 'szemük', 'szemű',
      'haj', 'haja', 'szakáll', 'bajusz',
      'bőr', 'bőre', 'arc', 'arca', 'orr', 'orra', 'száj', 'szája', 'ajak', 'ajka',
      'fog', 'foga', 'nyelv', 'nyelve', 'fül', 'füle',
      'kéz', 'keze', 'ujj', 'ujja', 'kar', 'karja',
      'láb', 'lába', 'térd', 'térde',
      'magas', 'alacsony', 'heg', 'hege', 'anyajegy', 'tetoválás', 'szeplő',
    ],
    profession: [
      'orvos', 'nővér', 'sebész', 'ápoló',
      'tanár', 'professzor', 'diák', 'tanuló',
      'katona', 'tiszt', 'százados', 'őrnagy', 'tábornok', 'ezredes',
      'pap', 'lelkész', 'apáca', 'szerzetes',
      'paraszt', 'földműves', 'molnár', 'pék', 'ács', 'kovács',
      'kereskedő', 'boltos', 'kocsmáros', 'hentes',
      'ügyvéd', 'bíró', 'rendőr',
      'hajós', 'halász', 'vadász',
      'író', 'költő', 'festő', 'zenész', 'hegedűs', 'színész',
      'király', 'királynő', 'herceg', 'hercegnő', 'úr', 'úrhölgy',
    ],
  },
};

// Pre-build a category → RegExp lookup per language so we don't rebuild
// the regex on every sentence. Unicode word boundaries via `(?<!\p{L})`
// and `(?!\p{L})` keep "father" from matching "fatherland" and "szem"
// from matching "szemtelen".
const regexCache = new Map<string, RegExp>();

function getCategoryRegex(lang: TriggerLang, cat: TriggerCategory): RegExp {
  const key = `${lang}:${cat}`;
  const cached = regexCache.get(key);
  if (cached) {
    cached.lastIndex = 0;
    return cached;
  }
  // Escape each word in case any contain regex metacharacters (e.g., "in-law").
  const escaped = TRIGGER_WORDS[lang][cat].map((w) =>
    w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
  );
  // Sort by length descending so longer words match first (e.g., "grandfather"
  // before "father") — alternation tries options left-to-right.
  escaped.sort((a, b) => b.length - a.length);
  const pattern = `(?<![\\p{L}\\p{N}])(?:${escaped.join('|')})(?![\\p{L}\\p{N}])`;
  const re = new RegExp(pattern, 'iu');
  regexCache.set(key, re);
  return re;
}

/**
 * Classify a sentence into the set of trigger categories it touches.
 * Callers pair two sentences only if they share ≥1 category.
 */
export function triggerCategories(
  sentence: string,
  lang: TriggerLang,
): Set<TriggerCategory> {
  const out = new Set<TriggerCategory>();
  for (const cat of ['kinship', 'body', 'profession'] as const) {
    if (getCategoryRegex(lang, cat).test(sentence)) {
      out.add(cat);
    }
  }
  return out;
}
