// Phones and other narrow screens. The game layout is a fixed 700px design plus a 220px
// notification column. Below DESKTOP_MIN width (css/kotoka.css does the styling):
// - `kotoka-dock` (both orientations): the footer menu becomes a one-row dock of small buttons
//   fixed to the top, with an English/中文 toggle instead of the hover language list; while
//   exploring the map is centred (or, when it does not fit, the wanderer); tapping a row with tiny
//   up/down arrows (workers, outfitting) opens a stepper with big buttons.
// - `kotoka-landscape`: desktop layout (log column on the left) scaled to the screen width.
// - `kotoka-narrow` (portrait): only the 700px game is scaled; the notification log is moved out of
//   the zoomed #wrapper and fixed to the bottom of the screen at a readable size.
// Space flight only had keyboard controls; on touch screens the ship follows the finger.
(function() {
	var DESKTOP_MIN = 940; // 220px notification column + 700px game + margins
	var DESIGN_WIDTH = 716; // portrait: 700px game + 8px padding on each side
	var LANDSCAPE_WIDTH = 940; // landscape: the whole desktop layout
	var STEPS = [['dnManyBtn', '−10'], ['dnBtn', '−1'], ['upBtn', '+1'], ['upManyBtn', '+10']];

	function isNarrow() {
		return document.body.classList.contains('kotoka-narrow');
	}

	function isDock() {
		return document.body.classList.contains('kotoka-dock');
	}

	// Mobile browsers widen the layout viewport to fit wide content, so innerWidth alone can
	// report the unscaled 716px; the device's CSS width (screen.width) caps it.
	function screenWidth() {
		return Math.min(window.innerWidth, window.screen && screen.width || window.innerWidth);
	}

	function themeBackground() {
		var bg = getComputedStyle(document.body).backgroundColor;
		return /^(transparent|rgba\(0, 0, 0, 0\))$/.test(bg) ? '#fff' : bg;
	}

	function fit() {
		var width = screenWidth();
		var compact = width < DESKTOP_MIN;
		var landscape = compact && window.matchMedia('(orientation: landscape)').matches;
		var portrait = compact && !landscape;
		var classes = document.body.classList;
		classes.toggle('kotoka-dock', compact);
		classes.toggle('kotoka-landscape', landscape);
		classes.toggle('kotoka-narrow', portrait);
		var zoom = portrait ? Math.min(1, width / DESIGN_WIDTH) : landscape ? Math.min(1, width / LANDSCAPE_WIDTH) : 1;
		document.documentElement.style.setProperty('--kotoka-zoom', String(zoom));
		placeLog(portrait);
		stripDots();
		layout();
	}

	// Menu labels end with '.' ('save.', '保存.' ...), which looks off on dock buttons. The game
	// rewrites some labels (sound, speed, cloud), so this runs on every change of the menu.
	function stripDots() {
		if(!isDock()) return;
		$('.menu > span').each(function() {
			var text = this.textContent;
			if(this.children.length === 0 && /[.。]$/.test(text)) this.textContent = text.replace(/[.。]+$/, '');
		});
	}

	// Only English and 简体中文 remain, so the dock offers a one-tap switch to the other one.
	function addLanguageToggle() {
		var menu = $('.menu');
		if(!menu.length || menu.find('.kotoka-lang').length) return;
		var other = window.lang === 'zh_cn' ? 'en' : 'zh_cn';
		$('<span class="menuBtn kotoka-lang">').text(other === 'en' ? 'English' : '中文').prependTo(menu)
			.on('click', function() { Engine.switchLanguage($('<li>').attr('data-language', other)[0]); });
	}

	// Notifications.notify finds the log by id, so moving the element keeps it working.
	function placeLog(narrow) {
		var log = document.getElementById('notifications'), wrapper = document.getElementById('wrapper');
		if(!log || !wrapper) return;
		var parent = narrow ? document.body : wrapper;
		if(log.parentNode !== parent) parent.appendChild(log);
		log.style.backgroundColor = narrow ? themeBackground() : '';
	}

	function logHeight() {
		var log = document.getElementById('notifications');
		return isNarrow() && log ? log.offsetHeight : 0;
	}

	function menuHeight() {
		var menu = document.querySelector('.menu');
		return isDock() && menu ? menu.offsetHeight : 0;
	}

	// Padding = fixed menu (top) and log (bottom); while exploring, extra space centres the map.
	function layout() {
		var body = document.body, menu = document.querySelector('.menu');
		if(menu) menu.style.backgroundColor = isDock() ? themeBackground() : '';
		var log = document.getElementById('notifications');
		if(log && isNarrow()) log.style.backgroundColor = themeBackground();
		var top = menuHeight(), bottom = logHeight();
		var exploring = isDock() && typeof World !== 'undefined' && Engine.activeModule === World;
		body.style.paddingTop = top ? top + 'px' : '';
		body.style.paddingBottom = exploring ? 'calc(60vh + ' + bottom + 'px)' : bottom ? bottom + 'px' : '';
		var map = document.getElementById('map');
		if(!exploring || !map) return;

		var avail = window.innerHeight - top - bottom, centre = top + avail / 2;
		var box = map.getBoundingClientRect(), target = box;
		if(box.height > avail) {
			// Map taller than the screen (e.g. landscape): keep the wanderer centred instead.
			var me = $('#map .landmark').filter(function() { return this.firstChild && this.firstChild.nodeValue === '@'; })[0];
			if(me) target = me.getBoundingClientRect();
		}
		var docCentre = target.top + window.scrollY + target.height / 2;
		var extra = Math.max(0, centre - docCentre);
		body.style.paddingTop = (top + extra) + 'px';
		window.scrollTo(window.scrollX, Math.max(0, docCentre + extra - centre));
	}

	function steer(e) {
		if(typeof Space === 'undefined' || Engine.activeModule !== Space || !Space.ship) return;
		var touch = e.touches[0];
		if(!touch) return;
		var r = Space.ship[0].getBoundingClientRect();
		var cx = r.left + r.width / 2, cy = r.top + r.height / 2, dead = 10;
		Space.left = touch.clientX < cx - dead;
		Space.right = touch.clientX > cx + dead;
		Space.up = touch.clientY < cy - dead;
		Space.down = touch.clientY > cy + dead;
		e.preventDefault();
	}

	function release() {
		if(typeof Space === 'undefined' || Engine.activeModule !== Space) return;
		Space.up = Space.down = Space.left = Space.right = false;
	}

	// Stepper: big buttons that click the row's own (tiny) arrow buttons.
	var stepper = null;

	function closeStepper() {
		if(stepper) stepper.remove();
		stepper = null;
	}

	function openStepper(row) {
		closeStepper();
		var id = row.attr('id');
		function current() { return id ? $('#' + id) : row; }
		stepper = $('<div id="kotoka-stepper" role="dialog">').css('background-color', themeBackground()).appendTo('body');
		var name = $('<div class="kotoka-stepper-name">').appendTo(stepper);
		var value = $('<div class="kotoka-stepper-value">').appendTo(stepper);
		var buttons = $('<div class="kotoka-stepper-buttons">').appendTo(stepper);
		STEPS.forEach(function(step) {
			if(!row.find('.' + step[0]).length) return;
			$('<button type="button">').text(step[1]).attr('data-step', step[0]).appendTo(buttons).on('click', function() {
				current().find('.' + step[0]).first().click();
				refresh();
			});
		});
		$('<button type="button" class="kotoka-stepper-close">').text(_('close')).appendTo(stepper).on('click', closeStepper);
		function refresh() {
			var r = current();
			if(!r.length || !document.body.contains(r[0])) { closeStepper(); return; }
			name.text(r.find('.row_key').first().text());
			value.text(r.find('.row_val').first().clone().children('div').remove().end().text().trim());
			buttons.find('button').each(function() {
				$(this).prop('disabled', r.find('.' + $(this).attr('data-step')).first().hasClass('disabled'));
			});
		}
		refresh();
	}

	// Re-run the layout after map redraws (every move) and location changes.
	function after(obj, name, fn) {
		var original = obj[name];
		obj[name] = function() {
			var result = original.apply(this, arguments);
			setTimeout(fn, 0);
			return result;
		};
	}
	if(typeof World !== 'undefined') after(World, 'drawMap', layout);
	after(Engine, 'travelTo', function() { closeStepper(); setTimeout(layout, 350); });
	after(Engine, 'turnLightsOff', layout);

	$(function() {
		addLanguageToggle();
		fit();
		$(window).on('resize orientationchange', fit);
		var menu = document.querySelector('.menu');
		if(menu && window.ResizeObserver) new ResizeObserver(layout).observe(menu);
		if(menu) new MutationObserver(stripDots).observe(menu, { subtree: true, childList: true, characterData: true });
		stripDots();
		$(document).on('click', '.workerRow, .outfitRow', function() {
			if(isDock() && $(this).find('.upBtn').length) openStepper($(this));
		});
		document.addEventListener('touchstart', steer, { passive: false });
		document.addEventListener('touchmove', steer, { passive: false });
		document.addEventListener('touchend', release);
		document.addEventListener('touchcancel', release);
	});
})();
