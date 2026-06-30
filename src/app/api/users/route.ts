import { NextResponse } from 'next/server';
import { getSession, hashPassword } from '../../../lib/auth';
import { query } from '../../../lib/db';

// GET list of all users with document count (Admin only)
export async function GET(request: Request) {
  try {
    const session = await getSession(request);
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sql = `
      SELECT u.id, u.name, u.email, u.role, u.is_active, u.created_at, 
             u.organization_id, u.external_id,
             COUNT(ud.document_id)::integer as "documentCount"
      FROM users u
      LEFT JOIN user_documents ud ON ud.user_id = u.id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `;
    const usersRes = await query(sql);

    return NextResponse.json({ users: usersRes.rows });
  } catch (error: any) {
    console.error('[API GET Users] Error:', error.message);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}

// POST create a user (Admin only)
export async function POST(request: Request) {
  try {
    const session = await getSession(request);
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { name, email, password, role } = body;
    const external_id = body.external_id ? String(body.external_id).trim() : null;
    let organization_id = body.organization_id || null;

    if (external_id && !organization_id) {
      const orgRes = await query('SELECT id FROM organizations LIMIT 1');
      if (orgRes.rowCount && orgRes.rowCount > 0) {
        organization_id = orgRes.rows[0].id;
      }
    }

    if (!name || !email || !password || !role) {
      return NextResponse.json(
        { error: 'All fields (name, email, password, role) are required.' },
        { status: 400 }
      );
    }

    if (role !== 'ADMIN' && role !== 'USER') {
      return NextResponse.json(
        { error: 'Invalid role value.' },
        { status: 400 }
      );
    }

    // Check if email already exists
    const checkEmail = await query('SELECT id FROM users WHERE email = $1', [
      email.toLowerCase().trim()
    ]);
    if (checkEmail.rowCount && checkEmail.rowCount > 0) {
      return NextResponse.json(
        { error: 'Email already exists.' },
        { status: 409 }
      );
    }

    // Check if external ID is already in use for organization
    if (external_id && organization_id) {
      const checkExternal = await query(
        'SELECT id FROM users WHERE external_id = $1 AND organization_id = $2',
        [external_id, organization_id]
      );
      if (checkExternal.rowCount && checkExternal.rowCount > 0) {
        return NextResponse.json(
          { error: 'External ID already in use for this organization.' },
          { status: 409 }
        );
      }
    }

    // Hash password and insert
    const passwordHash = await hashPassword(password);
    const insertRes = await query(
      `INSERT INTO users (name, email, password_hash, role, is_active, organization_id, external_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, email, role, is_active, organization_id, external_id, created_at`,
      [name, email.toLowerCase().trim(), passwordHash, role, true, organization_id, external_id]
    );
    const newUser = insertRes.rows[0];

    // Log audit log
    await query(
      'INSERT INTO audit_logs (user_id, action, metadata) VALUES ($1, $2, $3)',
      [
        session.userId,
        'User Created',
        JSON.stringify({ name: newUser.name, email: newUser.email, role: newUser.role })
      ]
    );

    return NextResponse.json({ user: newUser }, { status: 201 });
  } catch (error: any) {
    console.error('[API POST Users] Error:', error.message);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}
