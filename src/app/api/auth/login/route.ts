import { NextResponse } from 'next/server';
import { query } from '../../../../lib/db';
import { comparePassword, generateToken } from '../../../../lib/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required.' },
        { status: 400 }
      );
    }

    // 1. Find user by email
    const userRes = await query(
      'SELECT id, name, email, password_hash, role, is_active FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (!userRes.rowCount || userRes.rowCount === 0) {
      // Log login failure
      await query(
        'INSERT INTO audit_logs (user_id, action, metadata) VALUES ($1, $2, $3)',
        [null, 'Login Failed', JSON.stringify({ email, reason: 'User not found' })]
      );
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    const user = userRes.rows[0];

    // 2. Check if user is active
    if (!user.is_active) {
      return NextResponse.json(
        { error: 'Account deactivated' },
        { status: 401 }
      );
    }

    // 3. Compare password
    const isMatch = await comparePassword(password, user.password_hash);
    if (!isMatch) {
      // Log login failure
      await query(
        'INSERT INTO audit_logs (user_id, action, metadata) VALUES ($1, $2, $3)',
        [null, 'Login Failed', JSON.stringify({ email, reason: 'Password mismatch' })]
      );
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // 4. Generate JWT
    const token = await generateToken({ userId: user.id, role: user.role });

    // 5. Build response and set auth_token HttpOnly cookie
    const response = NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });

    response.headers.set(
      'Set-Cookie',
      `auth_token=${token}; HttpOnly; Path=/; Max-Age=${60 * 60 * 24 * 7}; SameSite=Lax${
        process.env.NODE_ENV === 'production' ? '; Secure' : ''
      }`
    );

    // 6. Log successful login
    await query(
      'INSERT INTO audit_logs (user_id, action, metadata) VALUES ($1, $2, $3)',
      [user.id, 'User Login', JSON.stringify({ email: user.email })]
    );

    return response;
  } catch (error: any) {
    console.error('[API Login] Error:', error.message);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}
