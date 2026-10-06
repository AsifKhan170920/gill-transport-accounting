/* PDC — post-dated cheques (js/pdc.js, FEATURES_SPEC 4).
   DOM-free: the model functions (upsert / clear / bounce / unclear / reminders) are what the
   page's buttons call; the list / form / view / ledger HTML is rendered through the app's own
   wrappers. Clicking through the dialogs is checked by hand in a browser. */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadApp } from './_harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['js/txn-forms.js', 'js/allocations.js', 'js/ledger-nav.js', 'js/pdc.js'];
const run = (ctx) => { ctx.addEventListener = () => {}; ctx.confirm = () => true; for (const f of FILES) vm.runInContext(readFileSync(join(ROOT, f), 'utf8'), ctx, { filename: f }); };
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 0.005, (m || '') + ` expected ${b}, got ${a}`);
const BACKUP = [join(ROOT, 'ls_backup_8805_v2.json'), join(ROOT, '..', 'ls_backup_8805_v2.json')].find(existsSync);
const BIZ = 1791237552016;

const iso = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

describe('PDC', { skip: !BACKUP && 'backup file not found' }, () => {
  let ctx, App, P, b;
  const cur = () => App.curBiz();
  const tb = (bb) => ctx.GL.trial(bb || cur(), { to: '2099-12-31' });

  beforeEach(() => {
    ctx = loadApp({ storage: JSON.parse(readFileSync(BACKUP, 'utf8')) });
    run(ctx); App = ctx.App; P = ctx.PDC;
    App.openBiz = BIZ; App.view = 'workspace'; b = cur();
  });

  test('registered: REG entry, Banking sidebar entry after Bank Reconciliations, label <-> key', () => {
    assert.ok(ctx.REG.pdc && ctx.REG.pdc.label === 'PDC');
    assert.equal(ctx.LABEL2KEY.PDC, 'pdc');
    const banking = ctx.SIDEBAR_GROUPS.find((g) => g[0] === 'Banking')[1];
    assert.ok(banking.includes('PDC'));
    const i = ctx.SIDEBAR.findIndex((r) => r[1] === 'PDC');
    assert.equal(ctx.SIDEBAR[i - 1][1], 'Bank Reconciliations');
    App.selectSection('PDC'); assert.equal(App.wsMode, 'list');
  });

  test('received + issued PDC: info rows in the party ledger, no balance effect, TB unchanged', () => {
    const cust = 'Al Noor Trading LLC', sup = 'Emirates Glass Supplies LLC';
    const balC = ctx.customerBalance(b, cust), balS = ctx.supplierBalance(b, sup);
    const t0 = tb(b);
    const r1 = P.upsert(b, { type: 'Received', party: cust, chequeNo: '100201', drawerBank: 'Emirates NBD', chequeDate: inDays(2), amount: '1,500', bankAccount: 'ADCB Current', description: 'TEST PDC received' });
    assert.ok(r1.ok, r1.error);
    const r2 = P.upsert(b, { type: 'Issued', party: sup, chequeNo: '5501', chequeDate: inDays(10), amount: 800, bankAccount: 'ADCB Current', description: 'TEST PDC issued' });
    assert.ok(r2.ok, r2.error);
    App.saveBiz(b); b = cur();
    assert.equal(P.statusOf(b, r1.record), 'Pending');
    near(ctx.customerBalance(b, cust), balC, 'customer balance');
    near(ctx.supplierBalance(b, sup), balS, 'supplier balance');
    const t1 = tb(b); near(t1.debit, t1.credit, 'TB'); near(t1.debit, t0.debit, 'TB total unchanged');

    // customer ledger: an info row, zero debit / credit, running balance unchanged
    App.wsSection = 'Customers'; const custRec = b.records.customers.find((c) => c.name === cust);
    App.ledgerId = custRec.id; App.wsMode = 'ledger';
    const d = App.ledgerData(b);
    const info = d.rows.find((r) => r.pdcInfo);
    assert.ok(info, 'info row present');
    assert.equal(info.debit, 0); assert.equal(info.credit, 0);
    assert.match(info.type, /^PDC #100201 due \d\d\/\d\d\/\d{4} — pending \(1,500\.00\)$/);
    near(d.closing, balC, 'ledger closing = balance');
    assert.match(App.ledgerRowHtml(info), /class="pdc-info-row"/);
    assert.ok(App.ledgerHtml(b).includes('PDC #100201'));
    // statement carries the row (no amounts)
    App.statementReturn = 'ledger';
    const st = App.statementData(b);
    const srow = st.rows.find((r) => /PDC #100201/.test(r.cells[2]));
    assert.ok(srow); assert.equal(srow.cells[3], ''); assert.equal(srow.cells[4], '');
    assert.match(App.statementHtml(b), /<tr class="pdc-info-row">/);

    // supplier ledger shows the issued one, not the received one
    App.wsSection = 'Suppliers'; App.ledgerId = b.records.suppliers.find((s) => s.name === sup).id;
    const ds = App.ledgerData(b);
    assert.ok(ds.rows.some((r) => r.pdcInfo && /5501/.test(r.type)));
    assert.ok(!ds.rows.some((r) => r.pdcInfo && /100201/.test(r.type)));
  });

  test('clear -> receipt in ADCB linked to the PDC, with allocation; balance moves, TB balanced; info row gone', () => {
    const cust = 'Desert Rose Interiors';
    const r = P.upsert(b, { type: 'Received', party: cust, chequeNo: '777', chequeDate: inDays(2), amount: 300, bankAccount: 'Emirates NBD Savings' }).record;
    App.saveBiz(b); b = cur();
    const bal0 = ctx.customerBalance(b, cust);
    const open = ctx.openInvoicesFor(b, 'cust', cust);
    const allocs = open.length ? [{ uid: ctx.invUid(open[0].invoice), amount: Math.min(300, open[0].outstanding) }] : [];
    const nRec = b.records.receipts.length;
    const res = P.clear(b, r.id, { date: '2026-10-06', bankAccount: 'ADCB Current', allocations: allocs });
    assert.ok(res.ok, res.error);
    b = cur();
    assert.equal(b.records.receipts.length, nRec + 1);
    const doc = b.records.receipts.find((x) => x.id === res.doc.id);
    assert.equal(doc.receivedIn, 'ADCB Current'); assert.equal(doc.paidBy, cust); assert.equal(doc.date, '2026-10-06');
    assert.equal(doc.amount, 300); assert.equal(doc.pdcId, r.id); assert.equal(doc.lines[0].sub, cust);
    assert.equal(doc.allocations.length, allocs.length);
    const pr = b.records.pdc.find((x) => x.id === r.id);
    assert.equal(P.statusOf(b, pr), 'Cleared'); assert.equal(pr.clearedId, doc.id); assert.equal(pr.clearingDate, '2026-10-06'); assert.equal(pr.bankAccount, 'ADCB Current');
    near(ctx.customerBalance(b, cust), bal0 - 300, 'customer balance drops by the cheque');
    const t = tb(b); near(t.debit, t.credit, 'TB');
    App.wsSection = 'Customers'; App.ledgerId = b.records.customers.find((c) => c.name === cust).id;
    const d = App.ledgerData(b);
    assert.ok(!d.rows.some((x) => x.pdcInfo), 'info row gone once cleared');
    assert.ok(d.rows.some((x) => x.src === 'receipts' && x.id === doc.id && x.credit === 300));
    // clearing twice is refused
    assert.equal(P.clear(b, r.id, {}).ok, false);
    // undo clearing deletes the receipt and returns to Pending
    const u = P.unclear(b, r.id); assert.ok(u.ok, u.error); b = cur();
    assert.ok(!b.records.receipts.some((x) => x.id === doc.id));
    assert.equal(P.statusOf(b, b.records.pdc.find((x) => x.id === r.id)), 'Pending');
    near(ctx.customerBalance(b, cust), bal0, 'balance restored');
  });

  test('issued PDC clears to a Payment; deleting that payment returns the cheque to Pending', () => {
    const sup = 'Sharjah Aluminium Co.';
    const r = P.upsert(b, { type: 'Issued', party: sup, chequeNo: 'S-9', chequeDate: inDays(-1), amount: 250, bankAccount: 'ADCB Current' }).record;
    const bal0 = ctx.supplierBalance(b, sup);
    const res = P.clear(b, r.id, {}); assert.ok(res.ok, res.error); b = cur();
    const doc = b.records.payments.find((x) => x.id === res.doc.id);
    assert.equal(doc.paidFrom, 'ADCB Current'); assert.equal(doc.payee, sup); assert.equal(doc.payeeType, 'supplier');
    near(ctx.supplierBalance(b, sup), bal0 - 250, 'supplier balance');
    near(tb(b).debit, tb(b).credit, 'TB');
    b.records.payments = b.records.payments.filter((x) => x.id !== doc.id); App.saveBiz(b); b = cur();
    assert.equal(P.statusOf(b, b.records.pdc.find((x) => x.id === r.id)), 'Pending');
  });

  test('bounce with a bank charge posts only the charge; cancel / reopen / deposit status moves', () => {
    const r = P.upsert(b, { type: 'Received', party: 'Al Noor Trading LLC', chequeNo: 'B1', chequeDate: inDays(0), amount: 900, bankAccount: 'ADCB Current' }).record;
    const exp = b.coa.find((n) => n.type === 'account' && ctx.acctRoot && ctx.acctRoot(b, n) === 'expense') || b.coa.find((n) => n.type === 'account');
    const nPay = (b.records.payments || []).length;
    assert.equal(P.bounce(b, r.id, { charge: 50 }).ok, false, 'charge needs an account');
    const res = P.bounce(b, r.id, { date: '2026-10-06', charge: 50, chargeAccount: exp.id, note: 'insufficient funds' });
    assert.ok(res.ok, res.error); b = cur();
    assert.equal(b.records.payments.length, nPay + 1);
    const pr = b.records.pdc.find((x) => x.id === r.id);
    assert.equal(P.statusOf(b, pr), 'Bounced'); assert.equal(pr.bounceNote, 'insufficient funds');
    near(tb(b).debit, tb(b).credit, 'TB');
    assert.equal(P.clear(b, r.id, {}).ok, false, 'a bounced cheque cannot be cleared');
    assert.ok(P.setStatus(b, r.id, 'Pending').ok);
    assert.ok(P.setStatus(b, r.id, 'Deposited').ok); assert.equal(P.statusOf(b, cur().records.pdc.find((x) => x.id === r.id)), 'Deposited');
    assert.ok(P.setStatus(cur(), r.id, 'Cancelled').ok);
    assert.equal(P.setStatus(cur(), r.id, 'Deposited').ok, false);
  });

  test('validation, duplicate cheque numbers, lock date', () => {
    assert.equal(P.upsert(b, { type: 'Received', party: '', chequeDate: inDays(1), amount: 5 }).ok, false);
    assert.equal(P.upsert(b, { type: 'Received', party: 'X', chequeDate: '', amount: 5 }).ok, false);
    assert.equal(P.upsert(b, { type: 'Received', party: 'X', chequeDate: inDays(1), amount: 0 }).ok, false);
    assert.ok(P.upsert(b, { type: 'Received', party: 'X', chequeNo: '1', chequeDate: inDays(1), amount: 5, bankAccount: 'ADCB Current' }).ok);
    assert.equal(P.upsert(b, { type: 'Received', party: 'X', chequeNo: '1', chequeDate: inDays(3), amount: 6 }).ok, false, 'duplicate');
    b.lockDate = '2026-12-31';
    const r = b.records.pdc[b.records.pdc.length - 1];
    const res = P.clear(b, r.id, { date: '2026-10-06' });
    assert.equal(res.ok, false); assert.match(res.error, /lock date/);
  });

  test('bulk clear: one save, receipts + payments, skips closed ones; TB balanced', () => {
    const a = P.upsert(b, { type: 'Received', party: 'Al Noor Trading LLC', chequeNo: 'K1', chequeDate: inDays(1), amount: 100, bankAccount: 'ADCB Current' }).record;
    const c = P.upsert(b, { type: 'Issued', party: 'Office Mart Stationery', chequeNo: 'K2', chequeDate: inDays(1), amount: 40, bankAccount: 'ADCB Current' }).record;
    const x = P.upsert(b, { type: 'Received', party: 'Al Noor Trading LLC', chequeNo: 'K3', chequeDate: inDays(1), amount: 60, bankAccount: 'ADCB Current' }).record;
    P.setStatus(b, x.id, 'Cancelled', { noSave: true }); App.saveBiz(b); b = cur();
    const res = P.bulkClear(b, [a.id, c.id, x.id], { date: '2026-10-06' });
    assert.equal(res.done.length, 2); assert.equal(res.failed.length, 0); b = cur();
    assert.ok(b.records.receipts.some((d) => d.pdcId === a.id));
    assert.ok(b.records.payments.some((d) => d.pdcId === c.id));
    assert.equal(P.statusOf(b, b.records.pdc.find((r) => r.id === x.id)), 'Cancelled');
    near(tb(b).debit, tb(b).credit, 'TB');
  });

  test('reminders: overdue / due / soon within N days; register with window.Reminders', () => {
    P.upsert(b, { type: 'Received', party: 'A', chequeNo: 'r1', chequeDate: inDays(-2), amount: 1 });
    P.upsert(b, { type: 'Received', party: 'A', chequeNo: 'r2', chequeDate: inDays(0), amount: 1 });
    P.upsert(b, { type: 'Issued', party: 'B', chequeNo: 'r3', chequeDate: inDays(3), amount: 1 });
    P.upsert(b, { type: 'Issued', party: 'B', chequeNo: 'r4', chequeDate: inDays(4), amount: 1 });
    const list = P.reminders(b);
    assert.deepEqual([...list.map((x) => x.severity)], ['overdue', 'due', 'soon']);
    assert.ok(list.every((x) => x.kind === 'pdc' && x.link.section === 'PDC' && /^\d{4}-\d\d-\d\d$/.test(x.due)));
    b.pdcSettings = { remindDays: 5 };
    assert.equal(P.reminders(b).length, 4);
    // contract: register('pdc', fn) once Reminders exists
    const seen = [];
    ctx.Reminders = { register: (id, fn) => seen.push([id, fn]) };
    assert.equal(P.registerReminders(), true);
    assert.equal(seen[0][0], 'pdc'); assert.equal(seen[0][1](b).length, 4);
  });

  test('list / form / view render; filters and totals by status', () => {
    const r = P.upsert(b, { type: 'Received', party: 'Al Noor Trading LLC', chequeNo: 'L1', chequeDate: inDays(-1), amount: 120, bankAccount: 'ADCB Current' }).record;
    P.upsert(b, { type: 'Issued', party: 'Office Mart Stationery', chequeNo: 'L2', chequeDate: inDays(20), amount: 70, bankAccount: 'ADCB Current' });
    App.saveBiz(b); b = cur();
    App.selectSection('PDC');
    let h = App.listHtml(b);
    assert.match(h, /pdc-tabs/); assert.match(h, /PDC\.clearOpen\(/); assert.match(h, /Overdue 1 day/);
    App._pdcFilter = 'overdue'; h = App.tableHtml(b);
    assert.ok(h.includes('L1') && !h.includes('L2'));
    App._pdcFilter = 'all'; App._pdcType = 'Issued'; h = App.tableHtml(b);
    assert.ok(!h.includes('>L1<') && h.includes('L2'));
    App._pdcType = 'all';
    const T = P.totals(b); assert.equal(T.Pending.n, 2); near(T.Pending.rcv, 120); near(T.Pending.iss, 70);
    App.editingId = null; App.wsMode = 'form';
    assert.match(App.formHtml(b), /id="pdc_party"/);
    App.editingId = r.id; App.wsMode = 'view';
    const v = App.viewHtml(b);
    assert.match(v, /PDC\.bounceOpen\(/); assert.match(v, /Information only/);
    assert.ok(!v.includes('App.txnJournal()'), 'no transaction journal on a PDC');
    // bulk mode swaps the delete bar for a clear bar
    App.wsMode = 'list'; P.bulkStart(); h = App.tableHtml(cur());
    assert.match(h, /PDC\.bulkClearOpen\(\)/); assert.ok(!h.includes('batchDeleteRun'));
  });
});
