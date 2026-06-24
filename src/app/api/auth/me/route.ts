import { NextResponse } from 'next/server';
import { getSession } from '../../../../lib/auth';
import { query } from '../../../../lib/db';

export async function GET(request: Request) {
  try {
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userRes = await query(
      'SELECT id, name, email, role, is_active FROM users WHERE id = $1',
      [session.userId]
    );

    if (!userRes.rowCount || userRes.rowCount === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const user = userRes.rows[0];
    if (!user.is_active) {
      return NextResponse.json({ error: 'Account deactivated' }, { status: 401 });
    }

    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error: any) {
    console.error('[API Me] Error:', error.message);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}
