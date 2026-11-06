(function(root) {
	if(root.Kotoka) root.Kotoka.addStrings({ zh_cn: {
		'Cloud Saves': '云存档', 'auto-save': '自动存档', 'auto-save every': '自动存档间隔',
		'{0} min': '{0} 分钟', 'new save': '新建存档', 'rename': '重命名', 'untitled': '未命名',
		'previous': '上一页', 'next': '下一页', 'page {0} / {1}': '第 {0}/{1} 页',
		'all 19 save slots are in use.': '19 个存档位已用完.', 'save': '保存', 'ok': '确定', 'cancel': '取消',
		'invalid name': '名称须为 1–40 个字符，且不能含控制字符',
		'load': '读取', 'overwrite': '覆盖', 'delete': '删除',
		'load this slot?': '读取这个存档位?', 'overwrite this slot?': '覆盖这个存档位?', 'delete this slot?': '删除这个存档位?',
		'failed': '操作失败', 'wood: {0}, huts: {1}, population: {2}': '木头：{0}，小屋：{1}，人口：{2}'
	} });
	function validSlot(n) { return Number.isInteger(n) && n >= 1 && n <= 19; }
	function formatDate(value) {
		var d = new Date(value);
		if(value == null || isNaN(d.getTime())) return null;
		function pad(n) { return String(n).padStart(2, '0'); }
		return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
	}
	function validateName(value) {
		if(typeof value !== 'string') return null;
		value = value.trim();
		return value && Array.from(value).length <= 40 && !/[\x00-\x1f\x7f-\x9f]/.test(value) ? value : null;
	}
	function freeSlot(slots) {
		for(var n = 1; n <= 19; n++) if(!slots.some(function(s) { return s.slot === n; })) return n;
		return null;
	}
	function pageModel(slots, auto, page) {
		var rows = [{ auto: true, saved: auto }].concat(slots.filter(function(s) { return validSlot(s.slot); }).slice().sort(function(a, b) { return new Date(b.updatedAt) - new Date(a.updatedAt) || a.slot - b.slot; }));
		var total = Math.ceil(rows.length / 5);
		page = Math.max(1, Math.min(total, page || 1));
		return { rows: rows.slice((page - 1) * 5, page * 5), page: page, total: total };
	}
	var api = { validSlot: validSlot, formatDate: formatDate, validateName: validateName, freeSlot: freeSlot, pageModel: pageModel };
	if(typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
	root.Kotoka.CloudSlots = api;
	var panel, previousFocus, busy = false, list, status, syncStatus, nav, newButton, hint, slots = [], auto, page = 1;
	function close() {
		if(!panel || busy) return;
		panel.remove(); panel = null;
		if(previousFocus) previousFocus.focus();
	}
	function button(parent, label, action) { return $('<button type="button">').text(_(label)).appendTo(parent).on('click', action); }
	function controls() {
		if(!panel) return;
		panel.find('button').each(function() { $(this).prop('disabled', busy || !!$(this).data('unavailable')); });
	}
	async function request(path, options) {
		var response = await Kotoka.CloudSave.request(path, options);
		if(path === '/api/save' && response.status === 404) return null;
		if(!response.ok) { var e = new Error(response.status === 413 ? 'save too large' : 'failed'); e.status = response.status; throw e; }
		return response.json();
	}
	function body(method, value) { return { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }; }
	async function run(action) {
		if(busy || !panel) return;
		busy = true; controls(); status.empty();
		try { await action(); }
		catch(e) {
			if(!Kotoka.CloudSave.isLoggedIn()) { busy = false; close(); return; }
			status.text(_(e.message === 'save too large' ? e.message : e instanceof TypeError ? 'offline' : 'failed'));
		} finally { busy = false; controls(); }
	}
	function renderStatus() {
		var s = Kotoka.CloudSave.status();
		syncStatus.text(s.error ? _(s.error) : s.lastSync ? _('last synced: {0}', formatDate(s.lastSync).slice(11)) : _('not synced yet'));
	}
	async function refresh() {
		slots = (await request('/api/slots')).slots;
		auto = await request('/api/save');
		render(); renderStatus();
	}
	function edit(parent, initial, placeholder, submit, cancel) {
		parent.empty();
		var input = $('<input type="text" maxlength="80">').val(initial).attr('placeholder', placeholder).appendTo(parent);
		function save() {
			if(busy) return;
			var name = validateName(input.val().trim() || placeholder);
			if(!name) { status.text(_('invalid name')); return; }
			submit(name);
		}
		button(parent, placeholder ? 'save' : 'ok', save); button(parent, 'cancel', cancel);
		input.on('keydown keyup', function(e) {
			e.stopPropagation();
			if(e.type === 'keydown' && e.key === 'Enter') { e.preventDefault(); save(); }
			if(e.key === 'Escape') { e.preventDefault(); if(e.type === 'keyup' && !busy) cancel(); }
		});
		input.focus();
	}
	function render() {
		list.empty(); nav.empty();
		var model = pageModel(slots, auto, page); page = model.page;
		newButton.data('unavailable', freeSlot(slots) === null);
		hint.text(freeSlot(slots) === null ? _('all 19 save slots are in use.') : '');
		model.rows.forEach(function(row) {
			var saved = row.auto ? row.saved : row;
			var element = $('<div class="kotoka-slot-row">').appendTo(list);
			var info = $('<div class="kotoka-slot-info">').appendTo(element);
			var name = $('<p>').text(row.auto ? _('auto-save') : row.name || _('untitled')).appendTo(info);
			if(saved) {
				var s = row.auto ? Kotoka.CloudSave.summary(saved.state) : saved.summary || {};
				function count(v) { return typeof v === 'number' && Number.isFinite(v) ? v : _('unknown'); }
				$('<p>').text((formatDate(saved.updatedAt) || _('unknown')) + ' — ' + _('wood: {0}, huts: {1}, population: {2}', count(s.wood), count(s.huts), count(s.population))).appendTo(info);
			} else $('<p>').text(_('not synced yet')).appendTo(info);
			var actions = $('<div>').appendTo(element);
			function execute(kind) {
				run(async function() {
					var path = '/api/slots/' + row.slot;
					if(kind === 'load') { var data = row.auto ? saved : await request(path); Kotoka.CloudSave.replaceLocalSave(data.state); return; }
					if(kind === 'delete') await request(path, { method: 'DELETE' });
					else {
						Engine.saveGame(); var state = localStorage.getItem('gameState');
						await request(path, body('PUT', { state: state, summary: Kotoka.CloudSave.summary(state), name: row.name || formatDate(new Date()) }));
					}
					await refresh();
				});
			}
			function actionsView() {
				actions.empty();
				(saved ? row.auto ? ['load'] : ['load', 'overwrite', 'rename', 'delete'] : []).forEach(function(kind) {
					button(actions, kind, function() {
						if(kind === 'rename') { edit(name, row.name || '', '', function(value) { run(async function() { await request('/api/slots/' + row.slot, body('PATCH', { name: value })); await refresh(); }); }, render); return; }
						actions.empty(); $('<span>').text(_(kind + ' this slot?')).appendTo(actions);
						button(actions, 'yes', function() { execute(kind); }); button(actions, 'no', actionsView);
					});
				});
			}
			actionsView();
		});
		if(model.total > 1) {
			button(nav, 'previous', function() { page--; render(); }).data('unavailable', page === 1);
			$('<span>').text(_('page {0} / {1}', page, model.total)).appendTo(nav);
			button(nav, 'next', function() { page++; render(); }).data('unavailable', page === model.total);
		}
		controls();
	}
	function create() {
		if(list.find('input').length) return;
		var row = $('<div class="kotoka-slot-row">').prependTo(list);
		edit(row, '', formatDate(new Date()), function(name) {
			run(async function() {
				Engine.saveGame(); var state = localStorage.getItem('gameState');
				for(var attempt = 0; attempt < 2; attempt++) {
					var slot = freeSlot(slots);
					if(slot === null) { render(); return; }
					try { await request('/api/slots/' + slot, body('PUT', { state: state, summary: Kotoka.CloudSave.summary(state), name: name, create: true })); break; }
					catch(e) { if(e.status !== 409 || attempt) throw e; slots = (await request('/api/slots')).slots; }
				}
				page = 1; await refresh();
			});
		}, render);
	}
	api.open = function() {
		if(panel || !Kotoka.CloudSave.isLoggedIn()) return;
		previousFocus = document.activeElement; page = 1;
		panel = $('<div id="kotoka-cloud-slots" role="dialog" aria-modal="true" tabindex="-1">').attr('aria-label', _('Cloud Saves')).appendTo('body');
		var bg = $('body').css('background-color');
		panel.css('background-color', /^(transparent|rgba\(0, 0, 0, 0\))$/.test(bg) ? '#fff' : bg);
		$('<h2>').text(_('Cloud Saves')).appendTo(panel);
		syncStatus = $('<p>').appendTo(panel); renderStatus();
		var interval = $('<div>').text(_('auto-save every') + ' ').appendTo(panel);
		[1, 5, 10].forEach(function(n) {
			button(interval, '', function() { Kotoka.CloudSave.setInterval(n); interval.find('button').attr('aria-pressed', 'false'); $(this).attr('aria-pressed', 'true'); }).text(_('{0} min', n)).attr('aria-pressed', String(n === Kotoka.CloudSave.getInterval()));
		});
		button(panel, 'sync now', function() { run(async function() { await Kotoka.CloudSave.syncNow(); await refresh(); }); });
		newButton = button(panel, 'new save', create);
		button(panel, 'log out', function() { Kotoka.CloudSave.logout(); });
		hint = $('<p>').appendTo(panel); status = $('<p role="status">').appendTo(panel);
		list = $('<div>').appendTo(panel); nav = $('<div>').appendTo(panel);
		button(panel, 'close', close); panel[0].focus(); run(refresh);
	};
	['keydown', 'keyup'].forEach(function(type) {
		root.addEventListener(type, function(e) {
			if(!panel) return;
			var inside = $(e.target).closest('#kotoka-cloud-slots').length > 0;
			if(inside && e.target.tagName === 'INPUT') return;
			e.stopImmediatePropagation();
			if(!inside || !/^(Tab|Enter|NumpadEnter|Space)$/.test(e.code)) e.preventDefault();
			if(type === 'keyup' && e.code === 'Escape' && !panel.find('input').length) close();
		}, true);
	});
})(typeof window !== 'undefined' ? window : globalThis);
