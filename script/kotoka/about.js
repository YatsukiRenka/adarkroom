// "about." menu entry (desktop menu and mobile dock): states that this is an unofficial modified
// version, credits the original game, names the licence and the trademark, and links the sources.
(function() {
	var SOURCE = 'https://github.com/YatsukiRenka/adarkroom';
	var ORIGINAL = 'https://github.com/doublespeakgames/adarkroom';

	Kotoka.addStrings({ zh_cn: {
		'about.': '关于.',
		'About': '关于',
		'this is an unofficial modified version of A Dark Room, maintained by kotoka.club.':
			'这是《A Dark Room》的非官方魔改版，由 kotoka.club 维护.',
		'the original game is by Michael Townsend and doublespeak games; its source code is published under the Mozilla Public License 2.0.':
			'原作由 Michael Townsend 与 doublespeak games 开发，源代码以 Mozilla Public License 2.0 发布.',
		'this version is not affiliated with or endorsed by doublespeak games. "A Dark Room" is their trademark.':
			'本版本与 doublespeak games 无关联，也未获其认可.「A Dark Room」是其商标.',
		'the modified source code is published under the same licence: {0}':
			'修改后的源代码以相同协议公开：{0}',
		'source code': '源代码',
		'original game': '原版',
		'licence': '许可证',
		'close': '关闭'
	} });

	function open() {
		if(Engine.keyLock) return;
		Events.startEvent({
			title: _('About'),
			scenes: {
				start: {
					text: [
						_('this is an unofficial modified version of A Dark Room, maintained by kotoka.club.'),
						_('the original game is by Michael Townsend and doublespeak games; its source code is published under the Mozilla Public License 2.0.'),
						_('this version is not affiliated with or endorsed by doublespeak games. "A Dark Room" is their trademark.'),
						_('the modified source code is published under the same licence: {0}', SOURCE.replace('https://', ''))
					],
					buttons: {
						source: { text: _('source code'), link: SOURCE },
						original: { text: _('original game'), link: ORIGINAL },
						licence: { text: _('licence'), link: 'LICENSE.md' },
						close: { text: _('close'), nextScene: 'end' }
					}
				}
			}
		});
	}

	$(function() {
		$('<span class="menuBtn">').text(_('about.')).appendTo('.menu').on('click', open);
	});
})();
