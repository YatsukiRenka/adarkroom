'use strict';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../../script/kotoka/background-timers.js', import.meta.url), 'utf8');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function harness(mode) {
	const handles = new Map();
	const errors = [];
	const delegated = [];
	const cleared = [];
	let nextId = 1;
	function schedule(repeat, callback, delay, ...args) {
		if(typeof callback !== 'function') {
			delegated.push({ repeat, callback, delay, args });
			return nextId++;
		}
		const id = nextId++;
		const fire = () => {
			if(!repeat) handles.delete(id);
			try { callback(...args); } catch(error) { errors.push(error); }
		};
		handles.set(id, (repeat ? setInterval : setTimeout)(fire, delay));
		return id;
	}
	function clear(id) {
		cleared.push(id);
		clearTimeout(handles.get(id));
		handles.delete(id);
	}
	const natives = {
		setTimeout: (fn, delay, ...args) => schedule(false, fn, delay, ...args),
		setInterval: (fn, delay, ...args) => schedule(true, fn, delay, ...args),
		clearTimeout: clear,
		clearInterval: clear
	};
	class FakeWorker {
		constructor(blob) {
			if(mode === 'throws') throw new Error('Worker unavailable');
			const self = { postMessage: data => natives.setTimeout(() => this.onmessage({ data }), 0) };
			this.self = self;
			vm.runInNewContext(blob.source, { self, ...natives });
		}
		postMessage(data) {
			natives.setTimeout(() => this.self.onmessage({ data }), 0);
		}
	}
	const window = {
		...natives,
		Worker: mode === 'missing' ? undefined : FakeWorker,
		Blob: class { constructor(parts) { this.source = parts.join(''); } },
		URL: { createObjectURL: blob => blob, revokeObjectURL() {} }
	};
	const context = vm.createContext({ window });
	return {
		window, natives, errors, delegated, cleared,
		install() { vm.runInContext(source, context); },
		dispose() { for(const handle of handles.values()) clearTimeout(handle); }
	};
}

async function test() {
	for(const mode of ['missing', 'throws']) {
		const h = harness(mode);
		h.install();
		assert.equal(h.window.Kotoka.backgroundTimers, false);
		for(const name of Object.keys(h.natives)) assert.equal(h.window[name], h.natives[name]);
		h.dispose();
	}
	const h = harness();
	const w = h.window;
	try {
		let oldFired = false;
		const oldId = w.setTimeout(() => { oldFired = true; }, 30);
		h.install();
		assert.equal(w.Kotoka.backgroundTimers, true);
		for(const name of Object.keys(h.natives)) assert.equal(w.Kotoka.nativeTimers[name], h.natives[name]);
		w.clearInterval(oldId);
		assert.ok(h.cleared.includes(oldId));
		let count = 0;
		const id = w.setTimeout(function(a, b) {
			assert.equal(this, w);
			assert.deepEqual([a, b], ['a', 42]);
			count++;
		}, 5, 'a', 42);
		assert.ok(Number.isInteger(id) && id >= 1e9 && id !== oldId);
		const order = [];
		w.setTimeout(() => order.push('late'), 40);
		w.setTimeout(() => order.push('early'), 2);
		let repeats = 0;
		const interval = w.setInterval(() => {
			if(++repeats === 3) w.clearTimeout(interval);
		}, 5);
		let canceled = false;
		const canceledId = w.setTimeout(() => { canceled = true; }, 15);
		w.clearInterval(canceledId);
		for(const value of [undefined, null, 999]) {
			w.clearTimeout(value);
			w.clearInterval(value);
		}
		w.setTimeout('example()', 12, 'arg');
		w.setInterval('example()', 13);
		assert.equal(h.delegated.length, 2);
		assert.deepEqual(h.delegated[0], { repeat: false, callback: 'example()', delay: 12, args: ['arg'] });
		assert.equal(h.delegated[1].repeat, true);
		const error = new Error('expected callback failure');
		w.setTimeout(() => { throw error; }, 1);
		let survived = false;
		w.setTimeout(() => { survived = true; }, 10);
		let coerced = 0;
		for(const delay of ['2', 'invalid', NaN, -10, undefined]) w.setTimeout(() => coerced++, delay);
		await sleep(100);
		assert.equal(count, 1);
		assert.deepEqual(order, ['early', 'late']);
		assert.equal(repeats, 3);
		assert.equal(canceled, false);
		assert.equal(oldFired, false);
		assert.equal(survived, true);
		assert.equal(coerced, 5);
		assert.deepEqual(h.errors, [error]);
		let externalCount = 0;
		const external = w.setInterval(() => externalCount++, 5);
		await sleep(100);
		w.clearInterval(external);
		const stoppedAt = externalCount;
		await sleep(100);
		assert.ok(stoppedAt > 0);
		assert.equal(externalCount, stoppedAt);
	} finally {
		h.dispose();
	}
}

test().then(() => console.log('background-timers: all tests passed')).catch(error => {
	console.error('background-timers: FAILED', error);
	process.exitCode = 1;
});
