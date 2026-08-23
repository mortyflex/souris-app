/* SOURIS — vue Agenda partagée (iOS + Android) */
(function () {
  var I = Souris.icon;
  Souris.tabbar('agenda', document.body.getAttribute('data-platform') || 'ios');
  Souris.sheets();
  Souris.stickyHeader();

  document.querySelector('[data-od-id="agenda-search"]').innerHTML = I('search', 22);
  document.querySelector('[data-od-id="agenda-view"]').innerHTML = I('agenda', 22);
  document.querySelector('[data-od-id="agenda-fab"]').innerHTML = I('add', 26);
  document.querySelectorAll('[data-close-sheet].ibtn').forEach(function (b) { b.innerHTML = I('close', 20); });

  /* ---------- Bandeau de semaine ---------- */
  var DAYS = [
    { dow: 'lun', n: 22, level: 1 }, { dow: 'mar', n: 23, level: 2, on: true },
    { dow: 'mer', n: 24, level: 1 }, { dow: 'jeu', n: 25, level: 2 },
    { dow: 'ven', n: 26, level: 2 }, { dow: 'sam', n: 27, level: 1 },
    { dow: 'dim', n: 28, level: 0 }
  ];
  document.getElementById('daystrip').innerHTML = DAYS.map(function (d) {
    return '<button class="day" type="button" role="tab" data-od-id="day-' + d.n + '"' +
      ' aria-selected="' + (d.on ? 'true' : 'false') + '"' +
      ' aria-label="' + d.dow + ' ' + d.n + ' septembre">' +
      '<span class="day__dow">' + d.dow + '</span>' +
      '<span class="day__n num">' + d.n + '</span>' +
      '<span class="day__load" data-level="' + d.level + '"></span></button>';
  }).join('');
  document.getElementById('daystrip').addEventListener('click', function (e) {
    var b = e.target.closest('.day'); if (!b) return;
    this.querySelectorAll('.day').forEach(function (x) { x.setAttribute('aria-selected', 'false'); });
    b.setAttribute('aria-selected', 'true');
  });

  /* ---------- Données de la journée ---------- */
  var RDV = [
    { id: 'lea', client: 'Léa Marchand', svc: 'Coupe + brushing', start: '09:00', end: '10:30', hue: 'lav',
      price: '55 €', since: 'Cliente depuis mars 2023', note: 'Préfère une coupe au carré, sans dégradé.',
      phases: [ { t: '09:00', d: 60, n: 'Shampooing & coupe', k: 'Vous êtes occupée' },
                { t: '10:00', d: 30, n: 'Brushing', k: 'Vous êtes occupée' } ] },
    { id: 'ines', client: 'Inès Ferrand', svc: 'Coloration racines', start: '10:30', end: '13:00', hue: 'rose',
      price: '78 €', since: 'Cliente depuis janvier 2022', note: 'Coloration 6.3 — allergie testée en 2022.',
      pose: { start: '11:15', end: '12:15' },
      phases: [ { t: '10:30', d: 45, n: 'Application couleur', k: 'Vous êtes occupée' },
                { t: '11:15', d: 60, n: 'Temps de pose', k: 'Vous êtes libre — Camille est placée ici', pose: true },
                { t: '12:15', d: 45, n: 'Rinçage & brushing', k: 'Vous êtes occupée' } ] },
    { id: 'camille', client: 'Camille Roy', svc: 'Coupe enfant', start: '11:30', end: '12:15', hue: 'peach',
      price: '18 €', since: 'Première visite', note: 'Placée pendant le temps de pose d’Inès.',
      phases: [ { t: '11:30', d: 45, n: 'Coupe', k: 'Vous êtes occupée' } ] },
    { id: 'pause', client: 'Pause déjeuner', svc: '', start: '13:00', end: '14:00', hue: 'off', block: true },
    { id: 'sofia', client: 'Sofia Benali', svc: 'Balayage + soin', start: '14:00', end: '16:00', hue: 'lav',
      price: '95 €', since: 'Cliente depuis septembre 2024', note: 'Balayage caramel, longueurs fragiles.',
      pose: { start: '15:00', end: '15:30' },
      phases: [ { t: '14:00', d: 60, n: 'Balayage', k: 'Vous êtes occupée' },
                { t: '15:00', d: 30, n: 'Temps de pose', k: 'Vous êtes libre', pose: true },
                { t: '15:30', d: 30, n: 'Rinçage & soin', k: 'Vous êtes occupée' } ] },
    { id: 'nadia', client: 'Nadia Cohen', svc: 'Frange + brushing', start: '16:30', end: '17:15', hue: 'off',
      absent: true, price: '12 €', since: 'Cliente depuis juin 2024', note: 'Marquée absente ce matin.',
      phases: [ { t: '16:30', d: 45, n: 'Frange + brushing', k: 'Annulé' } ] }
  ];

  var H0 = 8, H1 = 20, PX = 68;
  function mins(t) { var p = t.split(':'); return (+p[0]) * 60 + (+p[1]); }
  function y(t) { return (mins(t) - H0 * 60) / 60 * PX; }
  function fmt(t) { return t.replace(':', ' h ').replace(' h 00', ' h'); }
  function dur(a, b) {
    var m = mins(b) - mins(a), h = Math.floor(m / 60), r = m % 60;
    return (h ? h + ' h' : '') + (r ? (h ? ' ' : '') + r + ' min' : '');
  }

  /* Colonnes pour les rendez-vous simultanés */
  function layout(list) {
    var cols = [];
    list.forEach(function (e) {
      var s = mins(e.start), en = mins(e.end), placed = false;
      for (var c = 0; c < cols.length && !placed; c++) {
        if (cols[c].every(function (o) { return mins(o.end) <= s || mins(o.start) >= en; })) {
          cols[c].push(e); e.col = c; placed = true;
        }
      }
      if (!placed) { e.col = cols.length; cols.push([e]); }
    });
    var total = Math.max(1, cols.length);
    list.forEach(function (e) {
      var overlaps = list.some(function (o) {
        return o !== e && mins(o.start) < mins(e.end) && mins(o.end) > mins(e.start);
      });
      e.cols = overlaps ? total : 1;
      if (!overlaps) e.col = 0;
    });
  }

  function renderAgenda() {
    layout(RDV);
    var hours = '';
    for (var h = H0; h <= H1; h++) {
      hours += '<div class="tl__hour"><span class="tl__label num">' +
        (h < 10 ? '0' : '') + h + ':00</span></div>';
    }

    var evs = RDV.map(function (e) {
      var top = y(e.start), height = y(e.end) - y(e.start);
      var w = 100 / e.cols, left = e.col * w;
      var gap = e.cols > 1 ? 4 : 0;
      var small = height < 56;
      var pose = '';
      if (e.pose) {
        pose = '<span class="ev__pose" style="top:' + (y(e.pose.start) - top) + 'px;height:' +
          (y(e.pose.end) - y(e.pose.start)) + 'px"><span class="ev__poseLabel">' +
          I('clock', 12) + 'Temps de pose</span></span>';
      }
      var label = e.block ? e.client : e.client + ', ' + e.svc + ', ' + fmt(e.start) + ' à ' + fmt(e.end);
      return '<button class="ev ev--' + e.hue + (small ? ' ev--sm' : '') + '" type="button"' +
        ' data-rdv="' + e.id + '" data-od-id="rdv-' + e.id + '" aria-label="' + label + '"' +
        ' style="top:' + top + 'px;height:' + (height - 3) + 'px;left:calc(' + left + '% + ' + (e.col ? gap : 0) + 'px);' +
        'width:calc(' + w + '% - ' + gap + 'px)">' + pose +
        '<span class="ev__t num">' + fmt(e.start) + (small ? '' : ' – ' + fmt(e.end)) + '</span>' +
        '<span class="ev__name">' + e.client + (e.absent ? ' · absente' : '') + '</span>' +
        (e.svc && !small ? '<span class="ev__svc">' + e.svc + '</span>' : '') +
        '</button>';
    }).join('');

    var nowY = y('11:42');

    return '' +
      '<div class="sum" data-od-id="agenda-summary">' +
        '<div class="sum__i"><div class="sum__v num">4</div><div class="sum__k">Rendez-vous</div></div>' +
        '<div class="sum__i"><div class="sum__v num">5 h 15</div><div class="sum__k">Occupée</div></div>' +
        '<div class="sum__i"><div class="sum__v num">246 €</div><div class="sum__k">Attendu</div></div>' +
      '</div>' +
      '<div class="legend" data-od-id="agenda-legend">' +
        '<span class="legend__i"><span class="legend__sw"></span>Prestation</span>' +
        '<span class="legend__i"><span class="legend__sw legend__sw--pose"></span>Temps de pose — vous êtes libre</span>' +
        '<span class="legend__i"><span class="legend__sw legend__sw--off"></span>Indisponible</span>' +
      '</div>' +
      '<div class="tl" data-od-id="agenda-timeline">' +
        '<div class="tl__hours">' + hours + '</div>' +
        '<div class="tl__events">' + evs + '</div>' +
        '<div class="now" style="top:calc(8px + ' + nowY + 'px)" aria-hidden="true"><span class="now__t num">11:42</span></div>' +
      '</div>';
  }

  /* ---------- États ---------- */
  var state = new URLSearchParams(location.search).get('state') || 'default';
  var content = document.getElementById('content');
  var fab = document.querySelector('.fab');

  function skeleton() {
    var rows = '';
    [[0, 92], [1.4, 148], [3.2, 66], [4.4, 120]].forEach(function (r) {
      rows += '<div class="skel" style="position:absolute;top:' + (r[0] * PX) + 'px;height:' + r[1] + 'px;left:0;right:0"></div>';
    });
    var hours = '';
    for (var h = H0; h <= 14; h++) hours += '<div class="tl__hour"><span class="tl__label num">' + (h < 10 ? '0' : '') + h + ':00</span></div>';
    return '<div class="sum"><div class="sum__i"><div class="skel skel--title" style="width:34px"></div>' +
      '<div class="skel skel--line" style="width:78px;margin-top:8px"></div></div>' +
      '<div class="sum__i"><div class="skel skel--title" style="width:58px"></div>' +
      '<div class="skel skel--line" style="width:62px;margin-top:8px"></div></div></div>' +
      '<div class="tl"><div class="tl__hours">' + hours + '</div><div class="tl__events">' + rows + '</div></div>';
  }

  if (state === 'loading') {
    content.innerHTML = skeleton();
    content.setAttribute('aria-busy', 'true');
    content.setAttribute('aria-label', 'Chargement de la journée');
    fab.setAttribute('aria-disabled', 'true');
    fab.style.opacity = '0.45';
    fab.style.pointerEvents = 'none';
  } else if (state === 'empty') {
    content.innerHTML =
      '<div class="state" data-od-id="agenda-empty">' +
        '<span class="state__mark">' + I('calOff', 26) + '</span>' +
        '<p class="state__title">Journée libre</p>' +
        '<p class="state__text">Aucun rendez-vous mardi 23. Bloquez la journée ou ouvrez un créneau.</p>' +
        '<button class="btn btn--ghost" type="button" data-open-sheet="sheet-create">Créer le rendez-vous</button>' +
      '</div>';
  } else if (state === 'error') {
    content.innerHTML =
      '<div class="state" role="alert" data-od-id="agenda-error">' +
        '<span class="state__mark state__mark--rose">' + I('wifi', 26) + '</span>' +
        '<p class="state__title">Agenda non synchronisé</p>' +
        '<p class="state__text">Les rendez-vous de mardi 23 n’ont pas pu être chargés. Dernière mise à jour à 8 h 12.</p>' +
        '<button class="btn btn--ghost" type="button" id="retry">Réessayer</button>' +
      '</div>';
    document.getElementById('retry').addEventListener('click', function () {
      this.textContent = 'Nouvelle tentative…';
      this.setAttribute('aria-disabled', 'true');
    });
  } else {
    content.innerHTML = renderAgenda();
    document.getElementById('scroll').scrollTop = Math.max(0, y('09:00') - 40);
  }

  /* ---------- Détail ---------- */
  content.addEventListener('click', function (e) {
    var b = e.target.closest('[data-rdv]'); if (!b) return;
    var r = RDV.filter(function (x) { return x.id === b.getAttribute('data-rdv'); })[0];
    if (!r || r.block) return;
    document.getElementById('detail-title').textContent = r.client;
    document.getElementById('detail-body').innerHTML =
      '<p style="font-size:14px;color:var(--fg-soft);margin-bottom:2px">' + r.svc + ' · ' +
        fmt(r.start) + ' – ' + fmt(r.end) + '</p>' +
      (r.absent ? '<p class="chip chip--rose" style="margin-top:10px">' +
        '<span class="chip__dot"></span>Absence signalée</p>' : '') +
      '<div class="grp"><span class="grp__label">Déroulé</span></div>' +
      r.phases.map(function (p) {
        return '<div class="phase">' +
          '<span class="phase__bar' + (p.pose ? ' phase__bar--pose' : '') + '"></span>' +
          '<span class="phase__t num">' + fmt(p.t) + '</span>' +
          '<span class="phase__b"><span class="phase__n">' + p.n + ' · ' + p.d + ' min</span>' +
          '<span class="phase__d">' + p.k + '</span></span></div>';
      }).join('') +
      '<div class="grp"><span class="grp__label">Détails</span></div>' +
      '<div class="kv"><span class="kv__k">Durée</span><span class="kv__v num">' + dur(r.start, r.end) + '</span></div>' +
      '<div class="kv"><span class="kv__k">Prix</span><span class="kv__v num">' + r.price + '</span></div>' +
      '<div class="kv"><span class="kv__k">Cliente</span><span class="kv__v">' + r.since + '</span></div>' +
      '<div class="grp"><span class="grp__label">Note</span></div>' +
      '<p style="font-size:14.5px;line-height:1.5;padding-bottom:4px">' + r.note + '</p>' +
      '<button class="btn btn--danger btn--block" type="button" style="margin-top:12px" data-od-id="rdv-absence">Marquer comme absence</button>';
    document.querySelector('[data-scrim]').setAttribute('data-open', 'true');
    var s = document.getElementById('sheet-detail');
    s.setAttribute('data-open', 'true');
    s.removeAttribute('aria-hidden');
  });

  document.getElementById('rdv-done').addEventListener('click', function () {
    document.querySelector('[data-close-sheet]').click();
    Souris.toast('Rendez-vous terminé');
  });

  /* ---------- Création : aperçu des phases + validation ---------- */
  var PHASES = {
    coupe: [['Shampooing & coupe', 60, false], ['Brushing', 30, false]],
    couleur: [['Application couleur', 45, false], ['Temps de pose', 60, true], ['Rinçage & brushing', 45, false]],
    balayage: [['Balayage', 60, false], ['Temps de pose', 30, true], ['Rinçage & soin', 30, false]],
    frange: [['Retouche', 20, false]]
  };
  function addMin(t, m) {
    var v = mins(t) + m;
    return ('0' + Math.floor(v / 60)).slice(-2) + ':' + ('0' + (v % 60)).slice(-2);
  }
  function preview() {
    var k = document.getElementById('f-presta').value;
    var t = document.getElementById('f-heure').value || '09:00';
    document.getElementById('phase-preview').innerHTML = PHASES[k].map(function (p) {
      var row = '<div class="phase">' +
        '<span class="phase__bar' + (p[2] ? ' phase__bar--pose' : '') + '"></span>' +
        '<span class="phase__t num">' + fmt(t) + '</span>' +
        '<span class="phase__b"><span class="phase__n">' + p[0] + ' · ' + p[1] + ' min</span>' +
        '<span class="phase__d">' + (p[2] ? 'Vous restez libre, un autre rendez-vous peut être placé ici' : 'Vous êtes occupée') + '</span></span></div>';
      t = addMin(t, p[1]);
      return row;
    }).join('');
  }
  document.getElementById('f-presta').addEventListener('change', preview);
  document.getElementById('f-heure').addEventListener('change', preview);
  preview();

  document.getElementById('create-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var input = document.getElementById('f-cliente');
    var err = document.getElementById('f-cliente-err');
    if (!input.value.trim()) {
      input.setAttribute('aria-invalid', 'true');
      err.hidden = false;
      err.innerHTML = I('alert', 15) + '<span>Indiquez la cliente pour créer le rendez-vous.</span>';
      input.focus();
      return;
    }
    input.removeAttribute('aria-invalid');
    err.hidden = true;
    document.querySelectorAll('[data-close-sheet]')[1].click();
    Souris.toast('Rendez-vous créé');
    this.reset();
    preview();
  });
  document.getElementById('f-cliente').addEventListener('input', function () {
    if (this.value.trim()) { this.removeAttribute('aria-invalid'); document.getElementById('f-cliente-err').hidden = true; }
  });

  /* Arrivée depuis une fiche cliente : la création s'ouvre déjà remplie. */
  var incoming = new URLSearchParams(location.search).get('cliente');
  if (incoming && state === 'default') {
    document.getElementById('f-cliente').value = incoming;
    setTimeout(function () {
      document.querySelector('[data-open-sheet="sheet-create"]').click();
    }, 240);
  }
})();
