(function(root) {
	if(root.Kotoka) root.Kotoka.addStrings({ zh_cn: {
		'Cloud Slots': '云存档位', 'loading': '加载中', 'retry': '重试',
		'empty': '空', 'load': '读取', 'overwrite': '覆盖', 'delete': '删除',
		'save here': '存到这里', 'load this slot?': '读取这个存档位?',
		'overwrite this slot?': '覆盖这个存档位?', 'delete this slot?': '删除这个存档位?',
		'failed': '操作失败', 'wood: {0}, huts: {1}, population: {2}': '木头：{0}，小屋：{1}，人口：{2}'
	} });
	function validSlot(n) { return Number.isInteger(n) && n >= 1 && n <= 20; }
	function formatDate(value) {
		var d = new Date(value);
		if(!value || isNaN(d.getTime())) return null;
		function pad(n) { return String(n).padStart(2, '0'); }
		return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
	}
	function rows(response) {
		return Array.from({ length: 20 }, function(_, i) {
			var slot = i + 1, saved = response.slots.find(function(s) { return validSlot(s.slot) && s.slot === slot; });
			return { slot: slot, occupied: !!saved, date: saved ? formatDate(saved.updatedAt) : null, summary: saved && saved.summary || {} };
		});
	}
	var api = { validSlot: validSlot, formatDate: formatDate, rows: rows };
	if(typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
	root.Kotoka.CloudSlots = api;
	var panel, previousFocus, busy = false, generation = 0, list, status;
	function close() {
		if(!panel) return;
		panel.remove(); panel = null; generation++; busy = false;
		if(previousFocus) previousFocus.focus();
	}
	function button(parent, label, action) {
		return $('<button type="button">').text(_(label)).appendTo(parent).on('click', action);
	}
	async function request(path, options) {
		var response = await Kotoka.CloudSave.request(path, options);
		if(!response.ok) throw new Error(response.status === 413 ? 'save too large' : 'failed');
		return response.json();
	}
	async function run(action) {
		if(busy || !panel) return;
		var token = generation;
		busy = true; panel.find('button').prop('disabled', true); status.empty();
		try { await action(token); }
		catch(e) {
			if(token !== generation) return;
			if(!Kotoka.CloudSave.isLoggedIn()) { close(); return; }
			status.text(_(e.message === 'save too large' ? 'save too large' : e instanceof TypeError ? 'offline' : 'failed'));
			button(status, 'retry', function() { run(action); });
		} finally {
			if(token === generation && panel) { busy = false; panel.find('button').prop('disabled', false); }
		}
	}
	async function refresh(token) {
		status.text(_('loading'));
		var data = await request('/api/slots');
		if(token !== generation) return;
		status.empty(); list.empty();
		rows(data).forEach(function(model) {
			var row = $('<div class="kotoka-slot-row">').appendTo(list), s = model.summary;
			function count(v) { return typeof v === 'number' && Number.isFinite(v) ? v : _('unknown'); }
			$('<p>').text(model.slot + ' — ' + (model.occupied ? (model.date || _('unknown')) + ' — ' + _('wood: {0}, huts: {1}, population: {2}', count(s.wood), count(s.huts), count(s.population)) : _('empty'))).appendTo(row);
			var actions = $('<div>').appendTo(row);
			function execute(kind) {
				run(async function(token) {
					var path = '/api/slots/' + model.slot;
					if(kind === 'load') {
						var saved = await request(path);
						if(token === generation) Kotoka.CloudSave.replaceLocalSave(saved.state);
						return;
					}
					if(kind === 'delete') await request(path, { method: 'DELETE' });
					else {
						Engine.saveGame();
						var state = localStorage.getItem('gameState');
						await request(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: state, summary: Kotoka.CloudSave.summary(state) }) });
					}
					if(token === generation) await refresh(token);
				});
			}
			function controls() {
				actions.empty();
				(model.occupied ? ['load', 'overwrite', 'delete'] : ['save here']).forEach(function(kind) {
					button(actions, kind, function() {
						if(!model.occupied) { execute(kind); return; }
						actions.empty(); $('<span>').text(_(kind + ' this slot?') + ' ').appendTo(actions);
						button(actions, 'yes', function() { execute(kind); }); button(actions, 'no', controls);
					});
				});
			}
			controls();
		});
	}
	api.open = function() {
		if(panel || !Kotoka.CloudSave.isLoggedIn()) return;
		previousFocus = document.activeElement;
		panel = $('<div id="kotoka-cloud-slots" role="dialog" aria-modal="true" tabindex="-1">').attr('aria-label', _('Cloud Slots')).appendTo('body');
		var bg = $('body').css('background-color');
		panel.css('background-color', /^(transparent|rgba\(0, 0, 0, 0\))$/.test(bg) ? '#fff' : bg);
		$('<h2>').text(_('Cloud Slots')).appendTo(panel);
		status = $('<p role="status">').appendTo(panel); list = $('<div>').appendTo(panel);
		button(panel, 'close', close); panel[0].focus(); run(refresh);
	};
	// Window capture precedes both the game's body handlers and hotkeys' document capture.
	['keydown', 'keyup'].forEach(function(type) {
		root.addEventListener(type, function(e) {
			if(!panel) return;
			e.stopImmediatePropagation();
			// Keep keyboard navigation of the panel's own buttons; block everything else.
			var inPanel = $(e.target).closest('#kotoka-cloud-slots').length > 0;
			if(!inPanel || !/^(Tab|Enter|NumpadEnter|Space)$/.test(e.code)) e.preventDefault();
			if(type === 'keyup' && e.code === 'Escape') close();
		}, true);
	});
})(typeof window !== 'undefined' ? window : globalThis);
