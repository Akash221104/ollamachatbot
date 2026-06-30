import { NextResponse } from 'next/server';
import { query, getClient } from '../../../../lib/db';
import { 
  getOllamaModel, 
  getEmbedding, 
  makeOllamaRequestStream, 
  makeOllamaRequest, 
  getOllamaKeepAlive 
} from '../../../../services/ollama';

// Helper to handle OPTIONS requests for CORS preflight
export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    },
  });
}

export async function POST(request: Request) {
  const corsHeaders: Record<string, string> = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
  };

  try {
    const body = await request.json().catch(() => ({}));
    const { apiKey, userId, userName, message } = body;

    // 1. Input Validation
    if (!apiKey) {
      return NextResponse.json({ error: 'API key required' }, { status: 400, headers: corsHeaders });
    }
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400, headers: corsHeaders });
    }
    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'Message required' }, { status: 400, headers: corsHeaders });
    }

    // 2. Organization lookup by API Key
    const orgRes = await query(
      'SELECT id, name FROM organizations WHERE api_key = $1 AND is_active = true LIMIT 1',
      [apiKey]
    );
    if (!orgRes.rowCount || orgRes.rowCount === 0) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401, headers: corsHeaders });
    }
    const org = orgRes.rows[0];

    // 3. CORS Check (origin verification)
    const origin = request.headers.get('origin') || '';
    const integrationsRes = await query(
      'SELECT allowed_origins FROM chatbot_integrations WHERE organization_id = $1 AND is_active = true',
      [org.id]
    );

    let originAllowed = true;
    if (integrationsRes.rowCount && integrationsRes.rowCount > 0) {
      // If at least one integration specifies allowed_origins, check them
      let hasOriginsConfigured = false;
      let matchedOrigin = false;

      for (const row of integrationsRes.rows) {
        const origins = row.allowed_origins || [];
        if (origins.length > 0) {
          hasOriginsConfigured = true;
          // Match origin exactly, or check if it matches wildcard or general formats if desired
          if (origins.includes(origin)) {
            matchedOrigin = true;
          }
        }
      }

      if (hasOriginsConfigured && !matchedOrigin) {
        originAllowed = false;
      }
    }

    if (!originAllowed) {
      return NextResponse.json({ error: 'Origin not allowed' }, { status: 403, headers: corsHeaders });
    }

    // Update CORS headers to reflect the requesting origin if it's safe/allowed
    if (origin) {
      corsHeaders['Access-Control-Allow-Origin'] = origin;
    }

    // 4. Resolve external_id to internal user — scoped by organization
    const userResult = await query(
      `SELECT id, is_active FROM users WHERE external_id = $1 AND organization_id = $2`,
      [String(userId), org.id]
    );
    const user = userResult.rows[0];

    if (!user) {
      return NextResponse.json(
        { error: 'User not registered on this platform. Contact your administrator.' },
        { status: 403, headers: corsHeaders }
      );
    }

    if (!user.is_active) {
      return NextResponse.json(
        { error: 'Account deactivated' },
        { status: 403, headers: corsHeaders }
      );
    }

    const userUuid = user.id;

    // 5. Generate Query Embedding
    const embeddingModel = process.env.OLLAMA_EMBEDDING_MODEL || 'bge-m3';
    const queryEmbedding = await getEmbedding(message, embeddingModel);
    const vectorStr = '[' + queryEmbedding.join(',') + ']';

    // 6. Vector Search Scoped to User's Documents
    const sql = `
      SELECT e.chunk_text, e.document_id, d.filename
      FROM embeddings e
      JOIN documents d ON d.id = e.document_id
      JOIN user_documents ud ON ud.document_id = e.document_id
      WHERE ud.user_id = $1 AND d.status = 'ACTIVE'
      ORDER BY e.embedding <=> $2::vector ASC
      LIMIT 5
    `;
    const chunksRes = await query(sql, [userUuid, vectorStr]);
    const chunks = chunksRes.rows;

    const startTime = Date.now();

    // 7. Handle No Relevant Information Found
    if (chunks.length === 0) {
      // Log empty query search to audit logs
      await query(
        `INSERT INTO audit_logs (user_id, action, metadata)
         VALUES ($1, $2, $3)`,
        [
          userUuid,
          'Widget Chat',
          JSON.stringify({
            external_user_id: String(userId),
            organization: org.name,
            sources: [],
            responseTime: 0,
            emptyMatch: true
          })
        ]
      );

      const acceptHeader = request.headers.get('accept') || '';
      const isEventStream = acceptHeader.includes('text/event-stream');

      if (isEventStream) {
        const responseStream = new ReadableStream({
          start(streamController) {
            const dataPayload = JSON.stringify({ chunk: 'No relevant information found in your assigned documents.' });
            streamController.enqueue(new TextEncoder().encode(`data: ${dataPayload}\n\n`));
            
            const metaEvent = { done: true, sources: [], responseTime: 0 };
            streamController.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(metaEvent)}\n\n`));
            streamController.close();
          }
        });

        return new Response(responseStream, {
          headers: {
            ...corsHeaders,
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
          }
        });
      }

      return NextResponse.json({
        answer: 'No relevant information found in your assigned documents.',
        sources: [],
        responseTime: 0
      }, { headers: corsHeaders });
    }

    // 8. Fetch chatbot settings / system prompt
    const settingsRes = await query(
      'SELECT name, system_prompt FROM chatbot_settings WHERE is_active = true LIMIT 1'
    );
    const systemPrompt = settingsRes.rowCount && settingsRes.rowCount > 0
      ? settingsRes.rows[0].system_prompt
      : 'You are an enterprise AI assistant. Answer only using the provided context. If information is unavailable, clearly state that the answer is not available.';

    // 9. Build context and system prompt
    const contextText = chunks.map((c: any) => c.chunk_text).join('\n\n');
    const finalSystemPrompt = `${systemPrompt}\n\nCONTEXT:\n${contextText}`;

    const model = await getOllamaModel();
    const ollamaMessages = [
      { role: 'system', content: finalSystemPrompt },
      { role: 'user', content: message }
    ];

    const sources = Array.from(new Set(chunks.map((c: any) => c.filename))) as string[];

    // 10. Check if client wants SSE stream or JSON
    const acceptHeader = request.headers.get('accept') || '';
    const isEventStream = acceptHeader.includes('text/event-stream');

    if (isEventStream) {
      const controller = new AbortController();
      const ollamaResponseStream = await makeOllamaRequestStream('/api/chat', {
        model: model,
        messages: ollamaMessages,
        stream: true,
        keep_alive: getOllamaKeepAlive(),
        options: {
          temperature: 0.1,
          num_ctx: 4096
        }
      }, controller.signal);

      const responseStream = new ReadableStream({
        async start(streamController) {
          try {
            let rawBuffer = '';
            for await (const chunk of ollamaResponseStream as any) {
              rawBuffer += chunk.toString('utf8');
              const lines = rawBuffer.split('\n');
              rawBuffer = lines.pop() || '';

              for (const line of lines) {
                if (!line.trim()) continue;
                try {
                  const parsed = JSON.parse(line);
                  const content = parsed.message?.content || '';
                  if (content) {
                    // Send text chunk in SSE format
                    const dataPayload = JSON.stringify({ chunk: content });
                    streamController.enqueue(new TextEncoder().encode(`data: ${dataPayload}\n\n`));
                  }
                } catch (e) {
                  // Ignore JSON parse errors for incomplete lines
                }
              }
            }

            if (rawBuffer.trim()) {
              try {
                const parsed = JSON.parse(rawBuffer);
                const content = parsed.message?.content || '';
                if (content) {
                  const dataPayload = JSON.stringify({ chunk: content });
                  streamController.enqueue(new TextEncoder().encode(`data: ${dataPayload}\n\n`));
                }
              } catch (e) {}
            }

            // Send final metadata event
            const responseTime = Date.now() - startTime;
            const metaEvent = { done: true, sources, responseTime };
            streamController.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(metaEvent)}\n\n`));

            // Log to audit logs
            await query(
              `INSERT INTO audit_logs (user_id, action, metadata)
               VALUES ($1, $2, $3)`,
              [
                userUuid,
                'Widget Chat',
                JSON.stringify({
                  external_user_id: String(userId),
                  organization: org.name,
                  sources,
                  responseTime
                })
              ]
            );

            streamController.close();
          } catch (streamError) {
            streamController.error(streamError);
          }
        }
      });

      return new Response(responseStream, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        }
      });
    }

    // 11. Non-streaming standard JSON response
    const ollamaResponse = await makeOllamaRequest('/api/chat', {
      model: model,
      messages: ollamaMessages,
      stream: false,
      keep_alive: getOllamaKeepAlive(),
      options: {
        temperature: 0.1,
        num_ctx: 4096
      }
    });

    const answer = ollamaResponse.message?.content || 'No response generated.';
    const responseTime = Date.now() - startTime;

    // Log to audit logs
    await query(
      `INSERT INTO audit_logs (user_id, action, metadata)
       VALUES ($1, $2, $3)`,
      [
        userUuid,
        'Widget Chat',
        JSON.stringify({
          external_user_id: String(userId),
          organization: org.name,
          sources,
          responseTime
        })
      ]
    );

    return NextResponse.json({
      answer,
      sources,
      responseTime
    }, { headers: corsHeaders });

  } catch (error: any) {
    console.error('[API Widget Chat Error]:', error.message);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500, headers: corsHeaders }
    );
  }
}
