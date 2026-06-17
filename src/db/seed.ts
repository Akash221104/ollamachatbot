import fs from 'fs';
import path from 'path';
import { query, closePool } from '../lib/db';
import { ingestDocument } from '../services/rag';
import { getOllamaEmbeddingModel } from '../services/ollama';

/**
 * Custom environment variable loader for Node.js scripts running outside of Next.js startup framework context.
 * Reads `.env.local` from the workspace root to retrieve database configuration credentials.
 */
function loadEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index > 0) {
        const key = trimmed.slice(0, index).trim();
        const value = trimmed.slice(index + 1).trim();
        process.env[key] = value;
      }
    }
  }
}

async function main() {
  console.log('[Seed] Starting database migration and seeding...');
  loadEnvLocal();

  // 1. Run migrations first to create tables and setup pgvector
  const migrationPath = path.join(process.cwd(), 'src', 'db', 'migration.sql');
  if (!fs.existsSync(migrationPath)) {
    throw new Error(`Migration SQL file not found at ${migrationPath}`);
  }
  
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  console.log('[Seed] Executing schema migrations from migration.sql...');
  await query(migrationSql);
  console.log('[Seed] Database migrations applied successfully.');

  // 2. Fetch active embedding model
  const embeddingModel = await getOllamaEmbeddingModel();
  console.log(`[Seed] Active embedding model resolved as: "${embeddingModel}"`);

  // 3. Scan the src/data directory for all .txt files
  const dataDirPath = path.join(process.cwd(), 'src', 'data');
  if (fs.existsSync(dataDirPath)) {
    const files = fs.readdirSync(dataDirPath);
    const txtFiles = files.filter(f => f.endsWith('.txt'));
    
    console.log(`[Seed] Found ${txtFiles.length} text files to process:`, txtFiles);

    for (const filename of txtFiles) {
      console.log(`[Seed] Processing file: "${filename}"...`);
      const filePath = path.join(dataDirPath, filename);
      const fileText = fs.readFileSync(filePath, 'utf8');
      
      const result = await ingestDocument(filename, fileText, embeddingModel);
      console.log(`[Seed] Ingestion status for "${filename}": ${result.status} (Document ID: ${result.documentId})`);
    }
  } else {
    console.warn(`[Seed] Data directory not found at ${dataDirPath}`);
  }


  console.log('[Seed] Database initialization and seeding processes completed successfully!');
}

main()
  .catch((err) => {
    console.error('[Seed Error] Database seeding failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await closePool();
  });
