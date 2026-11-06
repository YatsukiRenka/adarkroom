"""Local static files + cloud API: python tools/kotoka/dev-server.py
--uid dev --username Developer --secret-file secret.txt [--logged-out]
[--backend http://127.0.0.1:8080]. Open http://127.0.0.1:8765/.
"""
import argparse
import http.client
import json
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--uid', default='dev')
    parser.add_argument('--username', default='Developer')
    parser.add_argument('--secret-file', required=True)
    parser.add_argument('--backend', default='http://127.0.0.1:8080')
    parser.add_argument('--logged-out', action='store_true')
    args = parser.parse_args()
    secret = Path(args.secret_file).read_text(encoding='utf-8').strip()
    backend = urlsplit(args.backend)
    root = str(Path(__file__).resolve().parents[2])

    class Handler(SimpleHTTPRequestHandler):
        def __init__(self, *a, **kw):
            super().__init__(*a, directory=root, **kw)

        def redirect(self, cookie):
            self.send_response(302)
            self.send_header('Location', '/')
            self.send_header('Set-Cookie', cookie + '; Path=/; HttpOnly; SameSite=Lax')
            self.send_header('Content-Length', '0')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()

        def route(self):
            path = urlsplit(self.path).path
            if path == '/outpost.goauthentik.io/sign_out':
                return self.redirect('dev_login=0')
            if path.startswith('/api/'):
                cookie = SimpleCookie(self.headers.get('Cookie', ''))
                if path == '/api/login':
                    return self.redirect('dev_login=1')
                if (cookie['dev_login'].value != '1' if cookie.get('dev_login') else args.logged_out):
                    data = json.dumps({'error': 'unauthenticated'}).encode()
                    self.send_response(401)
                    self.send_header('Content-Type', 'application/json; charset=utf-8')
                    self.send_header('Cache-Control', 'no-store')
                    self.send_header('Content-Length', str(len(data)))
                    self.end_headers()
                    if self.command != 'HEAD':
                        self.wfile.write(data)
                    return
                headers = {'X-Authentik-Uid': args.uid, 'X-Authentik-Username': args.username,
                           'X-Kotoka-Proxy-Secret': secret}
                body = self.rfile.read(int(self.headers.get('Content-Length', '0')))
                headers['Content-Type'] = self.headers.get('Content-Type', 'application/json')
                connection_type = http.client.HTTPSConnection if backend.scheme == 'https' else http.client.HTTPConnection
                conn = connection_type(backend.hostname, backend.port, timeout=30)
                try:
                    conn.request(self.command, backend.path.rstrip('/') + self.path, body, headers)
                    response = conn.getresponse()
                    data = response.read()
                    self.send_response(response.status)
                    for key in ('Content-Type', 'Cache-Control', 'Location'):
                        if response.getheader(key):
                            self.send_header(key, response.getheader(key))
                    self.send_header('Content-Length', str(len(data)))
                    self.end_headers()
                    if self.command != 'HEAD':
                        self.wfile.write(data)
                finally:
                    conn.close()
                return
            if self.command == 'GET':
                return super().do_GET()
            if self.command == 'HEAD':
                return super().do_HEAD()
            self.send_error(405)

        def __getattr__(self, name):
            if name.startswith('do_'):
                return self.route
            raise AttributeError(name)

        do_GET = route
        do_HEAD = route

    with ThreadingHTTPServer(('127.0.0.1', 8765), Handler) as server:
        server.serve_forever()


if __name__ == '__main__':
    main()
