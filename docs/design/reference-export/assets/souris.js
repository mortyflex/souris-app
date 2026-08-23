/* SOURIS — comportements partagés : navigation, feuilles, toasts, états */
(function (global) {
  'use strict';

  var ICONS = {
    agenda: '<path d="M7 3v3M17 3v3M3.5 9.5h17M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V7A1.5 1.5 0 0 1 5 5.5Z"/><path d="M7.5 13h4"/>',
    clientes: '<path d="M12 12.5a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5Z"/><path d="M4.5 20c0-3.6 3.36-6 7.5-6s7.5 2.4 7.5 6"/>',
    produits: '<path d="M9 3.5h6l.7 3.1a2 2 0 0 0 .9 1.25A4.5 4.5 0 0 1 18.7 12v6.5a2 2 0 0 1-2 2h-9.4a2 2 0 0 1-2-2V12a4.5 4.5 0 0 1 2.1-4.15 2 2 0 0 0 .9-1.25Z"/><path d="M5.4 13.5h13.2"/>',
    plus: '<path d="M4.5 7h15M4.5 12h15M4.5 17h15"/>',
    chevron: '<path d="m9.5 5.5 6.5 6.5-6.5 6.5"/>',
    back: '<path d="m14.5 5.5-6.5 6.5 6.5 6.5"/>',
    search: '<circle cx="11" cy="11" r="6.25"/><path d="m15.6 15.6 4.4 4.4"/>',
    add: '<path d="M12 5.5v13M5.5 12h13"/>',
    minus: '<path d="M5.5 12h13"/>',
    close: '<path d="m6.5 6.5 11 11M17.5 6.5l-11 11"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7"/>',
    alert: '<path d="M12 8v5"/><circle cx="12" cy="16.4" r="1.05" fill="currentColor" stroke="none"/><path d="M12 3.6 21.2 19.4H2.8Z"/>',
    clock: '<circle cx="12" cy="12" r="8.25"/><path d="M12 7.5V12l3 1.8"/>',
    calOff: '<path d="M7 3v3M17 3v3M3.5 9.5h17M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V7A1.5 1.5 0 0 1 5 5.5Z"/><path d="m9.5 13.5 5 4M14.5 13.5l-5 4"/>',
    box: '<path d="M12 3.5 20 8v8l-8 4.5L4 16V8Z"/><path d="M4 8l8 4.5L20 8M12 12.5V20.5"/>',
    tag: '<path d="M4.5 11.2V5.4A1 1 0 0 1 5.5 4.4h5.8a1 1 0 0 1 .7.3l7.3 7.3a1 1 0 0 1 0 1.4l-5.8 5.8a1 1 0 0 1-1.4 0L4.8 11.9a1 1 0 0 1-.3-.7Z"/><circle cx="8.6" cy="8.4" r="1.2"/>',
    percent: '<path d="m6.5 17.5 11-11"/><circle cx="8" cy="8" r="2"/><circle cx="16" cy="16" r="2"/>',
    globe: '<circle cx="12" cy="12" r="8.25"/><path d="M3.9 9.5h16.2M3.9 14.5h16.2"/><path d="M12 3.75c-4.4 5-4.4 11.5 0 16.5 4.4-5 4.4-11.5 0-16.5Z"/>',
    store: '<path d="M4.5 9.5h15v9a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5Z"/><path d="M4 9.5 5.6 5a1.5 1.5 0 0 1 1.4-1h10a1.5 1.5 0 0 1 1.4 1L20 9.5"/>',
    bell: '<path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10Z"/><path d="M10.2 18.5a2 2 0 0 0 3.6 0"/>',
    user: '<circle cx="12" cy="8" r="3.5"/><path d="M5.5 19.5c0-3 2.9-5 6.5-5s6.5 2 6.5 5"/>',
    lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="1.6"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    help: '<circle cx="12" cy="12" r="8.25"/><path d="M9.9 9.7a2.2 2.2 0 1 1 2.9 2.2c-.6.2-.8.7-.8 1.3v.4"/><circle cx="12" cy="16.3" r="1" fill="currentColor" stroke="none"/>',
    wifi: '<path d="M3.5 9.2a13 13 0 0 1 17 0M6.6 12.6a8.6 8.6 0 0 1 10.8 0M9.7 16a4.2 4.2 0 0 1 4.6 0"/><circle cx="12" cy="19" r="1.1" fill="currentColor" stroke="none"/>'
  };

  function icon(name, size) {
    var s = size || 24;
    return '<svg viewBox="0 0 24 24" width="' + s + '" height="' + s + '" fill="none" stroke="currentColor" ' +
      'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (ICONS[name] || '') + '</svg>';
  }

  var TABS = [
    { id: 'agenda',   label: 'Agenda',   href: 'agenda.html' },
    { id: 'clientes', label: 'Clientes', href: 'clientes.html' },
    { id: 'produits', label: 'Produits', href: 'produits.html' },
    { id: 'plus',     label: 'Plus',     href: 'plus.html' }
  ];

  function tabbar(active, platform) {
    var host = document.querySelector('[data-tabbar]');
    if (!host) return;
    host.className = platform === 'android' ? 'tabs tabs--md' : 'tabs';
    host.setAttribute('role', 'navigation');
    host.setAttribute('aria-label', 'Navigation principale');
    host.setAttribute('data-od-id', 'tabbar');
    host.innerHTML = TABS.map(function (t) {
      var on = t.id === active;
      var href = platform === 'android' ? ('android-' + t.href) : t.href;
      var live = platform === 'android' && !/^(agenda|plus)\.html$/.test(t.href) ? t.href : href;
      return '<a class="tab" href="' + live + '" data-od-id="tab-' + t.id + '"' +
        (on ? ' aria-current="page"' : '') + '>' +
        '<span class="tab__ind">' + icon(t.id, 24) + '</span>' +
        '<span>' + t.label + '</span></a>';
    }).join('');
  }

  /* Feuille modale accessible : Esc, scrim, restitution du focus */
  function sheets() {
    var last = null;

    function open(id) {
      var el = document.getElementById(id);
      if (!el) return;
      last = document.activeElement;
      var scrim = document.querySelector('[data-scrim]');
      if (scrim) scrim.setAttribute('data-open', 'true');
      el.setAttribute('data-open', 'true');
      el.removeAttribute('aria-hidden');
      var f = el.querySelector('button, a, input, [tabindex]');
      if (f) setTimeout(function () { f.focus({ preventScroll: true }); }, 60);
    }

    function close() {
      document.querySelectorAll('.sheet[data-open="true"]').forEach(function (el) {
        el.setAttribute('data-open', 'false');
        el.setAttribute('aria-hidden', 'true');
      });
      var scrim = document.querySelector('[data-scrim]');
      if (scrim) scrim.setAttribute('data-open', 'false');
      if (last && last.focus) last.focus({ preventScroll: true });
    }

    document.addEventListener('click', function (e) {
      var o = e.target.closest('[data-open-sheet]');
      if (o) { e.preventDefault(); open(o.getAttribute('data-open-sheet')); return; }
      if (e.target.closest('[data-close-sheet]') || e.target.hasAttribute('data-scrim')) close();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });

    return { open: open, close: close };
  }

  var toastTimer = null;
  function toast(message) {
    var el = document.querySelector('[data-toast]');
    if (!el) return;
    el.innerHTML = icon('check', 18) + '<span>' + message + '</span>';
    el.setAttribute('data-open', 'true');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.setAttribute('data-open', 'false'); }, 2600);
  }

  /* Filet sous l'en-tête dès que le contenu défile */
  function stickyHeader() {
    var sc = document.querySelector('.scroll');
    var hd = document.querySelector('.hd');
    if (!sc || !hd) return;
    sc.addEventListener('scroll', function () {
      hd.setAttribute('data-scrolled', sc.scrollTop > 4 ? 'true' : 'false');
    }, { passive: true });
  }

  global.Souris = { icon: icon, tabbar: tabbar, sheets: sheets, toast: toast, stickyHeader: stickyHeader };
})(window);
