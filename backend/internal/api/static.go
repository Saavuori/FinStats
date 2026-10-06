package api

import (
	"embed"
	"io/fs"
	"net/http"
	"path"
	"strings"
)

// The production image builds the Vite frontend into this directory (see
// Dockerfile). In a plain checkout it holds only .gitkeep, so `go build` still
// works locally — the backend then just serves the API, which is what the Vite
// dev server expects anyway.
//
//go:embed all:dist
var distFS embed.FS

// ServeStatic serves the embedded frontend build, falling back to index.html so
// a direct hit on any non-asset path still loads the app rather than 404ing.
// A missing *file* — anything with an extension — is a plain 404: answering a
// script request with index.html is how a missing MapLibre worker surfaced as
// a baffling MIME-type error instead of a 404.
var ServeStatic = staticHandler(mustSub(distFS, "dist"))

func mustSub(fsys fs.FS, dir string) fs.FS {
	sub, err := fs.Sub(fsys, dir)
	if err != nil {
		panic(err) // only fails for an invalid path literal
	}
	return sub
}

func staticHandler(site fs.FS) http.HandlerFunc {
	files := http.FileServer(http.FS(site))
	return func(w http.ResponseWriter, r *http.Request) {
		// Unknown /api/* paths must never fall through to index.html — an API
		// client asking for a route that doesn't exist deserves a 404, not HTML.
		if r.URL.Path == "/api" || strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}

		upath := strings.TrimPrefix(r.URL.Path, "/")
		if upath == "" {
			upath = "index.html"
		}
		if _, err := fs.Stat(site, upath); err != nil {
			if path.Ext(upath) != "" {
				http.NotFound(w, r)
				return
			}
			if _, err := fs.Stat(site, "index.html"); err != nil {
				http.NotFound(w, r)
				return
			}
			r = r.Clone(r.Context())
			r.URL.Path = "/"
		}

		files.ServeHTTP(w, r)
	}
}
