import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { query, closePool } from '../lib/db';
import { ingestDocument, generateSHA256 } from '../services/rag';

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

  // Step 1: Run migration.sql to initialize tables
  const migrationPath = path.join(process.cwd(), 'src', 'db', 'migration.sql');
  if (!fs.existsSync(migrationPath)) {
    throw new Error(`Migration SQL file not found at ${migrationPath}`);
  }
  
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  console.log('[Seed] Executing schema migrations from migration.sql...');
  await query(migrationSql);
  console.log('[Seed] Database migrations applied successfully.');

  // Step 2: Seed admin user
  const adminEmail = 'admin@company.com';
  const existingAdmin = await query('SELECT id FROM users WHERE email = $1', [adminEmail]);
  
  let adminId: string;
  if (existingAdmin.rowCount && existingAdmin.rowCount > 0) {
    console.log('[Seed] Admin already exists, skipping user seed.');
    adminId = existingAdmin.rows[0].id;
  } else {
    console.log('[Seed] Creating admin user...');
    const passwordHash = await bcrypt.hash('admin123', 10);
    const insertAdminRes = await query(
      `INSERT INTO users (name, email, password_hash, role, is_active)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ['Admin', adminEmail, passwordHash, 'ADMIN', true]
    );
    adminId = insertAdminRes.rows[0].id;
    console.log(`[Seed] Admin user created with ID: ${adminId}`);
  }

  // Step 3: Seed chatbot_settings
  const existingSettings = await query('SELECT id FROM chatbot_settings WHERE is_active = true');
  if (existingSettings.rowCount && existingSettings.rowCount > 0) {
    console.log('[Seed] Chatbot settings already exist, skipping chatbot seed.');
  } else {
    console.log('[Seed] Seeding chatbot settings...');
    await query(
      `INSERT INTO chatbot_settings (name, description, system_prompt, is_active)
       VALUES ($1, $2, $3, $4)`,
      [
        'AI Assistant',
        'Enterprise Multi-User RAG Portal Chatbot',
        'You are an enterprise AI assistant. Answer only using the provided context. If information is unavailable, clearly state that the answer is not available.',
        true
      ]
    );
    console.log('[Seed] Chatbot settings seeded successfully.');
  }

  // Step 4: Ingest context.txt
  let contextPath = path.join(process.cwd(), 'context.txt');
  if (!fs.existsSync(contextPath)) {
    // Fallback search in src/data
    contextPath = path.join(process.cwd(), 'src', 'data', 'context.txt');
  }

  if (fs.existsSync(contextPath)) {
    console.log(`[Seed] Found context file at: "${contextPath}"`);
    const fileText = fs.readFileSync(contextPath, 'utf8');
    const hash = generateSHA256(fileText);

    const existingDoc = await query('SELECT id FROM documents WHERE file_hash = $1', [hash]);
    if (existingDoc.rowCount && existingDoc.rowCount > 0) {
      console.log('[Seed] context.txt already ingested, skipping file seed.');
    } else {
      console.log('[Seed] Ingesting default context.txt document...');
      const embeddingModel = process.env.OLLAMA_EMBEDDING_MODEL || 'bge-m3';
      const result = await ingestDocument('context.txt', fileText, adminId, embeddingModel);
      console.log(`[Seed] context.txt ingested successfully (Doc ID: ${result.documentId}).`);
    }
  } else {
    console.log('[Seed] No context.txt found, skipping document ingestion seed.');
  }

  // Step 5: Seed organization
  const existingOrg = await query('SELECT id, api_key FROM organizations LIMIT 1');
  let orgId: string;
  if (existingOrg.rowCount && existingOrg.rowCount > 0) {
    console.log('[Seed] Organization already seeded:', existingOrg.rows[0].id);
    orgId = existingOrg.rows[0].id;
  } else {
    console.log('[Seed] Seeding organization...');
    const orgName = process.env.ORGANIZATION_NAME || 'My Company';
    
    // Generate random 16 character alphanumeric API key
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let randKey = '';
    for (let i = 0; i < 16; i++) {
      randKey += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const apiKey = 'ORG_' + randKey;

    const insertOrg = await query(
      `INSERT INTO organizations (name, api_key) VALUES ($1, $2) RETURNING id`,
      [orgName, apiKey]
    );
    orgId = insertOrg.rows[0].id;
    console.log(`[Seed] Organization "${orgName}" created.`);
    console.log('[Seed] Organization API Key:', apiKey);
    console.log('[Seed] Copy this key — it will not be shown again in the terminal');
  }

  // Step 6: Seed default integration
  const existingIntegration = await query('SELECT id FROM chatbot_integrations LIMIT 1');
  if (existingIntegration.rowCount && existingIntegration.rowCount > 0) {
    console.log('[Seed] Chatbot integration already exists, skipping integration seed.');
  } else {
    console.log('[Seed] Seeding default chatbot integration...');
    await query(
      `INSERT INTO chatbot_integrations (organization_id, name, allowed_origins) VALUES ($1, $2, $3)`,
      [orgId, 'Default Integration', '{}']
    );
    console.log('[Seed] Default chatbot integration seeded.');
  }

  console.log('[Seed] Seeding completed successfully!');
}

main()
  .catch((err) => {
    console.error('[Seed Error] Database seeding failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await closePool();
  });
