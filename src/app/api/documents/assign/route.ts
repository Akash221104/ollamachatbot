import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';
import { query, getClient } from '../../../../lib/db';

// POST: Replace all user assignments for a document (Admin only)
export async function POST(request: Request) {
  try {
    const session = await getSession(request);
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { documentId, userIds } = body;

    if (documentId === undefined || !Array.isArray(userIds)) {
      return NextResponse.json(
        { error: 'documentId and userIds array are required.' },
        { status: 400 }
      );
    }

    // 1. Verify document exists and get its name
    const docQuery = await query('SELECT filename FROM documents WHERE id = $1', [documentId]);
    if (!docQuery.rowCount || docQuery.rowCount === 0) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    const filename = docQuery.rows[0].filename;

    const dbClient = await getClient();
    try {
      await dbClient.query('BEGIN');

      // 2. Delete all existing user_documents mapping rows for this document
      await dbClient.query('DELETE FROM user_documents WHERE document_id = $1', [documentId]);

      // 3. Insert new user_documents mapping rows
      for (const userId of userIds) {
        await dbClient.query(
          'INSERT INTO user_documents (document_id, user_id) VALUES ($1, $2)',
          [documentId, userId]
        );
      }

      await dbClient.query('COMMIT');
    } catch (txErr) {
      await dbClient.query('ROLLBACK');
      throw txErr;
    } finally {
      dbClient.release();
    }

    // 4. Retrieve user names for audit logging metadata
    let assignedNames: string[] = [];
    if (userIds.length > 0) {
      const usersQuery = await query(
        'SELECT name FROM users WHERE id = ANY($1::uuid[])',
        [userIds]
      );
      assignedNames = usersQuery.rows.map((row: any) => row.name);
    }

    // 5. Log audit entry
    await query(
      'INSERT INTO audit_logs (user_id, action, metadata) VALUES ($1, $2, $3)',
      [
        session.userId,
        'Document Assigned',
        JSON.stringify({ document: filename, assignedTo: assignedNames })
      ]
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API POST Document Assign] Error:', error.message);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}

// DELETE: Remove a single document assignment for a user (Admin only)
export async function DELETE(request: Request) {
  try {
    const session = await getSession(request);
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { documentId, userId } = body;

    if (documentId === undefined || !userId) {
      return NextResponse.json(
        { error: 'documentId and userId are required.' },
        { status: 400 }
      );
    }

    // 1. Fetch document and user metadata for audit logging
    const docQuery = await query('SELECT filename FROM documents WHERE id = $1', [documentId]);
    if (!docQuery.rowCount || docQuery.rowCount === 0) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    const filename = docQuery.rows[0].filename;

    const userQuery = await query('SELECT name FROM users WHERE id = $1', [userId]);
    if (!userQuery.rowCount || userQuery.rowCount === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const username = userQuery.rows[0].name;

    // 2. Remove assignment row
    await query(
      'DELETE FROM user_documents WHERE document_id = $1 AND user_id = $2',
      [documentId, userId]
    );

    // 3. Log audit entry
    await query(
      'INSERT INTO audit_logs (user_id, action, metadata) VALUES ($1, $2, $3)',
      [
        session.userId,
        'Assignment Removed',
        JSON.stringify({ document: filename, user: username })
      ]
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API DELETE Document Assign] Error:', error.message);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}
