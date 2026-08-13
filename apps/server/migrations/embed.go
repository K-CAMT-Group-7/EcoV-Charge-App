package migrations

import "embed"

// Files contains the ordered PostgreSQL schema migrations.
//
//go:embed *.sql
var Files embed.FS
