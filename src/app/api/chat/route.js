import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import http from 'http';
import https from 'https';

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

// Ollama Base Endpoint Config (configurable via env variables for production server deployment)
const OLLAMA_BASE_URL = process.env.OLLAMA_URL || 'https://10.212.7.240:4433/ollama';

// Bypass SSL verification for HTTPS self-signed certificates
if (OLLAMA_BASE_URL.startsWith('https:')) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
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
      return 'llama3.2:1b'; // Fallback default
    }

    // Prefer llama3.2:1b or llama3.2 first for speed on CPU/low-memory systems
    const preferred32 = modelNames.find(name => name.startsWith('llama3.2:1b') || name.startsWith('llama3.2'));
    if (preferred32) return preferred32;

    // Next prefer llama3 or any other llama models
    const preferred = modelNames.find(name => name.startsWith('llama3') || name.startsWith('llama'));
    if (preferred) return preferred;

    // Default to the first available model
    return modelNames[0];
  } catch (e) {
    console.error('Ollama connection error, defaulting to llama3.2:1b:', e.message);
    return 'llama3.2:1b';
  }
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
    const body = await request.json();
    const { messages, model: requestedModel } = body;

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages are required and must be an array.' }, { status: 400 });
    }

    const lastUserMessage = messages.findLast(m => m.role === 'user');
    if (!lastUserMessage) {
      return NextResponse.json({ error: 'No user message found.' }, { status: 400 });
    }

    const context = getContextData();
    const model = requestedModel || await getOllamaModel();

    // Classify user intent
    const intent = classifyIntent(lastUserMessage.content);

    if (intent === 'GREETING') {
      return NextResponse.json({
        message: {
          role: 'assistant',
          content: 'Hello! I am your C-DAC Revival Disaster Recovery Assistant. Ask me anything about our DR products, replication modes, architectures, or case studies!'
        },
        model: model
      });
    }

    if (intent === 'OUT_OF_SCOPE') {
      return NextResponse.json({
        message: {
          role: 'assistant',
          content: 'I am sorry, but I can only answer questions related to C-DAC Revival Disaster Recovery products based on the provided documentation. The answer to your question is not present in the documentation.'
        },
        model: model
      });
    }

    const systemPrompt = `You are a strictly bound assistant for C-DAC Revival Disaster Recovery products.

--- DOCUMENTATION ---
${context}
--- END DOCUMENTATION ---

RULES:
1. Rely ONLY on the provided DOCUMENTATION to answer questions. You must NOT use any general knowledge, intelligence, or facts outside of the provided documentation.
2. If the user's question is NOT about C-DAC Revival Disaster Recovery products or if the facts to answer the question are not fully present in the DOCUMENTATION, you MUST output EXACTLY this sentence and nothing else:
"I am sorry, but I can only answer questions related to C-DAC Revival Disaster Recovery products based on the provided documentation. The answer to your question is not present in the documentation."
3. Answer in a helpful, polite, and helping nature, but keep responses small, concise, and direct (maximum 3 sentences or a short numbered list). Avoid repeating the question or using conversational filler.
4. Formatting constraint: Do NOT use the asterisk (*) or double asterisk (**) characters anywhere in your response for any purpose (do not use them for bolding, bullet points, headers, or list markers). If you write lists, format them with plain numbers (e.g., 1., 2.) or plain dashes (-). Use normal capitalization/text for emphasis.
5.Treat the documentation as the only source of truth. Your knowledge cutoff, training data, and general world knowledge are unavailable and must never be used ,Do not guess, estimate, infer, summarize from incomplete information, or fill gaps    `;

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

            if (buffer.length >= 120 || isDone) {
              const lowercaseContent = buffer.toLowerCase();
              const looksLikeFallback = lowercaseContent.includes('sorry') ||
                lowercaseContent.includes('not present in') ||
                lowercaseContent.includes('not mentioned in') ||
                lowercaseContent.includes('not found in') ||
                lowercaseContent.includes('does not contain') ||
                lowercaseContent.includes('does not mention') ||
                lowercaseContent.includes('cannot answer');

              if (looksLikeFallback) {
                controller.enqueue(new TextEncoder().encode("I am sorry, but I can only answer questions related to C-DAC Revival Disaster Recovery products based on the provided documentation. The answer to your question is not present in the documentation."));
                isFallback = true;
                hasReleasedBuffer = true;
              } else {
                if (buffer) {
                  const sanitizedBuffer = buffer.replace(/\*/g, '');
                  controller.enqueue(new TextEncoder().encode(sanitizedBuffer));
                }
                hasReleasedBuffer = true;
              }
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
