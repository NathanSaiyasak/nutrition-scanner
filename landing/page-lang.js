// page-lang.js — English and Thai for the website's text pages (About, Privacy), 26 Nov 2026.
// Same rule as the app (i18n.js): ?lang= in the link wins, else the choice saved on this phone under
// 'bettr-lang' (the app and these pages share it, so a Thai choice in the app carries over), else English.
// Each page holds both languages; CSS shows the one that matches <html lang>. Loaded in <head>, before
// the page is drawn, so the wrong language never flashes.
(function () {
  var KEY = 'bettr-lang';
  var LANGS = ['en', 'th'];
  function pick() {
    var fromUrl = new URLSearchParams(window.location.search).get('lang');
    if (LANGS.indexOf(fromUrl) >= 0) return fromUrl;
    try {
      var saved = localStorage.getItem(KEY);
      if (LANGS.indexOf(saved) >= 0) return saved;
    } catch (e) { /* storage blocked: English */ }
    return 'en';
  }
  function apply(lang) {
    document.documentElement.lang = lang;
    var title = document.querySelector('meta[name="title-' + lang + '"]');
    if (title) document.title = title.content;
  }
  apply(pick());

  // The EN / ไทย switch: remember the choice on this phone and swap the text in place.
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-set-lang]').forEach(function (button) {
      button.addEventListener('click', function () {
        var next = button.getAttribute('data-set-lang');
        try { localStorage.setItem(KEY, next); } catch (e) { /* not saved: this visit only */ }
        apply(next);
        var url = new URL(window.location.href);
        if (url.searchParams.has('lang')) { url.searchParams.set('lang', next); history.replaceState(null, '', url); }
        sync();
      });
    });
    function sync() {
      var lang = document.documentElement.lang;
      document.querySelectorAll('[data-set-lang]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.getAttribute('data-set-lang') === lang));
      });
    }
    sync();
    // Close the phone menu after a link in it is tapped.
    document.querySelectorAll('.menu-panel a').forEach(function (a) {
      a.addEventListener('click', function () { a.closest('details').open = false; });
    });
  });
})();
