package main

import (
	"log"
	"net/http"
	"os"

	"finstats/internal/api"
)

// finstats is a client-side app: the browser talks to Statistics Finland's
// PxWeb and WFS services directly (both send CORS headers). This backend has
// exactly one job — serve the embedded Vite build as a single, self-contained
// binary that fits the sibling apps' Podman/Caddy deployment on the Oracle
// host — plus two tiny endpoints for the version badge and health checks.
func main() {
	log.Println("Starting finstats backend...")

	mux := http.NewServeMux()
	mux.HandleFunc("/api/version", api.HandleGetVersion)
	mux.HandleFunc("/api/health", api.HandleHealth)

	// Embedded frontend build (production image only — empty in a dev checkout,
	// where Vite serves the frontend and proxies /api here instead).
	mux.HandleFunc("/", api.ServeStatic)

	// Default to :8081, which the frontend dev proxy targets; PORT overrides it
	// in the container.
	addr := ":8081"
	if p := os.Getenv("PORT"); p != "" {
		addr = ":" + p
	}
	log.Printf("Server listening on %s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}
