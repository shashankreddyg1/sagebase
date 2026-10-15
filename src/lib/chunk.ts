export interface TextChunk {
  index: number;
  content: string;
}

const DEFAULT_CHUNK_SIZE = 800;
const DEFAULT_OVERLAP = 100;

/**
 * Split text into ~800-character chunks with 100 characters of overlap.
 * Prefers to break on whitespace so words are never cut in half.
 */
export function chunkText(
  text: string,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
  overlap: number = DEFAULT_OVERLAP,
): TextChunk[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];

  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < clean.length) {
    let end = Math.min(start + chunkSize, clean.length);

    // Prefer a word boundary: walk back to the last space before `end`.
    if (end < clean.length) {
      const lastSpace = clean.lastIndexOf(' ', end);
      if (lastSpace > start + chunkSize * 0.5) {
        end = lastSpace;
      }
    }

    const content = clean.slice(start, end).trim();
    if (content) {
      chunks.push({ index: index++, content });
    }

    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }

  return chunks;
}
