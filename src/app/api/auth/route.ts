import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// Hardcoded demo credentials (no database required for authentication logic)
const DEMO_USER = {
  username: 'demo',
  password: 'demo123',
};

// Hardcoded static token to verify session
const DEMO_SESSION_TOKEN = 'demo_session_token_value';

/**
 * GET handler to check current authentication session status.
 * Reads the 'session_token' cookie and checks if it matches our expected session token.
 */
export async function GET() {
  try {
    // Session Handling: Await cookie store from Next.js headers
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('session_token');

    // Session Handling: Verify session token validity
    if (sessionToken && sessionToken.value === DEMO_SESSION_TOKEN) {
      return NextResponse.json({
        authenticated: true,
        user: DEMO_USER.username,
      });
    }

    // Return unauthenticated if no valid cookie is found
    return NextResponse.json({ authenticated: false });
  } catch (error: any) {
    console.error('Session check error:', error.message);
    return NextResponse.json({ error: 'Failed to verify session.' }, { status: 500 });
  }
}

/**
 * POST handler to handle login and logout actions.
 * - action: 'login' creates a session cookie.
 * - action: 'logout' deletes the session cookie.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, username, password } = body;

    const cookieStore = await cookies();

    // Login flow
    if (action === 'login') {
      if (username === DEMO_USER.username && password === DEMO_USER.password) {
        // Session Handling: Set an HttpOnly, SameSite cookie containing the session token.
        // It will be sent automatically with each API request (e.g. to /api/chat).
        cookieStore.set('session_token', DEMO_SESSION_TOKEN, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          path: '/',
          maxAge: 60 * 60 * 24, // 1 day
        }) ;

        return NextResponse.json({
          success: true,
          user: DEMO_USER.username,
        });
      }

      // Invalid credentials
      return NextResponse.json(
        { success: false, error: 'Invalid username or password' },
        { status: 401 }
      );
    } 
    
    // Logout flow
    else if (action === 'logout') {
      // Session Handling: Delete the 'session_token' cookie to destroy the session.
      cookieStore.delete('session_token');
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  } catch (error: any) {
    console.error('Auth request error:', error.message);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}
