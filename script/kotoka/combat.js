(function(root) {
	function parseSpeed(value) { return value === 0.5 || value === 0.75 || value === 1 ? value : 1; }
	function parseAuto(value) { return value === true; }
	function timeScale(fighting, modded, speed, gameSpeed) { return fighting ? (modded ? parseSpeed(speed) : 1) : gameSpeed; }
	function meleeButtons(weapons) {
		return Object.keys(weapons).filter(function(key) {
			var weapon = weapons[key];
			return weapon && (weapon.type === 'melee' || weapon.type === 'unarmed');
		}).map(function(key) { return 'attack_' + key.replace(/ /g, '-'); });
	}
	var api = { parseSpeed: parseSpeed, parseAuto: parseAuto, timeScale: timeScale, meleeButtons: meleeButtons };
	if(typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
	Kotoka.addStrings({ zh_cn: {
		'combat speed x{0}.': '战斗速度 x{0}.',
		'Combat Speed': '战斗速度',
		'choose how fast fights run. slower fights give more time to react.': '选择战斗的快慢. 越慢，反应时间越充裕.',
		'auto melee: on.': '自动近战：开.',
		'auto melee: off.': '自动近战：关.'
	} });
	root.Kotoka.Combat = api;
	var fightSpeed = 1;
	function speed() { return parseSpeed($SM.get('config.combatSpeed', true)); }
	function auto() { return parseAuto($SM.get('config.autoMelee', true)); }
	Engine.timeScale = function() { return timeScale(Engine.inCombat(), Kotoka.Mode.isModded(), fightSpeed, Engine.getSpeed()); };
	function applyAuto(panel) {
		if(!Kotoka.Mode.isModded() || !Engine.inCombat()) return;
		meleeButtons(World.Weapons).forEach(function(id) {
			var btn = panel.find('[id="' + id + '"]');
			if(btn.length && Kotoka.AutoRepeat.isAuto(btn) !== auto()) Kotoka.AutoRepeat.toggle(btn);
		});
	}
	var startCombat = Events.startCombat;
	Events.startCombat = function() {
		fightSpeed = speed();
		var result = startCombat.apply(this, arguments);
		if(Kotoka.Mode.isModded() && auto()) {
			var panel = Events.eventPanel();
			if(document.documentElement.contains(panel[0])) applyAuto(panel);
			else {
				// startEvent attaches its panel after startCombat returns.
				var observer = new MutationObserver(function() {
					if(document.documentElement.contains(panel[0])) {
						observer.disconnect();
						applyAuto(panel);
					}
				});
				observer.observe(document.documentElement, { childList: true, subtree: true });
			}
		}
		return result;
	};
	$(function() {
		if(!Kotoka.Mode.isModded()) return;
		var speedEntry = $('<span class="menuBtn">').insertAfter('.menu span.hyper');
		var autoEntry = $('<span class="menuBtn">').insertAfter(speedEntry);
		function labels() {
			speedEntry.text(_('combat speed x{0}.', speed()));
			autoEntry.text(_(auto() ? 'auto melee: on.' : 'auto melee: off.'));
		}
		speedEntry.on('click', function() {
			if(Engine.keyLock) return;
			var buttons = {};
			[0.5, 0.75, 1].forEach(function(n) {
				// keys become element ids; keep dots out of them
				buttons['combatSpeed' + String(n).replace('.', '_')] = { text: _('x{0}', n), nextScene: 'end', onChoose: function() {
					$SM.set('config.combatSpeed', n);
					labels();
				} };
			});
			buttons.cancel = { text: _('cancel'), nextScene: 'end' };
			Events.startEvent({ title: _('Combat Speed'), scenes: { start: {
				text: [_('choose how fast fights run. slower fights give more time to react.')], buttons: buttons
			} } });
		});
		autoEntry.on('click', function() {
			$SM.set('config.autoMelee', !auto());
			labels();
			if(Engine.inCombat()) applyAuto(Events.eventPanel());
		});
		labels();
	});
})(typeof window !== 'undefined' ? window : globalThis);
