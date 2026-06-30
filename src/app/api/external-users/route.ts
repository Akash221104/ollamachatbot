import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';

// GET all external users with document count (Admin only)
export async function GET(request: Request) {
  try {
    const session = await getSession(request);
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sql = `
      SELECT eu.id, eu.external_user_id, eu.name, eu.created_at,
             COUNT(eud.document_id)::integer as "documentCount"
      FROM external_users eu
      LEFT JOIN external_user_documents eud ON eud.external_user_id = eu.id
      GROUP BY eu.id
      ORDER BY eu.created_at DESC
    `;
    const usersRes = await query(sql);

    return NextResponse.json({ users: usersRes.rows });
  } catch (error: any) {
    console.error('[API GET External Users] Error:', error.message);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}

// POST manually create external user (Admin only)
export async function POST(request: Request) {
  try {
    const session = await getSession(request);
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { external_user_id, name } = body;

    if (!external_user_id || !external_user_id.trim()) {
      return NextResponse.json({ error: 'External User ID is required' }, { status: 400 });
    }

    // Get the seeded organization
    const orgRes = await query('SELECT id FROM organizations LIMIT 1');
    if (!orgRes.rowCount || orgRes.rowCount === 0) {
      return NextResponse.json({ error: 'No organization found. Please seed organization first.' }, { status: 400 });
    }
    const orgId = orgRes.rows[0].id;

    // Check if duplicate user exists in this organization
    const checkUser = await query(
      'SELECT id FROM external_users WHERE organization_id = $1 AND external_user_id = $2',
      [orgId, external_user_id.trim()]
    );
    if (checkUser.rowCount && checkUser.rowCount > 0) {
      return NextResponse.json({ error: 'External User ID already exists in this organization.' }, { status: 409 });
    }

    const insertRes = await query(
      `INSERT INTO external_users (organization_id, external_user_id, name)
       VALUES ($1, $2, $3)
       RETURNING id, external_user_id, name, created_at`,
      [orgId, external_user_id.trim(), name ? name.trim() : null]
    );

    const newUser = insertRes.rows[0];

    // Log audit log
    await query(
      'INSERT INTO audit_logs (user_id, action, metadata) VALUES ($1, $2, $3)',
      [
        session.userId,
        'External User Created',
        JSON.stringify({ external_user_id: newUser.external_user_id, name: newUser.name })
      ]
    );

    return NextResponse.json({ user: newUser }, { status: 201 });
  } catch (error: any) {
    console.error('[API POST External Users] Error:', error.message);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}
