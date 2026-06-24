import { query } from './db';

/**
 * Searches similarity vector chunks in the embeddings table,
 * restricted strictly to documents assigned to the specified user.
 */
export async function searchUserChunks(
  queryText: string,
  userId: string,
  topK: number = 5
): Promise<any[]> {
  // Import dynamically to preserve load order of env variables
  const { getEmbedding } = await import('../services/ollama');
  const embeddingModel = process.env.OLLAMA_EMBEDDING_MODEL || 'bge-m3';
  
  const queryEmbedding = await getEmbedding(queryText, embeddingModel);
  const vectorStr = '[' + queryEmbedding.join(',') + ']';

  const sql = `
    SELECT e.chunk_text, e.document_id, d.filename
    FROM embeddings e
    JOIN documents d ON d.id = e.document_id
    JOIN user_documents ud ON ud.document_id = e.document_id
    WHERE ud.user_id = $1 AND d.status = 'ACTIVE'
    ORDER BY e.embedding <=> $2::vector ASC
    LIMIT $3
  `;

  const result = await query(sql, [userId, vectorStr, topK]);
  return result.rows;
}
