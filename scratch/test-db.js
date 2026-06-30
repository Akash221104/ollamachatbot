const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

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
  loadEnvLocal();
  const client = new Client({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  await client.connect();
  
  console.log('--- Organizations ---');
  const orgs = await client.query('SELECT id, name, api_key FROM organizations');
  console.log(orgs.rows);

  console.log('--- Users with External IDs ---');
  const users = await client.query('SELECT id, name, email, external_id, organization_id, is_active FROM users');
  console.log(users.rows);

  console.log('--- User Documents ---');
  const docs = await client.query('SELECT * FROM user_documents');
  console.log(docs.rows);

  await client.end();
}

main().catch(console.error);
