/* Forms fixes (FIX_SPEC sections G and M): js/ui-modal.js, js/forms-fixes.js and the
   form-related changes in app.js / data.js / txn-forms.js.

   DOM-heavy behaviour (line buttons in designed forms, reveal boxes, the search
   pop-up) is exercised in a real browser; pinned here is the logic the rest of
   the app relies on: the bank migration and record shape, list columns, the
   Copy to matrix and prefill, the modal gate, totals with withholding, view
   options and history labels. */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadApp } from './_harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (ctx, f) => vm.runInContext(readFileSync(join(ROOT, f), 'utf8'), ctx, { filename: f });

let ctx, App;
function seed() {
  const biz = {
    id: 7, name: 'Forms Fix Co', country: 'United Arab Emirates',
    records: {
      bankCash: [
        { id: 2000, bankName: 'Asif', bankCode: '123', bankIBAN: 'AE123456789', bankAcctNo: '123456789', lines: [], name: 'Asif', code: '123' },
        { id: 2001, name: 'Old REG', iban: true, ibanNo: 'AE00 1111', balance: 50 },
        { id: 2002, name: 'Petty', balance: 0 },
      ],
      customers: [{ id: 100, name: 'Al Noor', address: 'Sharjah', trn: '100' }],
      suppliers: [{ id: 200, name: 'Glass Co' }],
      inventory: [{ id: 400, name: 'Glass 6mm', salesPrice: 95, purchasePrice: 60, qty: 100 }],
      nonInvItems: [{ id: 500, name: 'Install', salesPrice: 150, purchasePrice: 0 }],
      salesQuotes: [{ id: 900, uuid: 'q-1', date: '2026-10-01', issueDate: '2026-10-01', reference: '0001', custName: 'Al Noor', customer: 'Al Noor',
        lines: [{ item: 'Glass 6mm', desc: 'clear glass', account: 'x', accountName: 'Sales', qty: 20, price: 95, net: 1900, amount: 1995, taxAmt: 95, tax: '5', taxRate: '5' }],
        subtotal: 1900, tax: 95, total: 1995, balanceDue: 1995, amount: 1995 }],
      receipts: [{ id: 1, date: '2026-10-02', reference: '1', receivedIn: 'Asif', amount: 100, lines: [{ account: '', amount: 100 }] }],
      payments: [], salesInv: [], purchInv: [], bankRec: [{ id: 5, date: '2026-09-30', account: 'Asif', statementBalance: 10 }],
    },
    balanceSheet: [{ title: 'Assets', children: [] }, { title: 'Liabilities', children: [] }, { title: 'Equity', children: [] }],
    profitLoss: [],
  };
  ctx.ensureSettings(biz); ctx.ensureCoa(biz);
  biz.coa.push({ id: 'gInc', type: 'group', name: 'Income', parent: 'pl', plkind: 'income' }, { id: 'aSales', type: 'account', name: 'Sales', parent: 'gInc', balance: 0 });
  biz.coaTop.pl.unshift('gInc');
  ctx.ensureControl(biz, 'Accounts receivable', 'assets');
  ctx.ensureCashControl(biz);
  ctx.DB.set(ctx.DB.k.biz, [biz]);
  App.openBiz = biz.id;
}

beforeEach(() => {
  ctx = loadApp();
  App = ctx.App;
  run(ctx, 'js/txn-forms.js');
  run(ctx, 'js/quick-create.js');
  run(ctx, 'js/forms-fixes.js');
  seed();
});
const cur = () => App.curBiz();

describe('Bank & Cash: one IBAN key, Account number as a custom field (33, 32)', () => {
  test('designer keys and the old REG checkbox migrate losslessly and idempotently', () => {
    const b = cur();
    assert.equal(ctx.FormsFixes.migrateBanks(b), true);
    const asif = b.records.bankCash.find((r) => r.id === 2000);
    assert.equal(asif.iban, 'AE123456789'); assert.equal(asif.hasIban, true);
    assert.equal(asif.custom.accountNumber, '123456789');
    assert.equal(asif.bankIBAN, 'AE123456789', 'old key kept');
    const old = b.records.bankCash.find((r) => r.id === 2001);
    assert.equal(old.iban, 'AE00 1111'); assert.equal(old.hasIban, true);
    assert.deepEqual([...b.formConfig.bankCash.custom].map((x) => x.label), ['Account number']);
    assert.equal(ctx.FormsFixes.migrateBanks(b), false, 'second run changes nothing');
    assert.equal(b.formConfig.bankCash.custom.length, 1);
  });

  test('the list IBAN column and the form read the same value', () => {
    const b = cur(); ctx.FormsFixes.migrateBanks(b); ctx.DB.set(ctx.DB.k.biz, [b]);
    const col = ctx.REG.bankCash.columns.find((c) => c.key === 'iban');
    assert.equal(col.calc(cur().records.bankCash[0]), 'AE123456789');
    assert.equal(ctx.bankIbanOf({ bankIBAN: 'X1' }), 'X1');
  });

  test('form values: name required and unique, unticked boxes clear their values, custom fields kept', () => {
    const b = cur(); ctx.FormsFixes.migrateBanks(b);
    const BF = ctx.BankForm;
    assert.match(BF.applyValues(b, {}, { name: '' }, null).error, /Name is required/);
    assert.match(BF.applyValues(b, {}, { name: 'petty' }, null).error, /already exists/);
    const rec = JSON.parse(JSON.stringify(b.records.bankCash[0]));
    const r = BF.applyValues(b, rec, { name: 'Asif', code: '9', hasIban: false, iban: 'AE1', creditLimitOn: true, creditLimit: '5,000', custom: { accountNumber: '42' } }, 2000);
    assert.equal(r.ok, true);
    assert.equal(rec.iban, ''); assert.equal(rec.creditLimit, 5000); assert.equal(rec.custom.accountNumber, '42');
    assert.equal(rec.bankAcctNo, '42', 'legacy key kept in step'); assert.equal(rec.bankCode, '9');
  });
});

describe('Bank & Cash columns (34, 35)', () => {
  test('Manager order, IBAN then custom fields; settings checkboxes are not columns', () => {
    const b = cur(); ctx.FormsFixes.migrateBanks(b); ctx.DB.set(ctx.DB.k.biz, [b]);
    App.wsSection = 'Bank and Cash Accounts';
    const labels = [...App._colPool(ctx.REG.bankCash).map((c) => c.label)];
    assert.deepEqual(labels.slice(0, 15), ['Code', 'Name', 'Control account', 'Division', 'Uncategorized Receipts', 'Uncategorized Payments',
      'Cleared balance', 'Pending deposits', 'Pending withdrawals', 'Actual balance', 'Available credit', 'Last Bank Reconciliation', 'Timestamp', 'IBAN', 'Account number']);
    for (const gone of ['International Bank Account Number (IBAN)', 'Credit limit amount', 'Can have pending transactions', 'Credit limit', 'Inactive', 'Starting balance'])
      assert.ok(!labels.includes(gone), gone);
  });

  test('saved column choices from before the fix are carried over (ibanNo -> IBAN, + Account number)', () => {
    const b = cur(); b.details = b.details || {}; b.details.listCols = { bankCash: ['name', 'balance', 'iban', 'ibanNo', 'pending', 'creditLimitOn', 'creditLimit'] };
    ctx.FormsFixes.migrateBanks(b);
    assert.deepEqual([...b.details.listCols.bankCash], ['name', 'balance', 'iban', 'cf_accountNumber', 'availableCredit']);
    b.details.listCols.bankCash = ['name'];
    ctx.FormsFixes.migrateBanks(b);
    assert.deepEqual([...b.details.listCols.bankCash], ['name'], 'runs once; later choices are the user\'s');
  });

  test('defaults: Name, Cleared balance, Actual balance', () => {
    App.wsSection = 'Bank and Cash Accounts';
    assert.deepEqual([...App._cols(ctx.REG.bankCash).map((c) => c.label)], ['Name', 'Cleared balance', 'Actual balance']);
  });

  test('figures: uncategorized receipts, available credit, last reconciliation', () => {
    const b = cur(); const asif = b.records.bankCash[0];
    const f = ctx.bankFigures(b, asif);
    assert.equal(f.uncatIn, 100); assert.equal(f.lastRec, '2026-09-30'); assert.equal(f.available, '');
    const f2 = ctx.bankFigures(b, Object.assign({}, asif, { creditLimitOn: true, creditLimit: 1000 }));
    assert.equal(f2.available, 1100);
    assert.equal(f.cleared, ctx.bankActual(b, asif));
  });

  test('the "+ Add new" bank dialog asks for the same fields as the form, without a starting balance (36)', () => {
    const keys = [...ctx.QuickCreate.fieldsFor('bank').map((f) => f.key)];
    assert.deepEqual(keys, ['name', 'code', 'hasIban', 'iban', 'pending', 'creditLimitOn', 'creditLimit', 'inactive']);
  });
});

describe('closing balances are not entered on party forms (37)', () => {
  test('customer and supplier forms have no balance field', () => {
    assert.ok(!ctx.REG.customers.form.some((f) => f.key === 'balance'));
    assert.ok(!ctx.REG.suppliers.form.some((f) => f.key === 'balance'));
  });
  test('designer state: closing balance blocks removed, employee labels capitalised, Amount / Total headers', () => {
    const st = { blocks: [{ type: 'field', group: 'customer', field: 'custName', label: 'Customer Name' }, { type: 'field', group: 'customer', field: 'custBalance', label: 'Customer closing balance' }] };
    assert.equal(ctx.FormsFixes.migrateState('customers', st), true);
    assert.deepEqual(st.blocks.map((b) => b.field), ['custName']);
    const emp = { blocks: [{ type: 'field', group: 'employee', field: 'empCode', label: 'code' }, { type: 'field', group: 'employee', field: 'empBalance', label: 'ledger closing balance' }] };
    ctx.FormsFixes.migrateState('employees', emp);
    assert.deepEqual(emp.blocks.map((b) => b.label), ['Code']);
    const inv = { blocks: [{ type: 'lines', columns: [{ var: 'amountNoTax', label: 'Amount without Tax' }, { var: 'totalWithTax', label: 'Total with Tax' }] }] };
    ctx.FormsFixes.migrateState('creditNotes', inv);
    assert.deepEqual(inv.blocks[0].columns.map((c) => c.label), ['Amount', 'Total']);
    const bank = { blocks: [{ type: 'field', group: 'bank', field: 'bankIBAN', label: 'Bank IBAN number' }, { type: 'field', group: 'bank', field: 'bankAcctNo', label: 'Bank Account no.' }] };
    ctx.FormsFixes.migrateState('receipts', bank);
    assert.deepEqual(bank.blocks.map((b) => b.label), ['IBAN', 'Account number']);
  });
});

describe('Copy to (78)', () => {
  test('Manager matrix', () => {
    const T = App._copyTargets;
    assert.deepEqual([...T.salesQuotes], ['salesOrders', 'salesInv']);
    assert.deepEqual([...T.salesOrders], ['salesInv', 'deliveryNotes']);
    assert.deepEqual([...T.salesInv], ['receipts', 'creditNotes', 'deliveryNotes']);
    assert.deepEqual([...T.purchQuotes], ['purchOrders', 'purchInv']);
    assert.deepEqual([...T.purchOrders], ['purchInv', 'goodsRec']);
    assert.deepEqual([...T.purchInv], ['payments', 'debitNotes', 'goodsRec']);
  });

  test('quote -> invoice carries party, lines, tax and reference; not the money state', () => {
    const b = cur(); const q = b.records.salesQuotes[0];
    const pf = App.copyPrefill(b, 'salesQuotes', q, 'salesInv');
    assert.equal(pf.customer, 'Al Noor'); assert.equal(pf.reference, '0001');
    assert.equal(pf.lines.length, 1);
    const l = pf.lines[0];
    assert.equal(l.item, 'Glass 6mm'); assert.equal(l.desc, 'clear glass'); assert.equal(l.accountName, 'Sales');
    assert.equal(l.qty, 20); assert.equal(l.price, 95); assert.equal(String(l.taxRate), '5');
    assert.equal(pf.id, undefined); assert.equal(pf.uuid, undefined); assert.equal(pf.balanceDue, undefined);
    /* the native Sales Invoice engine loads it with the tax code resolved from the rate */
    const t = ctx.TxnForms.start(b, 'salesInv', pf, 'new');
    assert.equal(t.customer, 'Al Noor'); assert.equal(t.lines[0].taxCode, 'VAT 5%'); assert.equal(t.lines[0].price, '95');
  });

  test('purchase invoice -> payment settles the bill through Accounts payable', () => {
    const b = cur(); ctx.ensureControl(b, 'Accounts payable', 'liabilities');
    const pi = { id: 77, uuid: 'pi-77', reference: 'P1', supplier: 'Glass Co', total: 315, balanceDue: 315, lines: [] };
    const pf = App.copyPrefill(b, 'purchInv', pi, 'payments');
    assert.equal(pf.payeeType, 'supplier'); assert.equal(pf.payee, 'Glass Co');
    assert.equal(pf.lines[0].accountName, 'Accounts payable'); assert.equal(pf.allocations[0].uid, 'pi-77');
  });
});

describe('Sales Invoice options (86, 87)', () => {
  const line = (o) => Object.assign({ item: '', account: '', sub: '', desc: '', qty: '', price: '', discount: '', taxCode: '', division: '' }, o);
  test('withholding tax (amount or rate) reduces the balance due', () => {
    const b = cur(); const t = ctx.TxnForms.start(b, 'salesInv', null, 'new');
    t.lines = [line({ account: 'aSales', qty: '1', price: '1000', taxCode: 'VAT 5%' })];
    t.withholding = true; t.whtAmount = '50';
    let T = ctx.TxnForms.totals(b, t); assert.equal(T.total, 1050); assert.equal(T.wht, 50); assert.equal(T.balance, 1000);
    t.whtType = 'Rate'; t.whtRate = '10';
    T = ctx.TxnForms.totals(b, t); assert.equal(T.wht, 100); assert.equal(T.balance, 950);
    t.customer = 'Al Noor';
    const rec = ctx.TxnForms.buildRecord(b, t);
    assert.equal(rec.withholdingAmt, 100); assert.equal(rec.balanceDue, 950);
  });
  test('Qty column can be switched off on an invoice (qty counts as 1)', () => {
    const b = cur(); const t = ctx.TxnForms.start(b, 'salesInv', null, 'new');
    assert.equal(t.colQty, true);
    t.colQty = false;
    assert.equal(ctx.TxnForms.lineCalc(b, t, line({ account: 'aSales', qty: '5', price: '100' })).total, 100);
  });
});

describe('app modals instead of confirm() (79)', () => {
  function modalSandbox() {
    const made = [];
    const node = () => {
      const btn = {};
      return {
        className: '', style: {}, innerHTML: '', parentNode: null, setAttribute() {}, addEventListener() {},
        querySelector(sel) { return btn[sel] || (btn[sel] = { onclick: null, focus() {}, select() {}, value: 'typed' }); },
      };
    };
    const sb = { document: { createElement: () => { const n = node(); made.push(n); return n; }, body: { appendChild(n) { n.parentNode = { removeChild() {} }; } },
      addEventListener() {}, removeEventListener() {}, activeElement: null }, setTimeout, console };
    sb.window = sb; vm.createContext(sb); run(sb, 'js/ui-modal.js');
    return { sb, made };
  }
  test('gate() asks once, then the re-run passes straight through', async () => {
    const { sb, made } = modalSandbox(); let ran = 0, inner = null;
    const act = () => { if (!sb.UIModal.gate('Delete this?', act)) return false; ran++; return true; };
    assert.equal(act(), false); assert.equal(ran, 0);
    made[0].querySelector('.ui-modal-ok').onclick();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(ran, 1);
    inner = sb.UIModal.gate('Delete this?', act); /* no pass left over */
    assert.equal(inner, false);
  });
  test('Cancel does not run the action; alert() is routed to the modal', async () => {
    const { sb, made } = modalSandbox(); let ran = 0;
    const act = () => { if (!sb.UIModal.gate('Remove?', act)) return; ran++; };
    act(); made[0].querySelector('.ui-modal-cancel').onclick(); await new Promise((r) => setTimeout(r, 0));
    assert.equal(ran, 0);
    sb.alert('Hello'); assert.equal(made.length, 2);
  });
  test('no confirm()/prompt() calls remain in the app scripts', () => {
    for (const f of ['js/app.js', 'js/users.js', 'js/settings-pages.js', 'js/txn-forms.js', 'js/forms-fixes.js', 'js/form-editor-embedded.js', 'js/designer.js']) {
      const src = readFileSync(join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/global\.confirm \? global\.confirm\(m\)|typeof confirm === 'function' \? confirm\(qs\)|\(typeof confirm==='function'\)\?confirm\(msg\)/g, '');
      assert.ok(!/[^.\w]confirm\(|[^.\w]prompt\(/.test(src), f);
    }
  });
});

describe('View / Print / PDF options (88, 89, 92)', () => {
  const view = (key, rec) => { App.wsSection = ctx.KEY2LABEL[key]; return App.voucherDoc(cur(), ctx.REG[key], rec, { key }); };
  test('print options saved with the record hide those columns and fields', () => {
    const q = JSON.parse(JSON.stringify(cur().records.salesQuotes[0]));
    assert.match(view('salesQuotes', q), /Unit price/i);
    q.printOff = ['c:price', 'f:amounts_in_word'];
    const h = view('salesQuotes', q);
    assert.doesNotMatch(h, /<th[^>]*>Unit price/i); assert.doesNotMatch(h, /Amount in words/);
  });
  test('a quote shows no "Due Date -", and no empty Bank Details box', () => {
    const h = view('salesQuotes', cur().records.salesQuotes[0]);
    assert.doesNotMatch(h, /Due Date/); assert.doesNotMatch(h, /Bank Details/);
    assert.match(view('salesQuotes', Object.assign({}, cur().records.salesQuotes[0], { dueDate: '2026-10-31' })), /Valid until/);
  });
  test('withholding and Balance due on an invoice, hidden by Hide - Balance due', () => {
    const inv = { reference: '1', customer: 'Al Noor', issueDate: '2026-10-01', subtotal: 1000, tax: 50, total: 1050, withholdingAmt: 50, balanceDue: 1000, lines: [{ desc: 'x', qty: 1, price: 1000, amount: 1050, taxAmt: 50 }] };
    const h = view('salesInv', inv);
    assert.match(h, /Withholding tax/); assert.match(h, /Balance due/);
    assert.doesNotMatch(view('salesInv', Object.assign({}, inv, { hideBalanceDue: true })), /Balance due/);
  });
});

describe('History labels (91)', () => {
  test('changes are listed once, with form labels', () => {
    const ch = App._histChanges('salesInv', { custName: 'A', customer: 'A', total: 10, amount: 10 }, { custName: 'B', customer: 'B', total: 12, amount: 12 });
    assert.deepEqual([...ch.map((c) => c.label)], ['Customer', 'Amount']);
    assert.equal(App._histLabel('creditNotes', 'narration'), 'Narration');
    assert.equal(App._histLabel('bankCash', 'bankIBAN'), 'IBAN');
  });
});

describe('global search (90)', () => {
  test('matches every module, grouped by type', () => {
    const groups = ctx.FormsFixes.searchAll(cur(), 'glass');
    const names = groups.map((g) => g.group);
    assert.ok(names.includes('Suppliers')); assert.ok(names.includes('Inventory Items')); assert.ok(names.includes('Sales Quotes'));
    const q = groups.find((g) => g.group === 'Sales Quotes');
    assert.equal(q.items[0].title, 'Sales Quote 0001');
  });
});

describe('employees (94)', () => {
  test('the Employees list Email column has an Email field behind it', () => {
    assert.ok(ctx.REG.employees.form.some((f) => f.key === 'email'));
    assert.ok(readFileSync(join(ROOT, 'js/form-editor-embedded.js'), 'utf8').includes("['employee','empEmail']"));
  });
});

test('no UUID under the native form title (93)', () => {
  assert.ok(!readFileSync(join(ROOT, 'js/txn-forms.js'), 'utf8').includes('tf-uid'));
  assert.ok(existsSync(join(ROOT, 'js/ui-modal.js')));
});
