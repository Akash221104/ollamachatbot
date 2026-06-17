-- Enable the pgvector extension if it's not already enabled (commented out to allow non-superusers to run)
-- CREATE EXTENSION IF NOT EXISTS vector;

-- Create documents table to track source files
CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) NOT NULL UNIQUE,
    full_text TEXT NOT NULL,
    hash VARCHAR(32) NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create embeddings table to store chunk text and their corresponding vector embeddings
CREATE TABLE IF NOT EXISTS embeddings (
    id SERIAL PRIMARY KEY,
    document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    chunk_text TEXT NOT NULL,
    embedding vector(1024), -- standard 1024 dimensions for bge-m3 model
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create an HNSW index on the vector embedding column for fast cosine distance similarity queries
CREATE INDEX IF NOT EXISTS embeddings_vector_cosine_idx ON embeddings USING hnsw (embedding vector_cosine_ops);

-- Create index on document_id to optimize chunk lookups and deletions per document
CREATE INDEX IF NOT EXISTS embeddings_document_idx ON embeddings(document_id);
