/* List tools (js/list-tools.js), app modals (js/ui-modal.js) and the single
   top bar (index.html + js/topbar.js): date / money / words formatting,
   sortable list and ledger tables, footer totals, auto-hidden columns, Edit
   columns, bulk delete and Batch Update. */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadApp } from './_harness.mjs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

/** One business with a hand-made Receipts register (and some customers). */
function fresh(records, extra = {}) {
  const ctx = loadApp();
  const b = ctx.demoBusiness(); b.id = 5005; b.name = 'Lists Test';
  delete b.fmt; delete b.fmtV;
  Object.assign(b, extra);
  ctx.ensureSettings(b); ctx.ensureCoa(b);
  b.records = records || {
    bankCash: [{ id: 11, name: 'ADCB', code: 'ADCB' }],
    receipts: [
      { id: 1, date: '2026-01-05', reference: '3', receivedIn: 'ADCB - ADCB', paidBy: 'beta', paidByType: 'customer', description: 'x', amount: 8054 },
      { id: 2, date: '2026-03-01', reference: '10', receivedIn: 'ADCB - ADCB', paidBy: 'Alpha', paidByType: 'other', description: 'y', amount: -244092 },
      { id: 3, date: '2026-02-10', reference: '2', receivedIn: 'ADCB', paidBy: '', paidByType: 'supplier', description: 'z', amount: 0 },
      { id: 4, date: '', reference: '', receivedIn: 'ADCB', paidBy: 'gamma', paidByType: 'customer', description: 'w', amount: '' },
    ],
  };
  ctx.DB.set(ctx.DB.k.biz, [b]);
  ctx.App.openBiz = b.id;
  ctx.App.wsSection = 'Receipts'; ctx.App.wsMode = 'list';
  ctx.localStorage.removeItem('mgr_list_sort');
  return { ctx, App: ctx.App, b: () => ctx.App.curBiz() };
}
const bodyCells = (htmlStr, colIdx) => {
  const tbody = htmlStr.slice(htmlStr.indexOf('<tbody>'), htmlStr.indexOf('</tbody>'));
  return tbody.split('<tr').slice(1).map((tr) => {
    const tds = tr.split('<td').slice(1).map((td) => td.slice(td.indexOf('>') + 1).replace(/<\/td>[\s\S]*$/, '').replace(/<[^>]+>/g, ''));
    return tds[colIdx];
  });
};

describe('data display', () => {
  test('dates are DD/MM/YYYY by default and follow Settings when chosen', () => {
    const { App, b } = fresh();
    assert.equal(b().fmt.date, 'DD/MM/YYYY');
    assert.equal(App.fmtDateUS('2026-03-07'), '07/03/2026');
    assert.equal(App.fmtDate('2026-03-07T10:00:00Z'), '07/03/2026');
    assert.equal(App.fmtDateUS(''), '');
    const biz = b(); biz.fmt.date = 'MM/DD/YYYY'; App.saveBiz(biz);
    assert.equal(App.fmtDateUS('2026-03-07'), '03/07/2026');
    biz.fmt.date = 'D MMM YYYY'; App.saveBiz(biz);
    assert.equal(App.fmtDateUS('2026-03-07'), '7 Mar 2026');
  });

  test('the old MM/DD/YYYY default migrates once; a later choice stays', () => {
    const ctx = loadApp();
    const b = { id: 1, name: 'x', fmt: { date: 'MM/DD/YYYY', sep: 'comma-dot', decimals: 2 } };
    ctx.ensureSettings(b);
    assert.equal(b.fmt.date, 'DD/MM/YYYY'); assert.equal(b.fmtV, 2);
    b.fmt.date = 'MM/DD/YYYY'; ctx.ensureSettings(b);
    assert.equal(b.fmt.date, 'MM/DD/YYYY');
  });

  test('History timestamps use the same date format', () => {
    const { App } = fresh();
    assert.match(App._fmtTs('2026-03-07T08:09:10'), /^07\/03\/2026 08:09:10$/);
  });

  test('negative amounts have no space after the minus', () => {
    const { App } = fresh();
    assert.equal(App.money(-155646.51), '-155,646.51');
    assert.equal(App.money(1234), '1,234.00');
  });

  test('amount in words carries the currency', () => {
    const { App } = fresh();
    assert.equal(App.amountInWords(2000, 'AED'), 'AED Two Thousand Dirhams only');
    assert.equal(App.amountInWords(1, 'AED'), 'AED One Dirham only');
    assert.equal(App.amountInWords(150.5, 'AED'), 'AED One Hundred Fifty Dirhams and Fifty Fils only');
    assert.equal(App.amountInWords(21, 'USD'), 'USD Twenty-One Dollars only');
  });

  test('"ADCB - ADCB" is shown once; real code - name pairs stay', () => {
    const { App } = fresh();
    assert.equal(App.dispAcct('ADCB - ADCB'), 'ADCB');
    assert.equal(App.dispAcct('Cash Account - Cash Account'), 'Cash Account');
    assert.equal(App.dispAcct('B-001 - ADCB Current'), 'B-001 - ADCB Current');
    assert.equal(App.codeName('ADCB', 'ADCB'), 'ADCB');
    assert.equal(App.codeName('', 'Petty'), 'Petty');
    assert.equal(App.codeName('B-1', 'Petty'), 'B-1 - Petty');
  });

  test('receipts list: account once, Type capitalised, negatives red', () => {
    const { App, b } = fresh();
    const biz = b(); biz.details.listCols = { receipts: ['date', 'receivedIn', 'paidByType', 'amount'] }; App.saveBiz(biz);
    const h = App.tableHtml(App.curBiz());
    assert.ok(h.indexOf('ADCB - ADCB') < 0);
    assert.deepEqual(bodyCells(h, 4), ['Other', 'Supplier', 'Customer', 'Customer']);
    assert.match(h, /<td class="m r neg">-244,092\.00<\/td>/);
  });
});

describe('list table', () => {
  test('fixed columns carry ✎ / 👁 icons; data headers are sortable', () => {
    const { App } = fresh();
    const h = App.tableHtml(App.curBiz());
    assert.match(h, /<th class="act ico-h" title="Edit"[^>]*>✎<\/th>/);
    assert.match(h, /<th class="act ico-h" title="View"[^>]*>👁<\/th>/);
    assert.match(h, /onclick="App\.listSort\('amount'\)"/);
    assert.ok(!/<th class="act"><\/th>/.test(h), 'no empty header cells');
  });

  test('amount sort is numeric, empties last in both directions', () => {
    const { App } = fresh();
    App.listSort('amount');
    let ids = App.listRows(App.curBiz()).map((r) => r.id);
    assert.deepEqual(ids, [2, 3, 1, 4]);
    App.listSort('amount');
    ids = App.listRows(App.curBiz()).map((r) => r.id);
    assert.deepEqual(ids, [1, 3, 2, 4]);
    assert.deepEqual({ ...App.sortState('list:receipts') }, { col: 'amount', dir: 'desc' });
  });

  test('text sorts case-insensitively, dates as dates, references numerically', () => {
    const { App } = fresh();
    App.listSort('paidBy');
    assert.deepEqual(App.listRows(App.curBiz()).map((r) => r.paidBy), ['Alpha', 'beta', 'gamma', '']);
    App.listSort('date');
    assert.deepEqual(App.listRows(App.curBiz()).map((r) => r.id), [1, 3, 2, 4]);
    App.listSort('reference');
    assert.deepEqual(App.listRows(App.curBiz()).map((r) => r.reference), ['2', '3', '10', '']);
  });

  test('sorting covers the whole data set, with search and paging', () => {
    const { App } = fresh();
    App.pageSize = 2;
    App.listSort('amount');
    App.listSort('amount'); // desc
    const h = App.tableHtml(App.curBiz());
    const amounts = bodyCells(h, 7);
    assert.deepEqual(amounts, ['8,054.00', '0.00']);
    App.listQuery = 'ADCB - ADCB';
    assert.deepEqual(App.listRows(App.curBiz()).map((r) => r.id), [1, 2]);
  });

  test('each tab keeps its own sort', () => {
    const { App } = fresh();
    App.listSort('amount');
    App.wsSection = 'Payments';
    assert.equal(App.sortState('list:payments'), null);
    App.wsSection = 'Receipts';
    assert.equal(App.sortState().col, 'amount');
  });

  test('footer Total sits under the amount column; none without an amount column', () => {
    const { App, b } = fresh();
    const h = App.tableHtml(App.curBiz());
    const tfoot = h.slice(h.indexOf('<tfoot>'), h.indexOf('</tfoot>'));
    const cells = tfoot.split('<td').slice(1);
    assert.match(cells[0], /colspan="2"[^>]*>Total/);
    /* Date Reference Received-in Description Paid-by Amount → Amount is the 6th data column */
    const amountCell = cells.findIndex((c) => /-236,038\.00/.test(c));
    assert.equal(amountCell, 6);
    assert.ok(h.indexOf('class="total num"') < 0, 'total no longer in the footer bar');
    const biz = b(); biz.records.deliveryNotes = [{ id: 1, issueDate: '2026-01-01', reference: '1', customer: 'A' }]; App.saveBiz(biz);
    App.wsSection = 'Delivery Notes';
    assert.ok(App.tableHtml(App.curBiz()).indexOf('<tfoot>') < 0);
  });

  test('columns empty in every row are hidden by default and can be re-enabled', () => {
    const { App, b } = fresh();
    const biz = b(); biz.records.receipts.forEach((r) => { r.description = ''; }); App.saveBiz(biz);
    const c = App.cfg();
    assert.ok(!App._cols(c).some((x) => x.key === 'description'));
    const d = App._colDraftFor(c);
    const desc = d.find((x) => x.key === 'description');
    assert.equal(desc.on, false);
    desc.on = true; App.colsSave(d);
    assert.ok(App._cols(c).some((x) => x.key === 'description'));
  });

  test('Code / Reference / Date do not wrap; Name has a min width', () => {
    const { App } = fresh();
    const h = App.tableHtml(App.curBiz());
    assert.match(h, /<th class="nw sortable"/);
    App.wsSection = 'Customers';
    const hc = App.tableHtml(App.curBiz());
    assert.match(hc, /<th class="c-name sortable"/);
    assert.match(hc, /<th class="nw sortable"[^>]*title="Sort by Code"/);
  });
});

describe('Edit columns', () => {
  test('one pool per tab: built-in columns, form fields, custom fields, no duplicates', () => {
    const { App, b } = fresh();
    const biz = b(); biz.formConfig = { receipts: { custom: [{ key: 'cfa', type: 'field', label: 'Cheque no' }, { key: 'cfb', type: 'field', label: 'Amount' }] } };
    biz.records.receipts[0].custom = { cfa: 'CHQ-9' };
    App.saveBiz(biz);
    const pool = App._colPool(App.cfg());
    const labels = pool.map((p) => p.label.toLowerCase());
    assert.equal(new Set(labels).size, labels.length);
    assert.ok(pool.some((p) => p.key === 'cf_cfa'));
    assert.ok(!pool.some((p) => p.key === 'cf_cfb'), 'custom field duplicating a built-in label is dropped');
    assert.equal(pool[pool.length - 1].label, 'Journal');
    biz.details.listCols = { receipts: ['reference', 'cf_cfa'] }; App.saveBiz(App.curBiz());
    const b2 = App.curBiz(); b2.details.listCols = { receipts: ['reference', 'cf_cfa'] }; App.saveBiz(b2);
    const h = App.tableHtml(App.curBiz());
    assert.match(h, /Cheque no/); assert.match(h, /CHQ-9/);
  });

  test('order and selection are saved per tab; Reset to default clears them', () => {
    const { App, b } = fresh();
    App.editColumns();
    assert.equal(App.wsMode, 'listCols');
    const d = App._colDraft;
    const amountIdx = d.findIndex((x) => x.key === 'amount');
    App._ecMoveTo(amountIdx, 0);
    App._ecMove(1, 1);
    App.colsUpdate();
    assert.equal(App.wsMode, 'list');
    const saved = b().details.listCols.receipts;
    assert.equal(saved[0], 'amount');
    assert.equal(b().details.listColsOrder.receipts[0], 'amount');
    const head = App.tableHtml(App.curBiz());
    assert.ok(head.indexOf("listSort('amount')") < head.indexOf("listSort('date')"));
    App.editColumns(); App.colsReset();
    assert.equal(b().details.listCols.receipts, undefined);
  });

  test('Edit columns is a page with breadcrumb, handles, arrows, Update and Reset', () => {
    const { App } = fresh();
    App.editColumns();
    const p = App._colsPageHtml(App.curBiz());
    assert.match(p, /Receipts<\/a> ▸ Edit columns/);
    assert.match(p, /class="ec-handle"/);
    assert.match(p, />↑<\/button>/); assert.match(p, />↓<\/button>/);
    assert.match(p, />Update<\/button>/); assert.match(p, />Reset to default<\/button>/);
    assert.ok(p.indexOf('>Save<') < 0);
    assert.ok(!/>Edit<|>View</.test(p.slice(p.indexOf('ec-list'))), 'Edit / View are not reorderable');
  });

  test('Journal column opens the transaction journal when available, else the View', () => {
    const { App } = fresh();
    const seen = [];
    App.viewRecord = (id) => seen.push(['view', id]);
    App.rowJournal(2);
    App.showTransactionJournal = (k, id) => seen.push(['journal', k, id]);
    App.rowJournal(3);
    assert.deepEqual(seen.map((x) => [...x]), [['view', 2], ['journal', 'receipts', 3]]);
  });
});

describe('bulk delete and Batch Update', () => {
  test('bulk-delete mode: checkbox column with Select All and the "N selected" bar', () => {
    const { App } = fresh();
    App.batchMode = true; App.batchSel = { 1: 1 };
    const h = App.tableHtml(App.curBiz());
    assert.match(h, /<th class="act chk"><input type="checkbox" id="batchAll"/);
    assert.match(h, /<b id="batchCount">1<\/b> selected<\/span><span class="bb-sep">—<\/span>/);
    assert.match(h, />Delete<\/button><span class="bb-sep">\|<\/span>/);
    App.batchMode = false;
    assert.ok(App.tableHtml(App.curBiz()).indexOf('batch-bar') < 0);
  });

  test('Select All selects the current page only', () => {
    const { App } = fresh();
    App.pageSize = 2; App.batchMode = true; App.batchSel = {};
    App.tableHtml(App.curBiz());
    App.batchAll(true);
    assert.equal(Object.keys(App.batchSel).length, 2);
    App.batchAll(false);
    assert.equal(Object.keys(App.batchSel).length, 0);
  });

  test('deleting asks through the app modal, never confirm()', async () => {
    const { ctx, App, b } = fresh();
    let asked = null;
    ctx.confirm = () => { throw new Error('browser confirm used'); };
    ctx.UIModal.confirm = (t) => { asked = t; return Promise.resolve(true); };
    App.batchMode = true; App.batchSel = { 1: 1, 2: 1, 3: 1 };
    await App.batchDeleteRun();
    assert.equal(asked, 'Delete 3 selected records?\n\nThis can be undone from History.');   /* History restores a batch delete */
    assert.deepEqual(b().records.receipts.map((r) => r.id), [4]);
    assert.equal(App.batchMode, false);
  });

  test('cancelling the modal keeps the records', async () => {
    const { ctx, App, b } = fresh();
    ctx.UIModal.confirm = () => Promise.resolve(false);
    App.batchMode = true; App.batchSel = { 1: 1 };
    await App.batchDeleteRun();
    assert.equal(b().records.receipts.length, 4);
  });

  test('Batch Operations offers Import, Batch Update and Bulk delete', () => {
    const { App } = fresh();
    let shown = '';
    App._openOverlay = (h) => { shown = h; };
    App.batchMenu();
    assert.match(shown, /App\.batchImport\(\)/); assert.match(shown, /App\.batchUpdate\(\)/); assert.match(shown, /App\.batchDelete\(\)/);
  });

  test('Batch Update: download CSV, change a cell, only that cell changes', () => {
    const { App, b } = fresh();
    const csv = App.batchUpdateCsv();
    const lines = csv.trim().split('\n');
    assert.match(lines[0], /^Id,Date,Reference,/);
    const hdr = lines[0].split(',');
    const descIdx = hdr.indexOf('Description');
    const row = lines[1].split(','); row[descIdx] = 'changed'; lines[1] = row.join(',');
    const plan = App.batchUpdatePlan(lines.join('\n'));
    assert.equal(plan.changes.length, 1); assert.equal(plan.cells, 1);
    App.batchUpdateApply(plan);
    const rec = b().records.receipts.find((r) => String(r.id) === row[0]);
    assert.equal(rec.description, 'changed');
    assert.equal(b().records.receipts.filter((r) => r.description === 'changed').length, 1);
    assert.ok(App.batchUpdatePlan('Name\nx').error);
  });
});

describe('ledger sort', () => {
  test('ledger rows sort on the whole set; the opening row stays put', () => {
    const { App } = fresh();
    App.wsMode = 'ledger'; App.wsSection = 'Bank and Cash Accounts';
    const rows = [{ date: '2026-01-02', debit: 5, credit: 0 }, { date: '2026-01-01', debit: 0, credit: 7 }, { date: '2026-01-03', debit: 50, credit: 0 }, { opening: 1, type: 'Starting balance', debit: 0, credit: 0 }];
    App.setSortState('ledger:bankCash', 'debit', 'desc');
    assert.deepEqual([...App.sortLedgerRows(rows, 'ledger:bankCash').map((r) => r.debit)], [50, 5, 0, 0]);
    assert.equal(App.sortLedgerRows(rows, 'ledger:bankCash')[3].opening, 1);
    App.setSortState('ledger:bankCash', 'date', 'asc');
    assert.deepEqual([...App.sortLedgerRows(rows, 'ledger:bankCash').map((r) => r.date).slice(0, 3)], ['2026-01-01', '2026-01-02', '2026-01-03']);
  });
});

describe('top bar', () => {
  const bar = html.slice(html.indexOf('<div class="toolbar">'), html.indexOf('<div id="pageBusinesses"'));
  test('one bar: search and bell sit with the business, before the Businesses tab', () => {
    assert.ok(bar.indexOf('id="wsSearch"') < bar.indexOf('id="tabBiz"'));
    assert.ok(bar.indexOf('id="hdNotify"') < bar.indexOf('id="tabBiz"'));
    assert.ok(bar.indexOf('id="wsBizName"') < bar.indexOf('id="wsSearch"'));
  });
  test('no user-name tab or Logout button in the tabs; avatar menu in the right order', () => {
    const nav = bar.slice(bar.indexOf('<div class="tb-nav">'), bar.indexOf('<div class="tb-right">'));
    assert.ok(nav.indexOf('logout') < 0 && nav.indexOf('Profile') < 0);
    const menu = bar.slice(bar.indexOf('id="tbUserMenu"'));
    const order = ['hdUserName', 'hdUserRole', 'tb-menu-sep', 'My Profile', 'Emails', 'History', 'Backup', 'Dark Mode', 'tb-menu-sep', 'Logout'];
    let at = -1;
    order.forEach((t) => { const i = menu.indexOf(t, at + 1); assert.ok(i > at, t + ' out of order'); at = i; });
    assert.ok(/class="tb-menu-danger"[^>]*>.*Logout/.test(menu));
    assert.ok(bar.indexOf('btn btn-sm" onclick="App.openTool') < 0, 'old Emails / History / Backup buttons are gone');
  });
  test('every menu item keeps its old function', () => {
    const src = readFileSync(new URL('../js/topbar.js', import.meta.url), 'utf8');
    for (const s of ["A.go('profile')", 'A.toggleTheme()', 'A.logout()', 'A.openTool(what)']) assert.ok(src.indexOf(s) >= 0, s);
  });
});
