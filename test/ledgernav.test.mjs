/* js/ledger-nav.js — origin chain, ledger Next/Prev, Transaction Journal,
   ledger order and the sidebar's active tab (FIX_SPEC sections E and L). */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadApp } from './_harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const text = (h) => String(h).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

let ctx, App;

function seed() {
  const biz = {
    id: 77, name: 'Nav Co',
    records: {
      bankCash: [{ id: 1, name: 'ADCB Current', balance: 0 }, { id: 2, name: 'ENBD', balance: 0 }],
      customers: [{ id: 10, name: 'Al Noor', balance: 0 }],
      receipts: [
        { id: 101, reference: '1', date: '2026-10-03', receivedIn: 'ADCB Current', paidBy: 'Al Noor', amount: 1000,
          lines: [{ accountName: 'Sales', net: 952.38, taxAmt: 47.62, amount: 1000 }] },
        { id: 102, reference: '2', date: '2026-10-02', receivedIn: 'ENBD', amount: 500, lines: [{ accountName: 'Sales', amount: 500 }] },
      ],
      payments: [{ id: 201, reference: '1', date: '2026-10-04', paidFrom: 'ADCB Current', payee: 'Landlord', amount: 300, lines: [{ accountName: 'Sales', amount: 300 }] }],
      iat: [{ id: 301, reference: 'T1', date: '2026-10-01', paidFrom: 'ENBD', receivedIn: 'ADCB Current', amount: 2000 }],
      journal: [
        { id: 401, reference: 'J1', date: '2026-10-05', narration: 'bank fee', lines: [] },
        { id: 402, reference: 'J2', date: '2026-10-06', narration: 'unbalanced', lines: [] },
      ],
      salesInv: [{ id: 501, reference: 'INV-1', issueDate: '2026-10-01', customer: 'Al Noor', subtotal: 1000, tax: 50, total: 1050, lines: [{ accountName: 'Sales', net: 1000, taxAmt: 50, amount: 1050 }] }],
    },
  };
  ctx.ensureSettings(biz); ctx.ensureCoa(biz);
  const acct = (n) => biz.coa.find((x) => x.type === 'account' && x.name === n);
  ctx.ensureCashControl(biz);
  const cash = biz.coa.find((x) => x.cashControl);
  const sales = acct('Sales') || ctx.ensureControl(biz, 'Sales', 'pl');
  for (const k of ['receipts', 'payments', 'salesInv']) biz.records[k].forEach((r) => r.lines.forEach((l) => { l.account = sales && sales.id; }));
  const exp = biz.coa.find((x) => x.type === 'account' && x.id !== cash.id && x.id !== (sales && sales.id));
  biz.records.journal[0].lines = [{ account: exp.id, debit: 25 }, { account: cash.id, sub: 'ADCB Current', credit: 25 }];
  biz.records.journal[1].lines = [{ account: exp.id, debit: 50 }, { account: cash.id, sub: 'ENBD', credit: 45 }];
  ctx.refreshSummary(biz);
  ctx.DB.set(ctx.DB.k.biz, [biz]);
  return biz;
}

const crumb = () => { const m = ctx.htmlOf('wsMain').match(/<div class="ws-crumb[\s\S]*?<\/div><\/div>/); return m ? text(m[0]) : ''; };

beforeEach(() => {
  ctx = loadApp();
  vm.runInContext(readFileSync(join(ROOT, 'js/ledger-nav.js'), 'utf8'), ctx, { filename: 'ledger-nav.js' });
  App = ctx.App;
  App._nativeTxnForm = () => false; App._mountDesignedForm = () => {};   // form mounting needs a real DOM
  seed();
  App.view = 'workspace';
  App.openBusiness(77);
  App.selectSection('Bank and Cash Accounts');
  App.openLedger(1);
});

describe('bank ledger', () => {
  test('rows run oldest to newest with a running balance, journal lines included, count = rows', () => {
    const h = ctx.htmlOf('wsMain');
    const body = text(h);
    const at = (s) => body.indexOf(s);
    assert.ok(at('Inter-account transfer') < at('Receipt —') && at('Receipt —') < at('Payment —') && at('Payment —') < at('bank fee'), 'oldest first');
    assert.ok(body.includes('Journal entry — bank fee'), 'sub-account journal line shows in the bank ledger');
    assert.match(body, /2,675\.00/);                               // 2000 + 1000 - 300 - 25
    assert.match(h, /<span class="cnt">4<\/span>/);
  });
  test('the Reference column is plain text', () => {
    assert.doesNotMatch(ctx.htmlOf('wsMain'), /<a class="led-link" onclick="App\.ledgerOpen/);
  });
});

describe('origin chain', () => {
  test('ledger -> View -> Edit -> Update -> Next -> Clone -> Cancel keeps the ledger origin', () => {
    App.ledgerOpen('receipts', 101, 'view');
    assert.equal(crumb(), '▸ Bank and Cash Accounts ▸ ADCB Current ▸ Receipt 1');
    assert.equal(App.sideActive(), 'Bank and Cash Accounts');
    App.editRecord(101);
    assert.match(crumb(), /ADCB Current ▸ Receipt 1 ▸ Edit$/);
    assert.equal(App.backFromRecord(), true);                          // Update / Cancel
    assert.equal(App.wsMode, 'view'); assert.equal(App.editingId, 101);
    assert.equal(crumb(), '▸ Bank and Cash Accounts ▸ ADCB Current ▸ Receipt 1');
    App.lnNav(1);
    assert.equal(App.wsSection, 'Payments'); assert.equal(App.editingId, 201);
    assert.equal(crumb(), '▸ Bank and Cash Accounts ▸ ADCB Current ▸ Payment 1');
    App.cloneRecord();
    assert.equal(App.wsMode, 'form');
    assert.match(crumb(), /^▸ Bank and Cash Accounts ▸ ADCB Current ▸ Payment 1 ▸ /);
    assert.equal(App.sideActive(), 'Bank and Cash Accounts');
    App.backFromRecord();
    assert.equal(App.wsMode, 'view'); assert.equal(App.editingId, 201);
    App.backFromRecord();                                               // Close
    assert.equal(App.wsMode, 'ledger'); assert.equal(App.ledgerId, 1);
  });
  test('Next / Prev walk only the origin ledger with a counter', () => {
    App.ledgerOpen('iat', 301, 'view');
    assert.match(text(ctx.htmlOf('wsMain')), /1 \/ 4 in ADCB Current/);
    const seen = [];
    for (let i = 0; i < 6; i++) { seen.push(App.wsSection + ':' + App.editingId); App.lnNav(1); }
    assert.deepEqual([...new Set(seen)], ['Inter Account Transfers:301', 'Receipts:101', 'Payments:201', 'Journal Entries:401']);
    assert.ok(!seen.includes('Receipts:102'), 'the ENBD receipt is not on the ADCB ledger');
    App.lnNav('first'); assert.equal(App.editingId, 301);
  });
  test('Delete returns to the origin', () => {
    App.ledgerOpen('payments', 201, 'view');
    App.editRecord(201);
    ctx.confirm = () => true; ctx.window.confirm = () => true;
    App.deleteRecord(201);
    assert.equal(App.wsMode, 'ledger'); assert.equal(App.ledgerId, 1);
  });
  test('Invoice -> Copy to -> Receipt -> Create returns to the invoice view', () => {
    App.selectSection('Sales Invoices'); App.viewRecord(501);
    App.copyTo('receipts');
    assert.equal(App.wsSection, 'Receipts'); assert.equal(App.wsMode, 'form');
    assert.equal(App.sideActive(), 'Sales Invoices');
    App.backFromRecord();                                                // what Create does after saving
    assert.equal(App.wsSection, 'Sales Invoices'); assert.equal(App.wsMode, 'view'); assert.equal(App.editingId, 501);
  });
  test('the URL carries the origin', () => {
    App.ledgerOpen('receipts', 101, 'view');
    const p = App._lnHashParams();
    assert.equal(p.m, 'view'); assert.equal(p.s, 'receipts'); assert.equal(p.id, '101'); assert.equal(p.from, 'ledger:bankCash:1');
    /* and it can be rebuilt after a refresh */
    App._lnBootHash = { b: '77', s: 'receipts', m: 'view', id: '101', from: 'ledger:bankCash:1' };
    App.selectSection('Summary');
    assert.equal(App.lnRestoreFromHash(), true);
    assert.equal(App.wsMode, 'view'); assert.equal(App.editingId, 101);
    assert.equal(crumb(), '▸ Bank and Cash Accounts ▸ ADCB Current ▸ Receipt 1');
    assert.equal(App.sideActive(), 'Bank and Cash Accounts');
  });
});

describe('Transaction Journal', () => {
  test('a receipt posts bank / income / VAT and balances', () => {
    const b = App.curBiz(); const rows = App.postingsFor(b, 'receipts', b.records.receipts[0]);
    /* the ledger engine posts banks to Cash & cash equivalents with the bank as the sub-account */
    const by = Object.fromEntries(rows.map((r) => [r.link && r.link.t === 'ledger' && r.sub ? r.sub : r.account, r]));
    assert.equal(by['ADCB Current'].debit, 1000);
    assert.equal(by['Sales'].credit, 952.38);
    assert.equal(by['Output VAT'].credit, 47.62);
    assert.equal(by['ADCB Current'].link.t, 'ledger');
  });
  test('the section opens in place, links to ledgers, Back returns to the voucher', () => {
    App.ledgerOpen('receipts', 101, 'view');
    App.txnJournal();
    const h = ctx.htmlOf('wsMain');
    assert.match(h, /id="lnTJ"/);
    assert.match(h, /App\.lnOpenLedger\('bankCash',1\)/);
    App.lnOpenLedger('bankCash', 1);
    assert.equal(App.wsMode, 'ledger');
    App.navBack();
    assert.equal(App.wsMode, 'view'); assert.equal(App.editingId, 101); assert.equal(App._tjOpen, true);
    assert.equal(crumb(), '▸ Bank and Cash Accounts ▸ ADCB Current ▸ Receipt 1');
  });
  test('an unbalanced journal shows a red warning', () => {
    App.selectSection('Journal Entries'); App.viewRecord(402); App.txnJournal();
    assert.match(ctx.htmlOf('wsMain'), /class="ln-tj-warn"/);
    App.backFromRecord(); App.viewRecord(401); App._tjOpen = true; App.renderMain(App.curBiz());
    assert.doesNotMatch(ctx.htmlOf('wsMain'), /class="ln-tj-warn"/);
  });
  test('an engine-provided postingsForRecord takes over', () => {
    ctx.postingsForRecord = () => [{ accountName: 'X', debit: 1, credit: 0 }, { accountName: 'Y', debit: 0, credit: 1 }];
    const b = App.curBiz();
    assert.deepEqual(App.postingsFor(b, 'receipts', b.records.receipts[0]).map((r) => r.account), ['X', 'Y']);
  });
});

describe('sidebar', () => {
  test('no active tab on History / Settings, origin tab inside a voucher chain', () => {
    App.openTool('history'); assert.equal(App.sideActive(), null);
    App.selectSection('Settings'); assert.equal(App.sideActive(), null);
    App.selectSection('Receipts'); assert.equal(App.sideActive(), 'Receipts');
  });
  test('items carry a tooltip and a live count hook', () => {
    App.renderSidebar(App.curBiz());
    const h = ctx.htmlOf('sidebar');
    assert.match(h, /title="Bank and Cash Accounts"/);
    assert.match(h, /data-side-count="receipts">2</);
  });
});
