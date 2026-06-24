import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';
import { getAvailableChatModels } from '../../../services/ollama';

export async function GET(request: Request) {
  try {
    const session = await getSession(request);
    if (!session || session.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // 1. Fetch counts
    const usersCountRes = await query('SELECT COUNT(*)::integer as count FROM users');
    const docsCountRes = await query('SELECT COUNT(*)::integer as count FROM documents');
    const failedDocsRes = await query("SELECT COUNT(*)::integer as count FROM documents WHERE embedding_status = 'FAILED'");

    // 2. Check Ollama Status
    let ollamaStatus = 'offline';
    try {
      const models = await getAvailableChatModels();
      if (models && models.length > 0) {
        ollamaStatus = 'online';
      }
    } catch (ollamaErr) {
      // Ollama unreachable
    }

    // 3. Fetch latest 10 audit logs
    const logsRes = await query(
      `SELECT al.id, al.action, al.created_at, al.metadata, u.name as "userName", u.email as "userEmail"
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.user_id
       ORDER BY al.created_at DESC
       LIMIT 10`
    );

    return NextResponse.json({
      metrics: {
        totalUsers: usersCountRes.rows[0].count,
        totalDocuments: docsCountRes.rows[0].count,
        failedEmbeddings: failedDocsRes.rows[0].count,
        ollamaStatus
      },
      auditLogs: logsRes.rows
    });
  } catch (error: any) {
    console.error('[API Dashboard Overview] Error:', error.message);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}
