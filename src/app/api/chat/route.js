import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';
import { getOrGenerateEmbeddings, searchSimilarChunks } from './rag';

// Ollama Base Endpoint Config (configurable via env variables for production server deployment)
const OLLAMA_BASE_URL = (process.env.OLLAMA_URL || 'http://10.210.8.100:51434').replace(/\/+$/, '');
console.log('--- DEBUG: OLLAMA_BASE_URL is:', OLLAMA_BASE_URL);

// Bypass SSL verification for HTTPS self-signed certificates
if (OLLAMA_BASE_URL.startsWith('https:')) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

// Helper to perform HTTP requests to Ollama without Node's undici headers timeout limits
function makeOllamaRequest(path, body, signal) {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(`${OLLAMA_BASE_URL}${path}`);
      const bodyStr = JSON.stringify(body);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(bodyStr)
        },
        ...(isHttps ? { rejectUnauthorized: false } : {})
      };

      const req = client.request(options, (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            reject(new Error(`Ollama returned status ${res.statusCode}: ${data}`));
          });
        } else {
          resolve(res);
        }
      });

      req.on('error', (err) => {
        reject(err);
      });

      if (signal) {
        signal.addEventListener('abort', () => {
          req.destroy();
          const err = new Error('The operation was aborted.');
          err.name = 'AbortError';
          reject(err);
        });
      }

      req.write(bodyStr);
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

// Helper to perform HTTP GET requests to Ollama bypass SSL verification issues in native fetch
function makeOllamaGetRequest(path, signal) {
  return new Promise((resolve, reject) => {
    try {
      const url = new URL(`${OLLAMA_BASE_URL}${path}`);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'GET',
        headers: {},
        ...(isHttps ? { rejectUnauthorized: false } : {})
      };

      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`Ollama returned status ${res.statusCode}: ${data}`));
          } else {
            resolve(data);
          }
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      if (signal) {
        signal.addEventListener('abort', () => {
          req.destroy();
          const err = new Error('The operation was aborted.');
          err.name = 'AbortError';
          reject(err);
        });
      }

      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

// Load context documentation
function getContextData() {
  try {
    const filePath = path.join(process.cwd(), 'src', 'data', 'context.txt');
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    console.error('Error reading context.txt:', error);
    return 'C-DAC Revival Disaster Recovery products documentation is unavailable.';
  }
}

// Helper to get available model names
async function getAvailableModelNames() {
  try {
    const dataStr = await makeOllamaGetRequest('/api/tags');
    const data = JSON.parse(dataStr);
    return (data.models || []).map(m => m.name);
  } catch (e) {
    console.error('Error fetching available model names:', e.message);
    return [];
  }
}

// Check available Ollama models and choose the best one
async function getOllamaModel() {
  try {
    const modelNames = await getAvailableModelNames();

    if (modelNames.length === 0) {
      return 'qwen3:14b'; // Fallback default
    }

    // Prefer qwen3 first since that is what the user has loaded
    const preferredQwen = modelNames.find(name => name.startsWith('qwen3') || name.startsWith('qwen'));
    if (preferredQwen) return preferredQwen;

    // Prefer llama3.2:1b or llama3.2 first for speed on CPU/low-memory systems
    const preferred32 = modelNames.find(name => name.startsWith('llama3.2:1b') || name.startsWith('llama3.2'));
    if (preferred32) return preferred32;

    // Next prefer llama3 or any other llama models
    const preferred = modelNames.find(name => name.startsWith('llama3') || name.startsWith('llama'));
    if (preferred) return preferred;

    // Default to the first available model
    return modelNames[0];
  } catch (e) {
    console.error('Ollama connection error, defaulting to qwen3:14b:', e.message);
    return 'qwen3:14b';
  }
}

// Classify user intent to route messages cleanly
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

// Helper to choose the best embedding model from Ollama
async function getOllamaEmbeddingModel() {
  try {
    const modelNames = await getAvailableModelNames();

    // Check if bge-m3 is available
    const preferredBge = modelNames.find(name => name.startsWith('bge-m3'));
    if (preferredBge) return preferredBge;

    // Check if nomic-embed-text is available
    const preferredEmbed = modelNames.find(name => name.startsWith('nomic-embed-text'));
    if (preferredEmbed) return preferredEmbed;

    // Next check if all-minilm is available
    const preferredMinilm = modelNames.find(name => name.startsWith('all-minilm'));
    if (preferredMinilm) return preferredMinilm;

    // Fallback to active LLM model
    return 'bge-m3';
  } catch (e) {
    return 'bge-m3';
  }
}

async function isQueryInScope(query, isAuthenticated, generalChunks, userChunks, embeddingModel) {
  const cleanQuery = query.toLowerCase();

  const hasGeneral = GENERAL_KEYWORDS.some(kw => cleanQuery.includes(kw));
  if (hasGeneral) return true;

  if (isAuthenticated) {
    const hasUser = USER_KEYWORDS.some(kw => cleanQuery.includes(kw));
    if (hasUser) return true;
  }

  // Combine chunks for semantic checking
  const allAvailableChunks = [...generalChunks];
  if (isAuthenticated) {
    allAvailableChunks.push(...userChunks);
  }

  if (allAvailableChunks.length === 0) return false;

  const results = await searchSimilarChunks(query, allAvailableChunks, embeddingModel, 1);
  if (results.length > 0) {
    const highestScore = results[0].similarity;
    console.log(`--- DEBUG: RAG Scope similarity score for query "${query}" is:`, highestScore);
    if (highestScore >= 0.35) {
      return true;
    }
  }

  return false;
}

// Classify user intent to route messages cleanly
function classifyIntent(message) {
  const text = message.trim().toLowerCase();

  // Check for greetings and assistant introductions
  const greetings = ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'greetings', 'sup', 'yo'];
  const intros = ['who are you', 'what are you', 'introduce yourself', 'your name', 'help me'];

  const cleanText = text.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "").trim();

  if (greetings.includes(cleanText) || intros.some(intro => cleanText.includes(intro))) {
    return 'GREETING';
  }

  // All other queries are routed to the intelligent LLM
  return 'PRODUCT_QUESTION';
}

export async function POST(request) {
  try {
    // Session Handling: Retrieve the cookies to check authentication status
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get('session_token');
    const isAuthenticated = sessionToken && sessionToken.value === 'demo_session_token_value';

    const body = await request.json();
    const { messages, model: requestedModel } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages are required and must be an array.' }, { status: 400 });
    }

    const lastUserMessage = messages.findLast(m => m.role === 'user');
    if (!lastUserMessage) {
      return NextResponse.json({ error: 'No user message found.' }, { status: 400 });
    }

    // Context Loading & Selection Logic:
    const defaultModel = requestedModel || 'llama3.2:1b';
    const embeddingModel = await getOllamaEmbeddingModel();

    // 1. General context embeddings/chunks
    const contextPath = path.join(process.cwd(), 'src', 'data', 'context.txt');
    let generalChunks = [];
    try {
      generalChunks = await getOrGenerateEmbeddings(contextPath, embeddingModel);
    } catch (error) {
      console.error('Error loading/generating general chunks:', error);
    }

    // 2. User context embeddings/chunks (only if authenticated)
    let userChunks = [];
    if (isAuthenticated) {
      const userContextPath = path.join(process.cwd(), 'src', 'data', 'user.txt');
      try {
        userChunks = await getOrGenerateEmbeddings(userContextPath, embeddingModel);
      } catch (error) {
        console.error('Error loading/generating user chunks:', error);
      }
    }

    // Classify user intent
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

    // Check if the query is in scope using keyword + semantic filter
    const inScope = await isQueryInScope(lastUserMessage.content, isAuthenticated, generalChunks, userChunks, embeddingModel);
    if (!inScope) {
      const outOfScopeResponse = 'I am sorry, but I can only answer questions related to C-DAC Revival Disaster Recovery products based on the provided documentation. The answer to your question is not present in the documentation.';
      return new Response(outOfScopeResponse, {
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'X-Selected-Model': defaultModel
        }
      });
    }

    const model = requestedModel || await getOllamaModel();

    // System prompt is dynamically generated based on login status to switch context access rules.
    let systemPrompt = '';
    if (isAuthenticated) {
      const simUserChunks = await searchSimilarChunks(lastUserMessage.content, userChunks, embeddingModel, 5);
      const retrievedUserContext = simUserChunks.map(c => c.text).join('\n\n');

      const simGeneralChunks = await searchSimilarChunks(lastUserMessage.content, generalChunks, embeddingModel, 5);
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
      const simGeneralChunks = await searchSimilarChunks(lastUserMessage.content, generalChunks, embeddingModel, 5);
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

    // Construct request to local Ollama instance
    const ollamaMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role, content: m.content }))
    ];

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 600000); // 10 minutes timeout (allows for CPU-only slow cold starts)

    try {
      const ollamaResponse = await makeOllamaRequest('/api/chat', {
        model: model,
        messages: ollamaMessages,
        stream: true,
        options: {
          temperature: 0.1 // Low temperature for factual compliance
        }
      }, controller.signal);

      clearTimeout(timeoutId);

      const stream = new ReadableStream({
        async start(controller) {
          let buffer = '';
          let hasReleasedBuffer = false;
          let isFallback = false;

          const checkAndRelease = (isDone) => {
            if (hasReleasedBuffer) return;

            const trimmedBuffer = buffer.trim().toLowerCase();
            console.log(`--- DEBUG checkAndRelease: buffer="${buffer}", trimmed="${trimmedBuffer}", isDone=${isDone}, len=${buffer.length}`);

            if (trimmedBuffer.startsWith('confirmed:')) {
              const matchIndex = buffer.toLowerCase().indexOf('confirmed:');
              let cleanContent = buffer.slice(matchIndex + 10);
              cleanContent = cleanContent.replace(/^[\s\r\n]+/, '');

              // Wait until we have at least 15 characters of content to check for nested fallbacks,
              // unless the stream has finished.
              if (cleanContent.length < 15 && !isDone) {
                console.log(`--- DEBUG checkAndRelease: CONFIRMED match but cleanContent too short (${cleanContent.length} chars). Waiting...`);
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
            } else if (trimmedBuffer.startsWith('out_of_scope:') || isDone || buffer.length >= 40) {
              console.log(`--- DEBUG checkAndRelease: OUT_OF_SCOPE / FALLBACK match. startsWithOut=${trimmedBuffer.startsWith('out_of_scope:')}, isDone=${isDone}, len=${buffer.length}`);
              controller.enqueue(new TextEncoder().encode("I am sorry, but I can only answer questions related to C-DAC Revival Disaster Recovery products based on the provided documentation. The answer to your question is not present in the documentation."));
              hasReleasedBuffer = true;
              isFallback = true;
            }
          };

          try {
            let rawBuffer = '';
            for await (const chunk of ollamaResponse) {
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

    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError.name === 'AbortError') {
        return NextResponse.json({
          error: 'Request to Ollama timed out. The local model is taking too long to respond.',
          isOllamaOffline: false
        }, { status: 504 });
      }

      console.error('Failed to contact Ollama:', fetchError);
      return NextResponse.json({
        error: `Cannot connect to Ollama instance at ${OLLAMA_BASE_URL}. Please ensure Ollama is running and accessible.`,
        isOllamaOffline: true
      }, { status: 503 });
    }

  } catch (error) {
    console.error('API route error:', error);
    return NextResponse.json({ error: 'Internal server error.' }, { status: 500 });
  }
}

// GET method to check Ollama status and retrieve current model config
export async function GET() {
  try {
    const dataStr = await makeOllamaGetRequest('/api/tags');
    const data = JSON.parse(dataStr);
    const models = data.models || [];
    const activeModel = await getOllamaModel();

    return NextResponse.json({
      status: 'online',
      models: models.map(m => m.name),
      selectedModel: activeModel
    });
  } catch (e) {
    return NextResponse.json({
      status: 'offline',
      error: `Cannot reach Ollama at ${OLLAMA_BASE_URL}: ${e.message}`
    });
  }
}
