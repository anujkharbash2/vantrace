package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"time"

	"github.com/google/uuid"
)

type CreateRunRequest struct {
	Project string          `json:"project"`
	Name    string          `json:"name"`
	Config  json.RawMessage `json:"config"`
}

type CreateRunResponse struct {
	ID string `json:"id"`
}

type MetricPoint struct {
	Step  int     `json:"step"`
	Key   string  `json:"key"`
	Value float64 `json:"value"`
}

type LogMetricsRequest struct {
	Metrics []MetricPoint `json:"metrics"`
}

func createRunHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req CreateRunRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		id := uuid.NewString()[:8]
		_, err := db.Exec(
			`INSERT INTO runs (id, project, name, config, started_at) VALUES (?, ?, ?, ?, ?)`,
			id, req.Project, req.Name, string(req.Config), float64(time.Now().UnixNano())/1e9,
		)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		json.NewEncoder(w).Encode(CreateRunResponse{ID: id})
	}
}

func logMetricsHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		runID := r.PathValue("id")

		var req LogMetricsRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		tx, err := db.Begin()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		now := float64(time.Now().UnixNano()) / 1e9
		stmt, err := tx.Prepare(`INSERT INTO metrics (run_id, step, key, value, timestamp) VALUES (?, ?, ?, ?, ?)`)
		if err != nil {
			tx.Rollback()
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer stmt.Close()

		for _, m := range req.Metrics {
			if _, err := stmt.Exec(runID, m.Step, m.Key, m.Value, now); err != nil {
				tx.Rollback()
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
		}
		tx.Commit()
		w.WriteHeader(http.StatusOK)
	}
}

func finishRunHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		runID := r.PathValue("id")
		_, err := db.Exec(`UPDATE runs SET finished_at = ? WHERE id = ?`, float64(time.Now().UnixNano())/1e9, runID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
	}
}

func listRunsHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := db.Query(`SELECT id, project, name, started_at, finished_at FROM runs ORDER BY started_at DESC`)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		type runSummary struct {
			ID         string   `json:"id"`
			Project    string   `json:"project"`
			Name       string   `json:"name"`
			StartedAt  float64  `json:"started_at"`
			FinishedAt *float64 `json:"finished_at"`
		}

		var results []runSummary
		for rows.Next() {
			var rs runSummary
			if err := rows.Scan(&rs.ID, &rs.Project, &rs.Name, &rs.StartedAt, &rs.FinishedAt); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			results = append(results, rs)
		}
		json.NewEncoder(w).Encode(results)
	}
}

func getRunMetricsHandler(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		runID := r.PathValue("id")

		rows, err := db.Query(
			`SELECT step, key, value FROM metrics WHERE run_id = ? ORDER BY step ASC`,
			runID,
		)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		type point struct {
			Step  int     `json:"step"`
			Key   string  `json:"key"`
			Value float64 `json:"value"`
		}

		var results []point
		for rows.Next() {
			var p point
			if err := rows.Scan(&p.Step, &p.Key, &p.Value); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			results = append(results, p)
		}
		json.NewEncoder(w).Encode(results)
	}
}
