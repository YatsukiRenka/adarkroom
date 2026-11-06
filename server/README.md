# Cloud saves

Python 3.12+; no dependencies. Set `ADR_PROXY_SECRET_FILE` to a readable file
containing the shared nginx secret (trimmed; required and nonempty).
`ADR_DB_PATH` defaults to `/data/saves.db` (parent directory must exist),
`ADR_PORT` to 8080, `ADR_KEEP_REVISIONS` to 1, `ADR_MAX_SLOTS` to 20,
and `ADR_MAX_BODY` to 2097152 bytes. Retention, slot count, and body limit
must be at least 1. Auto-save retains the newest configured number of revisions.
Manual slots are independent of auto-save, numbered 1 through `ADR_MAX_SLOTS`;
each summary must be a JSON object of at most 1024 bytes in compact UTF-8 form.

Run `python server/app.py`; it binds to `0.0.0.0`. Only expose it through the
trusted proxy. Mount a writable `/data` and readable secret file for Docker.
Build with `docker build -t adr-saves server`.

Test: `cd server && python -m unittest`.

Back up a live database using SQLite's backup command, not a raw file copy:
`sqlite3 /data/saves.db ".backup '/backups/saves.db'"`.
This includes committed WAL data in the resulting standalone SQLite file.
