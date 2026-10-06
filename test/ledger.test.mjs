/* The general ledger (js/ledger-engine.js) against the user's TEST data.
   ls_backup_8805.json (one folder up) is the localStorage export from the
   browser; it holds "TEST - Fair Tax Demo" (2-3 entries per form) and the demo
   "Abbass Tempering Industry LLC". The tests never write the file back. */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadApp } from './_harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BACKUP = [join(ROOT, 'ls_backup_8805.json'), join(ROOT, '..', 'ls_backup_8805.json')].find(existsSync);
const TEST_ID = 1791237552016, ABBASS_ID = 1001;
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.005, (msg || '') + ` expected ${b}, got ${a}`);

function open(id) {
  const raw = readFileSync(BACKUP, 'utf8');
  const ctx = loadApp({ storage: JSON.parse(raw) });
  vm.runInContext(readFileSync(join(ROOT, 'js/txn-forms.js'), 'utf8'), ctx, { filename: 'txn-forms.js' });
  ctx.addEventListener = () => {};
  vm.runInContext(readFileSync(join(ROOT, 'js/form-editor-bridge.js'), 'utf8'), ctx, { filename: 'form-editor-bridge.js' });
  ctx.App.openBiz = id;
  return { ctx, App: ctx.App, GL: ctx.GL, b: ctx.App.curBiz(), raw };
}

describe('TEST - Fair Tax Demo: one general ledger', { skip: !BACKUP && 'backup file not found' }, () => {
  const { ctx, App, GL, b } = open(TEST_ID);
  const ar = () => GL.sysAcct(b, 'accounts receivable');

  test('Trial Balance 1 Jan - 31 Dec: debits equal credits', () => {
    const tb = GL.trial(b, { to: '2026-12-31' });
    near(tb.debit, tb.credit, 'TB');
    assert.ok(tb.debit > 0);
    const old = App.trialBalance(b, '2026-12-31'); near(old.dr, old.cr, 'App.trialBalance');
    /* the report the user opens (Reports -> Trial Balance) */
    const html = App._renderTrial(b, 'trial', { from: '2026-01-01', to: '2026-12-31', colName: 'Total' });
    const foot = html.slice(html.indexOf('<tfoot>'));
    const nums = [...foot.matchAll(/>([\d,.\- ]+)<\/td>/g)].map((m) => m[1]);
    assert.equal(nums[0], nums[1], 'report footer Dr = Cr: ' + nums.join(' / '));
  });

  test('Summary AR = Trial Balance AR = Customers list total = statements total', () => {
    const p = ctx.periodOf(b);
    const S = ctx.summaryFromCoa(b, { from: p.from, to: p.to });
    const sumAR = S.balanceSheet[0].children.find((k) => k.name === 'Accounts receivable').amt;
    const tbAR = GL.trial(b, { to: '2026-12-31' }).rows.find((r) => r.name === 'Accounts receivable').debit;
    const listAR = b.records.customers.reduce((s, c) => s + ctx.customerBalance(b, c.name), 0);
    App.wsSection = 'Customers';
    const stmts = b.records.customers.reduce((s, c) => { App.ledgerId = c.id; return s + App.ledgerData(b).closing; }, 0);
    near(sumAR, 4918.8, 'Summary AR'); near(tbAR, 4918.8, 'TB AR'); near(listAR, 4918.8, 'list'); near(stmts, 4918.8, 'statements');
  });

  test('customer balances: Desert Rose overpaid, Al Noor statement includes the WHT receipt', () => {
    near(ctx.customerBalance(b, 'Desert Rose Interiors'), -527.5);
    near(ctx.customerBalance(b, 'Al Noor Trading LLC'), 2990.4);
    near(ctx.customerBalance(b, 'Gulf Star Logistics FZE'), 2455.9);
    App.wsSection = 'Customers'; App.ledgerId = b.records.customers.find((c) => c.name === 'Al Noor Trading LLC').id;
    const d = App.ledgerData(b);
    near(d.closing, 2990.4, 'statement closing');
    assert.ok(d.rows.some((r) => r.src === 'whtReceipts'), 'WHT receipt is on the statement');
  });

  test('supplier balances = starting + purchase invoices - payments - debit notes', () => {
    near(ctx.supplierBalance(b, 'Emirates Glass Supplies LLC'), 3045 - 182.7);
    near(ctx.supplierBalance(b, 'Sharjah Aluminium Co.'), 1200 + 2919 - 105);
    near(ctx.supplierBalance(b, 'Office Mart Stationery'), 441);
  });

  test('bank balances come from the ledger', () => {
    const bal = (n) => ctx.bankActual(b, b.records.bankCash.find((x) => x.name === n));
    near(bal('ADCB Current'), 3950); near(bal('Petty Cash'), 1656.75); near(bal('Emirates NBD Savings'), -4794.25);
    near(ctx.cashTotal(b), 812.5);
  });

  test('VAT on receipts, payments and invoices posts to Output / Input VAT', () => {
    near(GL.balance(b, GL.sysAcct(b, 'output vat').id), 47.62 + 15 + 155 + 105 + 25 - 9.5 - 2.5);
    near(GL.balance(b, GL.sysAcct(b, 'input vat').id), -(50 + 7.5 + 145 + 139 + 21 - 8.7 - 5), 'Input VAT is a debit on a liability');
    const rows = ctx.postingsForRecord(b, 'receipts', b.records.receipts[0]);
    const by = (n) => rows.filter((r) => r.accountName === n).reduce((s, r) => s + r.debit - r.credit, 0);
    near(by('Cash & cash equivalents'), 1000); near(by('Sales'), -952.38); near(by('Output VAT'), -47.62);
    assert.equal(rows.find((r) => r.accountName === 'Cash & cash equivalents').sub, 'ADCB Current');
  });

  test('payslips: earnings to salaries, net pay owed to the employee', () => {
    near(ctx.employeeBalance(b, 'Ahmed Raza'), 5300);
    const emp = GL.sysAcct(b, 'employee clearing account');
    near(GL.balance(b, emp.id), 5300 + 3950 + 6800);
    const rows = ctx.postingsForRecord(b, 'payslips', b.records.payslips[0]);
    near(rows.reduce((s, r) => s + r.debit, 0), rows.reduce((s, r) => s + r.credit, 0), 'payslip journal balances');
  });

  test('expense claims are owed to the payer', () => {
    near(ctx.claimPayerBalance(b, 'Ahmed Raza'), 105);
    near(ctx.claimPayerBalance(b, 'Sara Thomas'), 230);
  });

  test('credit notes return stock, debit notes send it back', () => {
    const it = b.records.inventory.find((x) => x.name === 'Tempered Glass 6mm');
    /* 100 opening + 50 purchased - 20 sold + 2 returned by the customer - 3 returned to the supplier - 2 written off - 16 used in production */
    near(ctx.invItemStats(b, it).qtyOnHand, 111);
    /* the inventory account equals the sum of the items */
    const tot = b.records.inventory.reduce((s, x) => s + ctx.invItemStats(b, x).totalCost, 0);
    assert.ok(Math.abs(GL.balance(b, GL.sysAcct(b, 'inventory on hand').id) - tot) < 0.05, 'Inventory on hand = items (to the cent per posting)');
  });

  test('the unbalanced JV-0003 goes to Suspense and is reported, the trial balance still balances', () => {
    const iss = GL.issues(b);
    assert.ok(iss.some((x) => x.ref === '0003' && x.src === 'journal'));
    assert.ok(iss.some((x) => x.ref === '0002' && /bank or cash account/.test(x.problems.join())), 'JV-0002 has no bank chosen');
  });

  test('every document posts Dr = Cr', () => {
    GL.get(b).txs.forEach((t) => {
      const d = t.lines.reduce((s, L) => s + L.debit, 0), c = t.lines.reduce((s, L) => s + L.credit, 0);
      near(d, c, t.src + ' ' + t.ref);
    });
  });

  test('reading the ledger never changes a record', () => {
    const before = JSON.stringify(App.curBiz().records);
    const b2 = App.curBiz(); GL.get(b2); ctx.refreshSummary(b2);
    assert.equal(JSON.stringify(b2.records), before);
  });
});

describe('journal entries', { skip: !BACKUP && 'backup file not found' }, () => {
  const { ctx, App, b } = open(TEST_ID);
  const jv = (n) => JSON.parse(JSON.stringify(b.records.journal.find((j) => j.reference === n)));

  test('an unbalanced journal entry cannot be saved (JV-0003)', () => {
    const msg = App._designedSaveProblem(b, 'journal', jv('0003'), jv('0003'));
    assert.match(msg, /out of balance/i);
  });
  test('a zero journal entry cannot be saved', () => {
    const j = jv('0001'); j.lines.forEach((l) => { l.debit = ''; l.credit = ''; });
    assert.match(App._designedSaveProblem(b, 'journal', j, null), /debit and credit/i);
  });
  test('fixing JV-0003 (credit 50) makes it saveable', () => {
    const j = jv('0003'); j.lines[1].credit = 50;
    assert.equal(App._designedSaveProblem(b, 'journal', j, jv('0003')), null);
  });
  test('a Cash & cash equivalents line needs a bank account, and then posts to that bank', () => {
    const j = jv('0002');
    assert.match(App._designedSaveProblem(b, 'journal', j, j), /bank or cash account/);
    j.lines[1].sub = 'ADCB Current';
    assert.equal(App._designedSaveProblem(b, 'journal', j, j), null);
    const b2 = JSON.parse(JSON.stringify(b)); b2.records.journal = b2.records.journal.map((x) => (x.reference === '0002' ? j : x));
    const adcb = b2.records.bankCash.find((x) => x.name === 'ADCB Current');
    near(ctx.bankActual(b2, adcb), 3950 - 3000);
  });
});

describe('new business', () => {
  test('the first receipt has Accounts receivable and payable in the account list', () => {
    const ctx = loadApp();
    const nb = { id: 5, name: 'Fresh', country: 'United Arab Emirates', records: {} };
    ctx.ensureSettings(nb); ctx.ensureCoa(nb);
    const names = ctx.App.accountOptions(nb).map((o) => o.label);
    assert.ok(names.includes('Accounts receivable'), names.join());
    assert.ok(names.includes('Accounts payable'));
    ctx.ensureCoa(nb); ctx.ensureCoa(nb);
    assert.equal(nb.coa.filter((n) => n.name === 'Accounts receivable').length, 1, 'idempotent');
  });
  test('the default period is 1 January to today', () => {
    const ctx = loadApp();
    const p = ctx.periodOf({ period: { mode: 'ytd', from: '2026-01-01', to: '2026-05-29' } });
    const t = new Date(); const iso = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
    assert.equal(p.from, iso.slice(0, 4) + '-01-01'); assert.equal(p.to, iso);
  });
});

describe('old data in edit forms', { skip: !BACKUP && 'backup file not found' }, () => {
  test('imported Receipt 43848 opens in Edit with 5,091.00', () => {
    const { ctx, b } = open(ABBASS_ID);
    const rec = b.records.receipts.find((r) => r.reference === '43848');
    assert.ok(!rec.lines, 'the stored receipt has no lines');
    const t = ctx.TxnForms.start(b, 'receipts', rec, 'edit');
    near(ctx.TxnForms.totals(b, t).total, 5091);
    assert.ok(!t.loadBlocked);
    const tok = ctx.App.mapRecordToTokens('receipts', rec);
    near(Number(tok.lines[0].amount), 5091, 'designed form gets the amount too');
  });
  test('data-safety: a record with a total whose lines are empty blocks Update', () => {
    const { ctx, b } = open(TEST_ID);
    const rec = JSON.parse(JSON.stringify(b.records.receipts[0])); rec.lines = [{ account: '', amount: 0 }];
    const t = ctx.TxnForms.start(b, 'receipts', rec, 'edit');
    assert.match(t.loadBlocked || '', /did not load/);
    ctx.TxnForms.setState(t);
    const r = ctx.TxnForms.save('update', { noNav: true });
    assert.ok(r && r.errors && /did not load/.test(r.errors[0]));
  });
  test('a credit-note line with only an account keeps that account', () => {
    const { ctx, b } = open(TEST_ID);
    const cn = b.records.creditNotes.find((c) => c.reference === '0002');
    const tok = ctx.App.mapRecordToTokens('creditNotes', cn);
    assert.equal(tok.lines[0].account, 'Service Income');
  });
  test('receipt with Paid by = customer defaults the line to Accounts receivable', () => {
    const { ctx, b } = open(TEST_ID);
    const TF = ctx.TxnForms; const t = TF.start(b, 'receipts', null, 'new'); TF.setState(t);
    TF._partyType('customer'); TF._setParty('Al Noor Trading LLC');
    const l = TF.state().lines[0];
    assert.equal(l.account, ctx.GL.sysAcct(ctx.App.curBiz(), 'accounts receivable').id);
    assert.equal(l.sub, 'Al Noor Trading LLC');
  });
});

describe('match payers (preview, then confirm)', { skip: !BACKUP && 'backup file not found' }, () => {
  test('receipts with the customer only in the description are listed, and changed only on confirm', () => {
    const { ctx, App, b } = open(ABBASS_ID);
    const before = JSON.stringify(b.records.receipts);
    const M = App.payerMatches(b);
    const m = M.find((x) => x.reference === '43848');
    assert.equal(m.customer, 'MANCHESTER ALUMINIUM & GLASS WORKSHOP LLC');
    near(m.amount, 5091);
    assert.equal(JSON.stringify(b.records.receipts), before, 'preview changes nothing');
    const n = App.applyPayerMatches(b, [m.id]);
    assert.equal(n, 1);
    const r = b.records.receipts.find((x) => x.reference === '43848');
    assert.equal(r.paidBy, m.customer); assert.equal(r.paidByType, 'customer');
    assert.equal(r.lines[0].sub, m.customer); near(r.lines[0].amount, 5091);
    near(ctx.customerBalance(b, m.customer), -5091);
    assert.equal(App.payerMatches(b).some((x) => x.reference === '43848'), false, 'idempotent');
  });
});

describe('data check', { skip: !BACKUP && 'backup file not found' }, () => {
  test('reports header totals that differ from lines and postings sent to Suspense', () => {
    const { App, b } = open(TEST_ID);
    const d = App.dataCheck(b);
    assert.ok(d.ledger.some((x) => x.ref === '0003'));
    near(d.trial.debit, d.trial.credit);
    const html = App.dataCheckHtml(b);
    assert.match(html, /Data check/);
  });
});

describe('every TEST receipt, payment and sales invoice reopens with its own total', { skip: !BACKUP && 'backup file not found' }, () => {
  const { ctx, b } = open(TEST_ID);
  for (const key of ['receipts', 'payments', 'salesInv']) {
    test(key, () => {
      b.records[key].forEach((r) => {
        const t = ctx.TxnForms.start(b, key, r, 'edit');
        near(ctx.TxnForms.totals(b, t).total, Number(key === 'salesInv' ? r.total : r.amount), key + ' ' + r.reference);
        assert.ok(t.lines.every((l, i) => !r.lines[i] || l.account === r.lines[i].account), 'accounts load');
        assert.ok(!t.loadBlocked);
      });
    });
  }
});
