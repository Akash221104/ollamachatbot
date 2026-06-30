-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS vector;

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'USER')) DEFAULT 'USER',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create documents table
CREATE TABLE IF NOT EXISTS documents (
  id SERIAL PRIMARY KEY,
  filename TEXT UNIQUE NOT NULL,
  file_path TEXT NOT NULL,
  file_hash TEXT UNIQUE,
  status TEXT DEFAULT 'ACTIVE',
  embedding_status TEXT DEFAULT 'PENDING' CHECK (embedding_status IN ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')),
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create user_documents assignment mapping table
CREATE TABLE IF NOT EXISTS user_documents (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (user_id, document_id)
);

-- Create embeddings table (1024-dim vectors for bge-m3)
CREATE TABLE IF NOT EXISTS embeddings (
  id SERIAL PRIMARY KEY,
  document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INTEGER,
  chunk_text TEXT,
  embedding VECTOR(1024),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create chatbot_settings table
CREATE TABLE IF NOT EXISTS chatbot_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT DEFAULT 'AI Assistant',
  description TEXT,
  system_prompt TEXT DEFAULT 'You are an enterprise AI assistant. Answer only using the provided context. If information is unavailable, clearly state that the answer is not available.',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for vector similarity and chunk lookups
CREATE INDEX IF NOT EXISTS embeddings_vector_cosine_idx ON embeddings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX IF NOT EXISTS embeddings_document_idx ON embeddings(document_id);
CREATE INDEX IF NOT EXISTS user_documents_user_idx ON user_documents(user_id);

-- Phase 2 Tables --

-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  api_key TEXT UNIQUE NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Chatbot Integrations table
CREATE TABLE IF NOT EXISTS chatbot_integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  allowed_origins TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- External Users table
CREATE TABLE IF NOT EXISTS external_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  external_user_id TEXT NOT NULL,
  name TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (organization_id, external_user_id)
);

-- External User Documents table
CREATE TABLE IF NOT EXISTS external_user_documents (
  external_user_id UUID REFERENCES external_users(id) ON DELETE CASCADE,
  document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
  assigned_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (external_user_id, document_id)
);


