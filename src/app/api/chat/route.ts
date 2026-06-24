import { NextResponse } from 'next/server';
import { getSession } from '../../../lib/auth';
import { query } from '../../../lib/db';
import { searchUserChunks } from '../../../lib/rag';
import { 
  getOllamaModel, 
  makeOllamaRequestStream,
  makeOllamaRequest, 
  getOllamaKeepAlive 
} from '../../../services/ollama';

export async function POST(request: Request) {
  try {
    // 1. Authenticate user from JWT cookie
    const session = await getSession(request);
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userId } = session;
    const body = await request.json();
    const { message, model: requestedModel } = body;

    if (!message) {
      return NextResponse.json({ error: 'Message is required.' }, { status: 400 });
    }

    const startTime = Date.now();

    // 2. Query matching chunks restricted to user's documents
    const topK = 5;
    const chunks = await searchUserChunks(message, userId, topK);

    // 3. If no chunks found, return immediately
    if (chunks.length === 0) {
      return NextResponse.json({
        answer: 'No relevant information found in your assigned documents.',
        sources: [],
        responseTime: 0
      });
    }

    // 4. Fetch chatbot settings
    const settingsRes = await query(
      'SELECT name, system_prompt FROM chatbot_settings WHERE is_active = true LIMIT 1'
    );
    const systemPrompt = settingsRes.rowCount && settingsRes.rowCount > 0
      ? settingsRes.rows[0].system_prompt
      : 'You are an enterprise AI assistant. Answer only using the provided context. If information is unavailable, clearly state that the answer is not available.';

    // 5. Build prompt
    const contextText = chunks.map((c: any) => c.chunk_text).join('\n\n');
    const finalSystemPrompt = `${systemPrompt}\n\nCONTEXT:\n${contextText}`;

    const model = requestedModel || await getOllamaModel();
    const ollamaMessages = [
      { role: 'system', content: finalSystemPrompt },
      { role: 'user', content: message }
    ];

    const sources = Array.from(new Set(chunks.map((c: any) => c.filename))) as string[];

    // 6. Handle Server-Sent Events (SSE) streaming if requested
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
                    const escapedContent = JSON.stringify(content);
                    streamController.enqueue(new TextEncoder().encode(`data: ${escapedContent}\n\n`));
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
                  const escapedContent = JSON.stringify(content);
                  streamController.enqueue(new TextEncoder().encode(`data: ${escapedContent}\n\n`));
                }
              } catch (e) {}
            }

            // Send final metadata event
            const responseTime = Date.now() - startTime;
            const metaEvent = { done: true, sources, responseTime };
            streamController.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(metaEvent)}\n\n`));
            
            streamController.close();
          } catch (streamError) {
            streamController.error(streamError);
          }
        }
      });

      return new Response(responseStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        }
      });
    }

    // 7. Non-streaming standard JSON response
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

    return NextResponse.json({
      answer,
      sources,
      responseTime
    });

  } catch (error: any) {
    console.error('[API Chat Error]:', error.message);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}
