-- Migration 0001: Create todos table
CREATE TABLE IF NOT EXISTS todos (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	title TEXT NOT NULL,
	completed BOOLEAN DEFAULT FALSE,
	created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create index for listing
CREATE INDEX IF NOT EXISTS idx_todos_created_at ON todos(created_at DESC);
