package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
)

func main() {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		log.Fatal(err)
	}

	dbDir := filepath.Join(homeDir, ".vantrace")
	if err := os.MkdirAll(dbDir, 0755); err != nil {
		log.Fatal(err)
	}
	dbPath := filepath.Join(dbDir, "server.db")

	db, err := openDB(dbPath)
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	artifactDir := filepath.Join(dbDir, "artifacts")
	storage, err := NewLocalStorage(artifactDir)
	if err != nil {
		log.Fatal(err)
	}

	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	mux.HandleFunc("POST /runs", createRunHandler(db))
	mux.HandleFunc("POST /runs/{id}/metrics", logMetricsHandler(db))
	mux.HandleFunc("POST /runs/{id}/finish", finishRunHandler(db))
	mux.HandleFunc("GET /runs", listRunsHandler(db))
	mux.HandleFunc("GET /runs/{id}/metrics", getRunMetricsHandler(db))
	mux.HandleFunc("POST /runs/{id}/artifacts", uploadArtifactHandler(db, storage))
	mux.HandleFunc("GET /runs/{id}/artifacts", listRunArtifactsHandler(db))
	mux.HandleFunc("GET /artifacts/{hash}", downloadArtifactHandler(storage, db))
	mux.HandleFunc("POST /projects/{project}/registry", promoteArtifactHandler(db))
	mux.HandleFunc("GET /projects/{project}/registry", listRegistryHandler(db))
	mux.HandleFunc("GET /artifacts/{hash}/lineage", artifactLineageHandler(db))

	handler := corsMiddleware(mux)

	addr := ":6789"
	log.Printf("vantrace-server starting on %s (db: %s)", addr, dbPath)
	if err := http.ListenAndServe(addr, handler); err != nil {
		log.Fatal(err)
	}
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}

		next.ServeHTTP(w, r)
	})
}
