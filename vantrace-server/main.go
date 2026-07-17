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

	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	mux.HandleFunc("POST /runs", createRunHandler(db))
	mux.HandleFunc("POST /runs/{id}/metrics", logMetricsHandler(db))
	mux.HandleFunc("POST /runs/{id}/finish", finishRunHandler(db))
	mux.HandleFunc("GET /runs", listRunsHandler(db))

	addr := ":6789"
	log.Printf("vantrace-server starting on %s (db: %s)", addr, dbPath)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatal(err)
	}
}
