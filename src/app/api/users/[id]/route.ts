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

    // Check if user exists
    const userCheck = await query('SELECT name, email, role, is_active FROM users WHERE id = $1', [targetUserId]);
    if (!userCheck.rowCount || userCheck.rowCount === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const oldUser = userCheck.rows[0];

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

    if (fields.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    // Append user ID to parameter list
    values.push(targetUserId);
    const sql = `UPDATE users SET ${fields.join(', ')} WHERE id = $${valIndex} RETURNING id, name, email, role, is_active, created_at`;
    
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
