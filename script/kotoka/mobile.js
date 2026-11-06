// Phones and other narrow screens. The game layout is a fixed 700px design (plus a 220px
// notification column), so on narrow screens body gets class `kotoka-narrow`: the notifications
// move above the game and #wrapper is scaled with CSS zoom to the screen width (css/kotoka.css).
// Space flight only had keyboard controls; on touch screens the ship follows the finger.
(function() {
	var DESKTOP_MIN = 940; // 220px notification column + 700px game + margins
	var DESIGN_WIDTH = 716; // 700px game + 8px padding on each side

	// Mobile browsers widen the layout viewport to fit wide content, so innerWidth alone can
	// report the unscaled 716px; the device's CSS width (screen.width) caps it.
	function screenWidth() {
		return Math.min(window.innerWidth, window.screen && screen.width || window.innerWidth);
	}

	function fit() {
		var width = screenWidth();
		var narrow = width < DESKTOP_MIN;
		document.body.classList.toggle('kotoka-narrow', narrow);
		var zoom = narrow ? Math.min(1, width / DESIGN_WIDTH) : 1;
		document.documentElement.style.setProperty('--kotoka-zoom', String(zoom));
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

	$(function() {
		fit();
		$(window).on('resize orientationchange', fit);
		document.addEventListener('touchstart', steer, { passive: false });
		document.addEventListener('touchmove', steer, { passive: false });
		document.addEventListener('touchend', release);
		document.addEventListener('touchcancel', release);
	});
})();
