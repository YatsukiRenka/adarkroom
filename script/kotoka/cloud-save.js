(function(root) {
	if(root.Kotoka) root.Kotoka.addStrings({ zh_cn: {
		'log in.': '登录.', 'cloud: {0}.': '云存档：{0}.', 'cloud save': '云存档',
		'sync now': '立即同步', 'log out': '退出登录',
		'use cloud save': '使用云存档', "keep this browser’s save": '保留此浏览器的存档',
		'offline': '离线', 'conflict': '存档冲突', 'save too large': '存档过大',
		'not synced yet': '尚未同步', 'last synced: {0}': '上次同步：{0}',
		'unknown': '未知', 'cloud updated: {0}': '云存档更新时间：{0}',
		'cloud — wood: {0}, huts: {1}, population: {2}': '云存档——木头：{0}，小屋：{1}，人口：{2}',
		'this browser — wood: {0}, huts: {1}, population: {2}': '此浏览器——木头：{0}，小屋：{1}，人口：{2}',
		'choose which save to keep.': '请选择要保留的存档.'
	} });
	function parseInterval(value) { return /^(1|5|10)$/.test(String(value)) ? Number(value) : 1; }
	function parse(value) {
		try { return typeof value === 'string' ? JSON.parse(value) : value; } catch(e) { return null; }
	}
	function hash(value) {
		var h = 2166136261;
		for(var i = 0; i < value.length; i++) h = Math.imul(h ^ value.charCodeAt(i), 16777619);
		return (h >>> 0).toString(16).padStart(8, '0');
	}
	function metadata(value, uid) {
		var m = parse(value);
		return m && m.uid === uid && Number.isInteger(m.revision) && typeof m.hash === 'string' ? m : null;
	}
	function decide(input) {
		var local = input.local, cloud = parse(input.cloud), meta = metadata(input.meta, input.uid);
		if(input.cloud == null) return local == null ? 'empty' : 'upload';
		if(!cloud) return 'conflict';
		if(!Number.isInteger(cloud.revision) || typeof cloud.state !== 'string') return 'conflict';
		if(local == null) return 'download';
		if(meta && meta.revision === cloud.revision) return hash(local) === meta.hash ? 'synced' : 'upload';
		if(hash(local) === hash(cloud.state)) return 'adopt';
		// A brand-new game (nothing in stores yet) on a new browser: take the cloud save without asking.
		return pristine(local) ? 'download' : 'conflict';
	}
	function pristine(raw) {
		var s = parse(raw);
		return !!s && typeof s === 'object' && !Array.isArray(s) && (!s.stores || Object.keys(s.stores).length === 0);
	}
	function summary(raw) {
		var s = parse(raw) || {}, game = s.game || {}, buildings = game.buildings || {}, stores = s.stores || {};
		function count(v) { return typeof v === 'number' && Number.isFinite(v) ? v : null; }
		return { wood: count(stores.wood), huts: count(buildings.hut), population: count(game.population) };
	}
	function replaceLocalSave(state) {
		localStorage.setItem('gameState', state);
		Engine.saveGame = function() {};
		location.reload();
	}
	var api = { parseInterval: parseInterval, replaceLocalSave: replaceLocalSave, hash: hash, decide: decide, summary: summary, metadata: metadata };
	if(typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
	root.Kotoka.CloudSave = api;
		var profile = Kotoka.Mode.profile(Kotoka.Mode.current()), metaKey = Kotoka.Mode.metadataKey(profile), suspended = false;
	$(function() {
		var user, meta, ready = false, busy = false, loggedOut = false, error = '', lastSync, pending;
		api.isLoggedIn = function() { return !!user; };
		api.user = function() { return user; };
		api.request = request;
		var menu = $('<span class="menuBtn">').appendTo('.menu');
		function render() { menu.text((user ? _('cloud: {0}.', user.username) : _('log in.')) + (busy ? ' …' : '')); }
		function local() { return localStorage.getItem('gameState'); }
		function adopt(state, revision) {
			if(suspended) return;
			meta = { uid: user.uid, revision: revision, hash: hash(state) };
			localStorage.setItem(metaKey, JSON.stringify(meta));
			lastSync = new Date(); error = ''; ready = true;
		}
		async function request(path, options) {
			if(suspended) throw new Error('not synced yet');
			var headers = new Headers(options && options.headers);
			headers.set('X-Kotoka-Profile', profile);
			var response = await fetch(path, Object.assign({ credentials: 'same-origin', cache: 'no-store' }, options, { headers: headers }));
			if(suspended) throw new Error('not synced yet');
			if(response.status === 401) {
				user = null; meta = null; ready = false; pending = null; loggedOut = true;
				throw new Error('not synced yet');
			}
			return response;
		}
		function fail(e) { error = e.message === 'save too large' ? e.message : (loggedOut ? 'not synced yet' : 'offline'); }
		function download(cloud) {
			if(suspended) return;
			try {
				localStorage.setItem('gameState', cloud.state);
				adopt(cloud.state, cloud.revision);
				// Same synchronous task as the write: no game timer can save the old in-memory State over it before the reload.
				Engine.saveGame = function() {};
				location.reload();
			}
			catch(e) { fail(e); }
		}
		function dialog(text, buttons) {
			Events.startEvent({ title: _('cloud save'), scenes: { start: { text: text, buttons: buttons } } });
		}
		function button(text, fn) { return { text: _(text), nextScene: 'end', onChoose: fn || function() {} }; }
		function describe(label, state) {
			var s = summary(state);
			return _(label, s.wood == null ? _('unknown') : s.wood, s.huts == null ? _('unknown') : s.huts, s.population == null ? _('unknown') : s.population);
		}
		function showConflict() {
			// Wait while the cloud window covers the screen; the dialog would be hidden under it.
			if(suspended || !pending || Engine.keyLock || busy || document.getElementById('kotoka-cloud-slots')) return;
			var cloud = pending; pending = null;
			var date = new Date(cloud.updatedAt);
			dialog([_('choose which save to keep.'), _('cloud updated: {0}', isNaN(date.getTime()) ? _('unknown') : date.toLocaleString()),
				describe('cloud — wood: {0}, huts: {1}, population: {2}', cloud.state),
				describe('this browser — wood: {0}, huts: {1}, population: {2}', local())], {
				cloud: button('use cloud save', function() { download(cloud); }),
				browser: button('keep this browser’s save', function() { run(function() { return upload(cloud.revision, false); }); })
			});
		}
		async function upload(base, keepalive) {
			var state = local();
			if(state == null) return;
			var response = await request('/api/save', { method: 'PUT', keepalive: !!keepalive,
				headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseRevision: base, state: state }) });
			if(response.status === 409) { ready = false; error = 'conflict'; await reconcile(); return; }
			if(!response.ok) throw new Error(response.status === 413 ? 'save too large' : 'offline');
			var saved = await response.json(); adopt(state, saved.revision);
		}
		async function reconcile() {
			ready = false;
			var response = await request('/api/save');
			if(!response.ok && response.status !== 404) throw new Error('offline');
			var cloud = response.status === 404 ? null : await response.json(), state = local();
			if(suspended) return;
			var action = decide({ local: state, meta: meta, cloud: cloud, uid: user.uid });
			if(action === 'download') download(cloud);
			else if(action === 'upload') await upload(cloud ? cloud.revision : null, false);
			else if(action === 'adopt' || action === 'synced') adopt(state, cloud.revision);
			else if(action === 'empty') { meta = null; ready = true; error = ''; }
			else { error = 'conflict'; pending = cloud; }
		}
		async function run(fn) {
			if(suspended || busy) return;
			busy = true; render();
			try { await fn(); } catch(e) { fail(e); }
			finally { busy = false; render(); showConflict(); }
		}
		function sync(keepalive) {
			if(suspended || loggedOut) return;
			return run(async function() {
				if(!user) {
					var response = await request('/api/me');
					if(!response.ok) throw new Error('offline');
					user = await response.json(); meta = metadata(localStorage.getItem(metaKey), user.uid);
				}
				if(!ready) { if(!pending && !Engine.keyLock) await reconcile(); return; }
				var state = local();
				if(state != null && (!meta || hash(state) !== meta.hash)) await upload(meta ? meta.revision : null, keepalive);
			});
		}
		menu.on('click', function() {
			if(!user) { location.href = '/api/login'; return; }
			if(Engine.keyLock) return;
			Kotoka.CloudSlots.open();
		});
		// Upstream restart clears all of localStorage; keep this site's settings (hotkeys, cloud sync baseline).
		var deleteSave = Engine.deleteSave;
		Engine.deleteSave = function(noReload) {
			var keep = Object.keys(localStorage).filter(function(k) { return k.indexOf('kotoka.') === 0; })
				.map(function(k) { return [k, localStorage.getItem(k)]; });
			deleteSave.call(Engine, true);
			keep.forEach(function(kv) { localStorage.setItem(kv[0], kv[1]); });
			if(!noReload) location.reload();
		};
		var interval = parseInterval(localStorage.getItem('kotoka.cloudInterval')), timer;
		api.getInterval = function() { return interval; };
		api.setInterval = function(minutes) {
			if(suspended) return;
			interval = parseInterval(minutes);
			localStorage.setItem('kotoka.cloudInterval', String(interval));
			clearInterval(timer);
			timer = root.setInterval(function() { sync(false); }, interval * 60000);
		};
		api.status = function() { return { lastSync: lastSync || null, error: error, busy: busy }; };
		api.suspend = function() { suspended = true; clearInterval(timer); pending = null; };
		api.syncNow = function() { return sync(false); };
		api.logout = function() { location.href = '/outpost.goauthentik.io/sign_out'; };
		api.setInterval(interval);
		setInterval(showConflict, 1000);
		document.addEventListener('visibilitychange', function() { if(document.hidden) sync(false); });
		root.addEventListener('pagehide', function() { sync(true); });
		api.sync = sync;
		render(); sync(false);
	});
})(typeof window !== 'undefined' ? window : globalThis);
