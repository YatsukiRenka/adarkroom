// node tools/kotoka/test-expedition.js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const context = { module: { exports: {} } };
runInNewContext(readFileSync(new URL('../../script/kotoka/expedition.js', import.meta.url), 'utf8'), context);
const { recover, KEY } = context.module.exports;
// objects created inside the vm context have a different Object.prototype; compare structurally
const plain = v => JSON.parse(JSON.stringify(v));

function save(taken, carried, stores) {
	return { game: { [KEY]: taken, world: {} }, outfit: carried, stores: stores };
}

// no expedition record: nothing happens
let s = { game: {}, outfit: { 'cured meat': 3 }, stores: { 'cured meat': 1 } };
assert.strictEqual(recover(s), null);
assert.deepStrictEqual(plain(s.stores), { 'cured meat': 1 });
assert.strictEqual(recover(null), null);
assert.strictEqual(recover({}), null);

// reload mid-trip: carried items come back, consumed ones do not
s = save({ 'cured meat': 10, 'iron sword': 1, medicine: 2 }, { 'cured meat': 6, 'iron sword': 1, medicine: 2 }, { 'cured meat': 5, fur: 7 });
assert.deepStrictEqual(plain(recover(s)), { 'cured meat': 6, 'iron sword': 1, medicine: 2 });
assert.deepStrictEqual(plain(s.stores), { 'cured meat': 11, fur: 7, 'iron sword': 1, medicine: 2 });
assert.strictEqual(s.game[KEY], undefined, 'record cleared');
assert.deepStrictEqual(plain(s.outfit), { 'cured meat': 10, 'iron sword': 1, medicine: 2 }, 'selection restored');

// loot picked up on the way is not brought home by reloading
s = save({ 'cured meat': 4 }, { 'cured meat': 4, 'alien alloy': 3, bullets: 9 }, {});
assert.deepStrictEqual(plain(recover(s)), { 'cured meat': 4 });
assert.deepStrictEqual(plain(s.stores), { 'cured meat': 4 });

// more of an item than taken (picked up the same item): capped at what was taken
s = save({ medicine: 1 }, { medicine: 5 }, { medicine: 0 });
assert.deepStrictEqual(plain(recover(s)), { medicine: 1 });
assert.strictEqual(s.stores.medicine, 1);

// everything used up: nothing to return, record still cleared
s = save({ 'cured meat': 2 }, { 'cured meat': 0 }, { 'cured meat': 0 });
assert.deepStrictEqual(plain(recover(s)), {});
assert.strictEqual(s.game[KEY], undefined);

// malformed values do not throw or go negative
s = save({ torch: 'x', bolas: -3, charm: 2 }, null, null);
assert.deepStrictEqual(plain(recover(s)), {});
assert.deepStrictEqual(plain(s.stores), {});
s = save({ charm: 2 }, { charm: '2' }, { charm: '1' });
assert.deepStrictEqual(plain(recover(s)), { charm: 2 });
assert.strictEqual(s.stores.charm, 3);

console.log('expedition recovery tests passed');
