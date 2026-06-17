import crypto from 'crypto';

/**
 * Generates an MD5 hash of the given string content.
 * Used for detecting modifications in document files to prevent redundant embeddings generation.
 */
export function generateHash(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex');
}
