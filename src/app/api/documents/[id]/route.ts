import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';
import { query } from '../../../../lib/db';
import { deleteDocument } from '../../../../services/rag';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request);
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id } = await params;
    const documentId = parseInt(id, 10);

    if (isNaN(documentId)) {
      return NextResponse.json({ error: 'Invalid document ID.' }, { status: 400 });
    }

    // 1. Fetch document metadata for audit log
    const docQuery = await query('SELECT filename FROM documents WHERE id = $1', [documentId]);
    if (!docQuery.rowCount || docQuery.rowCount === 0) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }

    const filename = docQuery.rows[0].filename;

    // 2. Perform deletion (cascades database rows and cleans disk storage)
    const success = await deleteDocument(documentId);
    if (!success) {
      return NextResponse.json({ error: 'Failed to delete document.' }, { status: 500 });
    }

    // 3. Log document deletion audit
    await query(
      'INSERT INTO audit_logs (user_id, action, metadata) VALUES ($1, $2, $3)',
      [
        session.userId,
        'Document Deleted',
        JSON.stringify({ filename })
      ]
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API DELETE Document] Error:', error.message);
    return NextResponse.json(
      { error: 'Internal server error during document deletion.' },
      { status: 500 }
    );
  }
}
