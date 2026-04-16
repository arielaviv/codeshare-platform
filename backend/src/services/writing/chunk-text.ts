/**
 * Paragraph-boundary chunker.
 *
 * Used by the Slice-5 editing pipeline (line-editor + copy-editor) to slice
 * long chapters into LLM-sized pieces while preserving paragraph structure.
 *
 * Invariants:
 *   1. NEVER splits mid-paragraph. A single oversized paragraph (rare) stays
 *      as its own chunk even if it exceeds targetWords.
 *   2. Splits only on double-newline paragraph boundaries.
 *   3. Reconstruction: joining every chunk's `text` with `\n\n` produces the
 *      original prose (up to trailing/leading whitespace normalization on
 *      each paragraph).
 *   4. `precedingTail` on chunk K is a read-only rhythm hint — the last N
 *      words from chunk K-1. Editors include it in the prompt for voice
 *      continuity but are explicitly instructed NOT to rewrite it.
 */

export interface TextChunk {
  /** The prose this chunk is responsible for rewriting. */
  text: string;
  /** Last ~N words from prior chunk — provides rhythm context; NOT rewritten. */
  precedingTail: string;
  /** Zero-based index of the first paragraph in this chunk within the original. */
  startParagraph: number;
  /** Zero-based index of the last paragraph in this chunk (inclusive). */
  endParagraph: number;
}

export interface ChunkOptions {
  /** Target word count per chunk. Real chunks may exceed this when a single paragraph is larger. */
  targetWords?: number;
  /** Words of preceding-tail context. */
  tailWords?: number;
}

const DEFAULT_TARGET_WORDS = 2500;
const DEFAULT_TAIL_WORDS = 200;

/**
 * Split `text` into paragraph-boundary-respecting chunks whose cumulative
 * word count is at most `targetWords` per chunk (unless a single paragraph
 * exceeds that cap, in which case it stays as its own chunk).
 */
export function chunkTextByParagraph(text: string, opts: ChunkOptions = {}): TextChunk[] {
  const targetWords = opts.targetWords ?? DEFAULT_TARGET_WORDS;
  const tailWords = opts.tailWords ?? DEFAULT_TAIL_WORDS;

  if (!text || text.trim().length === 0) return [];

  const paragraphs = splitParagraphs(text);
  if (paragraphs.length === 0) return [];

  const chunks: TextChunk[] = [];
  let start = 0;
  let accumulator: string[] = [];
  let accumulatorWords = 0;

  for (let i = 0; i < paragraphs.length; i++) {
    const p = paragraphs[i];
    const pw = wordCount(p);

    // If adding this paragraph would exceed target AND the accumulator has
    // at least one paragraph already, flush first.
    if (accumulator.length > 0 && accumulatorWords + pw > targetWords) {
      chunks.push({
        text: accumulator.join('\n\n'),
        precedingTail: tailFromChunks(chunks, tailWords),
        startParagraph: start,
        endParagraph: i - 1,
      });
      start = i;
      accumulator = [];
      accumulatorWords = 0;
    }

    accumulator.push(p);
    accumulatorWords += pw;
  }

  if (accumulator.length > 0) {
    chunks.push({
      text: accumulator.join('\n\n'),
      precedingTail: tailFromChunks(chunks, tailWords),
      startParagraph: start,
      endParagraph: paragraphs.length - 1,
    });
  }

  return chunks;
}

/**
 * Reassemble chunks back into a single manuscript. Used by callers after the
 * line-editor / copy-editor have rewritten each chunk and we need the full
 * edited chapter to save.
 */
export function rejoinChunks(chunks: TextChunk[]): string {
  return chunks.map((c) => c.text.trim()).join('\n\n');
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function splitParagraphs(text: string): string[] {
  // Normalize CRLF → LF; split on 2+ consecutive newlines; trim + drop empty.
  return text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

function wordCount(s: string): number {
  const matches = s.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

function tailFromChunks(priorChunks: TextChunk[], tailWords: number): string {
  if (priorChunks.length === 0 || tailWords <= 0) return '';
  const prev = priorChunks[priorChunks.length - 1].text;
  const words = prev.trim().split(/\s+/);
  if (words.length <= tailWords) return prev.trim();
  return words.slice(words.length - tailWords).join(' ');
}
