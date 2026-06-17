import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { 
  getOllamaModel, 
  getOllamaEmbeddingModel, 
  makeOllamaRequestStream, 
  makeOllamaGetRequest,
  getOllamaKeepAlive,
  getAvailableChatModels
} from '../../../services/ollama';
import { searchSimilarChunks } from '../../../services/rag';
import { query } from '../../../lib/db';


// Hardcoded static token to verify session
const DEMO_SESSION_TOKEN = 'demo_session_token_value';

// Keywords for scope checking
const GENERAL_KEYWORDS = [
  'c-dac', 'cdac', 'revival', 'disaster recovery', 'dr', 'drm',
  'replication', 'replicator', 'replicate', 'replicated',
  'backup', 'backups', 'failover', 'failback', 'switchover', 'switchback',
  'sync', 'synchronous', 'semi-synchronous', 'asynchronous', 'async',
  'optimal', 'flat-file', 'active-active', 'iscsi', 'san',
  'lndc', 'nsdg', 'lrit', 'cmrf', 'maharashtra', 'pune', 'mumbai', 'hyderabad', 'delhi', 'gurgaon', 'imac', 'shastri park', 'laxmi nagar',
  'database', 'databases', 'oracle', 'postgresql', 'postgres', 'mssql', 'mysql', 'mongodb',
  'wan', 'rpo', 'rto', 'mfa', 'rbac', 'ethernet',
  'deployment', 'deployments', 'case study', 'case studies', 'accolade', 'accolades', 'patent', 'patents', 'award', 'awards',
  'compliance', 'compliant', 'isms', 'iso', 'distance', 'kilometer', 'kilometers', 'km',
  'staging', 'appliance', 'appliances', 'drill', 'drills', 'cost', 'saving', 'savings'
];

const USER_KEYWORDS = [
  'demo', 'admin', 'designation', 'sdc', 'dr-9981', 'emergency', 'contact', '9876543210',
  'sa-mum-01', 'appliance', 'drill', 'schedule', 'friday', 'clearance', 'level-3', '500gb',
  'user', 'profile', 'my info', 'my details', 'about me', 'who am i', 'my setup', 'assigned', 'staging'
];

/**
 * Checks whether the user query is within the domain scope of C-DAC Revival DR products.
 */
async function isQueryInScope(
  query: string,
  isAuthenticated: boolean,
  filenames: string[],
  embeddingModel: string
): Promise<boolean> {
  const cleanQuery = query.toLowerCase();

  const hasGeneral = GENERAL_KEYWORDS.some(kw => cleanQuery.includes(kw));
  if (hasGeneral) return true;

  if (isAuthenticated) {
    const hasUser = USER_KEYWORDS.some(kw => cleanQuery.includes(kw));
    if (hasUser) return true;
  }

  // Fallback to database semantic similarity check (Top-1 search)
  const results = await searchSimilarChunks(query, filenames, embeddingModel, 1, 0.30);
  if (results.length > 0) {
    const highestScore = results[0].similarity;
    console.log(`--- DEBUG: RAG Scope similarity score for query "${query}" is:`, highestScore);
    if (highestScore >= 0.30) {
      return true;
    }
  }

  return false;
}

/**
 * Classify user intent to route messages cleanly
 */
function classifyIntent(message: string): 'GREETING' | 'PRODUCT_QUESTION' {
  const text = message.trim().toLowerCase();

  const greetings = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'greetings', 'sup', 'yo'];
  const intros = ['who are you', 'what are you', 'introduce yourself', 'your name', 'help me'];

  const cleanText = text.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "").trim();

  if (greetings.includes(cleanText) || intros.some(intro => cleanText.includes(intro))) {
    return 'GREETING';
  }

  return 'PRODUCT_QUESTION';
}

/**
 * POST API handler to execute RAG queries and stream LLM completions.
 */
export async function POST(request: Request) {
  try {
    // Session Handling: Retrieve the cookies to check authentication status
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('session_token');
    const isAuthenticated = sessionToken && sessionToken.value === DEMO_SESSION_TOKEN;

    const body = await request.json();
    const { messages, model: requestedModel } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages are required and must be an array.' }, { status: 400 });
    }

    const lastUserMessage = messages.findLast(m => m.role === 'user');
    if (!lastUserMessage) {
      return NextResponse.json({ error: 'No user message found.' }, { status: 400 });
    }

    const defaultModel = requestedModel || 'llama3.2:1b';
    const embeddingModel = await getOllamaEmbeddingModel();

    // Dynamically retrieve all document filenames currently ingested in the database
    let allFilenames: string[] = [];
    try {
      const docList = await query('SELECT filename FROM documents');
      allFilenames = docList.rows.map((row: any) => row.filename);
    } catch (dbErr: any) {
      console.error('[API Chat] Failed to load documents from database:', dbErr.message);
      // Fallback in case of database errors
      allFilenames = ['context.txt'];
      if (isAuthenticated) {
        allFilenames.push('user.txt');
      }
    }

    // Filter which files are accessible based on user credentials
    const filenames = isAuthenticated 
      ? allFilenames 
      : allFilenames.filter((name: string) => name !== 'user.txt' && !name.startsWith('user_'));


    // Classify user intent (greetings bypass similarity retrieval)
    const intent = classifyIntent(lastUserMessage.content);

    if (intent === 'GREETING') {
      const content = isAuthenticated
        ? 'Hello, demo! I am your C-DAC Revival Disaster Recovery Assistant. Having loaded your profile, I can answer queries about your assigned staging appliances, contacts, custom drill schedules, and general DR products.'
        : 'Hello! I am your C-DAC Revival Disaster Recovery Assistant. Ask me anything about our DR products, replication modes, architectures, or case studies!';
      return new Response(content, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Selected-Model': defaultModel
        }
      });
    }

    // Check if the query is in scope using keyword + semantic database filter
    const inScope = await isQueryInScope(lastUserMessage.content, !!isAuthenticated, filenames, embeddingModel);
    if (!inScope) {
      const outOfScopeResponse = 'I am sorry, but I can only answer questions related to C-DAC Revival Disaster Recovery products based on the provided documentation. The answer to your question is not present in the documentation.';
      return new Response(outOfScopeResponse, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Selected-Model': defaultModel
        }
      });
    }

    // Separate files into user-specific and general documentation scopes
    const userFiles = allFilenames.filter(
      (name: string) => name === 'user.txt' || name.startsWith('user_')
    );
    const generalFiles = allFilenames.filter(
      (name: string) => name !== 'user.txt' && !name.startsWith('user_')
    );

    const model = requestedModel || await getOllamaModel();
    let systemPrompt = '';

    // Retrieve database context and construct system prompt templates
    if (isAuthenticated) {
      const simUserChunks = await searchSimilarChunks(lastUserMessage.content, userFiles, embeddingModel, 5, 0.25);
      const retrievedUserContext = simUserChunks.map(c => c.text).join('\n\n');

      const simGeneralChunks = await searchSimilarChunks(lastUserMessage.content, generalFiles, embeddingModel, 5, 0.25);
      const retrievedGeneralContext = simGeneralChunks.map(c => c.text).join('\n\n');
      
      systemPrompt = `You are a strictly bound assistant for C-DAC Revival Disaster Recovery products, customized for the logged-in user: demo.

CRITICAL RULE:
- You MUST start your response with "CONFIRMED: " if and only if the answer is fully present in the provided documentation.
- If the answer is NOT present in the provided documentation, or if the question is out of scope, you MUST start your response with "OUT_OF_SCOPE: " and nothing else.

--- USER PROFILE & CONFIGURATION DOCUMENTATION ---
${retrievedUserContext}
--- END USER PROFILE & CONFIGURATION DOCUMENTATION ---

--- GENERAL PRODUCT DOCUMENTATION ---
${retrievedGeneralContext}
--- END GENERAL PRODUCT DOCUMENTATION ---

RULES:
1. Rely ONLY on the provided USER PROFILE and GENERAL PRODUCT DOCUMENTATION to answer questions. You must NOT use any general knowledge, intelligence, or facts outside of the provided documentation.
2. Context selection and priority logic:
   - If a question relates to the user's specific information (e.g. who they are, their contact details, their staging appliance, their schedule, their database size, etc.), you MUST prioritize information from the USER PROFILE DOCUMENTATION.
   - If the answer to a question is not found in the USER PROFILE DOCUMENTATION, search the GENERAL PRODUCT DOCUMENTATION.
   - You MUST be able to combine information from both sources when generating answers (e.g. if the user asks "What databases are supported for my setup?", explain that the product generally supports Oracle, PostgreSQL, MSSQL, MySQL, and MongoDB, and note that their specific setup is using Oracle).
3. Answer in a helpful, polite, and helping nature, but keep responses small, concise, and direct (maximum 3 sentences or a short numbered list). Avoid repeating the question or using conversational filler.
4. Formatting constraint: Do NOT use the asterisk (*) or double asterisk (**) characters anywhere in your response for any purpose. If you write lists, format them with plain numbers (e.g., 1., 2.) or plain dashes (-). Use normal capitalization/text for emphasis.
5. Treat the documentation as the only source of truth. Your knowledge cutoff, training data, and general world knowledge are unavailable and must never be used. Do not guess, estimate, infer, summarize from incomplete information, or fill gaps.`;
    } else {
      const simGeneralChunks = await searchSimilarChunks(lastUserMessage.content, generalFiles, embeddingModel, 5, 0.25);
      const retrievedGeneralContext = simGeneralChunks.map(c => c.text).join('\n\n');


      systemPrompt = `You are a strictly bound assistant for C-DAC Revival Disaster Recovery products.

CRITICAL RULE:
- You MUST start your response with "CONFIRMED: " if and only if the answer is fully present in the provided documentation.
- If the answer is NOT present in the provided documentation, or if the question is out of scope, you MUST start your response with "OUT_OF_SCOPE: " and nothing else.

--- GENERAL PRODUCT DOCUMENTATION ---
${retrievedGeneralContext}
--- END GENERAL PRODUCT DOCUMENTATION ---

RULES:
1. Rely ONLY on the provided GENERAL PRODUCT DOCUMENTATION to answer questions. You must NOT use any general knowledge, intelligence, or facts outside of the provided documentation.
2. Since you are talking to an unauthenticated Guest user, you have NO access to user-specific details. Do NOT make up or look up any details about the user's profile, contact details, staging appliance, or schedule.
3. Answer in a helpful, polite, and helping nature, but keep responses small, concise, and direct (maximum 3 sentences or a short numbered list). Avoid repeating the question or using conversational filler.
4. Formatting constraint: Do NOT use the asterisk (*) or double asterisk (**) characters anywhere in your response for any purpose. If you write lists, format them with plain numbers (e.g., 1., 2.) or plain dashes (-). Use normal capitalization/text for emphasis.
5. Treat the documentation as the only source of truth. Your knowledge cutoff, training data, and general world knowledge are unavailable and must never be used. Do not guess, estimate, infer, summarize from incomplete information, or fill gaps.`;
    }

    console.log("=== FINAL SYSTEM PROMPT SENT TO OLLAMA ===");
    console.log(systemPrompt);

    const ollamaMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map((m: any) => ({ role: m.role, content: m.content }))
    ];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 minutes timeout

    try {
      const ollamaResponse = await makeOllamaRequestStream('/api/chat', {
        model: model,
        messages: ollamaMessages,
        stream: true,
        keep_alive: getOllamaKeepAlive(), // Maintain LLM in GPU memory to prevent VRAM swapping delays
        options: {
          temperature: 0.1,
          num_ctx: 4096 // Increased to support 5 context chunks per document scope without truncation
        }
      }, controller.signal);

      clearTimeout(timeoutId);

      // Create stream pipeline to process prefixes and formatting
      const stream = new ReadableStream({
        async start(controller) {
          let buffer = '';
          let hasReleasedBuffer = false;
          let isFallback = false;

          const checkAndRelease = (isDone: boolean) => {
            if (hasReleasedBuffer) return;

            const trimmedBuffer = buffer.trim().toLowerCase();
            console.log(`--- DEBUG checkAndRelease: buffer="${buffer}", trimmed="${trimmedBuffer}", isDone=${isDone}, len=${buffer.length}`);

            const confirmedRegex = /^\s*confirmed\s*[:\-\s]\s*/i;
            const outOfScopeRegex = /^\s*out[_\s]of[_\s]scope\s*[:\-\s]\s*/i;

            const matchConfirmed = buffer.match(confirmedRegex);
            const matchOutOfScope = buffer.match(outOfScopeRegex);

            if (matchConfirmed) {
              const prefixLength = matchConfirmed[0].length;
              let cleanContent = buffer.slice(prefixLength);
              cleanContent = cleanContent.replace(/^[\s\r\n]+/, '');

              if (cleanContent.length < 15 && !isDone) {
                return;
              }

              const cleanLower = cleanContent.toLowerCase().trim();
              if (
                cleanLower.startsWith('out_of_scope:') ||
                cleanLower.includes('out of scope') ||
                cleanLower.includes('sorry') ||
                cleanLower.includes('none') ||
                cleanLower.includes('unauthorized') ||
                cleanLower.includes('unauthenticated') ||
                cleanLower.includes('not available') ||
                cleanLower.includes('unavailable')
              ) {
                console.log(`--- DEBUG checkAndRelease: CONFIRMED but content is OUT_OF_SCOPE. cleanLower="${cleanLower}"`);
                controller.enqueue(new TextEncoder().encode("I am sorry, but I can only answer questions related to C-DAC Revival Disaster Recovery products based on the provided documentation. The answer to your question is not present in the documentation."));
                hasReleasedBuffer = true;
                isFallback = true;
              } else {
                console.log(`--- DEBUG checkAndRelease: CONFIRMED match. cleanContent="${cleanContent}"`);
                if (cleanContent) {
                  const sanitizedBuffer = cleanContent.replace(/\*/g, '');
                  controller.enqueue(new TextEncoder().encode(sanitizedBuffer));
                }
                hasReleasedBuffer = true;
                isFallback = false;
              }
            } else if (matchOutOfScope || isDone || buffer.length >= 60) {
              console.log(`--- DEBUG checkAndRelease: OUT_OF_SCOPE / FALLBACK match. isDone=${isDone}, len=${buffer.length}`);
              controller.enqueue(new TextEncoder().encode("I am sorry, but I can only answer questions related to C-DAC Revival Disaster Recovery products based on the provided documentation. The answer to your question is not present in the documentation."));
              hasReleasedBuffer = true;
              isFallback = true;
            }
          };

          try {
            let rawBuffer = '';
            // Read incoming http stream chunks
            for await (const chunk of ollamaResponse as any) {
              rawBuffer += chunk.toString('utf8');
              const lines = rawBuffer.split('\n');
              rawBuffer = lines.pop() || '';

              for (const line of lines) {
                if (!line.trim()) continue;
                try {
                  const parsed = JSON.parse(line);
                  const content = parsed.message?.content || '';
                  if (content) {
                    buffer += content;
                    if (!hasReleasedBuffer) {
                      checkAndRelease(false);
                    } else {
                      if (!isFallback) {
                        const sanitizedContent = content.replace(/\*/g, '');
                        controller.enqueue(new TextEncoder().encode(sanitizedContent));
                      }
                    }
                  }
                } catch (e) {
                  console.error('Error parsing stream line:', e);
                }
              }
            }

            if (rawBuffer.trim()) {
              try {
                const parsed = JSON.parse(rawBuffer);
                const content = parsed.message?.content || '';
                if (content) {
                  buffer += content;
                }
              } catch (e) {
                console.error('Error parsing final stream buffer:', e);
              }
            }

            checkAndRelease(true);
            controller.close();
          } catch (err) {
            console.error('Streaming error inside start:', err);
            controller.error(err);
          }
        }
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Transfer-Encoding': 'chunked',
          'X-Selected-Model': model
        }
      });

    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        return NextResponse.json({
          error: 'Request to Ollama timed out. The local model is taking too long to respond.',
          isOllamaOffline: false
        }, { status: 504 });
      }

      console.error('Failed to contact Ollama:', fetchError);
      return NextResponse.json({
        error: `Cannot connect to Ollama instance. Please ensure Ollama is running and accessible.`,
        isOllamaOffline: true
      }, { status: 503 });
    }

  } catch (error: any) {
    console.error('API route error:', error.message);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

export async function GET() {
  try {
    const chatModels = await getAvailableChatModels();
    const activeModel = await getOllamaModel();

    return NextResponse.json({
      status: 'online',
      models: chatModels,
      selectedModel: activeModel
    });
  } catch (e: any) {
    return NextResponse.json({
      status: 'offline',
      error: `Cannot reach Ollama: ${e.message}`
    });
  }
}
