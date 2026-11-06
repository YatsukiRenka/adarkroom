(function(root) {
	function decide(previous, id, timestamp, isAuto, modded) {
		if(modded === false) return { action: 'pass', state: null };
		if(isAuto) return { action: 'auto-off', state: null };
		if(id == null) return { action: 'pass', state: null };
		if(previous && previous.id === id && timestamp - previous.timestamp <= 350) {
			return { action: 'auto-on', state: null };
		}
		return { action: 'pass', state: { id: id, timestamp: timestamp } };
	}
	if(typeof module !== 'undefined' && module.exports) { module.exports = { decide: decide }; return; }
	root.Kotoka.autoRepeatDecision = decide;
Kotoka.addStrings({ zh_cn: { 'auto': '自动' } });

$(function() {
	var active = new Set();
	var tracking = null;
	var guards = {
		stokeButton: function() { return $SM.get('game.fire.value') < Room.FireEnum.Roaring.value; }
	};
	function press(btn) {
		btn = $(btn);
		if(!btn.length || btn.hasClass('disabled')) return false;
		Button.cooldown(btn);
		btn.data('handler')(btn);
		return true;
	}
	function stop(el) {
		active.delete(el);
		$(el).removeClass('auto').removeAttr('data-auto');
	}
	function toggle(btn) {
			if(!Kotoka.Mode.isModded()) return;
		btn = $(btn);
		if(!btn.length || !(btn.data('cooldown') > 0) || !document.documentElement.contains(btn[0])) return;
		if(active.has(btn[0])) stop(btn[0]);
		else {
			active.add(btn[0]);
			btn.addClass('auto').attr('data-auto', _('auto'));
		}
	}
	window.addEventListener('blur', function() { tracking = null; });
	document.addEventListener('click', function(e) {
			if(!Kotoka.Mode.isModded()) return;
		var btn = $(e.target).closest('div.button');
		var el = btn.data('cooldown') > 0 ? btn[0] : null;
		var result = decide(tracking, el, Date.now(), active.has(el));
		tracking = result.state;
		if(result.action !== 'pass') {
			toggle(el);
			e.preventDefault();
			e.stopImmediatePropagation();
		}
	}, true);
	new MutationObserver(function(records) {
		records.forEach(function(record) {
			Array.prototype.forEach.call(record.removedNodes, function(node) {
				active.forEach(function(el) { if(node === el || node.contains(el)) stop(el); });
			});
		});
	}).observe(document.body, { childList: true, subtree: true });
	setInterval(function() {
			if(!Kotoka.Mode.isModded()) return;
		active.forEach(function(el) {
			if(!document.documentElement.contains(el)) return stop(el);
			if($(el).is(':visible') && (!guards[el.id] || guards[el.id]())) press(el);
		});
	}, 200);
	Kotoka.AutoRepeat = { press: press, toggle: toggle, isAuto: function(btn) { return active.has($(btn)[0]); } };
});
})(typeof window !== 'undefined' ? window : globalThis);
