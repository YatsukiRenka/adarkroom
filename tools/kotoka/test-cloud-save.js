import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const context = { module: { exports: {} } };
runInNewContext(readFileSync(new URL('../../script/kotoka/cloud-save.js', import.meta.url), 'utf8'), context);
const logic = context.module.exports;
const summarize = logic.summary;
logic.summary = value => JSON.parse(JSON.stringify(summarize(value)));
const local = '{"stores":{"wood":12}}';
const cloud = { revision: 2, state: '{"stores":{"wood":3}}' };
const meta = { uid: 'a', revision: 2, hash: logic.hash(local) };
function decision(overrides) {
	return logic.decide(Object.assign({ local, cloud, meta, uid: 'a' }, overrides));
}
assert.strictEqual(logic.hash('hello'), '4f9f2cab');
assert.strictEqual(logic.hash(local), logic.hash(local));
assert.notStrictEqual(logic.hash(local), logic.hash(cloud.state));
assert.strictEqual(decision({ cloud: null }), 'upload');
assert.strictEqual(decision({ cloud: null, local: null }), 'empty');
assert.strictEqual(decision({}), 'synced');
assert.strictEqual(decision({ local: '{}' }), 'upload');
assert.strictEqual(decision({ meta: null, local: cloud.state }), 'adopt');
assert.strictEqual(decision({ meta: null }), 'conflict');
assert.strictEqual(decision({ uid: 'b' }), 'conflict');
assert.strictEqual(decision({ cloud: { revision: 3, state: cloud.state } }), 'conflict');
assert.strictEqual(decision({ local: null }), 'download');
assert.strictEqual(decision({ meta: '{broken' }), 'conflict');
assert.strictEqual(decision({ meta: 'null' }), 'conflict');
assert.strictEqual(decision({ local: '{broken', meta: null }), 'conflict');
assert.strictEqual(decision({ local: '{broken', cloud: null }), 'upload');
assert.strictEqual(decision({ cloud: '{broken' }), 'conflict');
assert.strictEqual(decision({ cloud: {} }), 'conflict');
assert.strictEqual(decision({ local: '', meta: null }), 'conflict');
// brand-new local game on a new browser takes the cloud save silently
const fresh = '{"features":{"location":{"room":true}},"game":{"fire":{"value":0}}}';
assert.strictEqual(decision({ local: fresh, meta: null }), 'download');
assert.strictEqual(decision({ local: '{"stores":{}}', meta: null }), 'download');
assert.strictEqual(decision({ local: fresh, uid: 'b' }), 'download');
// after a deliberate restart (sync baseline kept) the new game replaces the cloud save
assert.strictEqual(decision({ local: fresh }), 'upload');
assert.strictEqual(decision({ local: '[]', meta: null }), 'conflict');
assert.strictEqual(decision({ local: 'null', meta: null }), 'conflict');
assert.deepStrictEqual(logic.summary('{broken'), { wood: null, huts: null, population: null });
assert.deepStrictEqual(logic.summary('null'), { wood: null, huts: null, population: null });
assert.deepStrictEqual(logic.summary('{}'), { wood: null, huts: null, population: null });
assert.deepStrictEqual(logic.summary('{"stores":{"wood":0},"game":{"buildings":{"hut":4},"population":9}}'), { wood: 0, huts: 4, population: 9 });
assert.deepStrictEqual(logic.summary('{"stores":{"wood":"bad"},"game":{"buildings":null}}'), { wood: null, huts: null, population: null });
console.log('cloud-save decision and summary tests passed');

['1', '5', '10'].forEach(v => assert.equal(logic.parseInterval(v), Number(v)));
[null, undefined, '', '2', '01', ' 5 ', '5.0', 'bad'].forEach(v => assert.equal(logic.parseInterval(v), 1));
