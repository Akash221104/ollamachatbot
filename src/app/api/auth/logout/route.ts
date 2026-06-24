import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.json({ success: true });
  
  // Clear cookie by setting Max-Age to 0 and Expired in the past
  response.headers.set(
    'Set-Cookie',
    `auth_token=; HttpOnly; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax${
      process.env.NODE_ENV === 'production' ? '; Secure' : ''
    }`
  );
  
  return response;
}
