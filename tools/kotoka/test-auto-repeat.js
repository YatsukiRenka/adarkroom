import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';
const source = readFileSync(new URL('../../script/kotoka/auto-repeat.js', import.meta.url), 'utf8');
const exported = { exports: {} };
runInThisContext('(function(module) {\n' + source + '\n})')(exported);
const { decide } = exported.exports;
for(const id of [{}, 'Digit1']) {
	const first = decide(null, id, 1000, false);
	assert.equal(first.action, 'pass');
	assert.deepEqual(first.state, { id, timestamp: 1000 });
	for(const delay of [100, 350]) {
		assert.deepEqual(decide(first.state, id, 1000 + delay, false), { action: 'auto-on', state: null });
	}
	assert.equal(decide(first.state, id, 1351, false).action, 'pass');
	const other = decide(first.state, 'other', 1100, false);
	assert.equal(other.action, 'pass');
	assert.equal(decide(other.state, id, 1200, false).action, 'pass');
	assert.deepEqual(decide(first.state, null, 1100, false), { action: 'pass', state: null });
	const off = decide(first.state, id, 1100, true);
	assert.deepEqual(off, { action: 'auto-off', state: null });
	assert.equal(decide(off.state, id, 1200, false).action, 'pass');
}
console.log('auto-repeat logic tests passed');
