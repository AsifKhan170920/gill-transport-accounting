/* Reminders core (js/reminders.js) and Business Details trade license / company documents
   (js/business-docs.js) — FEATURES_SPEC "Shared contract: Reminders" and section 3.
   The bell dropdown, WebAudio chime and layout are checked in a browser; pinned here
   are the API contract, severity rules, the once-per-item-per-day sound rule,
   read / snooze state, Settings -> Notifications and the license source. */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadApp, loadAppWithDemo } from './_harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (ctx, f) => vm.runInContext(readFileSync(join(ROOT, f), 'utf8'), ctx, { filename: f });
/* same order as index.html: reminders.js right after ui-modal.js, business-docs.js last */
function boot(ctx) {
  run(ctx, 'js/reminders.js');
  run(ctx, 'js/settings-pages.js');
  vm.runInContext("App._liveOptionsFor = function () { return []; };", ctx);
  run(ctx, 'js/settings-fixes-b.js');
  run(ctx, 'js/business-docs.js');
  ctx.confirm = () => true;
  return ctx;
}
const T0 = new Date(2026, 9, 6, 9, 0, 0).getTime();          // 06/10/2026 09:00 local
const DAY = 864e5;

let ctx, App, R, chimes, toasts;
function wire(c) {
  ctx = c; App = ctx.App; R = ctx.Reminders;
  R._now = T0;
  chimes = []; toasts = [];
  R._chime = (v) => { chimes.push(v); return true; };
  R._isUnlocked = () => true;
  ctx.UIModal.toast = (m) => { toasts.push(String(m)); };
}
beforeEach(() => { const { ctx: c } = loadAppWithDemo(); boot(c); wire(c); });
const cur = () => App.curBiz();
const edit = (fn) => { const b = cur(); fn(b); App.saveBiz(b); return cur(); };
const keys = (items) => [...items].map((x) => x.key);
const addDays = (n) => R.addDays('2026-10-06', n);
const addInvoice = () => { edit((b) => { b.records.salesInv = (b.records.salesInv || []).concat([{ id: 9001, reference: 'INV-9', customer: 'Test Customer', issueDate: '2020-08-01', dueDate: '2020-09-01', total: 100, balanceDue: 100 }]); });
  return cur().records.salesInv.find((r) => r.id === 9001); };

describe('contract', () => {
  test('globals and API shape', () => {
    for (const f of ['register', 'list', 'refresh']) assert.equal(typeof R[f], 'function', f);
    assert.equal(R.today(), '2026-10-06');
    assert.equal(R.daysUntil('2026-10-09'), 3);
    assert.equal(R.daysUntil('2026-10-01'), -5);
    assert.equal(R.addDays('2026-12-31', 1), '2027-01-01');
  });

  test('register merges sources, computes severity from due + lead days and sorts', () => {
    R.register('t', () => [
      { id: 'a', title: 'Later', due: addDays(20), kind: 'pdc' },          // pdc lead 3 -> left out
      { id: 'b', title: 'Soon', due: addDays(2), kind: 'pdc' },
      { id: 'c', title: 'Today', due: addDays(0), kind: 'pdc' },
      { id: 'd', title: 'Late', due: addDays(-4), kind: 'pdc' },
      { id: 'e', title: 'Forced', due: addDays(90), kind: 'pdc', severity: 'due' },   // a given severity wins
      { id: 'f', title: 'Default lead', due: addDays(7), kind: 'whatever' },          // unknown kind: 7 days
      { title: 'no id' }, null,
    ]);
    const L = R.list(cur()).filter((x) => x.source === 't');
    assert.deepEqual(JSON.parse(JSON.stringify(L.map((x) => [x.id, x.severity]))), [['d', 'overdue'], ['c', 'due'], ['e', 'due'], ['b', 'soon'], ['f', 'soon']]);
    assert.equal(L[0].key, 't:d');
    assert.equal(L[0].days, -4);
    assert.ok(R.listAll(cur()).some((x) => x.id === 'a' && x.severity === 'later'), 'later items only in listAll');
  });

  test('re-registering replaces the source; a failing source does not break the others', () => {
    R.register('t', () => [{ id: 1, title: 'one', due: addDays(0) }]);
    R.register('t', () => [{ id: 2, title: 'two', due: addDays(0) }]);
    R.register('boom', () => { throw new Error('nope'); });
    const warn = console.warn; console.warn = () => {};
    try { assert.deepEqual(keys(R.list(cur()).filter((x) => x.source !== 'invoices')), ['t:2']); } finally { console.warn = warn; }
    assert.equal([...R._sources()].filter((s) => s === 't').length, 1);
  });

  test('lead days per kind and switched-off kinds come from Settings -> Notifications', () => {
    R.register('t', () => [{ id: 'x', title: 'x', due: addDays(10), kind: 'pdc' }]);
    assert.equal(R.list(cur()).filter((x) => x.source === 't').length, 0);
    edit((b) => { b.notifications = { lead: { pdc: 10 } }; });
    assert.equal(R.list(cur()).find((x) => x.source === 't').severity, 'soon');
    edit((b) => { b.notifications = { lead: { pdc: 10 }, off: { pdc: true } }; });
    assert.equal(R.list(cur()).filter((x) => x.source === 't').length, 0);
  });
});

describe('sound: once per item per day', () => {
  test('pickNew: only unread, unsnoozed overdue/due items not yet sounded today', () => {
    const it = (key, severity, extra = {}) => ({ key, severity, read: false, snoozed: false, ...extra });
    const items = [it('a', 'overdue'), it('b', 'due'), it('c', 'soon'), it('d', 'due', { read: true }), it('e', 'overdue', { snoozed: true }), it('f', 'due')];
    assert.deepEqual([...R._pickNew(items, { f: '2026-10-06' }, '2026-10-06')].map((x) => x.key), ['a', 'b']);
    assert.deepEqual([...R._pickNew(items, { a: '2026-10-05', b: '2026-10-06', f: '2026-10-06' }, '2026-10-06')].map((x) => x.key), ['a'], 'yesterday does not count');
    assert.equal(R._pickNew([], {}, '2026-10-06').length, 0);
  });

  test('refresh chimes once for new due items, not again the same day, again the next day', () => {
    R.register('t', () => [{ id: 1, title: 'Rent', due: '2026-10-06' }, { id: 2, title: 'Visa', due: '2026-10-01' }, { id: 3, title: 'Soon', due: '2026-10-08' }]);
    R.refresh();
    assert.equal(chimes.length, 1, 'one chime for the batch');
    assert.equal(toasts.length, 1);
    assert.match(toasts[0], /2 reminders need attention/);
    R.refresh(); R.refresh();
    assert.equal(chimes.length, 1, 'same day: silent');
    const st = R._state(cur().id);
    assert.equal(st.sounded['t:1'], '2026-10-06');
    assert.equal(st.sounded['t:3'], undefined, 'upcoming items never chime');
    R._now = T0 + DAY;                                     // next morning
    R.refresh();
    assert.equal(chimes.length, 2);
    assert.deepEqual(Object.values(R._state(cur().id).sounded), ['2026-10-07', '2026-10-07'], 'old days pruned');
  });

  test('a new item later the same day chimes; volume is passed; one item gets its own toast', () => {
    let list = [{ id: 1, title: 'A', due: '2026-10-06' }];
    R.register('t', () => list);
    edit((b) => { b.notifications = { volume: 35 }; });
    R.refresh();
    list = list.concat([{ id: 2, title: 'Payroll for September not run yet', due: '2026-10-05' }]);
    R.refresh();
    assert.deepEqual(chimes, [35, 35]);
    assert.equal(toasts[1], 'Payroll for September not run yet (overdue)');
  });

  test('mute: no sound and no toast; sound off: toast only; volume 0: silent', () => {
    R.register('t', () => [{ id: 1, title: 'A', due: '2026-10-06' }]);
    edit((b) => { b.notifications = { mute: true }; });
    R.refresh();
    assert.equal(chimes.length + toasts.length, 0);
    assert.equal(R._state(cur().id).sounded['t:1'], '2026-10-06', 'still counted as notified');
    R._now = T0 + DAY; edit((b) => { b.notifications = { sound: false }; });
    R.refresh();
    assert.equal(chimes.length, 0); assert.equal(toasts.length, 1);
    R._now = T0 + 2 * DAY; edit((b) => { b.notifications = { volume: 0 }; });
    R.refresh();
    assert.equal(chimes.length, 0);
  });

  test('before a user gesture the chime waits and plays on unlock', () => {
    R._isUnlocked = () => false;
    R.register('t', () => [{ id: 1, title: 'A', due: '2026-10-06' }]);
    R.refresh();
    assert.equal(chimes.length, 0);
    assert.equal(R._pending(), 60);
  });
});

describe('read and snooze', () => {
  test('mark as read hides an item until its severity changes', () => {
    let due = '2026-10-07';
    R.register('t', () => [{ id: 'k', title: 'K', due }]);
    assert.equal(R.count(cur()) >= 1, true);
    const before = R.count(cur());
    R.markRead('t:k');
    assert.equal(R.count(cur()), before - 1);
    assert.equal(R.list(cur()).find((x) => x.key === 't:k').read, true);
    due = '2026-10-06';                                  // soon -> due: back again
    assert.equal(R.list(cur()).find((x) => x.key === 't:k').read, false);
    R.markRead('t:k'); R.markUnread('t:k');
    assert.equal(R.list(cur()).find((x) => x.key === 't:k').read, false);
  });

  test('snooze 1 day hides it until tomorrow and silences the chime', () => {
    R.register('t', () => [{ id: 'k', title: 'K', due: '2026-10-05' }]);
    R.snooze('t:k');
    assert.equal(R._state(cur().id).snooze['t:k'], '2026-10-07');
    assert.equal(R.list(cur()).find((x) => x.key === 't:k').snoozed, true);
    chimes.length = 0; R.refresh();
    assert.equal(chimes.length, 0);
    R._now = T0 + DAY;
    assert.equal(R.list(cur()).find((x) => x.key === 't:k').snoozed, false);
  });

  test('bell badge counts what needs attention', () => {
    R.register('t', () => [{ id: 1, title: 'A', due: '2026-10-06' }, { id: 2, title: 'B', due: '2026-10-07' }]);
    R.refresh();
    const n = R.count(cur());
    assert.equal(ctx.document.getElementById('hdDot').textContent, String(n));
    assert.equal(ctx.document.getElementById('hdDot').hidden, false);
    assert.equal(App.notificationCount(cur()), n);
    R.markAllRead();
    assert.equal(R.count(cur()), 0);
    assert.equal(ctx.document.getElementById('hdDot').hidden, true);
  });
});

describe('links, page and settings', () => {
  test('links open the target record or Settings page', () => {
    const inv = addInvoice();
    R.openLink({ section: 'Sales Invoices', id: inv.id });
    assert.equal(App.wsSection, 'Sales Invoices'); assert.equal(App.wsMode, 'view'); assert.equal(App.editingId, inv.id);
    R.openLink({ section: 'Settings', setting: 'business' });
    assert.equal(App.wsMode, 'settings'); assert.equal(App.setView, 'business');
  });

  test('Reminders page lists with filters', () => {
    R.register('t', () => [{ id: 1, title: 'Alpha rent', due: '2026-10-06', kind: 'pdc' }, { id: 2, title: 'Beta visa', due: '2026-10-01', kind: 'expiry' }]);
    R.openPage();
    assert.equal(App.wsMode, 'reminders');
    let html = ctx.htmlOf('wsMain');
    assert.ok(html.includes('Alpha rent') && html.includes('Beta visa'));
    assert.ok(html.includes('Mark as read') && html.includes('Snooze 1 day'));
    R._setF('status', 'overdue'); html = ctx.htmlOf('wsMain');
    assert.ok(!html.includes('Alpha rent') && html.includes('Beta visa'));
    R._setF('status', 'attention'); R._setF('q', 'alpha'); html = ctx.htmlOf('wsMain');
    assert.ok(html.includes('Alpha rent') && !html.includes('Beta visa'));
    R._setF('q', ''); R._setF('kind', 'expiry'); html = ctx.htmlOf('wsMain');
    assert.ok(!html.includes('Alpha rent') && html.includes('Beta visa'));
    App.selectSection('Customers');
    assert.notEqual(App.wsMode, 'reminders');
  });

  test('Settings -> Notifications tile, page and save', () => {
    const tiles = App.setTiles();
    const i = tiles.findIndex((t) => t[2] === 'notifications');
    assert.ok(i > 0, 'tile present');
    assert.equal(tiles[i][4], 1);
    assert.equal(tiles[i + 1][1], 'Obsolete Features', 'alphabetical in block 1');
    App.selectSection('Settings');
    assert.ok(App.settingsHtml(cur()).includes("openSetting('notifications')"));
    App.openSetting('notifications');
    const html = App.settingsHtml(cur());
    for (const s of ['Mute all notifications', 'Play a short sound', 'Volume', 'Test sound', 'Trade license &amp; company documents', 'data-rm-lead="pdc"']) assert.ok(html.includes(s), s);
    R.saveSettings({ sound: false, mute: true, volume: 20, lead: { license: 90 }, off: { invoice: true } });
    const p = R.prefs(cur());
    assert.equal(p.sound, false); assert.equal(p.mute, true); assert.equal(p.volume, 20);
    assert.equal(R.leadFor(p, 'license'), 90); assert.equal(R.leadFor(p, 'pdc'), 3);
    assert.equal(R.list(cur()).filter((x) => x.kind === 'invoice').length, 0);
  });

  test('built-in invoices source: unpaid invoices falling due', () => {
    const inv = addInvoice();
    const it = R.list(cur()).find((x) => x.source === 'invoices' && x.link.id === inv.id);
    assert.ok(it, 'listed');
    assert.equal(it.severity, 'overdue'); assert.equal(it.kind, 'invoice');
    assert.equal(it.link.section, 'Sales Invoices');
  });
});

describe('Business Details: trade license and company documents', () => {
  const SP = () => ctx.SettingsPages;
  test('form shows the Trade License section, suggestions and the documents list', () => {
    App.selectSection('Settings'); App.openSetting('business');
    const html = App.settingsHtml(cur());
    for (const s of ['Trade License', 'License number', 'Issuing authority', 'Legal form', 'Activities', 'Issue date', 'Expiry date', 'Company documents',
      'list="bdAuthList"', 'list="bdLegalList"', '<datalist id="bdAuthList">', 'RAKEZ', 'SHAMS', 'SAIF Zone', 'JAFZA', 'DMCC', 'ADDED', 'Ajman DED',
      'Establishment card', 'Chamber of Commerce', 'VAT certificate (TRN)', 'Ejari / tenancy', 'Insurance']) assert.ok(html.includes(s), s);
    assert.ok(/type="date" data-c="expiry"/.test(html), 'document expiry is a date box');
    assert.ok(/type="date" data-k="tlExpiry"[^>]*value=""/.test(html), 'no default expiry');
  });

  test('saving keeps the existing details and stores the license and documents', () => {
    edit((b) => { b.details = Object.assign({}, b.details, { address: 'Shop 1, Dubai', taxNumber: '100200300400003', logo: 'data:x', email: 'a@b.c', listCols: { x: ['y'] }, _keep: 7 }); });
    const r = SP().save('business', { name: cur().name, address: 'Shop 1, Dubai', taxNumber: '100200300400003', logo: 'data:x', email: 'a@b.c',
      tlNumber: ' 778899 ', tlAuthority: 'RAKEZ', tlLegalForm: 'Free Zone Establishment (FZE)', tlActivities: 'General trading', tlIssue: '2025-11-01', tlExpiry: '2026-10-31',
      companyDocs: [{ type: 'Establishment card', number: 'EC-1', issue: '2025-01-01', expiry: '2026-11-15', notes: '' }, { type: 'Insurance' }] });
    assert.ok(r.ok, r.error);
    const d = cur().details;
    assert.equal(d.address, 'Shop 1, Dubai'); assert.equal(d.taxNumber, '100200300400003'); assert.equal(d.logo, 'data:x');
    assert.deepEqual({ ...d.listCols }, { x: ['y'] }); assert.equal(d._keep, 7);
    assert.deepEqual({ ...d.tradeLicense }, { number: '778899', authority: 'RAKEZ', legalForm: 'Free Zone Establishment (FZE)', activities: 'General trading', issueDate: '2025-11-01', expiryDate: '2026-10-31' });
    assert.equal(d.companyDocs.length, 1, 'empty line dropped');
    assert.equal(d.companyDocs[0].number, 'EC-1');
    const f = SP().form('business');
    assert.equal(f.tlAuthority, 'RAKEZ'); assert.equal(f.companyDocs[0].expiry, '2026-11-15');
    /* saving the page again without license fields touched keeps them */
    assert.ok(SP().save('business', { name: cur().name, phone: '04 1234567' }).ok);
    assert.equal(cur().details.tradeLicense.number, '778899');
    assert.equal(cur().details.phone, '04 1234567');
  });

  test("'license' source: 60 / 30 / 7 days before, due, overdue", () => {
    const at = (days) => { edit((b) => { b.details = Object.assign({}, b.details, { tradeLicense: { number: 'TL-9', authority: 'DED', expiryDate: addDays(days) } }); });
      return R.list(cur()).filter((x) => x.source === 'license'); };
    assert.equal(at(61).length, 0, 'not yet');
    let L = at(60); assert.equal(L.length, 1); assert.equal(L[0].severity, 'soon'); assert.match(L[0].id, /:d60$/); assert.equal(L[0].title, 'Trade license TL-9 expires in 60 days');
    assert.match(at(31)[0].id, /:d60$/);
    assert.match(at(30)[0].id, /:d30$/);
    assert.match(at(7)[0].id, /:d7$/);
    L = at(0); assert.equal(L[0].severity, 'due'); assert.match(L[0].id, /:due$/); assert.equal(L[0].title, 'Trade license TL-9 expires today');
    L = at(-3); assert.equal(L[0].severity, 'overdue'); assert.equal(L[0].title, 'Trade license TL-9 expired');
    assert.ok(L[0].detail.includes('DED'));
    assert.deepEqual({ ...L[0].link }, { section: 'Settings', setting: 'business' });
  });

  test('a read license reminder returns at the next stage; documents are covered too', () => {
    edit((b) => { b.details = Object.assign({}, b.details, { tradeLicense: { expiryDate: addDays(29) }, companyDocs: [{ type: 'Ejari / tenancy', number: 'EJ-5', expiry: addDays(-1) }] }); });
    const lic = () => R.list(cur()).filter((x) => x.source === 'license');
    assert.equal(lic().length, 2);
    const doc = lic().find((x) => x.title.startsWith('Ejari'));
    assert.equal(doc.severity, 'overdue'); assert.equal(doc.title, 'Ejari / tenancy EJ-5 expired');
    const tl = lic().find((x) => x.title.startsWith('Trade license'));
    R.markRead(tl.key);
    assert.equal(lic().find((x) => x.title.startsWith('Trade license')).read, true);
    R._now = T0 + 22 * DAY;                                  // 7 days left: new stage
    assert.equal(lic().find((x) => x.title.startsWith('Trade license')).read, false);
  });

  test('license expiry triggers the chime when it becomes due', () => {
    edit((b) => { b.details = Object.assign({}, b.details, { tradeLicense: { number: 'TL-1', expiryDate: addDays(1) } }); });
    R.refresh();
    const n0 = chimes.length;
    R._now = T0 + DAY; R.refresh();
    assert.equal(chimes.length, n0 + 1);
    assert.ok(R.lastFresh.some((x) => x.source === 'license'));
  });
});

const BACKUP = join(ROOT, '..', 'ls_backup_8805_v2.json');
describe('with the TEST - Fair Tax Demo backup', { skip: !existsSync(BACKUP) && 'backup not found' }, () => {
  test('opens, lists, and keeps every business detail through a license save', () => {
    const storage = JSON.parse(readFileSync(BACKUP, 'utf8'));
    const c = loadApp({ storage });
    boot(c); wire(c);
    App.openBiz = 1791237552016;
    const before = JSON.parse(JSON.stringify(cur().details || {}));
    assert.ok(Array.isArray([...R.list(cur())]));
    const r = c.SettingsPages.save('business', Object.assign({}, c.SettingsPages.form('business'), { tlNumber: 'T-1', tlExpiry: addDays(5) }));
    assert.ok(r.ok, r.error);
    const after = cur().details;
    for (const k of Object.keys(before)) assert.deepEqual(JSON.parse(JSON.stringify(after[k])), before[k], k);
    assert.equal(R.list(cur()).find((x) => x.source === 'license').severity, 'soon');
    /* the other businesses are untouched */
    const abb = c.DB.get(c.DB.k.biz, []).find((b) => b.id === 1001);
    assert.equal(abb.details.tradeLicense, undefined);
  });
});
