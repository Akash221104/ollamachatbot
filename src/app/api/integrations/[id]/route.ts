import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';
import { query } from '../../../../lib/db';

// PATCH update integration (Admin only)
export async function PATCH(
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
    const { name, allowed_origins, is_active } = body;

    // Build update query dynamically
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (name !== undefined) {
      if (!name.trim()) {
        return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
      }
      fields.push(`name = $${paramIndex++}`);
      values.push(name.trim());
    }

    if (allowed_origins !== undefined) {
      const origins = Array.isArray(allowed_origins) 
        ? allowed_origins.map((o: string) => o.trim()).filter((o: string) => o.length > 0)
        : [];
      fields.push(`allowed_origins = $${paramIndex++}`);
      values.push(origins);
    }

    if (is_active !== undefined) {
      fields.push(`is_active = $${paramIndex++}`);
      values.push(!!is_active);
    }

    if (fields.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    values.push(id);
    const updateSql = `
      UPDATE chatbot_integrations
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING id, name, allowed_origins, is_active, created_at
    `;

    const updateRes = await query(updateSql, values);
    if (!updateRes.rowCount || updateRes.rowCount === 0) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
    }

    const updated = updateRes.rows[0];

    // Log audit log
    await query(
      'INSERT INTO audit_logs (user_id, action, metadata) VALUES ($1, $2, $3)',
      [
        session.userId,
        'Integration Updated',
        JSON.stringify({ name: updated.name })
      ]
    );

    return NextResponse.json({ integration: updated });
  } catch (error: any) {
    console.error('[API PATCH Integration] Error:', error.message);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}

// DELETE integration (Admin only)
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

    const selectRes = await query('SELECT name FROM chatbot_integrations WHERE id = $1', [id]);
    if (!selectRes.rowCount || selectRes.rowCount === 0) {
      return NextResponse.json({ error: 'Integration not found' }, { status: 404 });
    }
    const name = selectRes.rows[0].name;

    await query('DELETE FROM chatbot_integrations WHERE id = $1', [id]);

    // Log audit log
    await query(
      'INSERT INTO audit_logs (user_id, action, metadata) VALUES ($1, $2, $3)',
      [
        session.userId,
        'Integration Deleted',
        JSON.stringify({ name })
      ]
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API DELETE Integration] Error:', error.message);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}
