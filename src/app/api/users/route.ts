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

    // Hash password and insert
    const passwordHash = await hashPassword(password);
    const insertRes = await query(
      `INSERT INTO users (name, email, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, name, email, role, is_active, created_at`,
      [name, email.toLowerCase().trim(), passwordHash, role, true]
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
