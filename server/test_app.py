import concurrent.futures
import http.client
import json
import sqlite3
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
                              ADR_PROXY_SECRET_FILE=str(secret), ADR_KEEP_REVISIONS='1', ADR_MAX_BODY='4096')
        self.env.start()
        os.environ.pop('ADR_MAX_SLOTS', None)
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
        self.assertEqual(self.request(path='/api/save?revision=1')[0], 404)
        for base in (2, 3, 4):
            self.assertEqual(self.put(base, json.dumps({'x': base + 1}))[0], 200)
        self.assertEqual([x['revision'] for x in self.request(path='/api/saves')[1]['saves']], [5])
        self.assertEqual(self.request(path='/api/save?revision=1')[0], 404)
        self.assertEqual(self.request(path='/api/save?revision=999')[0], 404)
        bob = {'X-Kotoka-Proxy-Secret': 'secret', 'X-Authentik-Uid': 'bob'}
        self.assertEqual(self.request(headers=bob)[0], 404)
        self.assertEqual(self.put(None, headers=bob)[1]['revision'], 1)
        self.assertEqual(self.request()[1]["revision"], 5)
    def test_older_days_pruned(self):
        with sqlite3.connect(os.environ['ADR_DB_PATH']) as db:
            for revision, day in ((1, '2026-01-01T10:00:00Z'), (2, '2026-01-01T11:00:00Z'),
                                  (3, '2026-01-02T09:00:00Z'), (4, '2026-01-02T09:30:00Z')):
                db.execute('INSERT INTO saves VALUES (?, ?, ?, ?, ?)', ('alice', revision, day, 'Alice', '{"r":%d}' % revision))
        for base in (4, 5, 6, 7):
            self.assertEqual(self.put(base, json.dumps({'r': base + 1}))[0], 200)
        self.assertEqual([x['revision'] for x in self.request(path='/api/saves')[1]['saves']], [8])

    def test_invalid(self):
        for body in ('garbage', 'null', '[]', '{}', '{"baseRevision":null}', '{"baseRevision":true,"state":"{}"}'):
            self.assertEqual(self.request('PUT', body=body)[0], 400)
        for state in ('[]', 'null', '1', 'bad', '{"x":NaN}', 1, {}):
            self.assertEqual(self.put(None, state)[0], 400)
        self.assertEqual(self.request('PUT', body='x' * 4097)[0], 413)
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

    def put_slot(self, slot=1, state='{}', summary=None, headers=None, name='Save', **extra):
        return self.request('PUT', '/api/slots/' + str(slot),
                            json.dumps(dict(state=state, summary={} if summary is None else summary, name=name, **extra)), headers)

    def test_slots(self):
        self.assertEqual(self.request(path='/api/slots')[1], {'slots': []})
        first = self.put_slot()
        self.assertEqual(first[0], 200)
        self.assertEqual(first[1]['slot'], 1)
        self.assertTrue(first[1]['updatedAt'].endswith('Z'))
        state, summary = '{"wood":"木"}', {'wood': 123}
        second = self.put_slot(state=state, summary=summary, name='New')
        self.assertEqual(second[0], 200)
        self.assertGreater(second[1]['updatedAt'], first[1]['updatedAt'])
        self.assertEqual(self.request(path='/api/slots/1')[1], dict(second[1], state=state, summary=summary))
        self.put_slot(19)
        self.put_slot(3)
        slots = self.request(path='/api/slots')[1]['slots']
        self.assertEqual([s['slot'] for s in slots], [1, 3, 19])
        self.assertEqual(slots[0], dict(second[1], size=len(state.encode('utf-8')), summary=summary))
        self.assertEqual(self.request('DELETE', '/api/slots/1')[:2], (200, {'slot': 1, 'deleted': True}))
        for method in ('GET', 'DELETE'):
            self.assertEqual(self.request(method, '/api/slots/1')[:2], (404, {'error': 'empty slot'}))

    def test_slots_invalid(self):
        for slot in ('0', '20', 'abc', '1.5', '01x'):
            for method in ('GET', 'PUT', 'DELETE'):
                self.assertEqual(self.request(method, '/api/slots/' + slot)[:2], (404, {'error': 'no such slot'}))
        for summary in ({'x': '木' * 342}, [], 'text', 1):
            self.assertEqual(self.put_slot(summary=summary)[0], 400)
        for state in ('[]', 'null', '1', 'bad', '{"x":NaN}', 1, {}):
            self.assertEqual(self.put_slot(state=state)[0], 400)
        for body in ('bad', 'null', '[]', '{}', '{"state":"{}"}', '{"state":"{}","summary":null}'):
            self.assertEqual(self.request('PUT', '/api/slots/1', body)[0], 400)
        self.assertEqual(self.request('PUT', '/api/slots/1', 'x' * 4097)[0], 413)
        for path, methods in (('/api/slots', ('PUT', 'DELETE', 'POST', 'PATCH')),
                              ('/api/slots/1', ('POST', 'BOGUS'))):
            for method in methods:
                self.assertEqual(self.request(method, path)[0], 405)

    def test_slots_isolation_auth(self):
        bob = {'X-Kotoka-Proxy-Secret': 'secret', 'X-Authentik-Uid': 'bob'}
        self.put_slot(state='{"alice":1}')
        self.assertEqual(self.request(path='/api/slots', headers=bob)[1], {'slots': []})
        for method in ('GET', 'DELETE'):
            self.assertEqual(self.request(method, '/api/slots/1', headers=bob)[0], 404)
        self.put_slot(headers=bob)
        self.assertEqual(self.request(path='/api/slots/1')[1]['state'], '{"alice":1}')
        before = self.request(path='/api/slots')[1]
        self.assertEqual(self.request()[0], 404)
        self.put(None)
        self.put(1, '{"auto":2}')
        self.assertEqual(self.request(path='/api/slots')[1], before)
        auto = self.request()[1]
        self.put_slot()
        self.request('DELETE', '/api/slots/1')
        self.assertEqual(self.request()[1], auto)
        for path in ('/api/slots', '/api/slots/1'):
            for method in ('GET', 'PUT', 'DELETE'):
                for headers in ({}, {'X-Authentik-Uid': 'alice'}, {'X-Kotoka-Proxy-Secret': 'wrong', 'X-Authentik-Uid': 'alice'}):
                    self.assertEqual(self.request(method, path, headers=headers)[0], 403)

    def test_names_and_rename(self):
        for name in ('', '   ', 'x' * 41, 'a\x00b', 'a\nb', 'a\x7fb', 'a\x85b', None, 1, True, [], {}):
            for method in ('PUT', 'PATCH'):
                self.assertEqual(self.request(method, '/api/slots/1', json.dumps(dict(state='{}', summary={}, name=name)))[0], 400)
        for method in ('PUT', 'PATCH'):
            self.assertEqual(self.request(method, '/api/slots/1', '{"state":"{}","summary":{}}')[0], 400)
        for name in ('木' * 40, '  valid name　', '😀' * 40):
            result = self.put_slot(name=name)
            self.assertEqual(result[0], 200)
            self.assertEqual(result[1]['name'], name.strip())
            self.assertEqual(self.request(path='/api/slots/1')[1]['name'], name.strip())
            self.assertEqual(self.request(path='/api/slots')[1]['slots'][0]['name'], name.strip())
        before = self.request(path='/api/slots/1')[1]
        self.assertEqual(self.request('PATCH', '/api/slots/1', '{"name":" Renamed "}')[:2], (200, {'slot': 1, 'name': 'Renamed'}))
        self.assertEqual(self.request(path='/api/slots/1')[1], dict(before, name='Renamed'))
        self.assertEqual(self.request('PATCH', '/api/slots/2', '{"name":"New"}')[:2], (404, {'error': 'empty slot'}))
        self.assertEqual(self.request('PATCH', '/api/slots/1', 'x' * 4097)[0], 413)

    def test_create(self):
        self.assertEqual(self.put_slot(create=True)[0], 200)
        before = self.request(path='/api/slots/1')[1]
        self.assertEqual(self.put_slot(state='{"new":1}', summary={'new': 1}, name='New', create=True)[:2], (409, {'error': 'slot in use'}))
        self.assertEqual(self.request(path='/api/slots/1')[1], before)
        for create in (None, 0, 1, 'true', [], {}):
            self.assertEqual(self.put_slot(create=create)[0], 400)
        self.assertEqual(self.put_slot(create=False)[0], 200)

    def test_migration(self):
        old_path = str(Path(self.temp_path) / 'old-db')
        with sqlite3.connect(old_path) as db:
            db.execute('CREATE TABLE slots (uid TEXT, slot INTEGER, '
                       'updated_at TEXT, username TEXT, summary TEXT, state TEXT, PRIMARY KEY(uid, slot))')
            db.execute('INSERT INTO slots VALUES (?, ?, ?, ?, ?, ?)', ('alice', 1, 'old-time', 'Alice', '{}', '{}'))
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        with patch.dict(os.environ, ADR_DB_PATH=old_path):
            self.server = create_server('127.0.0.1', 0)
        self.thread = threading.Thread(target=self.server.serve_forever)
        self.thread.start()
        self.assertEqual(self.request(path='/api/slots')[1]['slots'], [dict(slot=1, updatedAt='old-time', summary={}, size=2, name='')])
        self.assertEqual(self.request(path='/api/slots/1')[1]['name'], '')
        self.assertEqual(self.put_slot(name='Migrated')[0], 200)
        self.assertEqual(self.put_slot(2, create=True)[0], 200)
        self.assertEqual(self.put(None)[0], 200)

    def test_secret_required(self):
        for value in ('', str(Path(self.temp_path) / 'missing')):
            with patch.dict(os.environ, ADR_PROXY_SECRET_FILE=value):
                with self.assertRaises((ValueError, FileNotFoundError)):
                    create_server('127.0.0.1', 0)
        Path(os.environ['ADR_PROXY_SECRET_FILE']).write_text(' \n')
        with self.assertRaises(ValueError):
            create_server('127.0.0.1', 0)

    def profile_headers(self, profile, uid='alice'):
        return {'X-Kotoka-Proxy-Secret': 'secret', 'X-Authentik-Uid': uid,
                'X-Authentik-Username': 'Alice', 'X-Kotoka-Profile': profile}

    def test_modded_matches_default(self):
        headers = self.profile_headers('modded')
        self.put(None)
        self.put_slot()
        for path in ('/api/save', '/api/saves', '/api/slots', '/api/slots/1'):
            self.assertEqual(self.request(path=path), self.request(path=path, headers=headers))
        self.assertEqual(self.put(1, '{"new":1}', headers=headers)[1]['revision'], 2)
        self.assertEqual(self.request()[1]['state'], '{"new":1}')
        self.assertEqual(self.put_slot(name='Modded', headers=headers)[0], 200)
        self.assertEqual(self.request(path='/api/slots/1')[1]['name'], 'Modded')

    def test_profile_autosaves(self):
        vanilla = self.profile_headers('vanilla')
        bob = self.profile_headers('vanilla', 'bob')
        for headers, state in ((None, '{"modded":1}'), (vanilla, '{"vanilla":1}'), (bob, '{"bob":1}')):
            self.assertEqual(self.request(headers=headers)[0], 404)
            self.assertEqual(self.put(None, state, headers=headers)[1]['revision'], 1)
        self.assertEqual(self.put(1, '{"modded":2}')[1]['revision'], 2)
        self.assertEqual(self.put(2, '{}', headers=vanilla)[0], 409)
        self.assertEqual(self.put(1, '{"vanilla":2}', headers=vanilla)[1]['revision'], 2)
        self.assertEqual(self.put(None, headers=bob)[1]['revision'], 1)
        for headers, state, revision in ((None, '{"modded":2}', 2), (vanilla, '{"vanilla":2}', 2), (bob, '{"bob":1}', 1)):
            self.assertEqual(self.request(headers=headers)[1]['state'], state)
            self.assertEqual(self.request(path='/api/save?revision=' + str(revision), headers=headers)[1]['state'], state)
            self.assertEqual([s['revision'] for s in self.request(path='/api/saves', headers=headers)[1]['saves']], [revision])
        with sqlite3.connect(os.environ['ADR_DB_PATH']) as db:
            self.assertEqual({r[0] for r in db.execute('SELECT uid FROM saves')},
                             {'alice', 'alice#vanilla', 'bob#vanilla'})

    def test_profile_slots(self):
        profiles = (None, self.profile_headers('vanilla'), self.profile_headers('vanilla', 'bob'))
        for index, headers in enumerate(profiles):
            self.assertEqual(self.request(path='/api/slots', headers=headers)[1], {'slots': []})
            self.assertEqual(self.put_slot(state=json.dumps({'owner': index}), headers=headers, create=True)[0], 200)
            self.assertEqual(self.put_slot(headers=headers, create=True)[0], 409)
            self.assertEqual(self.put_slot(index + 2, headers=headers)[0], 200)
        for index, headers in enumerate(profiles):
            self.assertEqual([s['slot'] for s in self.request(path='/api/slots', headers=headers)[1]['slots']], [1, index + 2])
            self.assertEqual(self.request(path='/api/slots/1', headers=headers)[1]['state'], json.dumps({'owner': index}))
        for index, headers in enumerate(profiles):
            others = [(h, self.request(path='/api/slots/1', headers=h)) for i, h in enumerate(profiles) if i != index]
            self.assertEqual(self.request('PATCH', '/api/slots/1', '{"name":"Renamed"}', headers)[0], 200)
            self.assertEqual(self.request('DELETE', '/api/slots/1', headers=headers)[0], 200)
            for other, before in others:
                self.assertEqual(self.request(path='/api/slots/1', headers=other), before)

    def test_invalid_profiles(self):
        endpoints = (('/api/save', ('GET', 'PUT')), ('/api/saves', ('GET',)),
                     ('/api/slots', ('GET',)), ('/api/slots/1', ('GET', 'PUT', 'PATCH', 'DELETE')))
        for value in ('', 'Vanilla', 'other', 'x' * 10000):
            headers = self.profile_headers(value)
            with patch('app.sqlite3.connect') as connect:
                for path, methods in endpoints:
                    for method in methods:
                        with self.subTest(value=value[:10], path=path, method=method):
                            self.assertEqual(self.request(method, path, headers=headers)[:2], (400, {'error': 'invalid profile'}))
                            bad_auth = dict(headers, **{'X-Kotoka-Proxy-Secret': 'wrong'})
                            self.assertEqual(self.request(method, path, headers=bad_auth)[0], 403)
                self.assertEqual(self.request(path='/api/me', headers=headers)[1], {'uid': 'alice', 'username': 'Alice'})
                self.assertEqual(self.request(path='/api/login', headers=headers)[::2], (302, '/'))
                self.assertEqual(self.request(path='/healthz', headers=headers)[:2], (200, 'ok'))
                self.assertEqual(self.request(path='/unknown', headers=headers)[0], 404)
                connect.assert_not_called()


if __name__ == '__main__':
    unittest.main()
