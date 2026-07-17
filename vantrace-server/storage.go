package main

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
)

// Storage is the interface any artifact backend must implement.
// Local disk is the only implementation for now; S3-compatible
// backends can be added later without changing callers.
type Storage interface {
	// Put stores content from r, returns its content hash and size.
	Put(r io.Reader) (hash string, size int64, err error)
	// Get returns a reader for the content with the given hash.
	Get(hash string) (io.ReadCloser, error)
	// Exists checks if content with the given hash is already stored.
	Exists(hash string) bool
}

type LocalStorage struct {
	baseDir string
}

func NewLocalStorage(baseDir string) (*LocalStorage, error) {
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return nil, err
	}
	return &LocalStorage{baseDir: baseDir}, nil
}

// pathFor mirrors git's object layout: first 2 chars as a subdir,
// so one directory never ends up with thousands of files in it.
func (s *LocalStorage) pathFor(hash string) string {
	return filepath.Join(s.baseDir, hash[:2], hash[2:])
}

func (s *LocalStorage) Put(r io.Reader) (string, int64, error) {
	tmp, err := os.CreateTemp(s.baseDir, "upload-*")
	if err != nil {
		return "", 0, err
	}
	defer os.Remove(tmp.Name())
	defer tmp.Close()

	hasher := sha256.New()
	written, err := io.Copy(io.MultiWriter(tmp, hasher), r)
	if err != nil {
		return "", 0, err
	}

	hash := hex.EncodeToString(hasher.Sum(nil))
	finalPath := s.pathFor(hash)

	if err := os.MkdirAll(filepath.Dir(finalPath), 0755); err != nil {
		return "", 0, err
	}

	// dedup: if content already exists, discard the temp file
	if _, err := os.Stat(finalPath); err == nil {
		return hash, written, nil
	}

	tmp.Close()
	if err := os.Rename(tmp.Name(), finalPath); err != nil {
		return "", 0, err
	}
	return hash, written, nil
}

func (s *LocalStorage) Get(hash string) (io.ReadCloser, error) {
	path := s.pathFor(hash)
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("artifact not found: %s", hash)
	}
	return f, nil
}

func (s *LocalStorage) Exists(hash string) bool {
	_, err := os.Stat(s.pathFor(hash))
	return err == nil
}
