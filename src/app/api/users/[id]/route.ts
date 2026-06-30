import { NextResponse } from 'next/server';
import { getSession, hashPassword } from '../../../../lib/auth';
import { query } from '../../../../lib/db';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request);
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id: targetUserId } = await params;
    const body = await request.json();
    const { name, role, is_active, password } = body;
    const external_id = body.external_id !== undefined ? (body.external_id ? String(body.external_id).trim() : null) : undefined;
    let organization_id = body.organization_id !== undefined ? (body.organization_id || null) : undefined;

    // Check if user exists
    const userCheck = await query('SELECT name, email, role, is_active, organization_id, external_id FROM users WHERE id = $1', [targetUserId]);
    if (!userCheck.rowCount || userCheck.rowCount === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const oldUser = userCheck.rows[0];

    // Resolve organization_id if external_id is provided
    const hasExtId = external_id !== undefined ? !!external_id : !!oldUser.external_id;
    const currentOrgId = organization_id !== undefined ? organization_id : oldUser.organization_id;
    if (hasExtId && !currentOrgId) {
      const orgRes = await query('SELECT id FROM organizations LIMIT 1');
      if (orgRes.rowCount && orgRes.rowCount > 0) {
        organization_id = orgRes.rows[0].id;
      }
    }

    // Check unique constraint for external_id/organization_id
    if (external_id !== undefined || organization_id !== undefined) {
      const targetExtId = external_id !== undefined ? external_id : oldUser.external_id;
      const targetOrgId = organization_id !== undefined ? organization_id : oldUser.organization_id;

      if (targetExtId && targetOrgId) {
        const checkExt = await query(
          'SELECT id FROM users WHERE external_id = $1 AND organization_id = $2 AND id <> $3',
          [targetExtId, targetOrgId, targetUserId]
        );
        if (checkExt.rowCount && checkExt.rowCount > 0) {
          return NextResponse.json({ error: 'External ID already in use for this organization.' }, { status: 409 });
        }
      }
    }

    const fields: string[] = [];
    const values: any[] = [];
    const changes: Record<string, any> = {};
    let valIndex = 1;

    if (name !== undefined) {
      fields.push(`name = $${valIndex++}`);
      values.push(name);
      changes.name = name;
    }
    if (role !== undefined) {
      if (role !== 'ADMIN' && role !== 'USER') {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
      }
      fields.push(`role = $${valIndex++}`);
      values.push(role);
      changes.role = role;
    }
    if (is_active !== undefined) {
      fields.push(`is_active = $${valIndex++}`);
      values.push(is_active);
      changes.is_active = is_active;
    }
    if (password !== undefined && password !== '') {
      const passwordHash = await hashPassword(password);
      fields.push(`password_hash = $${valIndex++}`);
      values.push(passwordHash);
      changes.password = 'UPDATED';
    }
    if (organization_id !== undefined) {
      fields.push(`organization_id = $${valIndex++}`);
      values.push(organization_id);
      changes.organization_id = organization_id;
    }
    if (external_id !== undefined) {
      fields.push(`external_id = $${valIndex++}`);
      values.push(external_id);
      changes.external_id = external_id;
    }

    if (fields.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    // Append user ID to parameter list
    values.push(targetUserId);
    const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = $${valIndex} RETURNING id, name, email, role, is_active, organization_id, external_id, created_at`;
    
    const updateRes = await query(sql, values);
    const updatedUser = updateRes.rows[0];

    // Log user update audit
    await query(
      'INSERT INTO audit_logs (user_id, action, metadata) VALUES ($1, $2, $3)',
      [
        session.userId,
        'User Updated',
        JSON.stringify({ targetUser: oldUser.email, changes })
      ]
    );

    return NextResponse.json({ user: updatedUser });
  } catch (error: any) {
    console.error('[API PATCH User] Error:', error.message);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession(request);
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id: targetUserId } = await params;

    // Fetch user details for audit logs
    const userRes = await query('SELECT email FROM users WHERE id = $1', [targetUserId]);
    if (!userRes.rowCount || userRes.rowCount === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const targetUserEmail = userRes.rows[0].email;

    // Prevent admin from deleting themselves
    if (targetUserId === session.userId) {
      return NextResponse.json({ error: 'Cannot delete own account' }, { status: 400 });
    }

    // Delete user
    await query('DELETE FROM users WHERE id = $1', [targetUserId]);

    // Log deletion audit
    await query(
      'INSERT INTO audit_logs (user_id, action, metadata) VALUES ($1, $2, $3)',
      [
        session.userId,
        'User Deleted',
        JSON.stringify({ email: targetUserEmail })
      ]
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[API DELETE User] Error:', error.message);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}
