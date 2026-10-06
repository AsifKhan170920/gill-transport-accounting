/* ===================== Gill Transport: core + Trips =====================
   Ships only in the "Gill" build. Everything is gated per business by
   b.features.gill (Settings -> Gill Transport -> Enable); a business without
   the flag sees nothing new apart from that one settings page.

   Data lives on the business itself, outside b.records, so no register,
   ledger, report or list tool ever sees it:
     b.gill = { trips:[…], diesel:[…], lists:{ trucks, crushers, destinations,
                materials, vessels, dieselSuppliers } }

   This file owns the shared pieces (settings page, sidebar "Transport" group,
   routing, the spreadsheet grid, paste from Excel, filters, CSV, print and the
   grouped report) and the Trips page. js/gill-diesel.js adds the Diesel page
   and its Purchase Invoice link.
   ======================================================================= */
(function (G) {
  'use strict';
  if (typeof App === 'undefined' || G.Gill) return;

  var hasDom = function () { return typeof document !== 'undefined' && document && document.body && document.body.nodeType === 1; };
  var byId = function (id) { try { return document.getElementById(id); } catch (e) { return null; } };
  function esc(s) { return App.esc(s == null ? '' : s); }
  function pad(n) { return ('0' + n).slice(-2); }
  function todayIso() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function r3(n) { return Math.round((Number(n) || 0) * 1000) / 1000; }
  function blank(v) { return v == null || String(v).trim() === ''; }
  function toast(m) { try { if (G.UIModal) UIModal.toast(m); } catch (e) {} }
  var _seq = 0;
  function uid() { return Date.now() * 100 + ((_seq++) % 100); }
  function curB() { try { return App.openBiz != null ? App.curBiz() : null; } catch (e) { return null; } }
  function fmtD(iso) { if (!iso) return ''; try { return App.fmtDate(iso); } catch (e) { return iso; } }
  function money(n) { try { return App.money(n); } catch (e) { return r2(n).toFixed(2); } }
  function qtyFmt(n) { n = r3(n); return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 }); }
  function ddmm(iso) { var p = String(iso || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] : ''; }

  var MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  function validIso(y, m, d) {
    y = +y; m = +m; d = +d;
    if (!(y >= 1900 && y <= 2200 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    var dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCMonth() !== m - 1) return null;
    return y + '-' + pad(m) + '-' + pad(d);
  }
  /** User / Excel text -> 'YYYY-MM-DD'; '' for blank, null when it is not a date.
      Day-first unless the business shows dates month-first. */
  function parseDate(s) {
    s = String(s == null ? '' : s).trim();
    if (!s) return '';
    var m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:[T\s].*)?$/);
    if (m) return validIso(m[1], m[2], m[3]);
    if (/^\d{5}(\.\d+)?$/.test(s)) {                     // Excel serial day number
      var n = Math.floor(+s); if (n < 20000 || n > 90000) return null;
      var dt = new Date(Date.UTC(1899, 11, 30) + n * 86400000);
      return dt.getUTCFullYear() + '-' + pad(dt.getUTCMonth() + 1) + '-' + pad(dt.getUTCDate());
    }
    var thisYear = new Date().getFullYear();
    var yr = function (y) { if (y == null || y === '') return thisYear; y = String(y); return y.length <= 2 ? 2000 + (+y) : +y; };
    m = s.match(/^(\d{1,2})[\s\-\/.]+([A-Za-z]{3,9})\.?(?:[\s\-\/.,]+(\d{2,4}))?$/);
    if (m) { var mn = m[2].toLowerCase(), mi = MON[mn] != null ? MON[mn] : MON[mn.slice(0, 3)]; return mi == null ? null : validIso(yr(m[3]), mi, m[1]); }
    m = s.match(/^(\d{1,2})[\/.\-\s](\d{1,2})(?:[\/.\-\s](\d{2,4}))?$/);
    if (!m) return null;
    var b = curB(), f = (b && b.fmt && b.fmt.date) || 'DD/MM/YYYY';
    var mdy = /^MM/.test(f);
    return validIso(yr(m[3]), mdy ? m[1] : m[2], mdy ? m[2] : m[1]);
  }
  /** "1,234.50" / "AED 12" -> number; '' when blank; null when not a number. */
  function parseNum(s) {
    if (typeof s === 'number') return isFinite(s) ? s : null;
    s = String(s == null ? '' : s).replace(/[,\s]/g, '').replace(/^(aed|dhs?|usd)/i, '');
    if (s === '' || s === '-') return '';
    if (/^\(.*\)$/.test(s)) s = '-' + s.slice(1, -1);
    if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(s)) return null;
    return parseFloat(s);
  }
  /** Tab-separated text as Excel puts it on the clipboard (quoted cells may hold tabs / newlines). */
  function parseTSV(text) {
    text = String(text == null ? '' : text).replace(/\r\n?/g, '\n');
    var rows = [], row = [], cell = '', q = false, i = 0, at0 = true;
    for (; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
        continue;
      }
      if (c === '"' && at0) { q = true; at0 = false; continue; }
      if (c === '\t') { row.push(cell); cell = ''; at0 = true; continue; }
      if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; at0 = true; continue; }
      cell += c; at0 = false;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ''; }); });
  }
  function csvCell(v) { var s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function uniq(arr) { var seen = {}, out = []; arr.forEach(function (x) { x = String(x == null ? '' : x).trim(); if (!x) return; var k = x.toLowerCase(); if (seen[k]) return; seen[k] = 1; out.push(x); }); return out; }
  function sortStr(a) { return a.slice().sort(function (x, y) { return x.localeCompare(y, undefined, { numeric: true, sensitivity: 'base' }); }); }

  var Gill = G.Gill = {
    pages: {}, state: {}, _pending: null,
    LISTS: [['trucks', 'Trucks', 'e.g. DXB-A-12345'], ['crushers', 'Crushers', 'Crusher names'], ['destinations', 'Destinations', 'Sites / ports'],
      ['materials', 'Materials', 'e.g. Gabbro 3/4"'], ['vessels', 'Vessels', 'Vessel names'], ['dieselSuppliers', 'Diesel suppliers', 'Fuel suppliers (also taken from Suppliers)']],
    util: { esc: esc, parseDate: parseDate, parseNum: parseNum, parseTSV: parseTSV, csvCell: csvCell, todayIso: todayIso, ddmm: ddmm, r2: r2, r3: r3, uid: uid, uniq: uniq, money: money, qtyFmt: qtyFmt, fmtD: fmtD, toast: toast, curB: curB, byId: byId, hasDom: hasDom },
    /* In the Gill build (window.GILL_BUILD) the module is on unless a business switched it off */
    enabled: function (b) {
      if (!b) return false;
      if (b.features && b.features.gill != null) return !!b.features.gill;
      return !!G.GILL_BUILD;
    },
    /** b.gill with every part present (mutates b; the caller saves). */
    data: function (b) {
      var g = b.gill = (b.gill && typeof b.gill === 'object') ? b.gill : {};
      if (!Array.isArray(g.trips)) g.trips = [];
      if (!Array.isArray(g.diesel)) g.diesel = [];
      g.lists = (g.lists && typeof g.lists === 'object') ? g.lists : {};
      Gill.LISTS.forEach(function (L) { if (!Array.isArray(g.lists[L[0]])) g.lists[L[0]] = []; });
      return g;
    },
    st: function (label) {
      return Gill.state[label] = Gill.state[label] || { f: {}, sel: {}, fresh: {}, view: 'entries', g: '', cur: null };
    },
    page: function () { return Gill.pages[App.wsSection] || null; },
  };

  /* ------------------------------------------------------------------ pick-lists */
  function used(b, store, key) { return ((Gill.data(b)[store]) || []).map(function (r) { return r[key]; }); }
  function isDriver(e) {
    var t = [e.employeeType, e.empType, e.type, e.employmentType, e.category, e.empCategory].filter(Boolean).join(' ');
    return /company\s*driver/i.test(t);
  }
  Gill.source = function (b, src) {
    var R = b.records || {}, L = Gill.data(b).lists;
    switch (src) {
      case 'truck': return sortStr(uniq(L.trucks.concat((R.fixedAssets || []).filter(function (a) { return /truck|tipper|trailer|lorry|tanker/i.test((a.name || '') + ' ' + (a.category || '')); }).map(function (a) { return a.name; }), used(b, 'trips', 'truck'), used(b, 'diesel', 'truck'))));
      case 'driver': return sortStr(uniq((R.employees || []).filter(isDriver).map(function (e) { return e.name || e.empName; }).concat(used(b, 'trips', 'driver'), used(b, 'diesel', 'driver'))));
      case 'account': return sortStr(uniq((R.customers || []).map(function (c) { return c.name || c.custName; }).concat(used(b, 'trips', 'account'))));
      case 'crusher': return sortStr(uniq(L.crushers.concat(used(b, 'trips', 'crusher'))));
      case 'dest': return sortStr(uniq(L.destinations.concat(used(b, 'trips', 'dest'))));
      case 'material': return sortStr(uniq(L.materials.concat(used(b, 'trips', 'material'))));
      case 'vessel': return sortStr(uniq(L.vessels.concat(used(b, 'trips', 'vessel'))));
      case 'supplier': return sortStr(uniq(L.dieselSuppliers.concat((R.suppliers || []).map(function (s) { return s.name || s.supName; }), used(b, 'diesel', 'supplier'))));
    }
    return [];
  };

  /* ------------------------------------------------------------------ settings page */
  var _tiles = App.setTiles;
  App.setTiles = function () { var t = _tiles.apply(this, arguments) || []; if (!t.some(function (x) { return x[2] === 'gill'; })) t = t.concat([['truck', 'Gill Transport', 'gill', 'Trips, diesel and transport pick-lists', 2, 1]]); return t; };
  App.set_gill = function (b) {
    var g = Gill.data(JSON.parse(JSON.stringify(b))), on = Gill.enabled(b);
    var lists = Gill.LISTS.map(function (L) {
      return '<div class="gl-set-list"><label class="fld" for="gl_set_' + L[0] + '">' + esc(L[1]) + '</label>' +
        '<textarea id="gl_set_' + L[0] + '" rows="6" placeholder="' + esc(L[2]) + ' — one per line">' + esc(g.lists[L[0]].join('\n')) + '</textarea></div>';
    }).join('');
    return App.crumb('Settings', 'Gill Transport') +
      '<div class="card gl-set"><h2>Gill Transport</h2>' +
      '<label class="gl-switch-row"><span class="gl-switch"><input type="checkbox" id="gl_enable"' + (on ? ' checked' : '') + ' onchange="Gill.setEnabled(this.checked)"><span class="gl-knob"></span></span>' +
      '<span><b>Enable Trips and Diesel</b><small>Adds a Transport group with Trips and Diesel to the sidebar of this business only.</small></span></label>' +
      '<div class="gl-set-h">Pick-lists</div><p class="gl-hint">Suggestions offered while typing in Trips and Diesel. Any other value can still be typed. Drivers come from Employees whose type is “Company Driver”, accounts from Customers.</p>' +
      '<div class="gl-set-grid">' + lists + '</div>' +
      '<div class="form-actions"><button class="btn btn-primary" onclick="Gill.saveLists()">Update</button><button class="btn" onclick="App.settingsBack()">Cancel</button></div></div>';
  };
  Gill.setEnabled = function (on) {
    var b = curB(); if (!b) return;
    if (App.guardWrite && !App.guardWrite(b)) return;
    b.features = (b.features && typeof b.features === 'object') ? b.features : {};
    b.features.gill = !!on; Gill.data(b); App.saveBiz(b);
    try { App.renderSidebar(App.curBiz()); } catch (e) {}
    toast(on ? 'Gill Transport enabled — see Transport in the sidebar' : 'Gill Transport disabled (entries are kept)');
  };
  Gill.saveLists = function (vals) {
    var b = curB(); if (!b) return;
    if (App.guardWrite && !App.guardWrite(b)) return;
    var g = Gill.data(b);
    Gill.LISTS.forEach(function (L) {
      var v = vals ? vals[L[0]] : (byId('gl_set_' + L[0]) || {}).value;
      if (v == null) return;
      g.lists[L[0]] = uniq(Array.isArray(v) ? v : String(v).split(/\n/));
    });
    App.saveBiz(b); toast('Pick-lists saved');
    if (!vals) App.settingsBack();
  };

  /* ------------------------------------------------------------------ sidebar + routing */
  var EXTRA = [['🚚', 'Trips', null], ['⛽', 'Diesel', null]];
  var _side = App.renderSidebar;
  App.renderSidebar = function (b) {
    if (!Gill.enabled(b) || typeof SIDEBAR === 'undefined') return _side.apply(this, arguments);
    var addedS = [], gi = -1;
    EXTRA.forEach(function (r) { if (!SIDEBAR.some(function (x) { return x[1] === r[1]; })) { SIDEBAR.push(r); addedS.push(r); } });
    if (typeof SIDEBAR_GROUPS !== 'undefined' && !SIDEBAR_GROUPS.some(function (g) { return g[0] === 'Transport'; })) {
      var at = SIDEBAR_GROUPS.findIndex(function (g) { return g[0] === 'Purchases'; });
      gi = at < 0 ? SIDEBAR_GROUPS.length : at + 1;
      SIDEBAR_GROUPS.splice(gi, 0, ['Transport', ['Trips', 'Diesel']]);
    }
    try { return _side.apply(this, arguments); }
    finally {
      addedS.forEach(function (r) { var i = SIDEBAR.indexOf(r); if (i >= 0) SIDEBAR.splice(i, 1); });
      if (gi >= 0) SIDEBAR_GROUPS.splice(gi, 1);
    }
  };
  if (G.ICO && typeof ICO.forSection === 'function') {
    var FUEL = '<path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16"/><path d="M3 21h13"/><path d="M7 8h5"/><path d="M15 10h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V9l-3-3"/>';
    var _fs = ICO.forSection, _fset = ICO.forSetting;
    ICO.forSection = function (label, size, cls) {
      if (label === 'Trips') return ICO.get('truck', size, cls);
      if (label === 'Diesel') return ICO.get('box', size, cls).replace(/<path[\s\S]*<\/svg>$/, FUEL + '</svg>');
      return _fs.apply(this, arguments);
    };
    ICO.forSetting = function (key, size, cls) { return key === 'gill' ? ICO.get('truck', size, cls) : _fset.apply(this, arguments); };
  }

  var _rm = App.renderMain;
  App.renderMain = function (b) {
    var bb = b || this.curBiz();
    /* a Purchase Invoice opened from Diesel is pending only while its form is open */
    if (Gill._pending && !(this.wsMode === 'form' && this.wsSection === 'Purchase Invoices' && this.editingId == null)) Gill._pending = null;
    if (this.wsMode === 'section' && Gill.pages[this.wsSection] && Gill.enabled(bb)) {
      var m = byId('wsMain'); if (m) m.innerHTML = Gill.pageHtml(bb, this.wsSection);
      Gill._afterRender(bb);
      return;
    }
    return _rm.apply(this, arguments);
  };
  Gill._afterRender = function (b) {
    if (!hasDom()) return;
    try { var a = document.querySelector('#sidebar .side-item.active'); if (!a || a.getAttribute('data-side') !== App.wsSection) App.renderSidebar(b); } catch (e) {}
    var st = Gill.st(App.wsSection);
    if (st.focusNext) {
      var f = st.focusNext; st.focusNext = null;
      setTimeout(function () {
        var el = document.querySelector('.gl-grid input.gl-cell[data-id="' + f.id + '"][data-k="' + f.k + '"]');
        if (el) { el.focus(); try { el.select(); } catch (e) {} }
      }, 0);
    }
  };
  Gill.open = function (label) { App.selectSection(label); };
  /** The session / #hash restore can open the workspace before this file loads:
      repaint the sidebar (Transport group) and a Trips / Diesel page drawn without us. */
  Gill._boot = function () {
    try {
      if (!hasDom() || App.view !== 'workspace') return;
      var b = curB(); if (!b || !Gill.enabled(b)) return;
      App.renderSidebar(b);
      if (App.wsMode === 'section' && Gill.pages[App.wsSection]) App.renderMain(b);
    } catch (e) {}
  };

  /* ------------------------------------------------------------------ grid model */
  function colsOf(p) { return p.cols; }
  function editableCols(p) { return p.cols.filter(function (c) { return c.t !== 'calc'; }); }
  function rowBlank(p, r) { return editableCols(p).every(function (c) { return c.k === 'date' || blank(r[c.k]); }); }
  Gill.rows = function (b, p) { return Gill.data(b)[p.store]; };
  /** rows after filters, in display order (date, then entry order); rows added this visit always show */
  Gill.visible = function (b, p) {
    var st = Gill.st(p.label), f = st.f;
    var rows = Gill.rows(b, p).filter(function (r) {
      if (st.fresh[r.id]) return true;
      if (f.from && (r.date || '') < f.from) return false;
      if (f.to && (r.date || '') > f.to) return false;
      return (p.filters || []).every(function (fl) {
        var v = f[fl.k]; if (blank(v)) return true;
        if (fl.test) return fl.test(b, r, v);
        return String(r[fl.k] || '').toLowerCase() === String(v).toLowerCase();
      });
    });
    return rows.sort(function (x, y) {
      var dx = x.date || '9999', dy = y.date || '9999'; if (dx !== dy) return dx < dy ? -1 : 1;
      return (x.seq || 0) - (y.seq || 0);
    });
  };
  Gill.totals = function (b, p, rows) {
    var t = { n: rows.length };
    p.cols.forEach(function (c) { if (c.total) t[c.k] = 0; });
    rows.forEach(function (r) { p.cols.forEach(function (c) { if (c.total) t[c.k] += Number(c.calc ? c.calc(b, r) : r[c.k]) || 0; }); });
    p.cols.forEach(function (c) { if (c.total) t[c.k] = c.dec === 3 ? r3(t[c.k]) : r2(t[c.k]); });
    return t;
  };
  function nextSeq(rows) { return rows.reduce(function (m, r) { return Math.max(m, r.seq || 0); }, 0) + 1; }
  function locked(b, p, r) { return !!(p.locked && p.locked(b, r)); }
  /** Store one parsed value (cell edits, paste). Returns false for a locked row. */
  function setVal(p, r, c, raw) {
    var v;
    if (c.t === 'date') { v = parseDate(raw); if (v === null) return 'bad'; }
    else if (c.t === 'num') { v = parseNum(raw); if (v === null) return 'bad'; }
    else v = String(raw == null ? '' : raw).trim();
    r[c.k] = v; return 'ok';
  }
  Gill.newRow = function (b, p, after) {
    var rows = Gill.rows(b, p), st = Gill.st(p.label);
    var last = after || Gill.visible(b, p).slice(-1)[0];
    var r = { id: uid(), seq: nextSeq(rows), date: (last && last.date) || st.f.to || todayIso() };
    if (p.defaults) Object.assign(r, p.defaults(b, last) || {});
    rows.push(r); st.fresh[r.id] = 1; return r;
  };

  /* ------------------------------------------------------------------ mutations (UI) */
  function save(b, msg) {
    App.saveBiz(b);
    if (hasDom()) { var s = byId('glSaved'); if (s) { var d = new Date(); s.textContent = (msg || 'Saved') + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); s.classList.add('on'); } }
  }
  function rerender() { var b = curB(); if (b) App.renderMain(b); }
  function guard(b) { return !(App.guardWrite && !App.guardWrite(b)); }

  Gill.setField = function (id, k, raw, label) {
    var p = label ? Gill.pages[label] : Gill.page(); var b = curB(); if (!p || !b) return 'none';
    var r = Gill.rows(b, p).find(function (x) { return String(x.id) === String(id); }); if (!r) return 'none';
    if (locked(b, p, r)) return 'locked';
    var c = p.cols.find(function (x) { return x.k === k; }); if (!c || c.t === 'calc') return 'none';
    var res = setVal(p, r, c, raw); if (res !== 'ok') return res;
    if (!guard(b)) return 'denied';
    save(b); return 'ok';
  };
  Gill._timers = {};
  Gill.cellInput = function (el) {
    var key = el.getAttribute('data-id') + ':' + el.getAttribute('data-k');
    clearTimeout(Gill._timers[key]);
    Gill._timers[key] = setTimeout(function () { Gill._commit(el, true); }, 600);
  };
  Gill.cellChange = function (el) { Gill._commit(el, false); };
  Gill._commit = function (el, soft) {
    var id = el.getAttribute('data-id'), k = el.getAttribute('data-k');
    clearTimeout(Gill._timers[id + ':' + k]);
    var res = Gill.setField(id, k, el.value);
    if (el.classList) el.classList.toggle('gl-bad', res === 'bad');
    if (res === 'bad' && !soft) toast(k === 'date' ? 'Not a date — type it as ' + (App.datePlaceholder ? App.datePlaceholder() : 'dd/mm/yyyy') : 'Not a number');
    if (res !== 'ok') return;
    var p = Gill.page(), b = curB(); if (!p || !b) return;
    var r = Gill.rows(b, p).find(function (x) { return String(x.id) === String(id); });
    if (!soft && r) { var c = p.cols.find(function (x) { return x.k === k; }); el.value = cellText(c, r[k]); }
    Gill._paintTotals(b, p, r);
  };
  Gill._paintTotals = function (b, p, r) {
    if (!hasDom()) return;
    var t = Gill.totals(b, p, Gill.visible(b, p));
    p.cols.forEach(function (c) { if (!c.total) return; var el = byId('gl-tot-' + c.k); if (el) el.textContent = c.dec === 3 ? qtyFmt(t[c.k]) : money(t[c.k]); });
    if (r) p.cols.forEach(function (c) { if (c.t !== 'calc') return; var el = byId('gl-c-' + r.id + '-' + c.k); if (el) el.textContent = calcText(b, c, r); });
    if (p.afterEdit) p.afterEdit(b);
  };
  Gill.cellFocus = function (el) { var st = Gill.st(App.wsSection); st.cur = el.getAttribute('data-id'); };
  function gridInputs() { return Array.prototype.slice.call(document.querySelectorAll('.gl-grid input.gl-cell')).filter(function (x) { return !x.disabled; }); }
  function focusEl(el) { if (!el) return; el.focus(); try { el.select(); } catch (e) {} }
  Gill.cellKey = function (e, el) {
    var k = e.key;
    if ((k === 'Enter' || k === 'Tab') && !e.altKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault(); Gill._commit(el, false);
      var all = gridInputs(), i = all.indexOf(el), back = e.shiftKey;
      var tgt = all[i + (back ? -1 : 1)];
      if (tgt) return focusEl(tgt);
      if (!back) Gill.addRow();
      return;
    }
    if ((k === 'ArrowDown' || k === 'ArrowUp') && !el.getAttribute('list')) {
      e.preventDefault(); Gill._commit(el, false);
      var ri = +el.getAttribute('data-ri') + (k === 'ArrowDown' ? 1 : -1);
      focusEl(document.querySelector('.gl-grid input.gl-cell[data-ri="' + ri + '"][data-k="' + el.getAttribute('data-k') + '"]'));
      return;
    }
    if ((k === 'd' || k === 'D') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); Gill._commit(el, false); Gill.dupRows(); }
  };
  Gill.addRow = function () {
    var p = Gill.page(), b = curB(); if (!p || !b || !guard(b)) return;
    var st = Gill.st(p.label), cur = st.cur && Gill.rows(b, p).find(function (x) { return String(x.id) === String(st.cur); });
    var r = Gill.newRow(b, p, cur || null);
    save(b); st.cur = r.id; st.focusNext = { id: r.id, k: p.cols[1] ? p.cols[1].k : 'date' };
    rerender();
    return r;
  };
  function targets(b, p) {
    var st = Gill.st(p.label), ids = Object.keys(st.sel).filter(function (k) { return st.sel[k]; });
    if (!ids.length && st.cur) ids = [String(st.cur)];
    return Gill.rows(b, p).filter(function (r) { return ids.indexOf(String(r.id)) >= 0; });
  }
  Gill.dupRows = function () {
    var p = Gill.page(), b = curB(); if (!p || !b || !guard(b)) return;
    var src = targets(b, p); if (!src.length) { toast('Click a row (or tick some) to duplicate'); return; }
    var rows = Gill.rows(b, p), st = Gill.st(p.label), last = null;
    src.forEach(function (r) {
      var c = JSON.parse(JSON.stringify(r)); c.id = uid(); c.seq = nextSeq(rows);
      (p.noCopy || []).forEach(function (k) { delete c[k]; });
      rows.push(c); st.fresh[c.id] = 1; last = c;
    });
    st.sel = {}; save(b); st.cur = last.id; st.focusNext = { id: last.id, k: p.cols[1].k };
    toast('Duplicated ' + src.length + ' row' + (src.length === 1 ? '' : 's')); rerender();
  };
  Gill.deleteRows = function () {
    var p = Gill.page(), b = curB(); if (!p || !b || !guard(b)) return;
    var src = targets(b, p); if (!src.length) { toast('Click a row (or tick some) to delete'); return; }
    var lockedN = src.filter(function (r) { return locked(b, p, r); }).length;
    src = src.filter(function (r) { return !locked(b, p, r); });
    if (!src.length) { UIModal.alert('Billed entries cannot be deleted. Delete the purchase invoice first — the entries then return to Unbilled.', { title: 'Delete rows' }); return; }
    var n = src.length;
    var go = function () {
      var b2 = curB(), ids = src.map(function (r) { return String(r.id); });
      Gill.data(b2)[p.store] = Gill.rows(b2, p).filter(function (r) { return ids.indexOf(String(r.id)) < 0; });
      var st = Gill.st(p.label); st.sel = {}; st.cur = null; save(b2);
      toast('Deleted ' + n + ' row' + (n === 1 ? '' : 's')); rerender();
    };
    var msg = 'Delete ' + n + ' ' + (n === 1 ? 'row' : 'rows') + '?' + (lockedN ? ' (' + lockedN + ' billed ' + (lockedN === 1 ? 'entry is' : 'entries are') + ' kept.)' : '');
    if (G.UIModal && hasDom()) UIModal.confirm(msg, { title: 'Delete rows', okText: 'Delete', danger: true }).then(function (ok) { if (ok) go(); });
    else go();
  };
  Gill.toggleSel = function (id, on) {
    var st = Gill.st(App.wsSection); if (on) st.sel[id] = true; else delete st.sel[id];
    if (hasDom()) { var tr = document.querySelector('.gl-grid tr[data-row="' + id + '"]'); if (tr) tr.classList.toggle('gl-rsel', !!on); }
    var p = Gill.page(); if (p && p.afterEdit) p.afterEdit(curB());
  };
  Gill.selAll = function (on) {
    var p = Gill.page(), b = curB(); if (!p || !b) return; var st = Gill.st(p.label); st.sel = {};
    if (on) Gill.visible(b, p).forEach(function (r) { if (!p.selectable || p.selectable(b, r)) st.sel[r.id] = true; });
    rerender();
  };
  Gill.setFilter = function (k, v) { var st = Gill.st(App.wsSection); st.f[k] = v; st.fresh = {}; st.sel = {}; rerender(); };
  Gill.clearFilters = function () { var st = Gill.st(App.wsSection); st.f = {}; st.fresh = {}; st.sel = {}; rerender(); };
  Gill.setView = function (v) { var st = Gill.st(App.wsSection); st.view = v; rerender(); };
  Gill.setGroup = function (g) { var st = Gill.st(App.wsSection); st.g = g; rerender(); };

  /* ------------------------------------------------------------------ paste */
  function headerMap(p, row) {
    var cols = editableCols(p), map = [], hits = 0;
    row.forEach(function (h, i) {
      var n = norm(h), c = cols.find(function (x) { return norm(x.label) === n || (x.alias || []).some(function (a) { return norm(a) === n; }); });
      map[i] = c || null; if (c) hits++;
    });
    return hits >= 2 ? map : null;
  }
  /** Paste a block. Positional: from column `startK` of row `startId` across/down, overwriting
      and adding rows as needed (Excel-like). With a header row the columns are matched by name
      and every line becomes a new row. Returns {rows, bad, skipped}. */
  Gill.pasteBlock = function (b, p, text, startId, startK) {
    var data = parseTSV(text); if (!data.length) return { rows: 0, bad: 0, skipped: 0 };
    var cols = editableCols(p), hm = headerMap(p, data[0]), st = Gill.st(p.label);
    var view = Gill.visible(b, p), rows = Gill.rows(b, p);
    var ri = -1, ci = 0;
    if (hm) data = data.slice(1);
    else {
      ri = view.findIndex(function (r) { return String(r.id) === String(startId); });
      ci = Math.max(0, cols.findIndex(function (c) { return c.k === startK; }));
    }
    var out = { rows: 0, bad: 0, skipped: 0 }, prev = view.slice(-1)[0] || null;
    data.forEach(function (line, i) {
      var r = (!hm && ri >= 0) ? view[ri + i] : null;
      if (r && locked(b, p, r)) { out.skipped++; return; }
      if (!r) {
        r = { id: uid(), seq: nextSeq(rows), date: (prev && prev.date) || todayIso() };
        if (p.defaults) Object.assign(r, p.defaults(b, prev) || {});
        rows.push(r); st.fresh[r.id] = 1;
      }
      line.forEach(function (v, j) {
        var c = hm ? hm[j] : cols[ci + j]; if (!c) return;
        if (setVal(p, r, c, v) === 'bad') out.bad++;
      });
      prev = r; out.rows++;
    });
    return out;
  };
  Gill.onPaste = function (e) {
    var el = e.target; if (!el || !el.classList || !el.classList.contains('gl-cell')) return;
    var text = ''; try { text = (e.clipboardData || G.clipboardData).getData('text'); } catch (x) {}
    if (!/[\t\n]/.test(String(text).replace(/\n$/, ''))) return;     // one value: a normal paste
    e.preventDefault();
    var p = Gill.page(), b = curB(); if (!p || !b || !guard(b)) return;
    var res = Gill.pasteBlock(b, p, text, el.getAttribute('data-id'), el.getAttribute('data-k'));
    save(b); rerender();
    toast('Pasted ' + res.rows + ' row' + (res.rows === 1 ? '' : 's') + (res.bad ? ' — ' + res.bad + ' value(s) not understood, left blank' : '') + (res.skipped ? ' — ' + res.skipped + ' billed row(s) skipped' : ''));
  };
  Gill.pasteDialog = function () {
    var p = Gill.page(); if (!p) return;
    var hdr = editableCols(p).map(function (c) { return c.label; }).join(' ⇥ ');
    App._openOverlay('<div class="app-modal-h">Paste rows from Excel</div><div class="app-modal-b">' +
      '<p class="gl-hint">Copy the rows in Excel (with or without the heading row) and paste them below. Without headings the columns are read in this order:<br><span class="gl-cols">' + esc(hdr) + '</span></p>' +
      '<textarea id="glPasteBox" class="gl-paste" rows="10" placeholder="Paste here (Ctrl+V)"></textarea></div>' +
      '<div class="app-modal-f"><span style="flex:1"></span><button class="btn" onclick="App._closeOverlay()">Cancel</button><button class="btn btn-primary" onclick="Gill.pasteFromDialog()">Add rows</button></div>');
    setTimeout(function () { var t = byId('glPasteBox'); if (t) t.focus(); }, 0);
  };
  Gill.pasteFromDialog = function (text) {
    var p = Gill.page(), b = curB(); if (!p || !b || !guard(b)) return;
    if (text == null) { var t = byId('glPasteBox'); text = t ? t.value : ''; }
    if (!String(text).trim()) { toast('Nothing to paste'); return; }
    var res = Gill.pasteBlock(b, p, text, null, null);
    App._closeOverlay(); save(b); rerender();
    toast('Added ' + res.rows + ' row' + (res.rows === 1 ? '' : 's') + (res.bad ? ' — ' + res.bad + ' value(s) not understood, left blank' : ''));
    return res;
  };

  /* ------------------------------------------------------------------ rendering */
  function cellText(c, v) {
    if (v == null || v === '') return '';
    if (c.t === 'date') return fmtD(v);
    if (c.t === 'num') return String(c.dec === 3 ? r3(v) : r2(v));
    return String(v);
  }
  function calcText(b, c, r) { var v = c.calc(b, r); return (v === '' || v == null) ? '' : (c.dec === 3 ? qtyFmt(v) : money(v)); }
  function datalists(b, p) {
    var seen = {};
    return p.cols.filter(function (c) { return c.src && !seen[c.src] && (seen[c.src] = 1); }).map(function (c) {
      return '<datalist id="gl-dl-' + c.src + '">' + Gill.source(b, c.src).map(function (o) { return '<option value="' + esc(o) + '">'; }).join('') + '</datalist>';
    }).join('');
  }
  Gill.gridHtml = function (b, p) {
    var st = Gill.st(p.label), rows = Gill.visible(b, p), t = Gill.totals(b, p, rows);
    var allSel = rows.length && rows.every(function (r) { return st.sel[r.id] || (p.selectable && !p.selectable(b, r)); }) && Object.keys(st.sel).length;
    var head = '<th class="gl-sel"><input type="checkbox" tabindex="-1" title="Select all shown" ' + (allSel ? 'checked ' : '') + 'onchange="Gill.selAll(this.checked)"></th><th class="gl-n">#</th>' +
      p.cols.map(function (c) { return '<th class="' + (c.t === 'num' || c.t === 'calc' ? 'r ' : '') + 'gl-c-' + c.k + '">' + esc(c.label) + '</th>'; }).join('') +
      (p.extraHead ? p.extraHead(b) : '');
    var body = rows.map(function (r, ri) {
      var lk = locked(b, p, r), sel = !!st.sel[r.id];
      var cells = p.cols.map(function (c) {
        if (c.t === 'calc') return '<td class="r gl-calc" id="gl-c-' + r.id + '-' + c.k + '">' + calcText(b, c, r) + '</td>';
        var typ = c.t === 'num' ? ' inputmode="decimal"' : '';
        return '<td class="' + (c.t === 'num' ? 'r ' : '') + 'gl-c-' + c.k + '"><input class="gl-cell' + (c.t === 'num' ? ' r' : '') + '" type="text" autocomplete="off"' + typ +
          (c.src ? ' list="gl-dl-' + c.src + '"' : '') + (c.t === 'date' ? ' placeholder="' + esc(App.datePlaceholder ? App.datePlaceholder() : 'dd/mm/yyyy') + '"' : '') +
          ' data-id="' + r.id + '" data-k="' + c.k + '" data-ri="' + ri + '" value="' + esc(cellText(c, r[c.k])) + '"' + (lk ? ' disabled' : '') +
          ' aria-label="' + esc(c.label) + ' row ' + (ri + 1) + '"' +
          ' oninput="Gill.cellInput(this)" onchange="Gill.cellChange(this)" onkeydown="Gill.cellKey(event,this)" onfocus="Gill.cellFocus(this)"></td>';
      }).join('');
      return '<tr class="' + (lk ? 'gl-locked ' : '') + (sel ? 'gl-rsel' : '') + '" data-row="' + r.id + '">' +
        '<td class="gl-sel"><input type="checkbox" tabindex="-1"' + (sel ? ' checked' : '') + ' onchange="Gill.toggleSel(\'' + r.id + '\',this.checked)" aria-label="Select row ' + (ri + 1) + '"></td>' +
        '<td class="gl-n">' + (ri + 1) + '</td>' + cells + (p.extraCells ? p.extraCells(b, r) : '') + '</tr>';
    }).join('');
    if (!rows.length) body = '<tr><td colspan="' + (p.cols.length + 2 + (p.extraHead ? 1 : 0)) + '"><div class="gl-empty">' +
      (Gill.rows(b, p).length ? 'No ' + esc(p.label.toLowerCase()) + ' match the filters.' : 'No ' + esc(p.noun) + ' yet. Click <b>+ Add row</b>, or paste rows copied from Excel.') + '</div></td></tr>';
    var firstTot = p.cols.findIndex(function (c) { return c.total; });
    var foot = '<tr><td class="gl-sel"></td><td class="gl-n"></td><td colspan="' + Math.max(1, firstTot) + '" class="gl-tot-l">Total · ' + t.n + ' ' + esc(t.n === 1 ? p.noun1 : p.noun) + '</td>' +
      p.cols.slice(Math.max(1, firstTot)).map(function (c) { return c.total ? '<td class="r" id="gl-tot-' + c.k + '">' + (c.dec === 3 ? qtyFmt(t[c.k]) : money(t[c.k])) + '</td>' : '<td></td>'; }).join('') +
      (p.extraHead ? '<td></td>' : '') + '</tr>';
    return datalists(b, p) + '<div class="gl-grid-wrap"><table class="gl-grid" data-enter-nav="off" onpaste="Gill.onPaste(event)"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody><tfoot>' + foot + '</tfoot></table></div>';
  };
  function filterBar(b, p) {
    var st = Gill.st(p.label), f = st.f, rows = Gill.rows(b, p);
    var sel = function (fl) {
      var opts = fl.options ? fl.options(b) : sortStr(uniq(rows.map(function (r) { return r[fl.k]; })));
      return '<label class="gl-f"><span>' + esc(fl.label) + '</span><select onchange="Gill.setFilter(\'' + fl.k + '\',this.value)"><option value="">All</option>' +
        opts.map(function (o) { var v = Array.isArray(o) ? o[0] : o, l = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(v) + '"' + (String(f[fl.k] || '') === String(v) ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('') + '</select></label>';
    };
    var any = Object.keys(f).some(function (k) { return !blank(f[k]); });
    return '<div class="gl-filters">' +
      '<label class="gl-f"><span>From</span><input type="date" value="' + esc(f.from || '') + '" onchange="Gill.setFilter(\'from\',this.value)"></label>' +
      '<label class="gl-f"><span>To</span><input type="date" value="' + esc(f.to || '') + '" onchange="Gill.setFilter(\'to\',this.value)"></label>' +
      (p.filters || []).map(sel).join('') +
      (any ? '<button class="btn btn-xs gl-clear" onclick="Gill.clearFilters()">Clear filters</button>' : '') + '</div>';
  }
  /* grouped summary ("report") */
  Gill.report = function (b, p, g) {
    var grp = (p.groups || []).find(function (x) { return x[0] === g; }) || p.groups[0];
    var rows = Gill.visible(b, p).filter(function (r) { return !rowBlank(p, r); }), map = {}, order = [];
    rows.forEach(function (r) {
      var k = grp[0] === 'month' ? String(r.date || '').slice(0, 7) : String(r[grp[0]] || '').trim();
      k = k || '(blank)';
      if (!map[k]) { map[k] = []; order.push(k); }
      map[k].push(r);
    });
    order.sort(function (x, y) { if (x === '(blank)') return 1; if (y === '(blank)') return -1; return x.localeCompare(y, undefined, { numeric: true }); });
    var lines = order.map(function (k) { return { key: k, label: grp[0] === 'month' && k !== '(blank)' ? monthName(k) : k, t: p.reportRow(b, map[k]) }; });
    return { group: grp, lines: lines, total: p.reportRow(b, rows) };
  };
  function monthName(ym) { var p = ym.split('-'); var n = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][(+p[1]) - 1]; return n ? n + ' ' + p[0] : ym; }
  function reportTable(b, p, rep) {
    var cols = p.reportCols;
    var cell = function (c, v) { return '<td class="r">' + (c.dec === 3 ? qtyFmt(v) : c.int ? String(v) : money(v)) + '</td>'; };
    return '<div class="gl-grid-wrap"><table class="reg-tbl gl-rep"><thead><tr><th>' + esc(rep.group[1]) + '</th>' + cols.map(function (c) { return '<th class="r">' + esc(c.label) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      (rep.lines.length ? rep.lines.map(function (L) { return '<tr><td>' + esc(L.label) + '</td>' + cols.map(function (c) { return cell(c, L.t[c.k]); }).join('') + '</tr>'; }).join('') :
        '<tr><td colspan="' + (cols.length + 1) + '"><div class="gl-empty">Nothing to report for these filters.</div></td></tr>') +
      '</tbody><tfoot><tr><td>Total</td>' + cols.map(function (c) { return cell(c, rep.total[c.k]); }).join('') + '</tr></tfoot></table></div>';
  }
  Gill.pageHtml = function (b, label) {
    var p = Gill.pages[label], st = Gill.st(label);
    /* tidy: rows left completely empty on an earlier visit are dropped */
    var g = Gill.data(b), before = g[p.store].length;
    g[p.store] = g[p.store].filter(function (r) { return st.fresh[r.id] || !rowBlank(p, r) || locked(b, p, r); });
    if (g[p.store].length !== before) { try { App.saveBiz(b); } catch (e) {} }
    var I = function (n) { return G.ICO ? ICO.get(n, 15) : ''; };
    var rep = st.view === 'report';
    var tools = rep ? '' :
      '<button class="btn btn-primary btn-xs" onclick="Gill.addRow()">+ Add row</button>' +
      '<button class="btn btn-xs" onclick="Gill.dupRows()" title="Duplicate the current or ticked rows (Ctrl+D)">Duplicate</button>' +
      '<button class="btn btn-xs" onclick="Gill.deleteRows()">Delete</button>' +
      '<button class="btn btn-xs" onclick="Gill.pasteDialog()" title="Paste rows copied from Excel">Paste rows</button>';
    var groupSel = rep ? '<label class="gl-f gl-f-inline"><span>Group by</span><select onchange="Gill.setGroup(this.value)">' +
      p.groups.map(function (x) { return '<option value="' + x[0] + '"' + ((st.g || p.groups[0][0]) === x[0] ? ' selected' : '') + '>' + esc(x[1]) + '</option>'; }).join('') + '</select></label>' : '';
    return App.crumb(label) +
      '<div class="gl-page" data-gill="' + esc(p.store) + '">' +
      '<div class="reg-panel-head gl-head"><span class="reg-panel-title">' + esc(label) + '</span>' +
      '<div class="seg-sw gl-views"><button class="' + (rep ? '' : 'on') + '" onclick="Gill.setView(\'entries\')">Entries</button><button class="' + (rep ? 'on' : '') + '" onclick="Gill.setView(\'report\')">Report</button></div>' +
      '<div class="gl-tools">' + tools + groupSel +
      '<button class="btn btn-xs" onclick="Gill.exportCsv()">' + I('download') + ' CSV</button>' +
      '<button class="btn btn-xs" onclick="Gill.print()">Print</button>' +
      '<span class="gl-saved" id="glSaved" aria-live="polite"></span></div></div>' +
      filterBar(b, p) +
      (p.topHtml && !rep ? p.topHtml(b) : '') +
      (rep ? reportTable(b, p, Gill.report(b, p, st.g)) : Gill.gridHtml(b, p)) +
      (rep ? '' : '<div class="gl-help">Enter or Tab moves to the next cell (a new row after the last one) · ↑ ↓ move between rows · Ctrl+D duplicates · paste a block copied from Excel into any cell. Changes save automatically.</div>') +
      '</div>';
  };

  /* ------------------------------------------------------------------ CSV + print */
  function tableData(b, p) {
    var st = Gill.st(p.label);
    if (st.view === 'report') {
      var rep = Gill.report(b, p, st.g);
      var hdr = [rep.group[1]].concat(p.reportCols.map(function (c) { return c.label; }));
      var val = function (c, v) { return c.dec === 3 ? r3(v) : c.int ? v : r2(v).toFixed(2); };
      var body = rep.lines.map(function (L) { return [L.label].concat(p.reportCols.map(function (c) { return val(c, L.t[c.k]); })); });
      var tot = ['Total'].concat(p.reportCols.map(function (c) { return val(c, rep.total[c.k]); }));
      return { hdr: hdr, body: body, tot: tot, title: p.label + ' by ' + rep.group[1], numCols: p.reportCols.map(function (c, i) { return i + 1; }) };
    }
    var rows = Gill.visible(b, p).filter(function (r) { return !rowBlank(p, r); }), t = Gill.totals(b, p, rows);
    var cols = p.cols.concat(p.csvExtra || []);
    var out = function (c, r) { if (c.get) return c.get(b, r); if (c.t === 'calc') { var v = c.calc(b, r); return v === '' ? '' : (c.dec === 3 ? r3(v) : r2(v).toFixed(2)); } if (c.t === 'date') return fmtD(r[c.k]); return r[c.k] == null ? '' : r[c.k]; };
    return {
      hdr: cols.map(function (c) { return c.label; }),
      body: rows.map(function (r) { return cols.map(function (c) { return out(c, r); }); }),
      tot: cols.map(function (c, i) { return i === 0 ? 'Total (' + t.n + ')' : c.total ? (c.dec === 3 ? r3(t[c.k]) : r2(t[c.k]).toFixed(2)) : ''; }),
      title: p.label, numCols: cols.map(function (c, i) { return (c.t === 'num' || c.t === 'calc') ? i : -1; }).filter(function (i) { return i >= 0; })
    };
  }
  Gill.csv = function (b, p) {
    var d = tableData(b, p);
    return [d.hdr].concat(d.body, [d.tot]).map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n';
  };
  Gill.exportCsv = function () {
    var p = Gill.page(), b = curB(); if (!p || !b) return;
    var st = Gill.st(p.label);
    App._download('gill-' + p.store + (st.view === 'report' ? '-report' : '') + '-' + todayIso() + '.csv', '﻿' + Gill.csv(b, p));
  };
  function filterText(b, p) {
    var f = Gill.st(p.label).f, parts = [];
    if (f.from || f.to) parts.push((f.from ? fmtD(f.from) : '…') + ' – ' + (f.to ? fmtD(f.to) : '…'));
    (p.filters || []).forEach(function (fl) { if (!blank(f[fl.k])) parts.push(fl.label + ': ' + f[fl.k]); });
    return parts.join(' · ');
  }
  Gill.printHtml = function (b, p) {
    var d = tableData(b, p), num = {}; d.numCols.forEach(function (i) { num[i] = 1; });
    var td = function (tag, v, i) { return '<' + tag + (num[i] ? ' style="text-align:right"' : '') + '>' + esc(v) + '</' + tag + '>'; };
    return '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(d.title) + '</title><style>' +
      'body{font:12px/1.35 Inter,Segoe UI,Arial,sans-serif;color:#111;margin:14mm 10mm}h1{font-size:17px;margin:0}' +
      '.sub{color:#555;margin:2px 0 12px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #cfd5dd;padding:4px 6px;vertical-align:top}' +
      'th{background:#f1f4f8;text-align:left;font-size:10.5px;text-transform:uppercase}tfoot td{font-weight:700;background:#f7f8fa}@page{size:landscape;margin:10mm}' +
      '</style></head><body><h1>' + esc(b.name) + ' — ' + esc(d.title) + '</h1><div class="sub">' + esc(filterText(b, p) || 'All entries') + ' · printed ' + esc(fmtD(todayIso())) + '</div>' +
      '<table><thead><tr>' + d.hdr.map(function (h, i) { return td('th', h, i); }).join('') + '</tr></thead><tbody>' +
      d.body.map(function (r) { return '<tr>' + r.map(function (v, i) { return td('td', v, i); }).join('') + '</tr>'; }).join('') +
      '</tbody><tfoot><tr>' + d.tot.map(function (v, i) { return td('td', v, i); }).join('') + '</tr></tfoot></table></body></html>';
  };
  Gill.print = function () {
    var p = Gill.page(), b = curB(); if (!p || !b || !hasDom()) return;
    var html = Gill.printHtml(b, p);
    var fr = document.createElement('iframe');
    fr.setAttribute('aria-hidden', 'true'); fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(fr);
    var w = fr.contentWindow, d = w.document; d.open(); d.write(html); d.close();
    setTimeout(function () { try { w.focus(); w.print(); } catch (e) {} setTimeout(function () { fr.remove(); }, 1500); }, 60);
  };

  /* ------------------------------------------------------------------ Trips */
  var money2 = { t: 'num', total: 1 };
  Gill.pages.Trips = {
    label: 'Trips', store: 'trips', noun: 'trips', noun1: 'trip',
    cols: [
      { k: 'date', label: 'Date', t: 'date' },
      { k: 'ticket', label: 'Ticket No', t: 'text', alias: ['Ticket', 'Ticket Number'] },
      { k: 'truck', label: 'Truck No', t: 'text', src: 'truck', alias: ['Truck', 'Truck Number', 'Vehicle'] },
      { k: 'driver', label: 'Driver Name', t: 'text', src: 'driver', alias: ['Driver'] },
      { k: 'account', label: 'Account', t: 'text', src: 'account', alias: ['Customer'] },
      { k: 'crusher', label: 'Crusher Name', t: 'text', src: 'crusher', alias: ['Crusher'] },
      { k: 'dest', label: 'Destination', t: 'text', src: 'dest' },
      { k: 'material', label: 'Material', t: 'text', src: 'material' },
      { k: 'vessel', label: 'Vessel', t: 'text', src: 'vessel' },
      { k: 'weight', label: 'Weight', t: 'num', total: 1, dec: 3, alias: ['Weight (t)', 'Tons', 'Tonnes'] },
      Object.assign({ k: 'gillFnrc', label: 'Gill FNRC' }, money2),
      Object.assign({ k: 'otherFnrc', label: 'Other FNRC' }, money2),
      Object.assign({ k: 'aberToll', label: 'Aber Toll' }, money2),
      Object.assign({ k: 'sharjahToll', label: 'Sharjah Toll' }, money2),
      { k: 'desc', label: 'Description', t: 'text', alias: ['Remarks', 'Notes'] },
    ],
    filters: [{ k: 'truck', label: 'Truck' }, { k: 'driver', label: 'Driver' }, { k: 'crusher', label: 'Crusher' }, { k: 'material', label: 'Material' }, { k: 'account', label: 'Account' }],
    groups: [['truck', 'Truck'], ['driver', 'Driver'], ['crusher', 'Crusher'], ['month', 'Month']],
    reportCols: [{ k: 'n', label: 'Trips', int: 1 }, { k: 'weight', label: 'Weight', dec: 3 }, { k: 'gillFnrc', label: 'Gill FNRC' }, { k: 'otherFnrc', label: 'Other FNRC' },
      { k: 'aberToll', label: 'Aber Toll' }, { k: 'sharjahToll', label: 'Sharjah Toll' }, { k: 'charges', label: 'Total charges' }],
    reportRow: function (b, rows) {
      var t = Gill.totals(b, this, rows);
      t.charges = r2(t.gillFnrc + t.otherFnrc + t.aberToll + t.sharjahToll);
      return t;
    },
  };

  /* reminders: none needed for this module */
})(typeof window !== 'undefined' ? window : globalThis);
