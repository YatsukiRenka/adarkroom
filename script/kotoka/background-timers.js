(function() {
	const kotoka = window.Kotoka = window.Kotoka || {};
	const native = kotoka.nativeTimers = {
		setTimeout: window.setTimeout,
		setInterval: window.setInterval,
		clearTimeout: window.clearTimeout,
		clearInterval: window.clearInterval
	};
	kotoka.backgroundTimers = false;
	if(!window.Worker || !window.Blob || !window.URL || !window.URL.createObjectURL) return;

	function workerMain() {
		const timers = new Map();
		self.onmessage = function(event) {
			const data = event.data;
			if(data.type === 'clear') {
				clearTimeout(timers.get(data.id));
				timers.delete(data.id);
				return;
			}
			const fire = function() {
				if(!data.repeat) timers.delete(data.id);
				self.postMessage(data.id);
			};
			timers.set(data.id, (data.repeat ? setInterval : setTimeout)(fire, data.delay));
		};
	}

	let worker;
	let url;
	try {
		url = window.URL.createObjectURL(new window.Blob(['(' + workerMain.toString() + ')();'], { type: 'text/javascript' }));
		worker = new window.Worker(url);
	} catch(error) {
		return;
	}
	// The blob URL is intentionally never revoked: revoking right after
	// construction can break the worker's script load in some browsers.

	const callbacks = new Map();
	let nextId = 1000000000;
	worker.onmessage = function(event) {
		const timer = callbacks.get(event.data);
		if(!timer) return;
		if(!timer.repeat) callbacks.delete(event.data);
		try {
			timer.callback.apply(window, timer.args);
		} catch(error) {
			native.setTimeout.call(window, function() { throw error; }, 0);
		}
	};

	function schedule(repeat, callback, delay, args) {
		if(typeof callback !== 'function') {
			return native[repeat ? 'setInterval' : 'setTimeout'].call(window, callback, delay, ...args);
		}
		// Web IDL converts the delay to a signed 32-bit integer.
		delay = Math.max(0, (+delay) | 0);
		const id = nextId++;
		callbacks.set(id, { callback, args, repeat });
		worker.postMessage({ type: 'set', id, delay, repeat });
		return id;
	}

	function clear(id, nativeClear) {
		if(callbacks.has(id)) {
			callbacks.delete(id);
			worker.postMessage({ type: 'clear', id });
		} else {
			nativeClear.call(window, id);
		}
	}
	window.setTimeout = function(callback, delay, ...args) { return schedule(false, callback, delay, args); };
	window.setInterval = function(callback, delay, ...args) { return schedule(true, callback, delay, args); };
	window.clearTimeout = function(id) { clear(id, native.clearTimeout); };
	window.clearInterval = function(id) { clear(id, native.clearInterval); };
	kotoka.backgroundTimers = true;
})();
