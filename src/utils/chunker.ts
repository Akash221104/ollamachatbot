/**
 * Segment text content into paragraph-based chunks.
 * Splits on double-newlines/blank lines, trims whitespace, and filters out empty lines.
 */
export function chunkText(content: string): string[] {
  return content
    .split(/\n\s*\n+/)
    .map(chunk => chunk.trim())
    .filter(Boolean);
}
