package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/Vemnyx/thejkhouse/backend/internal/app"
	"github.com/Vemnyx/thejkhouse/backend/internal/db"
	"github.com/Vemnyx/thejkhouse/backend/log"
)

func listenAddr() string {
	p := strings.TrimSpace(os.Getenv("PORT"))
	if p == "" {
		return ":8080"
	}
	if strings.HasPrefix(p, ":") {
		return p
	}
	return ":" + p
}

func main() {
	closeLog := app.InitLogging()
	defer closeLog()

	ctx := context.Background()

	cfg, err := db.LoadConfig(ctx)
	if err != nil {
		log.Fatal("database config", "error", err)
	}

	if err := db.RunMigrations(ctx, cfg.ConnString); err != nil {
		log.Fatal("database migrate", "error", err)
	}

	pool, err := db.NewPool(ctx, cfg)
	if err != nil {
		log.Fatal("database pool", "error", err)
	}
	defer pool.Close()

	store := openUserStore(pool)
	defer store.close()

	authService, err := newAuthService(ctx)
	if err != nil {
		log.Fatal("firebase auth", "error", err)
	}

	imageUploader, err := newImageUploader(ctx)
	if err != nil {
		log.Fatal("image uploader", "error", err)
	}
	defer imageUploader.close()

	emailClient, err := newEmailClient(ctx)
	if err != nil {
		log.Fatal("email client", "error", err)
	}

	log.Info("database connection established")

	server := &apiServer{
		store:  store,
		auth:   authService,
		images: imageUploader,
		email:  emailClient,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/health", server.handleHealth)
	mux.HandleFunc("/auth/config", server.handleAuthConfig)
	mux.HandleFunc("/auth/login", server.handleAuthLogin)
	mux.HandleFunc("/auth/signup", server.handleAuthSignup)
	mux.HandleFunc("/auth/session", server.handleAuthSession)
	mux.HandleFunc("/emails", server.handleEmails)
	mux.HandleFunc("/images", server.handleImages)
	mux.HandleFunc("/images/", server.handleImageByID)
	mux.HandleFunc("/users/register", server.handleRegister)
	mux.HandleFunc("/users/me", server.handleMe)

	addr := listenAddr()
	srv := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		log.Info("server listening", "addr", addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal("listen", "error", err)
		}
	}()

	sigCtx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	<-sigCtx.Done()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Fatal("shutdown", "error", err)
	}
	log.Info("server stopped")
}
