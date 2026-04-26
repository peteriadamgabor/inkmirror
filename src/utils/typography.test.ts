import { describe, it, expect } from 'vitest';
import { applyTypographyReplacement } from './typography';

function makeNode(data: string): Text {
  // jsdom Text nodes are mutable just like DOM ones; we just need
  // something with a writable .data field for the helper to operate on.
  return document.createTextNode(data);
}

describe('applyTypographyReplacement', () => {
  describe('em-dash', () => {
    it('replaces -- with em-dash at end of typing', () => {
      const node = makeNode('say --');
      const result = applyTypographyReplacement(node, 6, false);
      expect(node.data).toBe('say —');
      expect(result.replaced).toBe(true);
      expect(result.offset).toBe(5);
    });

    it('does not re-trigger when a third dash follows', () => {
      const node = makeNode('---');
      const result = applyTypographyReplacement(node, 3, false);
      expect(node.data).toBe('---');
      expect(result.replaced).toBe(false);
    });

    it('handles -- at the very start of the node', () => {
      const node = makeNode('--word');
      const result = applyTypographyReplacement(node, 2, false);
      expect(node.data).toBe('—word');
      expect(result.offset).toBe(1);
    });
  });

  describe('ellipsis', () => {
    it('replaces ... with …', () => {
      const node = makeNode('and so...');
      const result = applyTypographyReplacement(node, 9, false);
      expect(node.data).toBe('and so…');
      expect(result.offset).toBe(7);
    });

    it('does not re-trigger after a fourth dot', () => {
      const node = makeNode('....');
      const result = applyTypographyReplacement(node, 4, false);
      expect(node.data).toBe('....');
      expect(result.replaced).toBe(false);
    });
  });

  describe('smart quotes (gated by smartQuotes flag)', () => {
    it('does nothing when smartQuotes is false', () => {
      const node = makeNode('"hi"');
      const result = applyTypographyReplacement(node, 4, false);
      expect(node.data).toBe('"hi"');
      expect(result.replaced).toBe(false);
    });

    it('opens a double quote at the start of a string', () => {
      const node = makeNode('"');
      applyTypographyReplacement(node, 1, true);
      expect(node.data).toBe('“');
    });

    it('closes a double quote after a letter', () => {
      const node = makeNode('hi"');
      applyTypographyReplacement(node, 3, true);
      expect(node.data).toBe('hi”');
    });

    it('opens a double quote after whitespace', () => {
      const node = makeNode('he said "');
      applyTypographyReplacement(node, 9, true);
      expect(node.data).toBe('he said “');
    });

    it("treats apostrophe in I'm as closing curly", () => {
      const node = makeNode("I'");
      applyTypographyReplacement(node, 2, true);
      expect(node.data).toBe('I’');
    });

    it('opens a single quote at the start of a quoted phrase', () => {
      const node = makeNode("'");
      applyTypographyReplacement(node, 1, true);
      expect(node.data).toBe('‘');
    });
  });
});
