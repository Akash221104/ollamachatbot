import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';

// GET all integrations (Admin only)
export async function GET(request: Request) {
  try {
    const session = await getSession(request);
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sql = `
      SELECT ci.id, ci.name, ci.allowed_origins, ci.is_active, ci.created_at,
             o.api_key
      FROM chatbot_integrations ci
      JOIN organizations o ON o.id = ci.organization_id
      ORDER BY ci.created_at DESC
    `;
    const integrationsRes = await query(sql);

    return NextResponse.json({ integrations: integrationsRes.rows });
  } catch (error: any) {
    console.error('[API GET Integrations] Error:', error.message);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}

// POST create integration (Admin only)
export async function POST(request: Request) {
  try {
    const session = await getSession(request);
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { name, allowed_origins } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Get the seeded organization
    const orgRes = await query('SELECT id FROM organizations LIMIT 1');
    if (!orgRes.rowCount || orgRes.rowCount === 0) {
      return NextResponse.json({ error: 'No organization found. Please seed organization first.' }, { status: 400 });
    }
    const orgId = orgRes.rows[0].id;

    // Convert allowed_origins to PostgreSQL array format (e.g. ['a', 'b'])
    const origins = Array.isArray(allowed_origins) 
      ? allowed_origins.map((o: string) => o.trim()).filter((o: string) => o.length > 0)
      : [];

    const insertRes = await query(
      `INSERT INTO chatbot_integrations (organization_id, name, allowed_origins)
       VALUES ($1, $2, $3)
       RETURNING id, name, allowed_origins, is_active, created_at`,
      [orgId, name.trim(), origins]
    );

    const newIntegration = insertRes.rows[0];

    // Log audit log
    await query(
      'INSERT INTO audit_logs (user_id, action, metadata) VALUES ($1, $2, $3)',
      [
        session.userId,
        'Integration Created',
        JSON.stringify({ name: newIntegration.name })
      ]
    );

    return NextResponse.json({ integration: newIntegration }, { status: 201 });
  } catch (error: any) {
    console.error('[API POST Integrations] Error:', error.message);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}
