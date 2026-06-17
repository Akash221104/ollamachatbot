import { query, getClient } from '../lib/db';
import { getEmbedding } from './ollama';
import { chunkText } from '../utils/chunker';
import { generateHash } from '../utils/hash';

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
 * Ingest a document file into the database.
 * Computes hash, handles duplicate checking, cleans up stale versions, chunks the text,
 * fetches embeddings from Ollama, and batch-inserts the chunks into PostgreSQL.
 */
export async function ingestDocument(
  filename: string,
  fullText: string,
  embeddingModel: string = 'bge-m3'
): Promise<IngestResult> {
  const hash = generateHash(fullText);

  // 1. Check if a document with the same filename already exists
  const existingByName = await query(
    'SELECT id, hash FROM documents WHERE filename = $1',
    [filename]
  );

  if (existingByName.rowCount && existingByName.rowCount > 0) {
    const doc = existingByName.rows[0];
    if (doc.hash === hash) {
      console.log(`[RAG] Document "${filename}" already exists and matches hash. Skipping ingestion.`);
      return { documentId: doc.id, status: 'skipped' };
    } else {
      console.log(`[RAG] Document "${filename}" content changed. Deleting stale records...`);
      await query('DELETE FROM documents WHERE id = $1', [doc.id]);
    }
  }

  // 2. Check if a document with the same hash exists under a different filename
  const existingByHash = await query(
    'SELECT id FROM documents WHERE hash = $1',
    [hash]
  );
  if (existingByHash.rowCount && existingByHash.rowCount > 0) {
    console.log(`[RAG] Duplicate content detected for "${filename}" (matches existing document ID ${existingByHash.rows[0].id}). Skipping.`);
    return { documentId: existingByHash.rows[0].id, status: 'skipped' };
  }

  // 3. Create document record
  const insertDocRes = await query(
    'INSERT INTO documents (filename, full_text, hash) VALUES ($1, $2, $3) RETURNING id',
    [filename, fullText, hash]
  );
  const documentId = insertDocRes.rows[0].id;

  // 4. Chunk text and generate embeddings
  const chunks = chunkText(fullText);
  console.log(`[RAG] Document "${filename}" split into ${chunks.length} chunks. Generating embeddings...`);

  const client = await getClient();
  try {
    await client.query('BEGIN');
    for (let i = 0; i < chunks.length; i++) {
      const chunkText = chunks[i];
      const embedding = await getEmbedding(chunkText, embeddingModel);
      const vectorStr = '[' + embedding.join(',') + ']';

      await client.query(
        `INSERT INTO embeddings (document_id, chunk_index, chunk_text, embedding)
         VALUES ($1, $2, $3, $4::vector)`,
        [documentId, i, chunkText, vectorStr]
      );
    }
    await client.query('COMMIT');
    console.log(`[RAG] Successfully ingested "${filename}" with ${chunks.length} chunks.`);
    return { documentId, status: 'inserted' };
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(`[RAG] Ingestion failed for "${filename}":`, error);
    // Delete the shell document record if the chunks transaction failed
    await query('DELETE FROM documents WHERE id = $1', [documentId]);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Delete a document and its embeddings by its filename.
 */
export async function deleteDocument(filename: string): Promise<boolean> {
  const res = await query('DELETE FROM documents WHERE filename = $1', [filename]);
  return (res.rowCount && res.rowCount > 0) || false;
}

/**
 * Perform pgvector similarity search on chunk embeddings matching the allowed filenames.
 */
export async function searchSimilarChunks(
  queryText: string,
  filenames: string[],
  embeddingModel: string = 'bge-m3',
  topK: number = 5,
  scoreThreshold: number = 0.35
): Promise<ChunkRecord[]> {
  if (filenames.length === 0) {
    return [];
  }

  try {
    const queryEmbedding = await getEmbedding(queryText, embeddingModel);
    const vectorStr = '[' + queryEmbedding.join(',') + ']';

    // pgvector cosine similarity calculation: 1 - (embedding <=> query_embedding)
    const sql = `
      SELECT e.chunk_text, e.chunk_index, d.filename, (1 - (e.embedding <=> $1::vector)) AS similarity
      FROM embeddings e
      JOIN documents d ON e.document_id = d.id
      WHERE d.filename = ANY($2::text[]) AND (1 - (e.embedding <=> $1::vector)) >= $3
      ORDER BY e.embedding <=> $1::vector ASC
      LIMIT $4
    `;

    const res = await query(sql, [vectorStr, filenames, scoreThreshold, topK]);
    return res.rows.map(row => ({
      text: row.chunk_text,
      similarity: parseFloat(row.similarity),
      filename: row.filename,
      chunkIndex: row.chunk_index
    }));
  } catch (error: any) {
    console.error('[RAG] Similarity search query failed:', error.message);
    return [];
  }
}
