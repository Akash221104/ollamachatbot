import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import http from 'http';
import https from 'https';

const OLLAMA_BASE_URL = (process.env.OLLAMA_URL || 'http://10.210.8.100:51434').replace(/\/+$/, '');

// Bypass SSL verification for HTTPS self-signed certificates (consistent with route.js)
if (OLLAMA_BASE_URL.startsWith('https:')) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

/**
 * Performs a POST request to Ollama.
 */
function makeOllamaRequest(path, body) {
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
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
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

      req.write(bodyStr);
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

let cachedModels = null;

async function getAvailableModels() {
  if (cachedModels) return cachedModels;
  try {
    const response = await new Promise((resolve, reject) => {
      const url = new URL(`${OLLAMA_BASE_URL}/api/tags`);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'GET',
        ...(isHttps ? { rejectUnauthorized: false } : {})
      };

      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`Status ${res.statusCode}`));
          } else {
            try {
              resolve(JSON.parse(data));
            } catch (e) {
              reject(e);
            }
          }
        });
      });

      req.on('error', reject);
      req.end();
    });

    cachedModels = (response.models || []).map(m => m.name);
    console.log('[RAG] Detected Ollama models:', cachedModels);
    return cachedModels;
  } catch (err) {
    console.error('[RAG] Failed to fetch available models:', err.message);
    return [];
  }
}

export async function getEmbedding(text, model = 'bge-m3') {
  return getEmbeddingHelper(text, model, new Set());
}

async function getEmbeddingHelper(text, model, triedModels) {
  triedModels.add(model);
  try {
    // 1. Try newer /api/embed
    try {
      const response = await makeOllamaRequest('/api/embed', { model, input: text });
      if (response.embeddings && response.embeddings[0]) {
        return response.embeddings[0];
      }
    } catch (e) {
      console.warn(`Ollama /api/embed with ${model} failed, trying /api/embeddings fallback...`, e.message);
    }

    // 2. Try older /api/embeddings
    const response = await makeOllamaRequest('/api/embeddings', { model, prompt: text });
    if (response.embedding) {
      return response.embedding;
    }
    throw new Error('No embedding array returned from Ollama');
  } catch (error) {
    console.error(`Error generating embedding with model "${model}":`, error.message);
    // Fallback dynamically to whatever model is installed and hasn't been tried yet
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
 * Loads cached embeddings or generates them if cache is missing/stale.
 * Compares MD5 hashes to detect file content modifications.
 */
export async function getOrGenerateEmbeddings(filePath, embeddingModel = 'bge-m3') {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf8');
  const contentHash = crypto.createHash('md5').update(content).digest('hex');

  // Cache files are placed in the same directory with "_embeddings.json" extension
  const cachePath = filePath.replace(/\.txt$/, '_embeddings.json');

  if (fs.existsSync(cachePath)) {
    try {
      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      if (cached.hash === contentHash && Array.isArray(cached.chunks) && cached.chunks.length > 0) {
        console.log(`[RAG] Cache hit for file: ${path.basename(filePath)}`);
        return cached.chunks;
      }
    } catch (err) {
      console.warn(`[RAG] Failed to parse cache for ${filePath}, regenerating:`, err.message);
    }
  }

  console.log(`[RAG] Cache miss/stale for: ${path.basename(filePath)}. Generating embeddings...`);

  // Segment document into paragraph-based chunks
  const rawChunks = content
    .split(/\n\s*\n+/)
    .map(chunk => chunk.trim())
    .filter(Boolean);

  const chunks = [];
  for (let i = 0; i < rawChunks.length; i++) {
    const text = rawChunks[i];
    try {
      // Process sequentially to not overwhelm local single-thread Ollama setups
      const embedding = await getEmbedding(text, embeddingModel);
      chunks.push({ text, embedding });
    } catch (err) {
      console.error(`[RAG] Error embedding chunk ${i + 1}/${rawChunks.length}:`, err.message);
    }
  }

  if (chunks.length > 0) {
    try {
      const cacheData = { hash: contentHash, chunks };
      fs.writeFileSync(cachePath, JSON.stringify(cacheData, null, 2), 'utf8');
      console.log(`[RAG] Successfully cached embeddings in ${path.basename(cachePath)}`);
    } catch (writeErr) {
      console.error(`[RAG] Failed to write cache file:`, writeErr.message);
    }
  }

  return chunks;
}

/**
 * Calculates cosine similarity between two vectors.
 */
export function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    return 0;
  }
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) {
    return 0;
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Search the chunks semantically using cosine similarity.
 */
export async function searchSimilarChunks(query, chunks, embeddingModel = 'bge-m3', topK = 5) {
  if (!chunks || chunks.length === 0) {
    return [];
  }

  let queryEmbedding;
  try {
    queryEmbedding = await getEmbedding(query, embeddingModel);
  } catch (err) {
    console.error('[RAG] Failed to embed query for similarity search:', err.message);
    return [];
  }

  const scored = chunks.map(chunk => {
    const similarity = cosineSimilarity(queryEmbedding, chunk.embedding);
    return { text: chunk.text, similarity };
  });

  // Sort by highest similarity
  scored.sort((a, b) => b.similarity - a.similarity);

  return scored.slice(0, topK);
}
