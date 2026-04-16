import { chunkTextByParagraph, rejoinChunks } from '../src/services/writing/chunk-text';

describe('chunkTextByParagraph', () => {
  it('returns empty array for empty input', () => {
    expect(chunkTextByParagraph('')).toEqual([]);
    expect(chunkTextByParagraph('   \n\n   ')).toEqual([]);
  });

  it('returns one chunk when all paragraphs fit under target', () => {
    const text = 'First paragraph of about eight words here.\n\nSecond one, just as short.';
    const chunks = chunkTextByParagraph(text, { targetWords: 1000 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].startParagraph).toBe(0);
    expect(chunks[0].endParagraph).toBe(1);
    expect(chunks[0].precedingTail).toBe('');
  });

  it('splits at paragraph boundaries when target is exceeded', () => {
    // Three paragraphs of 10 words each; target 15 → chunks of 1 paragraph
    // (when adding a second would exceed target).
    const p = (n: number): string => `${n} ${'word'.repeat(1)} `.trim() + ' ' + Array(9).fill('word').join(' ');
    const text = [p(1), p(2), p(3)].join('\n\n');
    const chunks = chunkTextByParagraph(text, { targetWords: 15, tailWords: 3 });
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    for (const c of chunks) {
      // Each chunk contains whole paragraphs only — never ends mid-sentence
      // because of a word cut.
      expect(c.text.endsWith('word')).toBe(true);
    }
  });

  it('keeps an oversize single paragraph as its own chunk', () => {
    const big = Array(500).fill('word').join(' ');
    const text = `Small para one.\n\n${big}\n\nSmall para three.`;
    const chunks = chunkTextByParagraph(text, { targetWords: 100, tailWords: 20 });
    // Middle chunk is the 500-word paragraph alone.
    const middle = chunks.find((c) => c.text.startsWith('word word'));
    expect(middle).toBeDefined();
    expect(middle!.startParagraph).toBe(middle!.endParagraph);
  });

  it('populates precedingTail from the prior chunks text (at most tailWords)', () => {
    const p1 = Array(30).fill('alpha').join(' ');
    const p2 = Array(30).fill('beta').join(' ');
    const p3 = Array(30).fill('gamma').join(' ');
    const text = [p1, p2, p3].join('\n\n');
    const chunks = chunkTextByParagraph(text, { targetWords: 30, tailWords: 5 });
    // The very first chunk has no preceding tail.
    expect(chunks[0].precedingTail).toBe('');
    if (chunks.length > 1) {
      // Subsequent chunks' tails are ≤5 words.
      expect(chunks[1].precedingTail.split(/\s+/).length).toBeLessThanOrEqual(5);
      // And contain words from the prior chunk (alpha).
      expect(chunks[1].precedingTail.includes('alpha')).toBe(true);
    }
  });

  it('reconstruction invariant — joining chunks back yields the original paragraph stream', () => {
    const paragraphs = [
      'The keeper woke before the light. She always had.',
      'Something about the note — its careful hand, the period after Tuesday — suggested it had been written for someone who would understand.',
      'She did not water the roses. She did not yet know if there were roses to water.',
      'Weeks pass in a house like this the way tide does. You do not notice it leaving, only that the chair sits differently in the light.',
    ];
    const original = paragraphs.join('\n\n');
    const chunks = chunkTextByParagraph(original, { targetWords: 25, tailWords: 4 });
    const rejoined = rejoinChunks(chunks);
    // Rejoining concatenates chunk texts with \n\n. Each chunk's text is the
    // paragraphs joined by \n\n internally. End-to-end this should equal the
    // original (after both sides trim trailing whitespace).
    expect(rejoined.trim()).toBe(original.trim());
  });

  it('startParagraph / endParagraph indexes are contiguous and cover every paragraph', () => {
    const text = Array.from({ length: 12 }, (_, i) => `Paragraph ${i + 1} content words here.`).join(
      '\n\n'
    );
    const chunks = chunkTextByParagraph(text, { targetWords: 20, tailWords: 5 });
    // Chunks should tile [0..11] contiguously.
    let expectedStart = 0;
    for (const c of chunks) {
      expect(c.startParagraph).toBe(expectedStart);
      expect(c.endParagraph).toBeGreaterThanOrEqual(c.startParagraph);
      expectedStart = c.endParagraph + 1;
    }
    expect(expectedStart).toBe(12);
  });

  it('normalizes CRLF to LF for paragraph splitting', () => {
    const text = 'One paragraph.\r\n\r\nSecond paragraph.\r\n\r\nThird.';
    const chunks = chunkTextByParagraph(text, { targetWords: 1000 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].endParagraph).toBe(2);
  });
});
