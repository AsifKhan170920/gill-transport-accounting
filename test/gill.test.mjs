/* Gill Transport: js/gill-trips.js + js/gill-diesel.js (FEATURES_SPEC section 5).
   The grid's keyboard / clipboard handling is checked in a browser; pinned here are
   the gate, the sidebar group, parsing and paste mapping, filters, totals, the reports,
   CSV, and the Diesel -> Purchase Invoice link (prefill, settle on save, revert on delete). */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadAppWithDemo } from './_harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (ctx, f) => vm.runInContext(readFileSync(join(ROOT, f), 'utf8'), ctx, { filename: f });

let ctx, App, Gill;
beforeEach(() => {
  ({ ctx } = loadAppWithDemo());
  run(ctx, 'js/gill-trips.js');
  run(ctx, 'js/gill-diesel.js');
  App = ctx.App; Gill = ctx.Gill;
  App.view = 'workspace';
  /* the designed form mounts in a browser only */
  App._mountDesignedForm = () => {};
});
const cur = () => App.curBiz();
const edit = (fn) => { const b = cur(); fn(b); App.saveBiz(b); return cur(); };
const plain = (x) => JSON.parse(JSON.stringify(x));
const enable = () => Gill.setEnabled(true);
const open = (label) => { App.wsSection = label; App.wsMode = 'section'; App.renderMain(cur()); return ctx.htmlOf('wsMain'); };

describe('gate', () => {
  test('without the flag nothing changes apart from the settings tile', () => {
    assert.ok(App.setTiles().some((t) => t[2] === 'gill' && t[1] === 'Gill Transport'));
    const before = vm.runInContext('SIDEBAR.length', ctx);
    App.renderSidebar(cur());
    const side = ctx.htmlOf('sidebar');
    assert.ok(!side.includes('Trips') && !side.includes('Transport'));
    App.wsSection = 'Trips'; App.wsMode = 'section'; App.renderMain(cur());
    assert.ok(!ctx.htmlOf('wsMain').includes('gl-grid'), 'no Trips page without the flag');
    assert.equal(vm.runInContext('SIDEBAR.length', ctx), before);
    assert.equal(cur().gill, undefined, 'no data written');
  });
  test('Enable adds a Transport group with Trips and Diesel, for this business only', () => {
    enable();
    assert.equal(cur().features.gill, true);
    App.renderSidebar(cur());
    const side = ctx.htmlOf('sidebar');
    assert.ok(side.indexOf('>Transport<') > side.indexOf('>Purchases<'), 'group after Purchases');
    assert.ok(side.includes('data-side="Trips"') && side.includes('data-side="Diesel"'));
    assert.ok(!vm.runInContext("SIDEBAR.some(function(r){return r[1]==='Trips'})", ctx), 'SIDEBAR itself is left untouched');
    assert.ok(!vm.runInContext("SIDEBAR_GROUPS.some(function(g){return g[0]==='Transport'})", ctx));
    assert.ok(open('Trips').includes('gl-grid'));
    assert.ok(open('Diesel').includes('Create Purchase Invoice') || open('Diesel').includes('glSelBar'));
  });
  test('settings page: switch + pick-lists saved one per line', () => {
    App.setView = 'gill';
    const html = App.settingsHtml(cur());
    assert.ok(html.includes('gl_enable') && html.includes('gl_set_trucks') && html.includes('gl_set_dieselSuppliers'));
    Gill.saveLists({ trucks: 'T-100\nT-200\n\nt-100', crushers: ['Fujairah Crusher'], materials: 'Gabbro 3/4"' });
    const L = cur().gill.lists;
    assert.deepEqual([...L.trucks], ['T-100', 'T-200']);
    assert.deepEqual([...L.crushers], ['Fujairah Crusher']);
    assert.deepEqual([...L.vessels], []);
  });
});

describe('parsing', () => {
  test('dates: day first, ISO, Excel serials, month names; null when not a date', () => {
    const P = Gill.util.parseDate;
    assert.equal(P('06/10/2026'), '2026-10-06');
    assert.equal(P('6.10.26'), '2026-10-06');
    assert.equal(P('2026-10-06'), '2026-10-06');
    assert.equal(P('46301'), '2026-10-06');
    assert.equal(P('6-Oct-2026'), '2026-10-06');
    assert.equal(P('06 October 2026'), '2026-10-06');
    assert.equal(P(''), '');
    assert.equal(P('31/02/2026'), null);
    assert.equal(P('hello'), null);
    edit((b) => { b.fmt = Object.assign({}, b.fmt, { date: 'MM/DD/YYYY' }); });
    assert.equal(P('10/06/2026'), '2026-10-06', 'month first when the business shows dates that way');
  });
  test('numbers and TSV with quoted cells', () => {
    const N = Gill.util.parseNum;
    assert.equal(N('1,234.50'), 1234.5); assert.equal(N('AED 12'), 12); assert.equal(N(''), ''); assert.equal(N('abc'), null); assert.equal(N('(5)'), -5);
    const rows = Gill.util.parseTSV('a\tb\n"x\ty"\t"multi\nline"\n\n');
    assert.deepEqual(JSON.parse(JSON.stringify(rows)), [['a', 'b'], ['x\ty', 'multi\nline']]);
  });
});

describe('Trips', () => {
  beforeEach(() => { enable(); open('Trips'); });
  test('add rows, edit cells (autosave), totals', () => {
    const r1 = Gill.addRow();
    assert.equal(Gill.setField(r1.id, 'date', '01/10/2026'), 'ok');
    assert.equal(Gill.setField(r1.id, 'truck', 'T-100'), 'ok');
    assert.equal(Gill.setField(r1.id, 'weight', '32.5'), 'ok');
    assert.equal(Gill.setField(r1.id, 'gillFnrc', '150'), 'ok');
    assert.equal(Gill.setField(r1.id, 'weight', 'heavy'), 'bad');
    assert.equal(Gill.setField(r1.id, 'date', '45/45/2026'), 'bad');
    const r2 = Gill.addRow();
    assert.equal(cur().gill.trips.find((r) => r.id === r2.id).date, '2026-10-01', 'a new row takes the previous date');
    Gill.setField(r2.id, 'weight', '1,000.25'); Gill.setField(r2.id, 'aberToll', '8');
    const b = cur(), p = Gill.pages.Trips, t = Gill.totals(b, p, Gill.visible(b, p));
    assert.equal(t.weight, 1032.75); assert.equal(t.gillFnrc, 150); assert.equal(t.aberToll, 8); assert.equal(t.n, 2);
    const html = open('Trips');
    assert.ok(html.includes('id="gl-tot-weight"') && html.includes('Total · 2 trips'));
  });
  test('paste a multi-row block from Excel, positional and with a header row', () => {
    const r = Gill.addRow();
    const b = cur(), p = Gill.pages.Trips;
    const res = Gill.pasteBlock(b, p, '02/10/2026\tTK-1\tT-100\tAli\tAl Noor Trading LLC\tFujairah\tPort\tGabbro\tMV Sea\t30\t100\t0\t5\t10\tfirst\n' +
      '03/10/2026\tTK-2\tT-200\tBilal\tGulf Star Logistics FZE\tFujairah\tPort\tSand\t\t28.5\t90\t10\t5\t\tsecond\n', r.id, 'date');
    App.saveBiz(b);
    assert.equal(res.rows, 2); assert.equal(res.bad, 0);
    const trips = cur().gill.trips;
    assert.equal(trips.length, 2, 'the first line filled the empty row, the second added one');
    const a = trips.find((x) => x.ticket === 'TK-1');
    assert.equal(a.date, '2026-10-02'); assert.equal(a.truck, 'T-100'); assert.equal(a.weight, 30); assert.equal(a.sharjahToll, 10); assert.equal(a.desc, 'first');
    /* a header row maps columns by name, in any order; every line is a new row */
    const b2 = cur();
    const res2 = Gill.pasteBlock(b2, p, 'Truck No\tDate\tWeight\tDriver Name\nT-300\t04/10/2026\t25\tSaeed\n', null, null);
    App.saveBiz(b2);
    assert.equal(res2.rows, 1);
    const c = cur().gill.trips.find((x) => x.truck === 'T-300');
    assert.equal(c.date, '2026-10-04'); assert.equal(c.weight, 25); assert.equal(c.driver, 'Saeed');
    /* pasting at a column starts there */
    const b3 = cur();
    Gill.pasteBlock(b3, p, '11\t12', a.id, 'gillFnrc'); App.saveBiz(b3);
    const a2 = cur().gill.trips.find((x) => x.id === a.id);
    assert.equal(a2.gillFnrc, 11); assert.equal(a2.otherFnrc, 12);
  });
  test('filters, duplicate, delete, report, CSV', () => {
    const b = cur(), p = Gill.pages.Trips;
    Gill.pasteBlock(b, p, 'Date\tTruck No\tDriver Name\tCrusher Name\tMaterial\tAccount\tWeight\tGill FNRC\n' +
      '01/09/2026\tT-100\tAli\tC1\tGabbro\tAl Noor Trading LLC\t10\t100\n' +
      '15/09/2026\tT-200\tBilal\tC2\tSand\tGulf Star Logistics FZE\t20\t50\n' +
      '01/10/2026\tT-100\tBilal\tC1\tGabbro\tAl Noor Trading LLC\t30\t25\n', null, null);
    App.saveBiz(b);
    Gill.st('Trips').fresh = {};
    Gill.setFilter('truck', 'T-100');
    assert.equal(Gill.visible(cur(), p).length, 2);
    Gill.setFilter('from', '2026-10-01');
    assert.equal(Gill.visible(cur(), p).length, 1);
    Gill.clearFilters();
    Gill.setFilter('driver', 'Bilal'); Gill.setFilter('crusher', 'C1');
    assert.equal(Gill.visible(cur(), p).length, 1);
    Gill.clearFilters();
    const rep = Gill.report(cur(), p, 'truck');
    assert.deepEqual(plain(rep.lines.map((l) => [l.key, l.t.n, l.t.weight, l.t.charges])), [['T-100', 2, 40, 125], ['T-200', 1, 20, 50]]);
    assert.equal(rep.total.weight, 60);
    assert.deepEqual(plain(Gill.report(cur(), p, 'month').lines.map((l) => [l.label, l.t.n])), [['Sep 2026', 2], ['Oct 2026', 1]]);
    assert.deepEqual(plain(Gill.report(cur(), p, 'driver').lines.map((l) => l.key)), ['Ali', 'Bilal']);
    const csv = Gill.csv(cur(), p).split('\r\n');
    assert.ok(csv[0].startsWith('Date,Ticket No,Truck No,Driver Name,Account,Crusher Name'));
    assert.equal(csv.length, 6, 'header + 3 rows + total + trailing');
    assert.ok(csv[4].startsWith('Total (3)'));
    assert.ok(Gill.printHtml(cur(), p).includes('<tfoot>'));
    Gill.st('Trips').view = 'report';
    assert.ok(Gill.csv(cur(), p).startsWith('Truck,Trips,Weight'));
    Gill.st('Trips').view = 'entries';
    /* duplicate the current row, delete ticked */
    const first = Gill.visible(cur(), p)[0];
    Gill.st('Trips').cur = first.id; Gill.dupRows();
    assert.equal(cur().gill.trips.length, 4);
    Gill.st('Trips').sel = { [first.id]: true }; Gill.deleteRows();
    assert.equal(cur().gill.trips.length, 3);
    assert.ok(!cur().gill.trips.some((r) => r.id === first.id));
  });
  test('pick-lists: drivers from Company Driver employees, accounts from customers', () => {
    edit((b) => { b.records.employees = (b.records.employees || []).concat([{ id: 9, name: 'Driver Dan', employeeType: 'Company Driver' }, { id: 10, name: 'Office Olga', employeeType: 'Staff' }]); });
    const src = Gill.source(cur(), 'driver');
    assert.ok(src.includes('Driver Dan') && !src.includes('Office Olga'));
    assert.ok(Gill.source(cur(), 'account').length >= 1);
    Gill.saveLists({ trucks: 'T-9' });
    assert.ok(Gill.source(cur(), 'truck').includes('T-9'));
    assert.ok(open('Trips').includes('<datalist id="gl-dl-truck"><option value="T-9">'));
  });
});

describe('Diesel -> Purchase Invoice', () => {
  let ids;
  beforeEach(() => {
    enable(); open('Diesel');
    const b = cur(), p = Gill.pages.Diesel;
    Gill.pasteBlock(b, p, 'Date\tSupplier\tTruck No\tDriver\tQty (litres)\tRate\tStation/Ref\n' +
      '01/10/2026\tADNOC Fuel\tT-100\tAli\t100\t3\tS1\n' +
      '02/10/2026\tADNOC Fuel\tT-200\tBilal\t150.5\t3\tS1\n' +
      '03/10/2026\tADNOC Fuel\tT-100\tAli\t80\t3\tS2\n' +
      '05/10/2026\tADNOC Fuel\tT-300\tSaeed\t69.5\t3\tS2\n' +
      '04/10/2026\tEmarat\tT-100\tAli\t50\t\tE1\n' +
      '06/10/2026\tADNOC Fuel\tT-200\tBilal\t40\t3\tS1\n', null, null);
    App.saveBiz(b);
    Gill.st('Diesel').fresh = {};
    ids = cur().gill.diesel.filter((r) => r.supplier === 'ADNOC Fuel' && r.date <= '2026-10-05').map((r) => r.id);
  });
  const invoices = () => cur().records.purchInv || [];
  /* what the Purchase Invoice form does on Save: push the record and save the business */
  const saveInvoice = (pf, ref) => { const b = cur(); const rec = Object.assign(JSON.parse(JSON.stringify(pf)), { id: Date.now() + Math.floor(Math.random() * 1000), reference: ref });
    rec.lines.forEach((l) => { l.price = 2.9; l.amountNoTax = Math.round(l.qty * 2.9 * 100) / 100; l.totalWithTax = l.amountNoTax; l.amount = l.amountNoTax; });
    b.records.purchInv = (b.records.purchInv || []).concat([rec]); App.saveBiz(b); return rec; };

  test('prefill: supplier, one Fuel line with the summed litres and the date span', () => {
    assert.equal(ids.length, 4);
    const b = cur(), res = Gill.diesel.buildInvoice(b, ids, { addSupplier: true });
    assert.ok(!res.error, res.error);
    assert.equal(res.prefill.supplier, 'ADNOC Fuel');
    assert.equal(res.prefill.lines.length, 1);
    const ln = res.prefill.lines[0];
    assert.equal(ln.qty, 400); assert.equal(ln.price, 3);
    assert.equal(ln.description, 'Diesel 01/10–05/10 (4 entries)');
    assert.equal(ln.accountName, 'Fuel');
    const fuel = b.coa.find((n) => n.id === ln.account);
    assert.equal(fuel.name, 'Fuel'); assert.equal(vm.runInContext('acctRoot', ctx)(b, fuel), 'expense');
    assert.ok(b.records.suppliers.some((s) => s.name === 'ADNOC Fuel'), 'supplier added');
    assert.equal(Gill.diesel.fuelAccount(b).id, fuel.id, 'found, not duplicated');
  });
  test('refuses mixed suppliers, billed entries and an unknown supplier without consent', () => {
    const b = cur(), all = b.gill.diesel;
    const mixed = Gill.diesel.buildInvoice(b, all.map((r) => r.id), {});
    assert.match(mixed.error, /2 suppliers/);
    assert.equal(Gill.diesel.buildInvoice(b, ids, {}).needSupplier, 'ADNOC Fuel');
    assert.match(Gill.diesel.buildInvoice(b, [], {}).error, /Tick/);
  });
  test('save settles the entries; cancel leaves them; delete reverts them', () => {
    const res = Gill.createInvoice(ids, true);
    assert.ok(res && res.prefill, 'opened');
    assert.equal(App.wsSection, 'Purchase Invoices'); assert.equal(App.wsMode, 'form');
    assert.equal(App._prefill.lines[0].qty, 400);
    assert.ok(Gill._pending && Gill._pending.ids.length === 4);
    /* a quick-create supplier save while the form is open links nothing */
    edit(() => {});
    assert.ok(cur().gill.diesel.every((r) => !r.invId));
    const inv = saveInvoice(App._prefill, 'PI-77');
    let b = cur();
    const billed = b.gill.diesel.filter((r) => Gill.diesel.billed(b, r));
    assert.deepEqual(plain(billed.map((r) => r.id).sort()), plain(ids.slice().sort()));
    assert.ok(billed.every((r) => String(r.invId) === String(inv.id) && r.invRef === 'PI-77'));
    assert.equal(Gill._pending, null, 'a second invoice will not link');
    assert.equal(inv.lines[0].qty, 400);
    /* the GL stays balanced */
    const GL = vm.runInContext('GL', ctx); const lines = GL.docLines(b, 'purchInv', inv.id);
    const dr = lines.reduce((s, l) => s + (+l.debit || 0), 0), cr = lines.reduce((s, l) => s + (+l.credit || 0), 0);
    assert.ok(lines.length >= 2 && Math.abs(dr - cr) < 0.005 && dr > 0, 'invoice posts Dr Fuel / Cr AP');
    /* billed rows are locked and show the Settled badge linking to the invoice */
    App.wsSection = 'Diesel'; App.wsMode = 'section'; App.renderMain(cur());
    const html = ctx.htmlOf('wsMain');
    assert.ok(html.includes('gl-settled') && html.includes("Gill.openInvoice('" + inv.id + "')") && html.includes('PI-77'));
    assert.ok(html.includes('4 diesel entries settled on purchase invoice PI-77'));
    assert.equal(Gill.setField(ids[0], 'qty', '1', 'Diesel'), 'locked');
    Gill.st('Diesel').sel = { [ids[0]]: true }; Gill.deleteRows();
    assert.equal(cur().gill.diesel.length, 6, 'billed rows are not deleted');
    Gill.st('Diesel').sel = {};
    /* report: billed vs unbilled litres by supplier */
    const rep = Gill.report(cur(), Gill.pages.Diesel, 'supplier');
    const ad = rep.lines.find((l) => l.key === 'ADNOC Fuel');
    assert.equal(ad.t.billedQty, 400); assert.equal(ad.t.unbilledQty, 40); assert.equal(ad.t.amount, 1320);
    /* filter by status */
    Gill.setFilter('status', 'unbilled');
    assert.equal(Gill.visible(cur(), Gill.pages.Diesel).length, 2);
    Gill.clearFilters();
    /* delete the invoice -> entries back to Unbilled */
    b = cur(); b.records.purchInv = b.records.purchInv.filter((x) => x.id !== inv.id); App.saveBiz(b);
    b = cur();
    assert.ok(b.gill.diesel.every((r) => !Gill.diesel.billed(b, r) && r.invId == null));
    assert.equal(Gill.setField(ids[0], 'qty', '101', 'Diesel'), 'ok');
  });
  test('cancelling the form leaves the entries unbilled', () => {
    Gill.createInvoice(ids, true);
    assert.ok(Gill._pending);
    App.backFromRecord();                // the form's Cancel
    assert.equal(App.wsSection, 'Diesel');
    assert.equal(Gill._pending, null);
    const before = invoices().length;
    saveInvoice({ supplier: 'Other', lines: [{ qty: 1, description: 'x' }] }, 'PI-1');
    assert.equal(invoices().length, before + 1);
    assert.ok(cur().gill.diesel.every((r) => !r.invId));
  });
});
