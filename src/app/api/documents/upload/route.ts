import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';
import { query } from '../../../../lib/db';
import { ingestDocument, generateSHA256 } from '../../../../services/rag';

export async function POST(request: Request) {
  try {
    const session = await getSession(request);
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!file.name.toLowerCase().endsWith('.txt')) {
      return NextResponse.json(
        { error: 'Only .txt files are supported' },
        { status: 400 }
      );
    }

    const text = await file.text();
    const hash = generateSHA256(text);

    // 1. Check if hash already exists (duplicate checking)
    const duplicateCheck = await query(
      'SELECT id, filename FROM documents WHERE file_hash = $1',
      [hash]
    );

    if (duplicateCheck.rowCount && duplicateCheck.rowCount > 0) {
      return NextResponse.json(
        { error: 'Document already exists' },
        { status: 409 }
      );
    }

    // 2. Perform ingestion
    // Ingests file, writes to disk, chunks, generates embeddings, and sets state to COMPLETED
    const embeddingModel = process.env.OLLAMA_EMBEDDING_MODEL || 'bge-m3';
    const result = await ingestDocument(file.name, text, session.userId, embeddingModel);

    // Fetch the inserted document details to return
    const docQuery = await query(
      'SELECT id, filename, file_path, file_hash, status, embedding_status, uploaded_by, created_at FROM documents WHERE id = $1',
      [result.documentId]
    );
    const docRecord = docQuery.rows[0];

    // Log document upload audit
    await query(
      'INSERT INTO audit_logs (user_id, action, metadata) VALUES ($1, $2, $3)',
      [
        session.userId,
        'Document Uploaded',
        JSON.stringify({ filename: file.name })
      ]
    );

    return NextResponse.json({ document: docRecord });
  } catch (error: any) {
    console.error('[API Document Upload] Error:', error.message);
    return NextResponse.json(
      { error: 'Internal server error during document processing.' },
      { status: 500 }
    );
  }
}
