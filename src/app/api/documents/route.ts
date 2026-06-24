import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';

export async function GET(request: Request) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (session.role === 'ADMIN') {
      // Admin sees all documents with assigned user names and details
      const sql = `
        SELECT d.id, d.filename, d.file_path, d.file_hash, d.status, d.embedding_status, d.uploaded_by, d.created_at,
               COALESCE(json_agg(json_build_object('id', u.id, 'name', u.name)) FILTER (WHERE u.id IS NOT NULL), '[]') as "assignedUsers"
        FROM documents d
        LEFT JOIN user_documents ud ON ud.document_id = d.id
        LEFT JOIN users u ON u.id = ud.user_id
        GROUP BY d.id
        ORDER BY d.created_at DESC
      `;
      const docsRes = await query(sql);
      return NextResponse.json({ documents: docsRes.rows });
    } else {
      // Normal user sees only documents assigned to them
      const sql = `
        SELECT d.id, d.filename, d.file_path, d.file_hash, d.status, d.embedding_status, d.uploaded_by, d.created_at
        FROM documents d
        JOIN user_documents ud ON ud.document_id = d.id
        WHERE ud.user_id = $1
        ORDER BY d.created_at DESC
      `;
      const docsRes = await query(sql, [session.userId]);
      return NextResponse.json({ documents: docsRes.rows });
    }
  } catch (error: any) {
    console.error('[API GET Documents] Error:', error.message);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}
