import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';

const JWT_SECRET = process.env.JWT_SECRET || 'rag-platform-secret-1293847-abcd';
const key = new TextEncoder().encode(JWT_SECRET);

/**
 * Signs a payload into a JWT token.
 */
export async function generateToken(payload: { userId: string; role: string }): Promise<string> {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(key);
}

/**
 * Verifies and decodes a JWT token.
 */
export async function verifyToken(token: string): Promise<{ userId: string; role: string } | null> {
  try {
    const { payload } = await jwtVerify(token, key, {
      algorithms: ['HS256'],
    });
    return payload as { userId: string; role: string };
  } catch (error) {
    return null;
  }
}

/**
 * Hashes a plaintext password with bcrypt.
 */
export async function hashPassword(password: string): Promise<string> {
  return await bcrypt.hash(password, 10);
}

/**
 * Compares a password with a bcrypt hash.
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return await bcrypt.compare(password, hash);
}

/**
 * Resolves session payload from request cookies.
 */
export async function getSession(req: Request): Promise<{ userId: string; role: string } | null> {
  try {
    const nextReq = req as any;
    let token = '';
    
    if (nextReq.cookies && typeof nextReq.cookies.get === 'function') {
      token = nextReq.cookies.get('auth_token')?.value || '';
    } else {
      const cookieHeader = req.headers.get('cookie') || '';
      const match = cookieHeader.match(/auth_token=([^;]+)/);
      token = match ? match[1] : '';
    }
    
    if (!token) return null;
    return await verifyToken(token);
  } catch (error) {
    return null;
  }
}
