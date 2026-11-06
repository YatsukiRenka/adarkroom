# Cloud saves

Python 3.12+; no dependencies. Set `ADR_PROXY_SECRET_FILE` to a readable file
containing the shared nginx secret (trimmed; required and nonempty).
`ADR_DB_PATH` defaults to `/data/saves.db` (parent directory must exist),
`ADR_PORT` to 8080, `ADR_KEEP_REVISIONS` to 1, `ADR_MAX_SLOTS` to 19,
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

## Endpoints

Send `X-Kotoka-Profile: modded` or `X-Kotoka-Profile: vanilla` on data requests.
A missing header means `modded`, using existing data unchanged. Each user/profile
has independent auto-save revisions, conflicts, retention, and manual slots (19 by
default). Storage uses the existing tables with `uid` for modded and
`uid + "#vanilla"` for vanilla; no schema change or migration is needed.
On `/api/save`, `/api/saves`, `/api/slots`, and `/api/slots/N`, other header values
(including empty or differently capitalized values) return 400
`{"error":"invalid profile"}` before database access. Authentication is checked
first and still returns 403 on failure. `/api/me`, `/api/login`, and `/healthz`
ignore this header.

- `GET /api/me`: authenticated user; `GET /api/login`: redirect to `/`.
- `GET /healthz`: unauthenticated health check.
- `GET /api/save`: newest auto-save, optional `?revision=N`.
- `PUT /api/save`: `{baseRevision, state}`, with 409 on revision conflict.
- `GET /api/saves`: retained auto-save metadata.
- `GET /api/slots`: occupied slots with `slot`, `updatedAt`, `summary`, `size`, `name`.
- `GET /api/slots/N`: `slot`, `updatedAt`, `summary`, `state`, `name`.
- `PUT /api/slots/N`: `{state, summary, name, create?}`; returns `{slot, updatedAt, name}`.
  Boolean `create` defaults to false. True requires a free slot; occupied slots
  return 409 `{"error":"slot in use"}` without changing the save.
- `PATCH /api/slots/N`: `{name}`; returns `{slot, name}`, preserving state,
  summary and `updatedAt`. Empty slots return 404 `{"error":"empty slot"}`.
- `DELETE /api/slots/N`: returns `{slot, deleted:true}`; empty slots return 404.

Names are required strings, trimmed to 1–40 Unicode code points with no control
characters. Invalid names and non-boolean `create` return 400. Slot numbers outside
1–`ADR_MAX_SLOTS` return 404 `{"error":"no such slot"}`. Startup adds the name
column to older databases; existing unnamed rows return `name: ""`.
All API endpoints require proxy authentication; JSON replies use `Cache-Control: no-store`.
