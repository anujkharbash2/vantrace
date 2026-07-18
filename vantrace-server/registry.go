package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"
)

type PromoteRequest struct {
	Hash string `json:"hash"`
	Tag  string `json:"tag"`
}

type RegistryEntry struct {
	Tag       string  `json:"tag"`
	Hash      string  `json:"hash"`
	Filename  string  `json:"filename"`
	Size      int64   `json:"size"`
	UpdatedAt float64 `json:"updated_at"`
}

func promoteArtifactHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		project := r.PathValue("project")

		var req PromoteRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		// verify the artifact actually exists before letting it be promoted
		var exists int
		err := db.QueryRow(`SELECT 1 FROM artifacts WHERE hash = ?`, req.Hash).Scan(&exists)
		if err != nil {
			http.Error(w, "artifact not found: "+req.Hash, http.StatusNotFound)
			return
		}

		now := float64(time.Now().UnixNano()) / 1e9
		_, err = db.Exec(`
			INSERT INTO registry_tags (project, tag, hash, updated_at)
			VALUES (?, ?, ?, ?)
			ON CONFLICT(project, tag) DO UPDATE SET hash = excluded.hash, updated_at = excluded.updated_at
		`, project, req.Tag, req.Hash, now)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.WriteHeader(http.StatusOK)
	}
}

func listRegistryHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		project := r.PathValue("project")

		rows, err := db.Query(`
			SELECT rt.tag, rt.hash, a.filename, a.size, rt.updated_at
			FROM registry_tags rt
			JOIN artifacts a ON a.hash = rt.hash
			WHERE rt.project = ?
			ORDER BY rt.tag ASC
		`, project)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		var results []RegistryEntry
		for rows.Next() {
			var e RegistryEntry
			if err := rows.Scan(&e.Tag, &e.Hash, &e.Filename, &e.Size, &e.UpdatedAt); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			results = append(results, e)
		}
		if err := rows.Err(); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		json.NewEncoder(w).Encode(results)
	}
}
