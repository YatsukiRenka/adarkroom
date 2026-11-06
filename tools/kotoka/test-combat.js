import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const context = { module: { exports: {} } };
runInNewContext(readFileSync(new URL('../../script/kotoka/combat.js', import.meta.url), 'utf8'), context);
const { parseSpeed, parseAuto, timeScale, meleeButtons } = context.module.exports;
for(const n of [0.5, 0.75, 1]) {
	assert.equal(parseSpeed(n), n);
	assert.equal(timeScale(true, true, n, 3), n);
}
for(const n of [0, 2, '0.5', null, undefined, NaN]) assert.equal(parseSpeed(n), 1);
for(const n of [0.5, 0.75, 1, 2, null, undefined]) assert.equal(timeScale(true, false, n, 2), 1);
for(const modded of [true, false]) {
	for(const speed of [1, 2, 3]) assert.equal(timeScale(false, modded, 0.5, speed), speed);
}
assert.equal(parseAuto(true), true);
for(const n of [false, 1, 0, 'true', null, undefined, {}, []]) assert.equal(parseAuto(n), false);
assert.deepEqual(Array.from(meleeButtons({
	fists: { type: 'unarmed', cooldown: 2 },
	'iron sword': { type: 'melee', cooldown: 2 },
	rifle: { type: 'ranged', cost: { bullets: 1 } },
	missing: undefined, empty: null, odd: 3, unknown: {}, wrong: { type: 'magic' }
})), ['attack_fists', 'attack_iron-sword']);
console.log('combat tests passed');
