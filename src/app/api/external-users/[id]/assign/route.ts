import { NextResponse } from 'next/server';
import { getSession } from '../../../../../lib/auth';
import { query, getClient } from '../../../../../lib/db';

// GET - Retrieve currently assigned document IDs (Admin only)
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession(request);
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const assignments = await query(
      'SELECT document_id FROM external_user_documents WHERE external_user_id = $1',
      [id]
    );

    const documentIds = assignments.rows.map((row) => row.document_id);
    return NextResponse.json({ documentIds });
  } catch (error: any) {
    console.error('[API GET External User Assign] Error:', error.message);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}

// POST - Full replace assignment (Admin only)
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = await getClient();
  try {
    const { id } = await params;
    const session = await getSession(request);
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { documentIds } = body;

    if (!Array.isArray(documentIds)) {
      return NextResponse.json({ error: 'documentIds array is required' }, { status: 400 });
    }

    // Verify user exists
    const userCheck = await query('SELECT external_user_id FROM external_users WHERE id = $1', [id]);
    if (!userCheck.rowCount || userCheck.rowCount === 0) {
      return NextResponse.json({ error: 'External User not found' }, { status: 404 });
    }

    await client.query('BEGIN');

    // 1. Delete all existing assignments
    await client.query('DELETE FROM external_user_documents WHERE external_user_id = $1', [id]);

    // 2. Insert new ones
    for (const docId of documentIds) {
      // Verify document exists
      const docCheck = await client.query('SELECT id FROM documents WHERE id = $1', [docId]);
      if (docCheck.rowCount && docCheck.rowCount > 0) {
        await client.query(
          `INSERT INTO external_user_documents (external_user_id, document_id)
           VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [id, docId]
        );
      }
    }

    await client.query('COMMIT');

    // Log audit log
    await query(
      'INSERT INTO audit_logs (user_id, action, metadata) VALUES ($1, $2, $3)',
      [
        session.userId,
        'External User Documents Assigned',
        JSON.stringify({ external_user_id: userCheck.rows[0].external_user_id, documentIds })
      ]
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('[API POST External User Assign] Error:', error.message);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}

// DELETE - Remove single assignment (Admin only)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getSession(request);
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { documentId } = body;

    if (!documentId) {
      return NextResponse.json({ error: 'documentId is required' }, { status: 400 });
    }

    // Verify user exists
    const userCheck = await query('SELECT external_user_id FROM external_users WHERE id = $1', [id]);
    if (!userCheck.rowCount || userCheck.rowCount === 0) {
      return NextResponse.json({ error: 'External User not found' }, { status: 404 });
    }

    await query(
      'DELETE FROM external_user_documents WHERE external_user_id = $1 AND document_id = $2',
      [id, documentId]
    );

    // Log audit log
    await query(
      'INSERT INTO audit_logs (user_id, action, metadata) VALUES ($1, $2, $3)',
      [
        session.userId,
        'External User Document Unassigned',
        JSON.stringify({ external_user_id: userCheck.rows[0].external_user_id, documentId })
      ]
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API DELETE External User Assign] Error:', error.message);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}
