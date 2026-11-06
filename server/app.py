"""Small authenticated cloud-save HTTP service."""
import hmac
import json
import os
import sqlite3
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
    keep = int(os.environ.get('ADR_KEEP_REVISIONS', '50'))
    max_body = int(os.environ.get('ADR_MAX_BODY', str(2 * 1024 * 1024)))
    if keep < 1 or max_body < 1:
        raise ValueError('Retention and body limit must be positive')
    with sqlite3.connect(db_path) as db:
        db.execute('PRAGMA journal_mode=WAL')
        db.execute('CREATE TABLE IF NOT EXISTS saves (uid TEXT, revision INTEGER, '
                   'updated_at TEXT, username TEXT, state TEXT, PRIMARY KEY(uid, revision))')

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

        def put_save(self, db, uid, username):
            try:
                length = int(self.headers.get('Content-Length', '-1'))
                if length > max_body:
                    return self.reply(413, {'error': 'body too large'})
                if length < 0 or self.headers.get('Transfer-Encoding'):
                    raise ValueError()
                body = json.loads(self.rfile.read(length), parse_constant=reject_constant)
                if not isinstance(body, dict) or 'baseRevision' not in body:
                    raise ValueError()
                base, state = body['baseRevision'], body.get('state')
                if base is not None and (type(base) is not int or base < 1):
                    raise ValueError()
                if not isinstance(state, str) or not isinstance(json.loads(state, parse_constant=reject_constant), dict):
                    raise ValueError()
                state.encode('utf-8')
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
