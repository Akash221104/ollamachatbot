import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';
import { query } from '../../../../lib/db';

// DELETE external user (Admin only)
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

    const selectRes = await query('SELECT external_user_id, name FROM external_users WHERE id = $1', [id]);
    if (!selectRes.rowCount || selectRes.rowCount === 0) {
      return NextResponse.json({ error: 'External User not found' }, { status: 404 });
    }
    const user = selectRes.rows[0];

    // Delete the external user. Cascades external_user_documents.
    await query('DELETE FROM external_users WHERE id = $1', [id]);

    // Log audit log
    await query(
      'INSERT INTO audit_logs (user_id, action, metadata) VALUES ($1, $2, $3)',
      [
        session.userId,
        'External User Deleted',
        JSON.stringify({ external_user_id: user.external_user_id, name: user.name })
      ]
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API DELETE External User] Error:', error.message);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}
