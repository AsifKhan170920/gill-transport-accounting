/* Settings fixes A (js/settings-fixes-a.js, FIX_SPEC_SETTINGS 95-111 + leftovers 62 / 71).
   DOM-free: the form extras are driven through SettingsFixesA._withValues, which is what the
   real forms do with the values they read from the page. Browser behaviour (injection into the
   mounted forms, line grids) is checked by hand in a real browser. */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadAppWithDemo, loadApp } from './_harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILES = ['js/settings-pages.js', 'js/txn-forms.js', 'js/form-editor-bridge.js', 'js/forms-fixes.js', 'js/settings-fixes-a.js'];
const run = (ctx) => { ctx.addEventListener = () => {}; ctx.confirm = () => true; for (const f of FILES) vm.runInContext(readFileSync(join(ROOT, f), 'utf8'), ctx, { filename: f }); };
const near = (a, b, m) => assert.ok(Math.abs(a - b) < 0.005, (m || '') + ` expected ${b}, got ${a}`);

let ctx, App, S, TF;
const cur = () => App.curBiz();
const save = (b) => App.saveBiz(b);
function acctOf(b, root) { return b.coa.find((n) => n.type === 'account' && !n.control && ctx.acctRoot(b, n) === root); }

beforeEach(() => {
  ({ ctx } = loadAppWithDemo());
  App = ctx.App; run(ctx); S = ctx.SettingsFixesA; TF = ctx.TxnForms;
  const b = cur();
  b.coa = [{ id: 'gi', type: 'group', name: 'Income', parent: 'pl', plkind: 'income' }, { id: 'ge', type: 'group', name: 'Expenses', parent: 'pl', plkind: 'expense' },
    { id: 'aInc', type: 'account', name: 'Sales', parent: 'gi', balance: 0 }, { id: 'aExp', type: 'account', name: 'Office', parent: 'ge', balance: 0 },
    { id: 'aAsset', type: 'account', name: 'Prepaid', parent: 'assets', balance: 0 }, { id: 'aLia', type: 'account', name: 'Payroll tax payable', parent: 'liabilities', balance: 0 }];
  b.coaTop = { bs: ['assets', 'liabilities', 'equity'], pl: ['gi', 'ge'] };
  b.records = {};
  b.records.customers = [{ id: 1, name: 'Al Noor' }, { id: 2, name: 'Desert Rose' }];
  b.records.employees = [{ id: 11, name: 'Ahmed Raza', code: 'EMP-001' }];
  b.records.bankCash = [{ id: 21, name: 'ADCB' }];
  b.records.capital = [{ id: 31, name: 'Partner A', balance: 1000 }];
  b.records.special = [{ id: 41, name: 'Clearing', balance: 300 }];
  b.records.salesInv = []; b.records.payments = []; b.records.payslips = []; b.records.purchInv = [];
  b.taxCodes = [{ name: 'VAT 5%', rate: 5 }];
  b.customFieldDefs = {
    text: [{ id: 'cfLpo', name: 'LPO Number', type: 'Single line text', printed: true, placement: ['Sales Invoice'], position: 2 },
           { id: 'cfSecret', name: 'Internal note', type: 'Single line text', noCopy: true, placement: ['Sales Invoice'], position: 1 },
           { id: 'cfLine', name: 'Batch', type: 'Single line text', placement: ['Sales Invoice - Line'] }],
    checkbox: [{ id: 'cfChk', name: 'Urgent', placement: ['Sales Invoice', 'Payment'], printed: true }],
    date: [{ id: 'cfDate', name: 'Delivery date', placement: ['Customer'] }],
    number: [{ id: 'cfNum', name: 'Pallets', placement: ['Sales Invoice'], minDecimals: true, decimals: 1, printed: true }],
  };
  b.details = Object.assign({}, b.details, { footer: 'Thank you' });
  b.footers = { 'sales-invoices': [{ id: 'ft1', name: 'Bank footer', content: '<p>IBAN AE07</p><script>x()</script>' }] };
  save(b);
});

describe('95-97 chart of accounts', () => {
  test('account form: Cash Flow group and Autofill, no visible Starting balance; the stored figure survives Update', () => {
    const b = cur(); const exp = acctOf(b, 'expense'); exp.balance = 0; const as = acctOf(b, 'assets'); as.balance = 750; save(b);
    App.coaCtx = { kind: 'account', side: 'bs', id: as.id };
    const h = App.coaEditor(cur());
    assert.ok(!/<label class="fld">Starting balance<\/label>/.test(h));
    assert.ok(h.includes('id="coa_cf"') && h.includes('Autofill — Line description') && h.includes('Autofill — Tax Code'));
    assert.ok(h.includes('type="hidden" id="coa_bal" value="750"'));
    ctx.stubEl('coa_name', as.name); ctx.stubEl('coa_code', ''); ctx.stubEl('coa_parent', as.parent); ctx.stubEl('coa_bal', '750');
    ctx.stubEl('coa_cf', 'investing'); ctx.stubEl('coa_afdesc', true); ctx.stubEl('coa_lineDesc', 'Monthly rent'); ctx.stubEl('coa_aftax', true); ctx.stubEl('coa_taxCode', 'VAT 5%');
    App.coaSave();
    const n = cur().coa.find((x) => x.id === as.id);
    assert.equal(n.balance, 750); assert.equal(n.cashFlow, 'investing'); assert.equal(n.lineDesc, 'Monthly rent'); assert.equal(n.taxCode, 'VAT 5%');
    assert.deepEqual({ ...S.autofillOf(cur(), as.id) }, { desc: 'Monthly rent', tax: 'VAT 5%' });
  });
  test('balance sheet groups nest (parent Group dropdown); P&L keeps New Total', () => {
    const b = cur(); App.coaCtx = { kind: 'group', side: 'bs', id: null };
    assert.ok(App.coaEditor(b).includes('id="coa_parent"'));
    App.coaCtx = null; assert.ok(App.set_coa(b).includes("App.coaNew('total','pl')"));
  });
  test('autofill when an account is picked on a native voucher line', () => {
    const b = cur(); const exp = acctOf(b, 'expense'); exp.afDesc = true; exp.lineDesc = 'Fuel'; exp.afTax = true; exp.taxCode = 'VAT 5%'; save(b);
    App.wsSection = 'Payments'; App.editingId = null; TF.formHtml(cur(), 'payments');
    TF._switchAccount(0, exp.id);
    const l = TF.state().lines[0]; assert.equal(l.desc, 'Fuel'); assert.equal(l.taxCode, 'VAT 5%');
  });
  test('cash flow statement follows the account’s group', () => {
    const b = cur(); const exp = acctOf(b, 'expense'); exp.cashFlow = 'financing'; save(b);
    const bb = cur(); bb.records.payments = [{ id: 5, date: '2026-03-01', paidFrom: 'ADCB', amount: 100, lines: [{ account: exp.id, amount: 100 }] }]; save(bb);
    const cf = App._cashFlow(cur(), '2026-01-01', '2026-12-31');
    assert.ok(cf.F.some((e) => e.id === exp.id)); assert.ok(!cf.O.some((e) => e.id === exp.id));
  });
});

describe('98-101 custom fields', () => {
  test('placements map to tabs; fields sorted by position', () => {
    assert.equal(S.placementKey('Sales Invoice').key, 'salesInv');
    assert.equal(S.placementKey('Sales Invoice - Line').line, true);
    assert.equal(S.placementKey('Bank or Cash Account').key, 'bankCash');
    assert.deepEqual([...S.fieldsFor(cur(), 'salesInv', false).map((f) => f.name)], ['Internal note', 'LPO Number', 'Pallets', 'Urgent']);
    assert.deepEqual([...S.fieldsFor(cur(), 'salesInv', true).map((f) => f.name)], ['Batch']);
  });
  test('the field renders on New Sales Invoice; Clone leaves out "exclude from copying"', () => {
    const x = S.extrasHtml(cur(), 'salesInv', null, 'new');
    assert.ok(x.cf.includes('LPO Number') && x.cf.includes('data-sfa-cf="cfLpo"') && x.cf.includes('type="checkbox" data-sfa-cf="cfChk"'));
    const pf = S.extrasHtml(cur(), 'salesInv', { custom: { cfLpo: 'L-1', cfSecret: 'hidden' } }, 'new');
    assert.ok(pf.cf.includes('value="L-1"') && !pf.cf.includes('hidden"'));
    const ed = S.extrasHtml(cur(), 'salesInv', { custom: { cfSecret: 'kept' } }, 'edit');
    assert.ok(ed.cf.includes('value="kept"'));
  });
  test('saved with a native Sales Invoice, loaded on Edit, printed on View, column cf_<id>', () => {
    const b = cur(); const inc = acctOf(b, 'income');
    App.wsSection = 'Sales Invoices'; App.editingId = null; TF.formHtml(b, 'salesInv');
    const t = TF.state(); t.customer = 'Al Noor'; t.lines = [{ item: '', account: inc.id, sub: '', desc: 'Work', qty: '1', price: '100', discount: '', taxCode: '', division: '', lcf_cfLine: 'B-7' }];
    const rec = S._withValues('salesInv', { custom: { cfLpo: 'LPO-55', cfChk: true, cfNum: 3 }, footers: ['ft1'] }, () => TF.save('create', { noNav: true }));
    assert.equal(rec.custom.cfLpo, 'LPO-55'); assert.deepEqual([...rec.footers], ['ft1']);
    const stored = cur().records.salesInv.find((r) => r.id === rec.id);
    assert.equal(stored.custom.cfLpo, 'LPO-55'); assert.equal(stored.lines[0].custom.cfLine, 'B-7');
    /* edit: the extras show the stored values, the line field loads */
    assert.ok(S.extrasHtml(cur(), 'salesInv', stored, 'edit').cf.includes('value="LPO-55"'));
    App.editingId = rec.id; TF.formHtml(cur(), 'salesInv'); assert.equal(TF.state().lines[0].lcf_cfLine, 'B-7');
    /* view / pdf */
    const v = App.voucherDoc(cur(), ctx.REG.salesInv, stored, { key: 'salesInv' });
    assert.ok(v.includes('LPO NUMBER') && v.includes('LPO-55') && v.includes('3.0') && v.includes('URGENT'));
    assert.ok(v.includes('IBAN AE07') && !v.includes('<script>') && !v.includes('Thank you'), 'only the chosen footer prints');
    const pool = App._colPool(ctx.REG.salesInv, cur());
    const col = pool.find((c) => c.key === 'cf_cfLpo'); assert.ok(col); assert.equal(col.calc(stored), 'LPO-55');
  });
  test('Copy to drops fields excluded from copying', () => {
    const pf = App.copyPrefill(cur(), 'salesInv', { id: 9, customer: 'Al Noor', custom: { cfLpo: 'A', cfSecret: 'B' }, lines: [] }, 'creditNotes');
    assert.equal(pf.custom.cfLpo, 'A'); assert.equal(pf.custom.cfSecret, undefined);
  });
  test('designed forms fold line fields into ln.custom and apply header values', () => {
    const rec = { lines: [{ desc: 'x', sfacf_cfLine: 'L9' }] };
    S._withValues('salesInv', { custom: { cfLpo: 'D-1' } }, () => App._applyDesignedToNative('salesInv', rec));
    assert.equal(rec.lines[0].custom.cfLine, 'L9'); assert.equal(rec.lines[0].sfacf_cfLine, undefined); assert.equal(rec.custom.cfLpo, 'D-1');
  });
});

describe('102-103 footers', () => {
  test('default footer ticked on new documents; old records keep printing it', () => {
    const x = S.extrasHtml(cur(), 'salesInv', null, 'new');
    assert.ok(/data-sfa-ft="default" checked/.test(x.ft) && /data-sfa-ft="ft1">/.test(x.ft));
    const old = { id: 1, customer: 'Al Noor', lines: [], total: 0 };
    assert.ok(App.voucherDoc(cur(), ctx.REG.salesInv, old, { key: 'salesInv' }).includes('Thank you'));
    const none = Object.assign({}, old, { footers: [] });
    assert.ok(!App.voucherDoc(cur(), ctx.REG.salesInv, none, { key: 'salesInv' }).includes('Thank you'));
    assert.equal(S.footersFor(cur(), 'customers').length, 0, 'non-documents have no footers');
  });
});

describe('104-105 + 62 payslips', () => {
  beforeEach(() => {
    const b = cur(); const exp = acctOf(b, 'expense'); const lia = b.coa.find((n) => n.type === 'account' && !n.control && ctx.acctRoot(b, n) === 'liabilities') || (() => { const n = { id: 'aLia', type: 'account', name: 'Payroll tax payable', parent: 'liabilities', balance: 0 }; b.coa.push(n); return n; })();
    b.payslipItems = { earnings: [{ id: 'e1', name: 'Basic salary', account: exp.id }], deductions: [{ id: 'd1', name: 'Advance recovery', account: lia.id }],
      contributions: [{ id: 'c1', name: 'Pension', expense: exp.id, liability: lia.id }] };
    save(b);
  });
  test('the payslip form is the native three-section form with item dropdowns', () => {
    App.wsSection = 'Payslips'; App.editingId = null;
    assert.equal(App._nativeTxnForm(cur(), 'payslips'), true);
    const h = TF.formHtml(cur(), 'payslips');
    assert.ok(h.includes('Earnings') && h.includes('Deductions') && h.includes('Contributions') && h.includes('Basic salary') && h.includes('Advance recovery'));
  });
  test('items post to their accounts; net pay owed to the employee; trial balance agrees', () => {
    App.wsSection = 'Payslips'; App.editingId = null; TF.formHtml(cur(), 'payslips');
    const t = S.ps.state(); t.employee = 'Ahmed Raza'; t.date = '2026-09-30';
    t.lines.earnings = [{ itemId: 'e1', item: 'Basic salary', desc: '', amount: '5000' }];
    t.lines.deductions = [{ itemId: 'd1', item: 'Advance recovery', desc: '', amount: '300' }];
    t.lines.contributions = [{ itemId: 'c1', item: 'Pension', desc: '', amount: '250' }];
    const rec = S.ps.save('create', { noNav: true });
    assert.equal(rec.netPay, 4700);
    assert.deepEqual([...rec.lines.map((l) => l.ptype)], ['Earning', 'Deduction', 'Contribution']);
    assert.ok(rec.lines[0].account && rec.lines[2].liabilityAccount);
    const b = cur(); ctx.GL.invalidate();
    near(ctx.GL.subBalance(b, 'employee clearing account', 'Ahmed Raza'), 4700, 'employee owed');
    const tb = ctx.GL.trial(b, { to: '2026-12-31' }); near(tb.debit, tb.credit, 'TB');
    assert.equal(ctx.payslipNetPay(rec), 4700);
    const v = App.voucherDoc(b, ctx.REG.payslips, rec, { key: 'payslips' });
    assert.ok(v.includes('Total earnings') && v.includes('Pension') && v.includes('4,700.00'));
  });
  test('old designer payslips load (negative line = deduction) and keep their amounts', () => {
    const t = S.ps.start(cur(), { employee: 'Ahmed Raza', lines: [{ desc: 'Basic salary', amount: 4000 }, { desc: 'Absence', amount: -200 }] }, 'edit');
    assert.equal(t.lines.earnings[0].itemId, 'e1'); assert.equal(t.lines.deductions[0].amount, '200'); assert.equal(t.lines.deductions[0].desc, 'Absence');
    assert.equal(S.ps.validate(cur(), t).length, 0);
  });
  test('payslip item account dropdowns: expense and liability accounts only', () => {
    const f = ctx.SettingsPages.PAGES.payslipItems.items.earnings.fields.find((x) => x.k === 'account');
    const b = cur(); const ids = f.opts(b).map((o) => o[0]).filter(Boolean);
    assert.ok(ids.length);
    ids.forEach((id) => { const n = b.coa.find((x) => x.id === id); assert.ok(!n.control); assert.ok(['expense', 'liabilities'].includes(ctx.acctRoot(b, n)), n.name); });
  });
});

describe('106-108 starting balances', () => {
  test('balance sheet dropdown has no P&L accounts; Debit / Credit stored nature-signed', () => {
    const SP = ctx.SettingsPages; const b = cur(); const def = SP.PAGES.starting.items['balance-sheet'];
    def.fields[0].opts(b).slice(1).forEach((o) => { const n = b.coa.find((x) => x.id === o[0]); assert.equal(ctx.acctRoot(b, n) === 'income' || ctx.acctRoot(b, n) === 'expense', false, n.name); });
    const as = acctOf(b, 'assets');
    const r = SP.save('starting/balance-sheet', { account: as.id, debit: 500, credit: '' }); assert.ok(r.ok, r.error);
    assert.equal(cur().coa.find((x) => x.id === as.id).balance, 500);
    const rows = SP.rows('starting/balance-sheet'); assert.equal(rows.find((x) => x.account === as.id).debit, 500);
    assert.equal(SP.save('starting/balance-sheet', { account: as.id, debit: 1, credit: 1 }).ok, false);
  });
  test('the difference shows in Starting balance equity with a warning', () => {
    const SP = ctx.SettingsPages; ctx.GL.invalidate();
    const s = S.sbSummary(cur()); near(s.diff, 300 - 1000, 'special 300 Dr, capital 1000 Cr');
    App.setView = 'starting'; App.spRoute = { key: 'starting', sub: '', action: null, id: null };
    assert.ok(App.set_starting(cur()).includes('Starting balances do not balance'));
  });
  test('capital / special forms have no starting balance; employee starting balances live on the record', () => {
    assert.ok(!ctx.REG.capital.form.some((f) => f.key === 'balance'));
    assert.ok(!ctx.REG.special.form.some((f) => f.key === 'balance'));
    const SP = ctx.SettingsPages; assert.ok(SP.save('starting/employees', { employee: 'Ahmed Raza', amount: 120 }).ok);
    assert.equal(cur().records.employees[0].balance, 120);
    const b = cur(); b.records.employees.push({ id: 12, name: 'Sara' }); b.startingBalances = { employees: [{ employee: 'Sara', amount: 80 }] }; save(b);
    const bb = cur(); assert.equal(S.migrateEmployeeSB(bb), true); assert.equal(bb.records.employees.find((e) => e.name === 'Sara').balance, 80);
    assert.equal(S.migrateTplState('capital', { blocks: [{ type: 'field', field: 'capName' }, { type: 'field', field: 'capBalance' }] }), true);
  });
});

describe('109 billable expenses', () => {
  test('payment line billable to a customer -> uninvoiced -> added to an invoice', () => {
    const b = cur(); b.billableExpenses = { enabled: true }; save(b); const exp = acctOf(b, 'expense');
    App.wsSection = 'Payments'; App.editingId = null; TF.formHtml(cur(), 'payments');
    const t = TF.state(); t.bank = 'ADCB'; t.partyType = 'other';
    t.lines = [{ item: '', account: exp.id, sub: '', desc: 'Courier', qty: '', price: '150', discount: '', taxCode: '', division: '', billableCustomer: 'Al Noor' }];
    assert.ok(TF.columns(cur(), t).some((c) => c.th === 'Billable to customer'));
    const pay = TF.save('create', { noNav: true }); assert.equal(pay.lines[0].billableCustomer, 'Al Noor');
    assert.equal(S.uninvoiced(cur(), 'Al Noor').length, 1);
    assert.ok(App._colPool(ctx.REG.customers, cur()).some((c) => c.key === 'billableUninvoiced'));
    App.wsSection = 'Sales Invoices'; TF.formHtml(cur(), 'salesInv'); const ti = TF.state(); ti.customer = 'Al Noor';
    S.billAdd(); assert.equal(ti.lines.length, 1); assert.equal(ti.lines[0].billableRef, S.uninvoiced(cur(), 'Al Noor')[0].ref);
    TF.save('create', { noNav: true });
    assert.equal(S.uninvoiced(cur(), 'Al Noor').length, 0);
    ctx.GL.invalidate(); const tb = ctx.GL.trial(cur(), { to: '2026-12-31' }); near(tb.debit, tb.credit, 'TB');
  });
});

describe('110-111 recurring', () => {
  test('Every N days / weeks / months / years', () => {
    assert.equal(S.everyText(1, 'months'), 'Every month'); assert.equal(S.everyText(3, 'weeks'), 'Every 3 weeks');
    assert.equal(S.advance('2026-01-31', 'Every 10 days'), '2026-02-10');
    assert.equal(S.advance('2026-01-01', 'Every 2 years'), '2028-01-01');
    assert.equal(S.advance('2026-01-01', 'Quarterly'), App._recurAdvance('2026-01-01', 'Quarterly'));
    const r = ctx.SettingsPages.save('recurring/salesInv', { next: '2026-01-01', everyN: 2, everyUnit: 'weeks', src: '' });
    assert.ok(r.ok, r.error); assert.equal(r.record.every, 'Every 2 weeks');
  });
  test('a due schedule shows a notice on its tab; Create makes the document and rolls the date', () => {
    const b = cur(); const inc = acctOf(b, 'income');
    b.records.salesInv = [{ id: 70, reference: '1', issueDate: '2026-01-05', customer: 'Al Noor', lines: [{ account: inc.id, net: 100, amount: 100, price: 100, qty: 1 }], total: 100, balanceDue: 100, custom: { cfLpo: 'keep', cfSecret: 'drop' } }];
    b.recurring = [{ id: 'r1', key: 'salesInv', src: '70', next: '2026-02-05', every: 'Every 1 months' }]; save(b);
    App.wsSection = 'Sales Invoices'; App.wsMode = 'list';
    assert.ok(App.listHtml(cur()).includes('1</b> recurring sales invoice due'));
    S.recurCreateDue('salesInv');
    const bb = cur(); assert.equal(bb.records.salesInv.length, 2);
    const made = bb.records.salesInv[1]; assert.equal(made.issueDate, '2026-02-05'); assert.equal(made.custom.cfLpo, 'keep'); assert.equal(made.custom.cfSecret, undefined);
    assert.equal(bb.recurring[0].next, '2026-03-05');
  });
});

describe('71 expense claims', () => {
  test('the designed expense claim gets Tax code and Total columns; amount includes tax', () => {
    const st = { blocks: [{ type: 'lines', columns: [{ var: 'accounts', label: 'Accounts' }, { var: 'amountNoTax', label: 'Amount', cellMode: 'input' }] }] };
    assert.equal(S.migrateTplState('expenseClaims', st), true);
    const vars = st.blocks[0].columns.map((c) => c.var); assert.deepEqual(vars, ['accounts', 'amountNoTax', 'taxRate', 'totalWithTax']);
    assert.equal(st.blocks[0].columns[2].dropSource, 'tax');
    assert.equal(S.migrateTplState('expenseClaims', st), false, 'idempotent');
    const rec = { lines: [{ amountNoTax: '100', totalWithTax: '105', net: 100, amount: 105 }] };
    App._applyDesignedToNative('expenseClaims', rec); assert.equal(rec.amount, 105);
  });
});

const BACKUP = [join(ROOT, 'ls_backup_8805_v2.json'), join(ROOT, '..', 'ls_backup_8805_v2.json')].find(existsSync);
describe('TEST - Fair Tax Demo backup', { skip: !BACKUP && 'backup file not found' }, () => {
  test('TEST LPO Number on Sales Invoice, TEST footer offered, TEST Basic Salary in the payslip items, TB balanced', () => {
    const c2 = loadApp({ storage: JSON.parse(readFileSync(BACKUP, 'utf8')) }); run(c2);
    c2.App.openBiz = 1791237552016; const b = c2.App.curBiz(); const S2 = c2.SettingsFixesA;
    assert.deepEqual([...S2.fieldsFor(b, 'salesInv', false).map((f) => f.name)], ['TEST LPO Number']);
    assert.ok(S2.extrasHtml(b, 'salesInv', null, 'new').ft.includes('TEST footer'));
    c2.App.wsSection = 'Payslips'; c2.App.editingId = null;
    assert.ok(c2.TxnForms.formHtml(b, 'payslips').includes('TEST Basic Salary'));
    const opts = c2.SettingsPages.PAGES.starting.items['balance-sheet'].fields[0].opts(b);
    assert.ok(!opts.some((o) => /Sales|Rent Expense|Salaries/.test(o[1])));
    const tb = c2.GL.trial(b, { to: '2026-12-31' }); near(tb.debit, tb.credit, 'TB');
  });
});
