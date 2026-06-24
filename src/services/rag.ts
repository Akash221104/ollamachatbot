import { query, getClient } from '../lib/db';
import { getEmbedding } from './ollama';
import { chunkText } from '../utils/chunker';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export interface ChunkRecord {
  text: string;
  similarity: number;
  filename: string;
  chunkIndex: number;
}

export interface IngestResult {
  documentId: number;
  status: 'inserted' | 'skipped';
}

/**
 * Computes SHA-256 hash of document content.
 */
export function generateSHA256(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Ingests a text document into the platform.
 * Saves the file to the uploads directory, creates database records,
 * and generates vector chunks.
 */
export async function ingestDocument(
  filename: string,
  fullText: string,
  uploadedBy: string | null = null,
  embeddingModel: string = process.env.OLLAMA_EMBEDDING_MODEL || 'bge-m3'
): Promise<IngestResult> {
  const hash = generateSHA256(fullText);

  // 1. Check if a document with the same hash exists
  const existingByHash = await query(
    'SELECT id, filename FROM documents WHERE file_hash = $1',
    [hash]
  );
  if (existingByHash.rowCount && existingByHash.rowCount > 0) {
    console.log(`[RAG] Duplicate content detected for "${filename}" (matches existing document: "${existingByHash.rows[0].filename}"). Skipping.`);
    const existingId = existingByHash.rows[0].id;
    // Ensure it's assigned to the user if uploadedBy is provided
    if (uploadedBy) {
      await query(
        'INSERT INTO user_documents (user_id, document_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [uploadedBy, existingId]
      );
    }
    return { documentId: existingId, status: 'skipped' };
  }

  // 2. Ensure uploads directory exists and write the file
  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  const filePath = path.join(uploadsDir, filename);
  fs.writeFileSync(filePath, fullText, 'utf8');

  // 3. Create document record with PENDING/PROCESSING status
  const insertDocRes = await query(
    `INSERT INTO documents (filename, file_path, file_hash, status, embedding_status, uploaded_by)
     VALUES ($1, $2, $3, 'ACTIVE', 'PROCESSING', $4) RETURNING id`,
    [filename, filePath, hash, uploadedBy]
  );
  const documentId = insertDocRes.rows[0].id;

  // 4. Assign document to the uploader if provided
  if (uploadedBy) {
    await query(
      'INSERT INTO user_documents (user_id, document_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [uploadedBy, documentId]
    );
  }

  // 5. Chunk text and generate embeddings
  const chunks = chunkText(fullText);
  console.log(`[RAG] Document "${filename}" split into ${chunks.length} chunks. Generating embeddings using ${embeddingModel}...`);

  const client = await getClient();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await getEmbedding(chunk, embeddingModel);
      const vectorStr = '[' + embedding.join(',') + ']';

      await client.query(
        `INSERT INTO embeddings (document_id, chunk_index, chunk_text, embedding)
         VALUES ($1, $2, $3, $4::vector)`,
        [documentId, i, chunk, vectorStr]
      );
    }
    await client.query('COMMIT');

    // Update status to COMPLETED
    await query(
      "UPDATE documents SET embedding_status = 'COMPLETED' WHERE id = $1",
      [documentId]
    );

    console.log(`[RAG] Successfully ingested "${filename}" with ${chunks.length} chunks.`);
    return { documentId, status: 'inserted' };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`[RAG] Ingestion failed for "${filename}":`, error);
    
    // Update status to FAILED
    await query(
      "UPDATE documents SET embedding_status = 'FAILED' WHERE id = $1",
      [documentId]
    );
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Permanently deletes a document, removing files from disk and triggering SQL cascades.
 */
export async function deleteDocument(documentId: number): Promise<boolean> {
  const docQuery = await query('SELECT file_path FROM documents WHERE id = $1', [documentId]);
  if (!docQuery.rowCount || docQuery.rowCount === 0) {
    return false;
  }

  const { file_path } = docQuery.rows[0];
  
  // 1. Delete from database (triggers ON DELETE CASCADE for embeddings & user_documents)
  const res = await query('DELETE FROM documents WHERE id = $1', [documentId]);
  
  // 2. Delete file from local disk if it exists
  try {
    if (fs.existsSync(file_path)) {
      fs.unlinkSync(file_path);
    }
  } catch (err: any) {
    console.warn(`[RAG] Failed to delete physical file at "${file_path}":`, err.message);
  }

  return (res.rowCount && res.rowCount > 0) || false;
}
