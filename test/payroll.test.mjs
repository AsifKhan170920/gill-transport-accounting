/* Payroll (js/payroll.js) and Employees — UAE information & documents (js/employees-uae.js).
   Runs against the TEST - Fair Tax Demo business when the backup is present (copied untracked
   into the worktree), else against a small seeded business. DOM-free: the UI functions are
   driven through Payroll.* / EmpUAE.f with the state the pages would hold. */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadApp, loadAppWithDemo } from './_harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['js/settings-pages.js', 'js/txn-forms.js', 'js/forms-fixes.js', 'js/settings-fixes-a.js', 'js/payroll.js', 'js/employees-uae.js'];
const run = (ctx) => { ctx.addEventListener = () => {}; ctx.confirm = () => true; for (const f of FILES) vm.runInContext(readFileSync(join(ROOT, f), 'utf8'), ctx, { filename: f }); };
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 0.005, (m || '') + ` expected ${b}, got ${a}`);
const BACKUP = [join(ROOT, 'ls_backup_8805_v2.json'), join(ROOT, '..', 'ls_backup_8805_v2.json')].find((p) => existsSync(p));
const TEST_ID = 1791237552016;

let ctx, App, P, EU;
const cur = () => App.curBiz();
const save = (b) => App.saveBiz(b);
const tb = (b) => ctx.GL.trial(b, {});
const bal = (b, n) => ctx.employeeBalance(b, n);

function seedSmall() {
  const { ctx: c } = loadAppWithDemo();
  const b = c.App.curBiz();
  b.records.employees = [{ id: 11, name: 'Ahmed Raza', code: 'EMP-001' }, { id: 12, name: 'Bilal Hussain', code: 'EMP-002' }, { id: 13, name: 'Sara Thomas', code: 'EMP-003' }];
  b.records.payslips = []; b.records.payments = (b.records.payments || []);
  b.records.bankCash = (b.records.bankCash || []).concat([{ id: 77, name: 'ADCB Current' }]);
  if (!b.coa.some((n) => n.type === 'account' && !n.control && c.acctRoot(b, n) === 'expense')) {
    b.coa.push({ id: 'gExp', type: 'group', name: 'Expenses', parent: 'pl', plkind: 'expense' }, { id: 'aSal', type: 'account', name: 'Salaries', parent: 'gExp', balance: 0 });
    b.coaTop = b.coaTop || { bs: ['assets', 'liabilities', 'equity'], pl: [] }; b.coaTop.pl = (b.coaTop.pl || []).concat(['gExp']);
  }
  c.App.saveBiz(b);
  return c;
}

beforeEach(() => {
  if (BACKUP) { ctx = loadApp({ storage: JSON.parse(readFileSync(BACKUP, 'utf8')) }); ctx.App.openBiz = TEST_ID; }
  else ctx = seedSmall();
  App = ctx.App; run(ctx); P = ctx.Payroll; EU = ctx.EmpUAE;
  P._today = '2026-10-06'; EU._today = '2026-10-06';
  const b = cur();
  const exp = b.coa.find((n) => n.type === 'account' && !n.control && ctx.acctRoot(b, n) === 'expense');
  b.coa.push({ id: 'aPens', type: 'account', name: 'Pension payable', parent: 'liabilities', balance: 0 }, { id: 'aAdv', type: 'account', name: 'Salary advances', parent: 'liabilities', balance: 0 },
    { id: 'aPensX', type: 'account', name: 'Pension expense', parent: exp.parent, balance: 0 });
  b.payslipItems = b.payslipItems || {};
  b.payslipItems.earnings = (b.payslipItems.earnings && b.payslipItems.earnings.length ? b.payslipItems.earnings : [{ id: 'e1', name: 'Basic salary' }, { id: 'e2', name: 'Housing allowance' }]);
  b.payslipItems.deductions = [{ id: 'd1', name: 'Advance recovery', account: 'aAdv' }];
  b.payslipItems.contributions = [{ id: 'c1', name: 'Pension', expense: 'aPensX', liability: 'aPens' }];
  const it = (n) => b.payslipItems.earnings.find((x) => x.name === n);
  const set = (name, basic, housing, extra) => { const e = b.records.employees.find((x) => x.name === name); e.pay = { earnings: [{ itemId: it('Basic salary').id, item: 'Basic salary', amount: basic }, { itemId: it('Housing allowance').id, item: 'Housing allowance', amount: housing }], deductions: [], contributions: [], ...(extra || {}) }; e.iban = 'AE070331234567890123456'; e.bankName = 'ADCB'; };
  set('Ahmed Raza', 4000, 1500, { deductions: [{ itemId: 'd1', item: 'Advance recovery', amount: 200 }] });
  set('Bilal Hussain', 3500, 1000);
  set('Sara Thomas', 6000, 2000, { contributions: [{ itemId: 'c1', item: 'Pension', amount: 300 }] });
  save(b);
});

describe('payroll run', () => {
  test('prefill: every active employee from the pay setup, dated the last day of the month', () => {
    const d = P.prefill(cur(), '2026-10');
    assert.equal(d.date, '2026-10-31');
    assert.equal(d.rows.length, 3);
    assert.ok(d.rows.every((r) => r.include));
    assert.deepEqual([...d.cols.map((c) => c.item)], ['Basic salary', 'Housing allowance', 'Advance recovery', 'Pension']);
    const a = d.rows.find((r) => r.employee === 'Ahmed Raza');
    near(P.rowTotals(d, a).net, 5300);
    near(P.draftTotals(d).net, 5300 + 4500 + 8000);
  });

  test('an inactive employee is left out; a month that already has manual payslips starts unticked', () => {
    const b = cur(); b.records.employees.find((e) => e.name === 'Bilal Hussain').status = 'Resigned'; save(b);
    assert.equal(P.prefill(cur(), '2026-10').rows.length, 2);
    if (BACKUP) { const d = P.prefill(cur(), '2026-09'); assert.ok(d.rows.every((r) => !r.include && /Already has payslip/.test(r.note))); }
  });

  test('create: one payslip per employee, accrual postings, Trial Balance balanced, liabilities = net', () => {
    const b = cur(); const before = { a: bal(b, 'Ahmed Raza'), b: bal(b, 'Bilal Hussain'), s: bal(b, 'Sara Thomas') };
    const nPs = (b.records.payslips || []).length;
    const d = P.prefill(b, '2026-10'); const r = P.create(b, d);
    assert.ok(!r.errors, JSON.stringify(r.errors)); save(b);
    const b2 = cur();
    assert.equal(b2.records.payslips.length, nPs + 3);
    const mine = b2.records.payslips.filter((p) => p.payrollRun === r.run.id);
    assert.equal(mine.length, 3); assert.ok(mine.every((p) => p.date === '2026-10-31'));
    const t = tb(b2); near(t.debit, t.credit, 'TB');
    near(bal(b2, 'Ahmed Raza') - before.a, 5300); near(bal(b2, 'Bilal Hussain') - before.b, 4500); near(bal(b2, 'Sara Thomas') - before.s, 8000);
    near(ctx.GL.balance(b2, 'aAdv'), 200, 'deduction liability');
    near(ctx.GL.balance(b2, 'aPens'), 300, 'contribution liability');
    near(ctx.GL.balance(b2, 'aPensX'), 300, 'contribution expense');
    const run2 = P.runById(b2, r.run.id); const f = P.figures(b2, run2);
    assert.equal(f.status, 'Accrued'); assert.equal(f.employees, 3); near(f.net, 17800); near(f.gross, 18000); near(f.deductions, 200); near(f.contributions, 300);
    assert.equal(ctx.payslipNetPay(mine.find((p) => p.employee === 'Sara Thomas')), 8000);
    /* a second run for the same month is refused */
    assert.ok(P.validate(b2, P.prefill(b2, '2026-10')).some((e) => /already exists/.test(e)));
  });

  test('validation: nothing ticked, negative net, contribution item without accounts, lock date', () => {
    const b = cur(); const d = P.prefill(b, '2026-10');
    d.rows.forEach((r) => { r.include = false; }); assert.ok(P.validate(b, d).some((e) => /Tick at least one/.test(e)));
    d.rows[0].include = true; const k = d.cols.find((c) => c.item === 'Advance recovery').key; d.rows[0].amt[k] = 99999;
    assert.ok(P.validate(b, d).some((e) => /deductions are more than earnings/.test(e)));
    d.rows[0].amt[k] = 0; b.payslipItems.contributions[0].liability = ''; d.rows[0].amt[d.cols.find((c) => c.item === 'Pension').key] = 10;
    assert.ok(P.validate(b, d).some((e) => /needs an expense and a liability/.test(e)));
    b.payslipItems.contributions[0].liability = 'aPens'; b.lockDate = '2026-10-31';
    assert.ok(P.validate(b, d).some((e) => /lock date/.test(e)));
  });

  test('draft: saved without posting, finished later', () => {
    const b = cur(); const d = P.prefill(b, '2026-10'); const r = P.saveDraft(b, d); save(b);
    const b2 = cur(); const run2 = P.runById(b2, r.run.id);
    assert.equal(run2.state, 'draft'); assert.equal(P.status(b2, run2), 'Draft');
    assert.ok(!(b2.records.payslips || []).some((p) => p.payrollRun === run2.id));
    const d2 = Object.assign({ id: run2.id }, JSON.parse(JSON.stringify(run2)));
    const c = P.create(b2, d2); assert.ok(!c.errors, JSON.stringify(c.errors)); save(b2);
    assert.equal(P.runs(cur()).length, 1); assert.equal(P.runById(cur(), run2.id).state, 'posted');
  });
});

describe('pay salaries', () => {
  const mkRun = () => { const b = cur(); const r = P.create(b, P.prefill(b, '2026-10')); save(b); return r.run.id; };

  test('partial then full payment from ADCB: status Partly paid -> Paid, liabilities clear, TB balanced', () => {
    const before = { a: bal(cur(), 'Ahmed Raza'), b: bal(cur(), 'Bilal Hussain'), s: bal(cur(), 'Sara Thomas') };
    const id = mkRun(); let b = cur();
    const adcb0 = ctx.GL.subBalance(b, 'cash & cash equivalents', 'ADCB Current');
    let r = P.pay(b, id, { bank: 'ADCB Current', date: '2026-11-02', mode: 'each', rows: [{ employee: 'Ahmed Raza', amount: 5300 }, { employee: 'Bilal Hussain', amount: 2000 }] });
    assert.ok(!r.errors, JSON.stringify(r.errors)); save(b);
    assert.equal(r.payments.length, 2); assert.equal(r.payments[0].payee, 'Ahmed Raza'); assert.equal(r.payments[0].date, '2026-11-02');
    b = cur(); assert.equal(P.status(b, P.runById(b, id)), 'Partly paid'); near(P.figures(b, P.runById(b, id)).outstanding, 2500 + 8000);
    near(bal(b, 'Ahmed Raza'), before.a);
    r = P.pay(b, id, { bank: 'ADCB Current', date: '2026-11-02', rows: [{ employee: 'Bilal Hussain', amount: 2500 }, { employee: 'Sara Thomas', amount: 8000 }] }); assert.ok(!r.errors); save(b);
    b = cur(); const f = P.figures(b, P.runById(b, id));
    assert.equal(f.status, 'Paid'); near(f.paid, 17800); near(f.outstanding, 0);
    near(bal(b, 'Ahmed Raza'), before.a); near(bal(b, 'Bilal Hussain'), before.b); near(bal(b, 'Sara Thomas'), before.s);
    near(adcb0 - ctx.GL.subBalance(b, 'cash & cash equivalents', 'ADCB Current'), 17800, 'bank');
    const t = tb(b); near(t.debit, t.credit, 'TB');
  });

  test('refuses more than is owed, an unknown bank, an employee outside the run', () => {
    const id = mkRun(); const b = cur();
    assert.ok(P.pay(b, id, { bank: 'ADCB Current', date: '2026-11-02', rows: [{ employee: 'Ahmed Raza', amount: 6000 }] }).errors.some((e) => /more than/.test(e)));
    assert.ok(P.pay(b, id, { bank: 'Nope', date: '2026-11-02', rows: [{ employee: 'Ahmed Raza', amount: 1 }] }).errors.some((e) => /bank or cash/.test(e)));
    assert.ok(P.pay(b, id, { bank: 'ADCB Current', date: '2026-11-02', rows: [{ employee: 'Nobody', amount: 1 }] }).errors.some((e) => /no payslip/.test(e)));
  });

  test('WPS batch: one payment, one line per employee on Employee clearing account', () => {
    const id = mkRun(); const b = cur();
    const r = P.pay(b, id, { bank: 'ADCB Current', date: '2026-11-02', mode: 'batch', rows: [{ employee: 'Ahmed Raza', amount: 5300 }, { employee: 'Bilal Hussain', amount: 4500 }, { employee: 'Sara Thomas', amount: 8000 }] });
    assert.ok(!r.errors); save(b);
    assert.equal(r.payments.length, 1); assert.equal(r.payments[0].lines.length, 3); near(r.payments[0].amount, 17800);
    assert.equal(P.status(cur(), P.runById(cur(), id)), 'Paid');
    const t = tb(cur()); near(t.debit, t.credit);
    const w = P.wpsTable(cur(), P.runById(cur(), id), { 'Ahmed Raza': 100 });
    assert.equal(w.length, 2); assert.equal(w[1][5], 'AE070331234567890123456');
  });

  test('delete: refused while payments are linked, removes the payslips otherwise', () => {
    const id = mkRun(); let b = cur();
    P.pay(b, id, { bank: 'ADCB Current', date: '2026-11-02', rows: [{ employee: 'Ahmed Raza', amount: 10 }] }); save(b);
    b = cur(); assert.ok(P.deleteRun(b, id).errors);
    b.records.payments = b.records.payments.filter((p) => p.payrollRun !== id); save(b);
    b = cur(); const n = b.records.payslips.length; const r = P.deleteRun(b, id); save(b);
    assert.equal(r.deleted, 3); assert.equal(cur().records.payslips.length, n - 3); assert.equal(P.runs(cur()).length, 0);
  });
});

describe('recurring', () => {
  test('run next month copies the last run (with its edits)', () => {
    const b = cur(); const d = P.prefill(b, '2026-10');
    const k = d.cols.find((c) => c.item === 'Basic salary').key; d.rows.find((r) => r.employee === 'Bilal Hussain').amt[k] = 3700;
    const r = P.create(b, d); save(b);
    const b2 = cur(); assert.equal(P.nextMonth(b2), '2026-11');
    const n = P.prefill(b2, '2026-11', { copyFrom: P.runById(b2, r.run.id) });
    assert.equal(n.date, '2026-11-30'); assert.equal(n.description, 'Payroll Nov 2026');
    near(P.rowTotals(n, n.rows.find((x) => x.employee === 'Bilal Hussain')).earnings, 4700);
  });

  test('reminders: payroll not run, salaries not paid; registered with window.Reminders', () => {
    let b = cur();
    const r1 = P.reminders(b, '2026-11-03');
    assert.ok(r1.some((x) => x.id === 'payroll-run-2026-10' && x.severity === 'overdue' && x.kind === 'payroll'));
    assert.ok(P.reminders(b, '2026-10-28').some((x) => x.id === 'payroll-run-2026-10' && x.severity === 'soon'));
    if (BACKUP) assert.ok(!r1.some((x) => x.id === 'payroll-run-2026-09'), 'September has a payslip for every employee already');
    { const d0 = P.prefill(b, '2026-10'); P.saveDraft(b, d0); assert.equal(P.nextMonth(b), '2026-10', 'a draft month is continued, not skipped'); b.records.payroll = []; }
    P.create(b, P.prefill(b, '2026-10')); save(b); b = cur();
    const r2 = P.reminders(b, '2026-11-03');
    assert.ok(!r2.some((x) => x.id === 'payroll-run-2026-10'));
    assert.ok(r2.some((x) => x.id === 'payroll-pay-2026-10' && /not fully paid/.test(x.title)));
    const got = {}; ctx.Reminders = { register: (id, fn) => { got[id] = fn; } };
    P.registerReminders(); EU.registerReminders();
    assert.equal(typeof got.payroll, 'function'); assert.equal(typeof got['employee-docs'], 'function');
  });
});

describe('payroll summary report', () => {
  test('by month and by employee, from every payslip of the year', () => {
    const b = cur(); P.create(b, P.prefill(b, '2026-10')); save(b);
    const s = P.summary(cur(), '2026');
    const oct = s.months.find((m) => m.month === '2026-10'); near(oct.net, 17800); assert.equal(oct.employeeCount, 3);
    const sara = s.employees.find((e) => e.employee === 'Sara Thomas'); near(sara.contributions, 300); assert.equal(sara.code, 'EMP-003');
  });
});

describe('pages render', () => {
  test('list, review grid, run, pay and report pages', () => {
    App.wsSection = 'Payroll'; App.wsMode = 'list';
    let h = App.listHtml(cur()); assert.ok(h.includes('Run payroll for Oct 2026'), 'list');
    P.ui.newRun('2026-10'); h = P.pageHtml(cur()); assert.ok(h.includes('prReview') && h.includes('Housing allowance') && h.includes('Create <span'));
    P.ui.create(); const runs = P.runs(cur()); assert.equal(runs.length, 1);
    h = P.pageHtml(cur()); assert.ok(h.includes('Payroll — Oct 2026') && h.includes('Pay salaries') && h.includes('Accrued'));
    P.ui.pay(runs[0].id); h = P.pageHtml(cur()); assert.ok(h.includes('Pay salaries — Oct 2026') && h.includes('AE07'));
    P.ui.report('2026'); h = P.pageHtml(cur()); assert.ok(h.includes('By month') && h.includes('By employee'));
    assert.ok(ctx.SIDEBAR.some((s) => s[1] === 'Payroll' && s[2] === 'payroll'));
  });
});

describe('employees: UAE information & documents', () => {
  const form = (id) => { App.wsSection = 'Employees'; App.editingId = id; return App.formHtml(cur()); };

  test('the employee form has the UAE sections and loads the existing values', () => {
    const e = cur().records.employees[0];
    const h = form(e.id);
    for (const s of ['Personal', 'Employment', 'UAE documents', 'Passport', 'Emirates ID', 'Residence visa', 'Labour card', 'Medical insurance', 'Driving licence', 'Bank &amp; WPS', 'Leave &amp; end of service', 'Pay setup', 'Document attachments']) assert.ok(h.includes(s), s);
    assert.ok(h.includes('value="' + e.name + '"')); assert.ok(h.includes('Company Driver'));
  });

  test('validation: Company Driver needs a driving licence, IBAN and Emirates ID formats, unique name', () => {
    const b = cur(); form(b.records.employees[0].id); const S = EU.f.state();
    S.v.empType = 'Company Driver'; S.v.dlNo = ''; S.v.dlExpiry = '';
    let E = EU.validate(b, S.v, S.id, S.pay); assert.ok(E.some((x) => /Driving licence number is required/.test(x)) && E.some((x) => /expiry date is required/.test(x)));
    S.v.dlNo = 'DL-1'; S.v.dlExpiry = '2027-01-01'; S.v.iban = 'AE12 34'; S.v.eidNo = '784-1990'; S.v.name = b.records.employees[1].name;
    E = EU.validate(b, S.v, S.id, S.pay); assert.ok(E.some((x) => /UAE IBAN/.test(x)) && E.some((x) => /15 digits/.test(x)) && E.some((x) => /already called/.test(x)));
  });

  test('save: flat document fields, pay setup, a rename follows into payslips and payroll', () => {
    let b = cur(); const r = P.create(b, P.prefill(b, '2026-10')); save(b);
    const e = cur().records.employees.find((x) => x.name === 'Bilal Hussain');
    form(e.id); const S = EU.f.state();
    Object.assign(S.v, { name: 'Bilal Hussain Khan', empType: 'Company Driver', dlNo: 'DL-778', dlExpiry: '2026-10-20', passportNo: 'P123', passportExpiry: '2026-09-30', eidNo: '784-1990-1234567-1', iban: 'ae070331234567890123456', vehicleNo: 'Truck 12' });
    const saved = EU.f.save('update', { noNav: true }); assert.ok(!saved.errors, JSON.stringify(saved.errors));
    b = cur(); const e2 = b.records.employees.find((x) => x.id === e.id);
    assert.equal(e2.name, 'Bilal Hussain Khan'); assert.equal(e2.dlNo, 'DL-778'); assert.equal(e2.iban, 'AE07 0331 2345 6789 0123 456'); assert.equal(e2.vehicleNo, 'Truck 12');
    assert.equal(e2.pay.earnings.length, 2);
    assert.ok(b.records.payslips.some((p) => p.payrollRun === r.run.id && p.employee === 'Bilal Hussain Khan'));
    assert.ok(!b.records.payslips.some((p) => p.employee === 'Bilal Hussain'));
    assert.ok(bal(b, 'Bilal Hussain Khan') >= 4500 - 0.005); near(bal(b, 'Bilal Hussain'), 0); const t = tb(b); near(t.debit, t.credit);
    /* expiry reminders: passport expired, driving licence within 30 days */
    const rem = EU.reminders(b, '2026-10-06');
    assert.ok(rem.some((x) => /Passport expired/.test(x.title) && x.severity === 'overdue' && x.kind === 'expiry'));
    assert.ok(rem.some((x) => /Driving licence expires in 14 days/.test(x.title) && x.severity === 'soon'));
    assert.ok(EU.reminders(b, '2026-10-20').some((x) => /Driving licence expires today/.test(x.title) && x.severity === 'due'));
    /* list panel and coloured expiry columns */
    App.wsSection = 'Employees'; App.wsMode = 'list';
    assert.ok(App.listHtml(b).includes('Document expiries'));
    const pool = App._colPool(ctx.REG.employees, b); const pc = pool.find((c) => c.key === 'passportExpiry'); assert.ok(pc && pc.euExpiry);
    assert.ok(App._cellHtml(b, 'employees', pc, e2).includes('eu-exp-expired'));
    /* the profile view */
    App.editingId = e.id; assert.ok(App.viewHtml(b).includes('Truck 12'));
  });
});
