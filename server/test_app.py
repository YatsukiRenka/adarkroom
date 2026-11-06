import concurrent.futures
import http.client
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch

from app import create_server


class APITest(unittest.TestCase):
    def setUp(self):
        self.temp_path = tempfile.mkdtemp()
        secret = Path(self.temp_path) / 'secret'
        secret.write_text(' secret \n')
        self.env = patch.dict(os.environ, ADR_DB_PATH=str(Path(self.temp_path) / 'db'),
                              ADR_PROXY_SECRET_FILE=str(secret), ADR_KEEP_REVISIONS='3', ADR_MAX_BODY='512')
        self.env.start()
        self.server = create_server('127.0.0.1', 0)
        self.thread = threading.Thread(target=self.server.serve_forever)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.env.stop()
        # Retain temporary artifacts: repository policy requires recycle-bin deletion.

    def request(self, method='GET', path='/api/save', body=None, headers=None):
        conn = http.client.HTTPConnection('127.0.0.1', self.server.server_port)
        auth = {'X-Kotoka-Proxy-Secret': 'secret', 'X-Authentik-Uid': 'alice', 'X-Authentik-Username': 'Alice'}
        if headers is not None:
            auth = headers
        conn.request(method, path, body, auth)
        response = conn.getresponse()
        status, location = response.status, response.getheader('Location')
        self.assertEqual(response.getheader('Cache-Control'), 'no-store')
        self.assertEqual(response.getheader('Content-Type'), 'application/json; charset=utf-8')
        data = json.loads(response.read())
        conn.close()
        return status, data, location

    def put(self, base, state='{}', headers=None):
        return self.request('PUT', body=json.dumps(dict(baseRevision=base, state=state)), headers=headers)

    def test_auth_routes(self):
        for headers in ({}, {'X-Authentik-Uid': 'alice'}, {'X-Kotoka-Proxy-Secret': 'wrong', 'X-Authentik-Uid': 'alice'}, {'X-Kotoka-Proxy-Secret': 'secret'}):
            self.assertEqual(self.request(headers=headers)[:2], (403, {'error': 'forbidden'}))
        self.assertEqual(self.request(path='/api/me')[1], {'uid': 'alice', 'username': 'Alice'})
        self.assertEqual(self.request(path='/api/login')[::2], (302, '/'))
        self.assertEqual(self.request(path='/healthz', headers={})[:2], (200, 'ok'))
        self.assertEqual(self.request(path='/unknown')[0], 404)
        for method in ('POST', 'DELETE', 'PATCH', 'BOGUS'):
            self.assertEqual(self.request(method)[0], 405)

    def test_history(self):
        self.assertEqual(self.request()[0], 404)
        first = self.put(None)
        self.assertEqual(first[0], 200)
        self.assertEqual(first[1]['revision'], 1)
        self.assertTrue(first[1]['updatedAt'].endswith('Z'))
        self.assertEqual(self.put(1)[1], first[1])
        self.assertEqual(self.put(None)[1], dict(error='conflict', **first[1]))
        self.put(1, '{"x":2}')
        self.assertEqual(self.request(path='/api/save?revision=1')[1]['state'], '{}')
        for base in (2, 3, 4):
            self.assertEqual(self.put(base, json.dumps({'x': base + 1}))[0], 200)
        self.assertEqual([x['revision'] for x in self.request(path='/api/saves')[1]['saves']], [5, 4, 3])
        self.assertEqual(self.request(path='/api/save?revision=1')[0], 404)
        self.assertEqual(self.request(path='/api/save?revision=999')[0], 404)
        bob = {'X-Kotoka-Proxy-Secret': 'secret', 'X-Authentik-Uid': 'bob'}
        self.assertEqual(self.request(headers=bob)[0], 404)
        self.assertEqual(self.put(None, headers=bob)[1]['revision'], 1)
        self.assertEqual(self.request()[1]["revision"], 5)
    def test_invalid(self):
        for body in ('garbage', 'null', '[]', '{}', '{"baseRevision":null}', '{"baseRevision":true,"state":"{}"}'):
            self.assertEqual(self.request('PUT', body=body)[0], 400)
        for state in ('[]', 'null', '1', 'bad', '{"x":NaN}', 1, {}):
            self.assertEqual(self.put(None, state)[0], 400)
        self.assertEqual(self.request('PUT', body='x' * 513)[0], 413)
        for revision in ('abc', '-1', '', '1&revision=2'):
            self.assertEqual(self.request(path='/api/save?revision=' + revision)[0], 400)

    def test_concurrent(self):
        self.put(None)
        barrier = threading.Barrier(2)
        def write(i):
            barrier.wait()
            return self.put(1, json.dumps({'x': i}))[0]
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            self.assertEqual(sorted(pool.map(write, (1, 2))), [200, 409])

    def test_secret_required(self):
        for value in ('', str(Path(self.temp_path) / 'missing')):
            with patch.dict(os.environ, ADR_PROXY_SECRET_FILE=value):
                with self.assertRaises((ValueError, FileNotFoundError)):
                    create_server('127.0.0.1', 0)
        Path(os.environ['ADR_PROXY_SECRET_FILE']).write_text(' \n')
        with self.assertRaises(ValueError):
            create_server('127.0.0.1', 0)


if __name__ == '__main__':
    unittest.main()
