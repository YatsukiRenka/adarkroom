// Upstream takes the outfit out of the stores when the wanderer embarks and only puts it back on a
// safe return (World.goHome); the trip itself (World.state, position, health, water, ...) lives in
// memory, so reloading or closing the page mid-trip lost everything carried, like dying.
//
// This module keeps the trip in the save while exploring (State.game.kotokaTrip, refreshed on every
// move, health/water change, event end and every few seconds) and resumes it on load: the wanderer is
// back where they were, with the same pack, health, water and map progress. Loot still only counts
// once they walk home. A fight in progress at reload time is not restored.
//
// Fallback for saves without a usable trip snapshot: State.game.kotokaExpedition records what was
// taken at embark, and min(carried now, taken) of each item is returned to the stores.
(function(root) {
	var KEY = 'kotokaExpedition', TRIP = 'kotokaTrip';

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

	function validTrip(trip) {
		return !!(trip && typeof trip === 'object' && trip.state && Array.isArray(trip.state.map) &&
			Array.isArray(trip.state.mask) && Array.isArray(trip.curPos) && trip.curPos.length === 2 &&
			trip.curPos.every(function(n) { return Number.isInteger(n) && n >= 0 && n < trip.state.map.length; }));
	}

	// Pure: what to do with a freshly loaded State: 'resume' | 'recover' | 'none'.
	function onLoad(state) {
		var game = state && state.game;
		if(!game) return 'none';
		if(validTrip(game[TRIP]) && game[KEY]) return 'resume';
		if(game[TRIP]) delete game[TRIP];
		return game[KEY] ? 'recover' : 'none';
	}

	var api = { recover: recover, validTrip: validTrip, onLoad: onLoad, KEY: KEY, TRIP: TRIP };
	if(typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
	root.Kotoka.Expedition = api;
	Kotoka.addStrings({ zh_cn: {
		'the last expedition was cut short. the supplies carried have been returned to the village.':
			'上次探索被中断，带出的物资已退回村里.',
		'the journey continues.': '旅途继续.'
	} });

	var recovered = null, pendingTrip = null, resuming = false;

	function after(obj, name, fn) {
		var original = obj[name];
		obj[name] = function() {
			var result = original.apply(this, arguments);
			fn();
			return result;
		};
	}

	function exploring() {
		return Engine.activeModule === World && World.state && !World.dead && !resuming;
	}

	// World.state is stored by reference: later changes are written with the next save.
	function snapshot() {
		if(!exploring() || !window.State || !State.game) return;
		State.game[TRIP] = {
			state: World.state,
			curPos: World.copyPos(World.curPos),
			health: World.health,
			water: World.water,
			foodMove: World.foodMove,
			waterMove: World.waterMove,
			fightMove: World.fightMove,
			starvation: World.starvation,
			thirst: World.thirst,
			danger: World.danger,
			usedOutposts: World.usedOutposts
		};
		Engine.saveGame();
	}

	function clearRecords() {
		if(window.State && State.game) delete State.game[TRIP];
		$SM.remove('game.' + KEY);
	}

	// Engine.loadGame runs inside Engine.init, before Path.init caps the outfit to the stores.
	after(Engine, 'loadGame', function() {
		var action = onLoad(window.State);
		if(action === 'resume') pendingTrip = State.game[TRIP];
		else if(action === 'recover') recovered = recover(window.State);
	});

	// Record before upstream embark takes the items out of the stores (Path.init binds the embark
	// button to Path.embark during Engine.init, so wrapping it at script load is early enough).
	var embark = Path.embark;
	Path.embark = function() {
		$SM.set('game.' + KEY, Object.assign({}, Path.outfit));
		var result = embark.apply(this, arguments);
		snapshot();
		return result;
	};
	after(World, 'move', snapshot);
	after(World, 'setHp', snapshot);
	after(World, 'setWater', snapshot);
	after(World, 'useOutpost', snapshot);
	after(Events, 'endEvent', function() { setTimeout(snapshot, 300); });
	after(World, 'goHome', clearRecords);
	after(World, 'die', clearRecords);

	// Same steps as Path.embark, minus taking the outfit from the stores (already done at the real
	// embark), then the saved trip replaces the fresh one World.onArrival sets up.
	function resume(trip) {
		resuming = true;
		Engine.travelTo(Path);
		setTimeout(function() {
			World.onArrival();
			World.state = trip.state;
			World.curPos = World.copyPos(trip.curPos);
			World.foodMove = trip.foodMove || 0;
			World.waterMove = trip.waterMove || 0;
			World.fightMove = trip.fightMove || 0;
			World.starvation = !!trip.starvation;
			World.thirst = !!trip.thirst;
			World.danger = !!trip.danger;
			World.usedOutposts = trip.usedOutposts || {};
			World.setWater(typeof trip.water === 'number' ? trip.water : World.getMaxWater());
			World.setHp(typeof trip.health === 'number' ? trip.health : World.getMaxHealth());
			World.updateSupplies();
			$('#outerSlider').animate({left: '-700px'}, 300);
			Engine.activeModule = World;
			World.drawMap();
			resuming = false;
			snapshot();
			Notifications.notify(World, _('the journey continues.'));
		}, 400);
	}

	$(function() {
		if(pendingTrip) resume(pendingTrip);
		else if(recovered) {
			Engine.saveGame();
			Notifications.notify(null, _('the last expedition was cut short. the supplies carried have been returned to the village.'));
		}
		setInterval(snapshot, 5000);
	});
})(typeof window !== 'undefined' ? window : globalThis);
