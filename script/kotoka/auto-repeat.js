Kotoka.addStrings({ zh_cn: { 'auto': '自动' } });

$(function() {
	var active = new Set();
	var hold, swallowed;
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
		btn = $(btn);
		if(!btn.length || !(btn.data('cooldown') > 0) || !document.documentElement.contains(btn[0])) return;
		if(active.has(btn[0])) stop(btn[0]);
		else {
			active.add(btn[0]);
			btn.addClass('auto').attr('data-auto', _('auto'));
		}
	}
	function cancel() {
		if(hold) clearTimeout(hold.timer);
		hold = null;
	}
	document.addEventListener('mousedown', function(e) {
		if(e.button !== 0) return;
		cancel();
		swallowed = null;
		var btn = $(e.target).closest('div.button');
		if(!(btn.data('cooldown') > 0)) return;
		hold = { el: btn[0], timer: setTimeout(function() {
			swallowed = btn[0];
			toggle(btn);
		}, 500) };
	}, true);
	document.addEventListener('mouseout', function(e) {
		if(hold && hold.el.contains(e.target) && (!e.relatedTarget || !hold.el.contains(e.relatedTarget))) cancel();
	}, true);
	document.addEventListener('mouseup', cancel, true);
	window.addEventListener('blur', cancel);
	document.addEventListener('click', function(e) {
		var el = $(e.target).closest('div.button')[0];
		if(el && (el === swallowed || active.has(el))) {
			if(el !== swallowed) stop(el);
			e.preventDefault();
			e.stopImmediatePropagation();
		}
		swallowed = null;
	}, true);
	new MutationObserver(function(records) {
		records.forEach(function(record) {
			Array.prototype.forEach.call(record.removedNodes, function(node) {
				active.forEach(function(el) { if(node === el || node.contains(el)) stop(el); });
			});
		});
	}).observe(document.body, { childList: true, subtree: true });
	setInterval(function() {
		active.forEach(function(el) {
			if(!document.documentElement.contains(el)) return stop(el);
			if($(el).is(':visible') && (!guards[el.id] || guards[el.id]())) press(el);
		});
	}, 200);
	Kotoka.AutoRepeat = { press: press, toggle: toggle, isAuto: function(btn) { return active.has($(btn)[0]); } };
});
