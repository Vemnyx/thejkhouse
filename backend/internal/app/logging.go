package app

import (
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
)

// InitLogging installs slog.Default() as a tee to stderr and an optional info
// log file (BACKEND_LOG_FILE, default logs/app.log). Returns a close func for
// the file handler.
func InitLogging() func() {
	stderrHandler := slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo})
	fileHandler, closeInfo := openInfoFileHandler()

	root := slog.New(&teeHandler{a: stderrHandler, b: fileHandler})
	slog.SetDefault(root)

	return closeInfo
}

func openInfoFileHandler() (slog.Handler, func()) {
	path := strings.TrimSpace(os.Getenv("BACKEND_LOG_FILE"))
	if path == "" {
		path = "logs/app.log"
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0750); err != nil {
		fmt.Fprintf(os.Stderr, "info log: mkdir %q: %v (file logging disabled)\n", dir, err)
		return slog.DiscardHandler, func() {}
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0640)
	if err != nil {
		fmt.Fprintf(os.Stderr, "info log: open %q: %v (file logging disabled)\n", path, err)
		return slog.DiscardHandler, func() {}
	}
	h := slog.NewTextHandler(f, &slog.HandlerOptions{Level: slog.LevelInfo})
	return h, func() { _ = f.Close() }
}
