import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';

// GET the active chatbot settings (Admin only)
export async function GET(request: Request) {
  try {
    const session = await getSession(request);
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const settingsRes = await query(
      'SELECT id, name, description, system_prompt, is_active FROM chatbot_settings WHERE is_active = true LIMIT 1'
    );

    if (!settingsRes.rowCount || settingsRes.rowCount === 0) {
      // Fallback fallback settings
      return NextResponse.json({
        settings: {
          name: 'AI Assistant',
          description: '',
          system_prompt: 'You are an enterprise AI assistant. Answer only using the provided context. If information is unavailable, clearly state that the answer is not available.'
        }
      });
    }

    return NextResponse.json({ settings: settingsRes.rows[0] });
  } catch (error: any) {
    console.error('[API GET Settings] Error:', error.message);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}

// POST update the active chatbot settings (Admin only)
export async function POST(request: Request) {
  try {
    const session = await getSession(request);
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, system_prompt } = body;

    if (!name || !system_prompt) {
      return NextResponse.json(
        { error: 'name and system_prompt are required.' },
        { status: 400 }
      );
    }

    // Check if settings exist, if so update, otherwise insert
    const checkSettings = await query('SELECT id FROM chatbot_settings WHERE is_active = true LIMIT 1');
    
    let updatedSettings;
    if (checkSettings.rowCount && checkSettings.rowCount > 0) {
      const updateRes = await query(
        `UPDATE chatbot_settings 
         SET name = $1, description = $2, system_prompt = $3 
         WHERE is_active = true RETURNING id, name, description, system_prompt, is_active`,
        [name, description || '', system_prompt]
      );
      updatedSettings = updateRes.rows[0];
    } else {
      const insertRes = await query(
        `INSERT INTO chatbot_settings (name, description, system_prompt, is_active)
         VALUES ($1, $2, $3, $4) RETURNING id, name, description, system_prompt, is_active`,
        [name, description || '', system_prompt, true]
      );
      updatedSettings = insertRes.rows[0];
    }

    // Log settings update audit
    await query(
      'INSERT INTO audit_logs (user_id, action, metadata) VALUES ($1, $2, $3)',
      [
        session.userId,
        'Settings Updated',
        JSON.stringify({ name: updatedSettings.name })
      ]
    );

    return NextResponse.json({ settings: updatedSettings });
  } catch (error: any) {
    console.error('[API POST Settings] Error:', error.message);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}
