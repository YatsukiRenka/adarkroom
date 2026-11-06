// Upstream takes the outfit out of the stores when the wanderer embarks and only puts it back on a
// safe return (World.goHome); the trip itself lives in memory. Reloading or closing the page mid-trip
// therefore lost everything carried, like dying. This module records what was taken at embark
// (State.game.kotokaExpedition) and, when a save still carries that record on load, returns
// min(carried now, taken at embark) of each item to the stores: nothing is lost, consumed supplies
// stay consumed, and loot cannot be brought home by reloading. Death still loses the pack.
(function(root) {
	var KEY = 'kotokaExpedition';

	// Pure: mutates the loaded State, returns { item: amount } that was returned (or null).
	function recover(state) {
		var game = state && state.game, taken = game && game[KEY];
		if(!taken || typeof taken !== 'object') return null;
		var carried = state.outfit && typeof state.outfit === 'object' ? state.outfit : {};
		var returned = {};
		state.stores = state.stores && typeof state.stores === 'object' ? state.stores : {};
		Object.keys(taken).forEach(function(k) {
			var n = Math.max(0, Math.min(Number(carried[k]) || 0, Number(taken[k]) || 0));
			if(n > 0) {
				state.stores[k] = (Number(state.stores[k]) || 0) + n;
				returned[k] = n;
			}
		});
		// Offer the same selection again for the next trip; Path caps it to what is in stock.
		state.outfit = Object.assign({}, taken);
		delete game[KEY];
		return returned;
	}

	var api = { recover: recover, KEY: KEY };
	if(typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
	root.Kotoka.Expedition = api;
	Kotoka.addStrings({ zh_cn: {
		'the last expedition was cut short. the supplies carried have been returned to the village.':
			'上次探索被中断，带出的物资已退回村里.'
	} });

	var recovered = null;

	function after(obj, name, fn) {
		var original = obj[name];
		obj[name] = function() {
			var result = original.apply(this, arguments);
			fn();
			return result;
		};
	}

	function clearRecord() {
		$SM.remove('game.' + KEY);
	}

	// Engine.loadGame runs inside Engine.init, before Path.init caps the outfit to the stores.
	after(Engine, 'loadGame', function() {
		if(window.State) recovered = recover(window.State);
	});

	// Record before upstream embark takes the items out of the stores (Path.init binds the embark
	// button to Path.embark during Engine.init, so wrapping it at script load is early enough).
	var embark = Path.embark;
	Path.embark = function() {
		$SM.set('game.' + KEY, Object.assign({}, Path.outfit));
		return embark.apply(this, arguments);
	};
	after(World, 'goHome', clearRecord);
	after(World, 'die', clearRecord);

	$(function() {
		if(recovered) {
			Engine.saveGame();
			Notifications.notify(null, _('the last expedition was cut short. the supplies carried have been returned to the village.'));
		}
	});
})(typeof window !== 'undefined' ? window : globalThis);
