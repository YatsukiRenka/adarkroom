import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';
function load(name) {
  const exported = { exports: {} };
  new Function('module', readFileSync(new URL('../../script/kotoka/' + name + '.js', import.meta.url), 'utf8'))(exported);
  return exported.exports;
}
const mode = load('mode'), auto = load('auto-repeat');
for (const value of [undefined, null, '', 'bad', 'MODDED', 'modded']) assert.strictEqual(mode.parse(value), 'modded');
assert.strictEqual(mode.parse('vanilla'), 'vanilla');
for (const name of ['modded', 'vanilla']) {
  assert.strictEqual(mode.profile(name), name);
  assert.strictEqual(mode.metadataKey(name), name === 'modded' ? 'kotoka.cloud' : 'kotoka.cloud.vanilla');
  assert.deepStrictEqual(mode.limits(name), name === 'modded' ? { huts: 50, speed: 3 } : { huts: 20, speed: 2 });
  const other = name === 'modded' ? 'vanilla' : 'modded';
  const input = { gameState: 'current', ['kotoka.save.' + other]: 'target', untouched: 'keep' };
  const output = mode.swap(input, name, other);
  assert.deepStrictEqual(output, { gameState: 'target', ['kotoka.save.' + name]: 'current', 'kotoka.mode': other, untouched: 'keep' });
  assert.strictEqual(input.gameState, 'current');
  assert.deepStrictEqual(mode.swap({ gameState: 'current' }, name, other), { ['kotoka.save.' + name]: 'current', 'kotoka.mode': other });
  assert.deepStrictEqual(mode.swap({ ['kotoka.save.' + name]: 'stale', ['kotoka.save.' + other]: 'target' }, name, other), { gameState: 'target', 'kotoka.mode': other });
}
for (const active of [false, true]) assert.deepStrictEqual(auto.decide({ id: 'a', timestamp: 1 }, 'a', 2, active, false), { action: 'pass', state: null });
assert.strictEqual(auto.decide({ id: 'a', timestamp: 1 }, 'a', 2, false, true).action, 'auto-on');
console.log('mode tests passed');
