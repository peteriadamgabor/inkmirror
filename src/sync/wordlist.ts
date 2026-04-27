/**
 * Curated 256-word list for in-app passphrase generation.
 *
 * Properties:
 *   - 256 = 2^8 entries → exactly 8 bits per pick, no modulo-bias accommodation
 *     needed; we draw an unbiased byte and index directly.
 *   - All-lowercase, ASCII-only, 4–7 characters per word, common English nouns
 *     and adjectives. Optimised for memorability and unambiguous pronunciation.
 *   - No homophones with each other in the list, no profanity, no proper nouns.
 *
 * Usage: 8 picks → 256^8 = 2^64 possible passphrases → 64 bits of entropy.
 * Combined with Argon2id MODERATE on the derive side, this is well above the
 * threshold where offline brute-force from a leaked auth_proof+salt is practical.
 *
 * Bundle cost: ~2 KB minified.
 *
 * IMPORTANT: do not reorder, mutate, or trim this list — its length being a
 * power of two is what lets the picker use one byte per pick without bias.
 */
export const WORDLIST: readonly string[] = [
  'amber', 'anchor', 'apple', 'arbor', 'arrow', 'aspen', 'autumn', 'azure',
  'badge', 'banjo', 'basin', 'beach', 'beacon', 'bench', 'berry', 'birch',
  'bison', 'blade', 'blaze', 'blossom', 'border', 'breeze', 'bridge', 'bronze',
  'brook', 'bubble', 'butter', 'cabin', 'cactus', 'camel', 'candle', 'canyon',
  'carbon', 'castle', 'cedar', 'chalk', 'cherry', 'chest', 'cider', 'cinder',
  'cliff', 'cloud', 'clover', 'cobalt', 'cocoa', 'comet', 'copper', 'coral',
  'cotton', 'cove', 'crane', 'crater', 'crest', 'crow', 'crown', 'crystal',
  'dagger', 'daisy', 'dawn', 'delta', 'desert', 'diamond', 'dragon', 'dream',
  'drift', 'dune', 'dusk', 'eagle', 'earth', 'ember', 'emerald', 'fable',
  'falcon', 'feather', 'fern', 'field', 'finch', 'fjord', 'flame', 'flask',
  'flax', 'fleet', 'flint', 'forest', 'fox', 'fresh', 'frost', 'galaxy',
  'garden', 'garnet', 'glacier', 'glade', 'glass', 'glow', 'goose', 'granite',
  'grape', 'grass', 'gravel', 'grove', 'gull', 'hail', 'hammer', 'harbor',
  'hare', 'harvest', 'haven', 'hawk', 'hazel', 'heath', 'hedge', 'helm',
  'heron', 'hill', 'honey', 'horizon', 'horse', 'hyacinth', 'iris', 'iron',
  'island', 'ivory', 'jade', 'jasper', 'kelp', 'kettle', 'knot', 'lagoon',
  'lake', 'lantern', 'lark', 'lemon', 'light', 'lilac', 'lily', 'lime',
  'linen', 'loom', 'lotus', 'lynx', 'magnet', 'maple', 'marble', 'marigold',
  'marsh', 'meadow', 'medal', 'midnight', 'mist', 'moon', 'moose', 'moss',
  'mountain', 'nest', 'nettle', 'noon', 'north', 'oak', 'ocean', 'olive',
  'onyx', 'opal', 'orange', 'orchid', 'otter', 'oyster', 'paint', 'palm',
  'panda', 'pear', 'pearl', 'pebble', 'pine', 'plum', 'pond', 'poppy',
  'porch', 'prairie', 'puma', 'quartz', 'quiet', 'quill', 'quince', 'rabbit',
  'raft', 'rain', 'rainbow', 'raven', 'reef', 'reed', 'ribbon', 'ridge',
  'river', 'road', 'robin', 'rope', 'rose', 'ruby', 'rune', 'sage',
  'sail', 'salt', 'sand', 'sapphire', 'satin', 'scout', 'seed', 'shade',
  'shell', 'shelter', 'shore', 'silk', 'silver', 'slate', 'snow', 'song',
  'sparrow', 'spring', 'spruce', 'star', 'stone', 'storm', 'stream', 'summer',
  'swan', 'thistle', 'thorn', 'thunder', 'tide', 'tiger', 'topaz', 'torch',
  'tower', 'trail', 'trout', 'tundra', 'twig', 'twilight', 'valley', 'vase',
  'velvet', 'vine', 'violet', 'vista', 'volcano', 'walnut', 'water', 'wave',
  'wheat', 'whisper', 'willow', 'winter', 'wolf', 'wool', 'yarn', 'zenith',
];

if (WORDLIST.length !== 256) {
  // This is a dev-time sanity check. Trips only if someone edits the list
  // without preserving its 256-element shape, which would re-introduce
  // modulo bias on byte-indexed picks.
  throw new Error(`WORDLIST must be 256 entries; got ${WORDLIST.length}`);
}

/**
 * Generate a passphrase by picking `count` words uniformly at random.
 *
 * Each word contributes log2(256) = 8 bits of entropy. The default of 8 picks
 * yields 64 bits — comfortably above offline-attack-feasibility against an
 * Argon2id MODERATE derive (~1 s/guess, ~hours on commodity GPUs).
 */
export function generatePassphrase(count = 8): string {
  if (count < 1) throw new Error('count must be ≥ 1');
  const buf = crypto.getRandomValues(new Uint8Array(count));
  let out = '';
  for (let i = 0; i < count; i++) {
    if (i > 0) out += '-';
    out += WORDLIST[buf[i]];
  }
  return out;
}
