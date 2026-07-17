package main

import (
	"database/sql"
	"path/filepath"

	_ "modernc.org/sqlite"
)

func openDB(path string) (*sql.DB, error) {
	db, err := sql.Open("sqlite", filepath.Clean(path))
	if err != nil {
		return nil, err
	}

	schema := `
	CREATE TABLE IF NOT EXISTS runs (
		id TEXT PRIMARY KEY,
		project TEXT NOT NULL,
		name TEXT,
		config TEXT,
		started_at REAL,
		finished_at REAL
	);
	CREATE TABLE IF NOT EXISTS metrics (
		run_id TEXT,
		step INTEGER,
		key TEXT,
		value REAL,
		timestamp REAL
	);
	CREATE INDEX IF NOT EXISTS idx_metrics_run_id ON metrics(run_id);
	`
	if _, err := db.Exec(schema); err != nil {
		return nil, err
	}
	return db, nil
}
