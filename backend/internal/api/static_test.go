package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func testSite() http.HandlerFunc {
	return staticHandler(fstest.MapFS{
		"index.html":          {Data: []byte("<!doctype html><title>app</title>")},
		"assets/index-abc.js": {Data: []byte("console.log(1)")},
	})
}

func get(t *testing.T, h http.Handler, path string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	return rec
}

func TestStaticServesAssets(t *testing.T) {
	rec := get(t, testSite(), "/assets/index-abc.js")
	if rec.Code != http.StatusOK || rec.Body.String() != "console.log(1)" {
		t.Fatalf("asset: got %d %q", rec.Code, rec.Body.String())
	}
}

func TestStaticFallsBackToIndex(t *testing.T) {
	for _, path := range []string{"/", "/some/client/route", "/assets/"} {
		rec := get(t, testSite(), path)
		if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "<title>app</title>") {
			t.Errorf("%s: want index.html, got %d %q", path, rec.Code, rec.Body.String())
		}
	}
}

func TestStaticNeverServesHTMLForAPI(t *testing.T) {
	for _, path := range []string{"/api", "/api/", "/api/nope"} {
		if rec := get(t, testSite(), path); rec.Code != http.StatusNotFound {
			t.Errorf("%s: want 404, got %d", path, rec.Code)
		}
	}
}

func TestStaticWithoutBuild(t *testing.T) {
	// A dev checkout embeds only .gitkeep: every page is a 404.
	h := staticHandler(fstest.MapFS{".gitkeep": {}})
	if rec := get(t, h, "/"); rec.Code != http.StatusNotFound {
		t.Fatalf("want 404 without a build, got %d", rec.Code)
	}
}
