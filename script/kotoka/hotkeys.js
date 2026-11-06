(function(root) {
	var actions = [];
	for(var i = 1; i <= 6; i++) actions.push({ id: 'attack' + i, label: 'attack ' + i, code: 'Digit' + i, index: i - 1 });
	[['eat', 'eat meat', '#eat', 'KeyE'], ['meds', 'use meds', '#meds', 'KeyR'],
		['hypo', 'use hypo', '#hypo', 'KeyT'], ['stim', 'boost', '#use-stim', 'KeyF'],
		['shield', 'shield', '#shld', 'KeyG'], ['takeAll', 'take everything', '#loot_takeEverything', 'Space'],
		['leave', 'leave', '#leaveBtn', 'Enter']].forEach(function(a) {
		actions.push({ id: a[0], label: a[1], selector: a[2], code: a[3] });
	});
	function rebind(bindings, id, code) {
		var result = Object.assign({}, bindings);
		Object.keys(result).forEach(function(key) { if(code && result[key] === code) result[key] = null; });
		result[id] = code;
		return result;
	}
	function load(raw) {
		var saved;
		try { saved = JSON.parse(raw); } catch(e) { saved = null; }
		if(!saved || typeof saved !== 'object' || Array.isArray(saved) ||
			actions.some(function(a) { return Object.prototype.hasOwnProperty.call(saved, a.id) && saved[a.id] !== null && (typeof saved[a.id] !== 'string' || !saved[a.id].trim()); })) saved = {};
		var result = {};
		// Explicit bindings win over defaults introduced by newer versions.
		actions.filter(function(a) { return !Object.prototype.hasOwnProperty.call(saved, a.id); }).forEach(function(a) { result = rebind(result, a.id, a.code); });
		actions.filter(function(a) { return Object.prototype.hasOwnProperty.call(saved, a.id); }).forEach(function(a) { result = rebind(result, a.id, saved[a.id]); });
		return result;
	}
	function display(code) {
		if(!code) return '';
		var arrows = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
		return arrows[code] || code.replace(/^Digit(?=\d$)/, '').replace(/^Key(?=[A-Z]$)/, '').replace(/^Numpad/, 'Num');
	}
	var logic = { load: load, rebind: rebind, display: display };
	if(typeof module !== 'undefined' && module.exports) { module.exports = logic; return; }
	root.Kotoka.addStrings({ zh_cn: {
		'use hypo': '注射药剂', 'boost': '强化', 'shield': '护盾',
		'hotkeys.': '快捷键.', 'Hotkeys': '快捷键', 'attack 1': '攻击 1', 'attack 2': '攻击 2', 'attack 3': '攻击 3',
		'attack 4': '攻击 4', 'attack 5': '攻击 5', 'attack 6': '攻击 6',
		'reset to defaults': '恢复默认', 'unbound': '未绑定',
		'press a key (Escape cancels; Backspace or Delete unbinds)': '请按键（Esc 取消，退格或 Delete 解除绑定）',
		'hold a button or its hotkey for half a second to toggle auto mode.': '长按按钮或其快捷键半秒即可切换自动模式.'
	} });
	$(function() {
		var raw;
		try { raw = localStorage.getItem('kotoka.hotkeys'); } catch(e) {}
		var bindings = load(raw), panel, waiting, previousFocus;
		var held = new Map();
		function target(a) {
			return a.selector ? $('#event').find(a.selector).first() : $('#event #attackButtons .button').eq(a.index);
		}
		function hints() {
			$('#event [data-hotkey]').removeAttr('data-hotkey');
			actions.forEach(function(a) { if(bindings[a.id]) target(a).attr('data-hotkey', display(bindings[a.id])); });
		}
		function save() {
			try { localStorage.setItem('kotoka.hotkeys', JSON.stringify(bindings)); } catch(e) {}
			hints();
			renderRows();
		}
		function cancelHolds() { held.forEach(clearTimeout); held.clear(); }
		function close() { panel.remove(); panel = null; waiting = null; if(previousFocus) previousFocus.focus(); }
		function renderRows() {
			panel.find('[data-action]').each(function() {
				var id = $(this).attr('data-action');
				$(this).find('span').last().text(waiting === id ? _('press a key (Escape cancels; Backspace or Delete unbinds)') : (display(bindings[id]) || _('unbound')));
			});
		}
		function open() {
			if(panel) return;
			cancelHolds();
			previousFocus = document.activeElement;
			panel = $('<div id="kotoka-hotkeys" role="dialog" aria-modal="true" tabindex="-1">').attr('aria-label', _('Hotkeys')).appendTo('body');
			var bg = $('body').css('background-color');
			panel.css('background-color', /^(transparent|rgba\(0, 0, 0, 0\))$/.test(bg) ? '#fff' : bg);
			$('<h2>').text(_('Hotkeys')).appendTo(panel);
			$('<p>').text(_('hold a button or its hotkey for half a second to toggle auto mode.')).appendTo(panel);
			actions.forEach(function(a) {
				var row = $('<button type="button" class="kotoka-key-row">').attr('data-action', a.id).appendTo(panel);
				$('<span>').text(_(a.label)).appendTo(row);
				$('<span>').appendTo(row);
				row.on('click', function() { waiting = a.id; renderRows(); });
			});
			$('<button type="button">').text(_('reset to defaults')).appendTo(panel).on('click', function() { bindings = load(null); waiting = null; save(); });
			$('<button type="button">').text(_('close')).appendTo(panel).on('click', close);
			renderRows();
			panel[0].focus();
		}
		$('<span class="menuBtn">').text(_('hotkeys.')).appendTo('.menu').on('click', open);
		function block(e) { e.preventDefault(); e.stopImmediatePropagation(); }
		document.addEventListener('keydown', function(e) {
			if(panel) {
				block(e);
				if(e.repeat) return;
				held.set(e.code, null);
				if(waiting) {
					if(e.code !== 'Escape') bindings = rebind(bindings, waiting, /^(Backspace|Delete)$/.test(e.code) ? null : e.code);
					waiting = null; save();
				} else if(e.code === 'Escape') close();
				return;
			}
			if(held.has(e.code)) { block(e); return; }
			if(e.repeat || e.ctrlKey || e.altKey || e.metaKey || $(e.target).closest('input, textarea, select').length || e.target.isContentEditable) return;
			var action = actions.find(function(a) { return bindings[a.id] === e.code; });
			if(!action) return;
			var btn = target(action);
			if(!btn.length) return;
			block(e);
			Kotoka.AutoRepeat.press(btn);
			held.set(e.code, setTimeout(function() {
				if(target(action)[0] === btn[0]) Kotoka.AutoRepeat.toggle(btn);
			}, 500));
		}, true);
		document.addEventListener('keyup', function(e) {
			if(panel || held.has(e.code)) block(e);
			clearTimeout(held.get(e.code)); held.delete(e.code);
		}, true);
		window.addEventListener('blur', cancelHolds);
		new MutationObserver(hints).observe(document.getElementById('wrapper') || document.body, { childList: true, subtree: true });
		hints();
		Kotoka.Hotkeys = { _logic: logic };
	});
})(typeof window !== 'undefined' ? window : globalThis);
