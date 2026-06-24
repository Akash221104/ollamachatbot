import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyToken } from '../lib/auth';

export default async function HomePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;
  const session = token ? await verifyToken(token) : null;

  if (!session) {
    redirect('/login');
  }

  if (session.role === 'ADMIN') {
    redirect('/dashboard');
  } else {
    redirect('/chat');
  }
}
