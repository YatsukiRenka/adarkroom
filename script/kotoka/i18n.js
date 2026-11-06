// Strings for the kotoka.club additions. Each module registers its own
// translations, keyed by language code, e.g.
//   Kotoka.addStrings({ zh_cn: { 'hotkeys.': '快捷键.' } });
// Only the language chosen in index.html (global `lang`) is merged.
var Kotoka = window.Kotoka || {};
window.Kotoka = Kotoka;

Kotoka.addStrings = function(byLang) {
	var dict = byLang[window.lang];
	if(dict) {
		_.addTranslation(dict);
	}
};
