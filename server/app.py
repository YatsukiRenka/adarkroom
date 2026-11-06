"""Small authenticated cloud-save HTTP service."""
import hmac
import json
import os
import sqlite3
import unicodedata
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlsplit


def reject_constant(value):
    raise ValueError("Invalid JSON constant")


def create_server(host='0.0.0.0', port=None):
    secret_path = os.environ.get('ADR_PROXY_SECRET_FILE')
    if not secret_path:
        raise ValueError('ADR_PROXY_SECRET_FILE is required')
    secret = Path(secret_path).read_text(encoding='utf-8').strip()
    if not secret:
        raise ValueError('Proxy secret must not be empty')
    db_path = os.environ.get('ADR_DB_PATH', '/data/saves.db')
    keep = int(os.environ.get('ADR_KEEP_REVISIONS', '1'))
    max_slots = int(os.environ.get('ADR_MAX_SLOTS', '19'))
    max_body = int(os.environ.get('ADR_MAX_BODY', str(2 * 1024 * 1024)))
    if keep < 1 or max_body < 1 or max_slots < 1:
        raise ValueError('Retention and body limit must be positive')
    with sqlite3.connect(db_path) as db:
        db.execute('PRAGMA journal_mode=WAL')
        db.execute('CREATE TABLE IF NOT EXISTS saves (uid TEXT, revision INTEGER, '
                   'updated_at TEXT, username TEXT, state TEXT, PRIMARY KEY(uid, revision))')
        db.execute('CREATE TABLE IF NOT EXISTS slots (uid TEXT, slot INTEGER, '
                   'updated_at TEXT, username TEXT, summary TEXT, state TEXT, PRIMARY KEY(uid, slot))')
        if 'name' not in {row[1] for row in db.execute('PRAGMA table_info(slots)')}:
            db.execute('ALTER TABLE slots ADD COLUMN name TEXT')

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def reply(self, status, data, location=None):
            payload = json.dumps(data, ensure_ascii=False).encode('utf-8')
            self.send_response(status)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(payload)))
            if location:
                self.send_header('Location', location)
            self.end_headers()
            if self.command != 'HEAD':
                self.wfile.write(payload)
            print(json.dumps({'method': self.command, 'path': urlsplit(self.path).path,
                              'status': status, 'uid': self.headers.get('X-Authentik-Uid', '')[:8]}), flush=True)

        def dispatch(self):
            url = urlsplit(self.path)
            if self.command == 'GET' and url.path == '/healthz':
                return self.reply(200, 'ok')
            uid = self.headers.get('X-Authentik-Uid', '')
            supplied = self.headers.get('X-Kotoka-Proxy-Secret', '')
            if not uid or not hmac.compare_digest(supplied.encode(), secret.encode()):
                return self.reply(403, {'error': 'forbidden'})
            methods = {'/api/me': ('GET',), '/api/save': ('GET', 'PUT'),
                       '/api/saves': ('GET',), '/api/login': ('GET',), '/healthz': ('GET',)}
            slot = None
            if url.path == '/api/slots':
                methods[url.path] = ('GET',)
            elif url.path.startswith('/api/slots/'):
                number = url.path[len('/api/slots/'):]
                if not number.isascii() or not number.isdigit() or len(number) > 18:
                    return self.reply(404, {'error': 'no such slot'})
                slot = int(number)
                if not 1 <= slot <= max_slots:
                    return self.reply(404, {'error': 'no such slot'})
                methods[url.path] = ('GET', 'PUT', 'DELETE', 'PATCH')
            if url.path not in methods:
                return self.reply(404, {'error': 'not found'})
            if self.command not in methods[url.path]:
                return self.reply(405, {'error': 'method not allowed'})
            username = self.headers.get('X-Authentik-Username', '')
            if url.path == '/api/me':
                return self.reply(200, {'uid': uid, 'username': username})
            if url.path == '/api/login':
                return self.reply(302, {}, '/')
            db = sqlite3.connect(db_path, timeout=30)
            try:
                if url.path == '/api/slots':
                    rows = db.execute('SELECT slot, updated_at, summary, state, name FROM slots WHERE uid=? ORDER BY slot', (uid,))
                    return self.reply(200, {'slots': [dict(slot=n, updatedAt=t, summary=json.loads(s), size=len(state.encode('utf-8')), name=name or '') for n, t, s, state, name in rows]})
                if slot is not None:
                    return self.handle_slot(db, uid, username, slot)
                if self.command == 'PUT':
                    return self.put_save(db, uid, username)
                if url.path == '/api/saves':
                    rows = db.execute('SELECT revision, updated_at, state FROM saves WHERE uid=? ORDER BY revision DESC', (uid,))
                    return self.reply(200, {'saves': [dict(revision=r, updatedAt=t, size=len(s.encode('utf-8'))) for r, t, s in rows]})
                query = parse_qs(url.query, keep_blank_values=True)
                args = [uid]
                sql = 'SELECT revision, updated_at, state FROM saves WHERE uid=?'
                if 'revision' in query:
                    values = query['revision']
                    if len(values) != 1 or not values[0].isascii() or not values[0].isdigit() or len(values[0]) > 18:
                        return self.reply(400, {'error': 'invalid revision'})
                    args.append(int(values[0]))
                    sql += ' AND revision=?'
                row = db.execute(sql + ' ORDER BY revision DESC LIMIT 1', args).fetchone()
                if not row:
                    return self.reply(404, {'error': 'no save'})
                return self.reply(200, dict(revision=row[0], updatedAt=row[1], state=row[2]))
            finally:
                db.close()

        def read_body(self, require_state=True):
            length = int(self.headers.get('Content-Length', '-1'))
            if length > max_body:
                self.reply(413, {'error': 'body too large'})
                return None
            if length < 0 or self.headers.get('Transfer-Encoding'):
                raise ValueError()
            body = json.loads(self.rfile.read(length), parse_constant=reject_constant)
            if not isinstance(body, dict):
                raise ValueError()
            if require_state:
                state = body.get('state')
                if not isinstance(state, str) or not isinstance(json.loads(state, parse_constant=reject_constant), dict):
                    raise ValueError()
                state.encode('utf-8')
            return body

        def read_name(self, body):
            name = body.get('name')
            if not isinstance(name, str) or any(unicodedata.category(c) == 'Cc' for c in name):
                raise ValueError()
            name = name.strip()
            if not 1 <= len(name) <= 40:
                raise ValueError()
            name.encode('utf-8')
            return name

        def handle_slot(self, db, uid, username, slot):
            if self.command == 'PATCH':
                try:
                    body = self.read_body(require_state=False)
                    if body is None:
                        return
                    name = self.read_name(body)
                except (ValueError, UnicodeError, RecursionError):
                    return self.reply(400, {'error': 'invalid body'})
                with db:
                    db.execute('BEGIN IMMEDIATE')
                    changed = db.execute('UPDATE slots SET name=? WHERE uid=? AND slot=?', (name, uid, slot)).rowcount
                if not changed:
                    return self.reply(404, {'error': 'empty slot'})
                return self.reply(200, dict(slot=slot, name=name))
            if self.command == 'PUT':
                try:
                    body = self.read_body()
                    if body is None:
                        return
                    name = self.read_name(body)
                    if not isinstance(body.get('create', False), bool):
                        raise ValueError()
                    if not isinstance(body.get('summary'), dict):
                        raise ValueError()
                    summary = json.dumps(body['summary'], ensure_ascii=False, separators=(',', ':'))
                    if len(summary.encode('utf-8')) > 1024:
                        raise ValueError()
                except (ValueError, UnicodeError, RecursionError):
                    return self.reply(400, {'error': 'invalid body'})
                with db:
                    db.execute('BEGIN IMMEDIATE')
                    if body.get('create', False) and db.execute('SELECT 1 FROM slots WHERE uid=? AND slot=?', (uid, slot)).fetchone():
                        return self.reply(409, {'error': 'slot in use'})
                    updated = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
                    db.execute('INSERT OR REPLACE INTO slots (uid, slot, updated_at, username, summary, state, name) VALUES (?, ?, ?, ?, ?, ?, ?)',
                               (uid, slot, updated, username, summary, body['state'], name))
                return self.reply(200, dict(slot=slot, updatedAt=updated, name=name))
            if self.command == 'DELETE':
                with db:
                    db.execute('BEGIN IMMEDIATE')
                    deleted = db.execute('DELETE FROM slots WHERE uid=? AND slot=?', (uid, slot)).rowcount
                if not deleted:
                    return self.reply(404, {'error': 'empty slot'})
                return self.reply(200, dict(slot=slot, deleted=True))
            row = db.execute('SELECT updated_at, summary, state, name FROM slots WHERE uid=? AND slot=?', (uid, slot)).fetchone()
            if not row:
                return self.reply(404, {'error': 'empty slot'})
            return self.reply(200, dict(slot=slot, updatedAt=row[0], summary=json.loads(row[1]), state=row[2], name=row[3] or ''))

        def put_save(self, db, uid, username):
            try:
                body = self.read_body()
                if body is None:
                    return
                if 'baseRevision' not in body:
                    raise ValueError()
                base, state = body['baseRevision'], body.get('state')
                if base is not None and (type(base) is not int or base < 1):
                    raise ValueError()
            except (ValueError, UnicodeError, RecursionError):
                return self.reply(400, {'error': 'invalid body'})
            with db:
                db.execute('BEGIN IMMEDIATE')
                current = db.execute('SELECT revision, updated_at, state FROM saves WHERE uid=? ORDER BY revision DESC LIMIT 1', (uid,)).fetchone()
                if base != (current[0] if current else None):
                    return self.reply(409, dict(error='conflict', revision=current[0] if current else None, updatedAt=current[1] if current else None))
                if current and state == current[2]:
                    revision, updated = current[:2]
                else:
                    revision = current[0] + 1 if current else 1
                    updated = datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z')
                    db.execute('INSERT INTO saves VALUES (?, ?, ?, ?, ?)', (uid, revision, updated, username, state))
                    db.execute('DELETE FROM saves WHERE uid=? AND revision<=?', (uid, revision - keep))
            return self.reply(200, dict(revision=revision, updatedAt=updated))

        def __getattr__(self, name):
            if name.startswith('do_'):
                return self.dispatch
            raise AttributeError(name)

    return ThreadingHTTPServer((host, int(os.environ.get('ADR_PORT', '8080')) if port is None else port), Handler)


if __name__ == '__main__':
    with create_server() as server:
        server.serve_forever()
