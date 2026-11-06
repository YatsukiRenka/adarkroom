(function(root) {
	var MODES = { vanilla: 'vanilla', modded: 'modded' };
	function parse(value) { return value === MODES.vanilla ? MODES.vanilla : MODES.modded; }
	function limits(mode) { return parse(mode) === MODES.modded ? { huts: 50, speed: 3 } : { huts: 20, speed: 2 }; }
	function metadataKey(mode) { return parse(mode) === MODES.modded ? 'kotoka.cloud' : 'kotoka.cloud.vanilla'; }
	function swap(storage, current, target) {
		var result = Object.assign({}, storage), from = 'kotoka.save.' + current, to = 'kotoka.save.' + target;
		if(result.gameState == null) delete result[from];
		else result[from] = result.gameState;
		if(result[to] == null) delete result.gameState;
		else result.gameState = result[to];
		delete result[to];
		result['kotoka.mode'] = target;
		return result;
	}
	var api = { MODES: MODES, parse: parse, limits: limits, metadataKey: metadataKey, profile: parse, swap: swap };
	if(typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
	Kotoka.addStrings({ zh_cn: {
		'mode: modded.': '模式：魔改.', 'mode: vanilla.': '模式：原版.',
		'modded': '魔改版', 'vanilla': '原版', 'Switch Mode?': '切换模式?', 'switch': '切换', 'cancel': '取消',
		'vanilla: speed up to x2, at most 20 huts, no auto mode, fights at normal speed.': '原版：最高 x2 速度，最多 20 间小屋，无自动模式，战斗按正常速度进行.',
		'modded: speed up to x3, up to 50 huts, double-click auto mode, combat speed, auto melee.': '魔改版：最高 x3 速度，最多 50 间小屋，双击自动模式，可调战斗速度，自动近战.',
		'saves are kept separately for each mode, locally and in the cloud.': '两种模式的本地和云端存档分别保存.',
		'current progress will be saved, then the other mode’s save loaded. without a save, a new game begins.': '当前进度将被保存，然后读取另一模式的存档；若没有存档，则开始新游戏.'
	} });
	var current = parse(localStorage.getItem('kotoka.mode')), switching = false;
	api.current = function() { return current; };
	api.isModded = function() { return current === MODES.modded; };
	Room.Craftables.hut.maximum = limits(current).huts;
	Engine.MAX_SPEED = limits(current).speed;
	api.switchTo = async function(target) {
		if(target !== MODES.vanilla && target !== MODES.modded || target === current || switching) return;
		switching = true;
		var cloud = Kotoka.CloudSave;
		if(cloud && cloud.isLoggedIn()) {
			try { await cloud.syncNow(); } catch(e) {}
		}
		if(cloud) cloud.suspend();
		Engine.saveGame();
		var next = swap(localStorage, current, target);
		['kotoka.save.' + current, 'gameState', 'kotoka.save.' + target, 'kotoka.mode'].forEach(function(key) {
			if(next[key] == null) localStorage.removeItem(key);
			else localStorage.setItem(key, next[key]);
		});
		Engine.saveGame = function() {};
		location.reload();
	};
	root.Kotoka.Mode = api;
	$(function() {
		$('<span class="menuBtn">').text(_(api.isModded() ? 'mode: modded.' : 'mode: vanilla.')).appendTo('.menu').on('click', function() {
			if(Engine.keyLock) return;
			var target = api.isModded() ? MODES.vanilla : MODES.modded;
			Events.startEvent({ title: _('Switch Mode?'), scenes: { start: {
				text: [_(target === MODES.vanilla ? 'vanilla: speed up to x2, at most 20 huts, no auto mode, fights at normal speed.' : 'modded: speed up to x3, up to 50 huts, double-click auto mode, combat speed, auto melee.'),
					_('saves are kept separately for each mode, locally and in the cloud.'),
					_('current progress will be saved, then the other mode’s save loaded. without a save, a new game begins.')],
				buttons: { switch: { text: _('switch'), nextScene: 'end', onChoose: function() { api.switchTo(target); } }, cancel: { text: _('cancel'), nextScene: 'end' } }
			} } });
		});
	});
})(typeof window !== 'undefined' ? window : globalThis);
