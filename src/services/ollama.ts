import http from 'http';
import https from 'https';
import { URL } from 'url';

// Setup connection URL from environment variables
const OLLAMA_BASE_URL = (
  process.env.OLLAMA_BASE_URL ||
  process.env.OLLAMA_URL ||
  'http://10.210.8.100:51434'
).replace(/\/+$/, '');

console.log('--- DEBUG: OLLAMA_BASE_URL configured as:', OLLAMA_BASE_URL);

// Bypass SSL verification for self-signed certificates on local networks
if (OLLAMA_BASE_URL.startsWith('https:')) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

/**
 * Executes a POST request to Ollama endpoint.
 */
export function makeOllamaRequest(path: string, body: any, signal?: AbortSignal): Promise<any> {
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
          'Content-Length': Buffer.byteLength(bodyStr),
        },
        timeout: 10000, // 10 seconds timeout
        ...(isHttps ? { rejectUnauthorized: false } : {}),
      };

      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
            reject(new Error(`Ollama returned status ${res.statusCode}: ${data}`));
          } else {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(new Error(`Failed to parse Ollama JSON response: ${data}`));
            }
          }
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request to Ollama timed out.'));
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

/**
 * Special request client helper returning raw client response stream.
 * Used for streaming completions directly to the frontend.
 */
export function makeOllamaRequestStream(path: string, body: any, signal?: AbortSignal): Promise<http.IncomingMessage> {
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
          'Content-Length': Buffer.byteLength(bodyStr),
        },
        ...(isHttps ? { rejectUnauthorized: false } : {}),
      };

      const req = client.request(options, (res) => {
        if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
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

/**
 * Executes a GET request to Ollama.
 */
export function makeOllamaGetRequest(path: string, signal?: AbortSignal): Promise<string> {
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
        timeout: 5000, // 5 seconds timeout
        ...(isHttps ? { rejectUnauthorized: false } : {}),
      };

      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
            reject(new Error(`Ollama returned status ${res.statusCode}: ${data}`));
          } else {
            resolve(data);
          }
        });
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request to Ollama timed out.'));
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

/**
 * Helper to get the keep_alive duration parameter.
 */
export function getOllamaKeepAlive(): string {
  return process.env.OLLAMA_KEEP_ALIVE || '20m';
}

/**
 * Retrieve raw list of available models from tags.
 */
export async function getRawAvailableModels(): Promise<any[]> {
  try {
    const dataStr = await makeOllamaGetRequest('/api/tags');
    const data = JSON.parse(dataStr);
    return data.models || [];
  } catch (err: any) {
    console.error('[Ollama] Failed to fetch available models:', err.message);
    return [];
  }
}

/**
 * Retrieve names of available models from tags.
 */
export async function getAvailableModels(): Promise<string[]> {
  const models = await getRawAvailableModels();
  return models.map((m: any) => m.name);
}

/**
 * Retrieve names of available models that support chat completions.
 */
export async function getAvailableChatModels(): Promise<string[]> {
  const models = await getRawAvailableModels();
  const chatModels = models.filter((m: any) => {
    if (m.capabilities) {
      return m.capabilities.includes('completion');
    }
    const name = m.name.toLowerCase();
    return !name.includes('embed') && !name.includes('bge-') && !name.includes('minilm');
  });
  return chatModels.map((m: any) => m.name);
}

/**
 * Generates an embedding vector for text chunking.
 */
export async function getEmbedding(text: string, model: string = 'bge-m3'): Promise<number[]> {
  return getEmbeddingHelper(text, model, new Set<string>());
}

/**
 * Helper with retry logic and fallback models if preferred bge-m3 is not available.
 */
async function getEmbeddingHelper(text: string, model: string, triedModels: Set<string>): Promise<number[]> {
  triedModels.add(model);
  try {
    // 1. Try newer /api/embed
    try {
      const response = await makeOllamaRequest('/api/embed', { 
        model, 
        input: text,
        keep_alive: getOllamaKeepAlive()
      });
      if (response.embeddings && response.embeddings[0]) {
        return response.embeddings[0];
      }
    } catch (e: any) {
      console.warn(`Ollama /api/embed with ${model} failed, trying /api/embeddings fallback...`, e.message);
    }

    // 2. Try older /api/embeddings
    const response = await makeOllamaRequest('/api/embeddings', { 
      model, 
      prompt: text,
      keep_alive: getOllamaKeepAlive()
    });
    if (response.embedding) {
      return response.embedding;
    }
    throw new Error('No embedding array returned from Ollama');
  } catch (error: any) {
    console.error(`Error generating embedding with model "${model}":`, error.message);
    const available = await getAvailableModels();
    if (available.length > 0) {
      const untried = available.find(m => !triedModels.has(m));
      if (untried) {
        console.warn(`Attempting embedding generation using fallback model "${untried}"...`);
        return getEmbeddingHelper(text, untried, triedModels);
      }
    }
    throw error;
  }
}

/**
 * Chooses the best LLM model for responding from the available model list.
 */
export async function getOllamaModel(): Promise<string> {
  try {
    const modelNames = await getAvailableChatModels();

    if (modelNames.length === 0) {
      return 'qwen3:14b'; // Default fallback
    }

    const preferredQwen = modelNames.find(name => name.startsWith('qwen3') || name.startsWith('qwen'));
    if (preferredQwen) return preferredQwen;

    const preferred32 = modelNames.find(name => name.startsWith('llama3.2:1b') || name.startsWith('llama3.2'));
    if (preferred32) return preferred32;

    const preferred = modelNames.find(name => name.startsWith('llama3') || name.startsWith('llama'));
    if (preferred) return preferred;

    return modelNames[0];
  } catch (e: any) {
    console.error('Ollama connection error, defaulting to qwen3:14b:', e.message);
    return 'qwen3:14b';
  }
}

/**
 * Chooses the best embedding model from the available model list.
 */
export async function getOllamaEmbeddingModel(): Promise<string> {
  try {
    const modelNames = await getAvailableModels();

    const preferredBge = modelNames.find(name => name.startsWith('bge-m3'));
    if (preferredBge) return preferredBge;

    const preferredEmbed = modelNames.find(name => name.startsWith('nomic-embed-text'));
    if (preferredEmbed) return preferredEmbed;

    const preferredMinilm = modelNames.find(name => name.startsWith('all-minilm'));
    if (preferredMinilm) return preferredMinilm;

    return 'bge-m3';
  } catch (e) {
    return 'bge-m3';
  }
}
