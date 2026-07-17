package main

import (
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"time"
)

type ArtifactResponse struct {
	Hash        string `json:"hash"`
	Filename    string `json:"filename"`
	Size        int64  `json:"size"`
	ContentType string `json:"content_type"`
}

func uploadArtifactHandler(db *sql.DB, storage Storage) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		runID := r.PathValue("id")

		err := r.ParseMultipartForm(100 << 20) // 100MB buffer for form parsing
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		file, header, err := r.FormFile("file")
		if err != nil {
			http.Error(w, "missing 'file' field", http.StatusBadRequest)
			return
		}
		defer file.Close()

		role := r.FormValue("role")
		if role == "" {
			role = "output"
		}

		hash, size, err := storage.Put(file)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		contentType := header.Header.Get("Content-Type")
		now := float64(time.Now().UnixNano()) / 1e9

		_, err = db.Exec(
			`INSERT OR IGNORE INTO artifacts (hash, filename, size, content_type, created_at)
			 VALUES (?, ?, ?, ?, ?)`,
			hash, header.Filename, size, contentType, now,
		)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		_, err = db.Exec(
			`INSERT INTO run_artifacts (run_id, hash, role, logged_at) VALUES (?, ?, ?, ?)`,
			runID, hash, role, now,
		)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		json.NewEncoder(w).Encode(ArtifactResponse{
			Hash: hash, Filename: header.Filename, Size: size, ContentType: contentType,
		})
	}
}

func downloadArtifactHandler(storage Storage, db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		hash := r.PathValue("hash")

		var filename, contentType string
		err := db.QueryRow(
			`SELECT filename, content_type FROM artifacts WHERE hash = ?`, hash,
		).Scan(&filename, &contentType)
		if err != nil {
			http.Error(w, "artifact not found", http.StatusNotFound)
			return
		}

		reader, err := storage.Get(hash)
		if err != nil {
			http.Error(w, err.Error(), http.StatusNotFound)
			return
		}
		defer reader.Close()

		w.Header().Set("Content-Type", contentType)
		w.Header().Set("Content-Disposition", "attachment; filename=\""+filename+"\"")
		io.Copy(w, reader)
	}
}

func listRunArtifactsHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		runID := r.PathValue("id")

		rows, err := db.Query(`
			SELECT a.hash, a.filename, a.size, a.content_type, ra.role
			FROM run_artifacts ra
			JOIN artifacts a ON a.hash = ra.hash
			WHERE ra.run_id = ?
			ORDER BY ra.logged_at ASC
		`, runID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		type item struct {
			Hash        string `json:"hash"`
			Filename    string `json:"filename"`
			Size        int64  `json:"size"`
			ContentType string `json:"content_type"`
			Role        string `json:"role"`
		}

		var results []item
		for rows.Next() {
			var i item
			if err := rows.Scan(&i.Hash, &i.Filename, &i.Size, &i.ContentType, &i.Role); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			results = append(results, i)
		}
		json.NewEncoder(w).Encode(results)
	}
}
