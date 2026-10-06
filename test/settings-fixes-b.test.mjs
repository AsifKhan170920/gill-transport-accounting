/* Settings fixes (B): js/settings-fixes-b.js and the reverse-charge / tax-account postings in
   js/ledger-engine.js — FIX_SPEC_SETTINGS items 112-126, leftover 65 and the grouped Trial Balance.
   DOM behaviour (date boxes painted in the chosen format, the theme iframe, the stock box on the
   Sales Invoice form) is checked in a browser; pinned here is the logic behind it. */
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadAppWithDemo } from './_harness.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const run = (ctx, f) => vm.runInContext(readFileSync(join(ROOT, f), 'utf8'), ctx, { filename: f });

let ctx, App, SP, FX, GL;
beforeEach(() => {
  ({ ctx } = loadAppWithDemo());
  run(ctx, 'js/settings-pages.js');
  /* stand-in for js/form-editor-bridge.js (designed forms' option lists), wrapped by settings-fixes-b */
  vm.runInContext("App._liveOptionsFor = function (b, src) { return src === 'tax' ? (b.taxCodes || []).map(function (t) { return '<option value=\"' + t.rate + '\">' + t.name + '</option>'; }) : []; };", ctx);
  run(ctx, 'js/settings-fixes-b.js');
  App = ctx.App; SP = ctx.SettingsPages; FX = ctx.SettingsFixesB; GL = vm.runInContext('GL', ctx);
  ctx.confirm = () => true;
});
const cur = () => App.curBiz();
const save = (path, v, id) => { const r = SP.save(path, v, id); assert.ok(r.ok, r.error); return r.record; };
const edit = (fn) => { const b = cur(); fn(b); App.saveBiz(b); return cur(); };
const render = (key, sub = '', action = null, id = null) => {
  App.setView = key; App.spRoute = { key, sub, action, id: id == null ? null : String(id) };
  return App.settingsHtml(cur());
};
const acct = (b, id) => (b.coa || []).find((n) => n.id === id);
const idOf = (b, name) => ((b.coa || []).find((n) => n.type === 'account' && n.name === name) || {}).id;
const docPostings = (b, key, id) => GL.docLines(b, key, id).map((L) => [acct(b, L.acct) ? acct(b, L.acct).name : L.acct, L.debit, L.credit]);

describe('115-117 date and number formats', () => {
  test('every live date format', () => {
    const want = { 'DD-MM-YY': '31-12-26', 'DD-MM-YYYY': '31-12-2026', 'DD.MM.YY': '31.12.26', 'DD.MM.YYYY': '31.12.2026', 'DD/MM/YY': '31/12/26',
      'DD/MM/YYYY': '31/12/2026', 'MM/DD/YYYY': '12/31/2026', 'YYYY-MM-DD': '2026-12-31', 'YYYY.MM.DD': '2026.12.31', 'YYYY/MM/DD': '2026/12/31' };
    assert.deepEqual([...FX.DATE_FORMATS].map((x) => x[0]).sort(), Object.keys(want).sort());
    for (const f of Object.keys(want)) {
      edit((b) => { b.fmt.date = f; });
      assert.equal(App.fmtDate('2026-12-31'), want[f], f);
      assert.equal(App.fmtDateUS('2026-12-31T10:00:00Z'), want[f], f + ' (timestamp)');
      assert.equal(App.datePlaceholder(), f.toLowerCase());
    }
    edit((b) => { b.fmt.date = 'YYYY.MM.DD'; });
    assert.ok(App._fmtTs('2026-03-04T08:00:00').startsWith('2026.03.04'), 'History timestamps follow the format');
  });
  test('the Settings page offers them, keeping an older stored choice', () => {
    const html = render('format');
    for (const ex of ['31-12-26', '31.12.2026', '2026/12/31', '12,34,56,789.00', '123,456,789/00']) assert.ok(html.includes(ex), ex);
  });
  test('Indian grouping and the "/00" decimal mark, parsed back', () => {
    edit((b) => { b.fmt.sep = 'indian'; });
    assert.equal(App.money(123456789), '12,34,56,789.00');
    assert.equal(App.money(-1234.5), '-1,234.50');
    assert.equal(App.money(999), '999.00');
    edit((b) => { b.fmt.sep = 'comma-slash'; });
    assert.equal(App.money(123456789), '123,456,789/00');
    assert.equal(App.parseNum('1,234/50'), 1234.5);
    edit((b) => { b.fmt.sep = 'dot-comma'; });
    assert.equal(App.parseNum('1.234,50'), 1234.5);
    edit((b) => { b.fmt.sep = 'comma-dot'; });
    assert.equal(App.parseNum('1,234.50'), 1234.5);
    assert.equal(App.money(1234.5), '1,234.50');
  });
  test('report headings no longer print [object Object]', () => {
    App._repCtx = null;
    const h = App.repHead(cur(), 'Test');
    assert.ok(!h.includes('[object Object]'));
  });
});

describe('112-114 tax codes', () => {
  test('a reverse-charged Custom % code adds no tax to documents and keeps its rate', () => {
    const r = save('tax', { name: 'RCM 5%', taxRate: 'Custom %', type: 'Single rate', rate: 5, reverse: true });
    assert.equal(r.rate, 0); assert.equal(r.rcRate, 5); assert.ok(r.rcTag);
    assert.equal(App.taxRate('RCM 5%'), 0, 'forms multiply by 0');
    const loaded = SP.PAGES.tax.load(JSON.parse(JSON.stringify(r)), cur());
    assert.equal(loaded.rate, 5, 'the form shows the real rate');
    const html = render('tax');
    assert.ok(html.includes('5% (reverse charge)'));
    /* unticking it makes it an ordinary 5 % code again */
    const r2 = save('tax', Object.assign({}, loaded, { reverse: false }), r.id);
    assert.equal(r2.rate, 5); assert.equal(r2.rcRate, undefined);
  });
  test('Transactions column counts the documents using a code', () => {
    edit((b) => { b.records.payments = [{ id: 1, date: '2026-10-01', paidFrom: b.records.bankCash[0].name, amount: 105, lines: [{ account: idOf(b, 'Input VAT'), net: 100, amount: 105, taxAmt: 5, tax: 'VAT 5%', taxCode: 'VAT 5%' }] },
      { id: 2, date: '2026-10-02', paidFrom: b.records.bankCash[0].name, amount: 10, lines: [{ account: idOf(b, 'Input VAT'), amount: 10 }] }]; });
    const html = render('tax');
    assert.ok(html.includes('>Transactions<'));
    assert.equal(FX.taxTxCount(cur(), cur().taxCodes.find((t) => t.name === 'VAT 5%')), 1);
    assert.equal(FX.taxTxCount(cur(), cur().taxCodes.find((t) => t.name === 'Exempt')), 0);
  });
  test('the Account dropdown lists only tax asset / liability accounts', () => {
    const b = cur(), ids = FX.taxAccountOpts(b).map((o) => o[0]);
    assert.ok(ids.includes(idOf(b, 'Input VAT')) && ids.includes(idOf(b, 'Output VAT')), 'Input / Output VAT');
    for (const bad of ['Accounts receivable', 'Cash & cash equivalents', 'Accounts payable', 'Capital Accounts', 'Retained earnings', 'Suspense', 'Deposits (Asset)']) assert.ok(!ids.includes(idOf(b, bad)), bad);
    const html = render('tax', '', 'new');
    assert.ok(!html.includes('Accounts receivable'));
  });
});

describe('112 reverse charge and tax accounts in the general ledger', () => {
  let exp, sup, bank;
  beforeEach(() => {
    save('tax', { name: 'RCM 5%', taxRate: 'Custom %', type: 'Single rate', rate: 5, reverse: true });
    const b = cur(); exp = GL.sysAcct(b, 'salaries', true).id; App.saveBiz(b);
    sup = cur().records.suppliers[0].name; bank = cur().records.bankCash[0].name;
  });
  test('purchase invoice (native line by name, designed line by tag): Dr Input VAT = Cr Output VAT, total without tax', () => {
    const tag = cur().taxCodes.find((t) => t.name === 'RCM 5%').rcTag;
    const b = edit((b) => { b.records.purchInv = [
      { id: 11, issueDate: '2026-10-03', reference: 'PI-1', supplier: sup, total: 1000, lines: [{ account: exp, net: 1000, amount: 1000, taxAmt: 0, tax: 'RCM 5%', taxCode: 'RCM 5%' }] },
      { id: 12, issueDate: '2026-10-03', reference: 'PI-2', supplier: sup, total: 200, lines: [{ account: exp, accountName: 'Salaries', net: 200, amount: 200, taxAmt: 0, tax: '0e' + tag, taxRate: '0e' + tag }] }]; });
    const p1 = docPostings(b, 'purchInv', 11);
    assert.deepEqual(p1.find((x) => x[0] === 'Input VAT'), ['Input VAT', 50, 0]);
    assert.deepEqual(p1.find((x) => x[0] === 'Output VAT'), ['Output VAT', 0, 50]);
    assert.deepEqual(p1.find((x) => x[0] === 'Accounts payable'), ['Accounts payable', 0, 1000]);
    const p2 = docPostings(b, 'purchInv', 12);
    assert.deepEqual(p2.find((x) => x[0] === 'Input VAT'), ['Input VAT', 10, 0]);
    assert.deepEqual(p2.find((x) => x[0] === 'Output VAT'), ['Output VAT', 0, 10]);
    const tb = GL.trial(b); assert.equal(tb.debit, tb.credit);
  });
  test('payments and expense claims post the reverse charge; sales documents do not', () => {
    const b = edit((b) => {
      b.records.payments = [{ id: 21, date: '2026-10-04', paidFrom: bank, amount: 400, lines: [{ account: exp, net: 400, amount: 400, taxAmt: 0, taxCode: 'RCM 5%' }] }];
      b.records.expenseClaims = [{ id: 22, date: '2026-10-04', payer: 'Asif', lines: [{ account: exp, net: 100, amount: 100, taxAmt: 0, taxCode: 'RCM 5%' }] }];
      b.records.salesInv = [{ id: 23, issueDate: '2026-10-04', customer: b.records.customers[0].name, total: 300, lines: [{ account: exp, net: 300, amount: 300, taxAmt: 0, taxCode: 'RCM 5%' }] }];
    });
    assert.deepEqual([...docPostings(b, 'payments', 21).filter((x) => /VAT/.test(x[0]))].map((x) => [...x]), [['Input VAT', 20, 0], ['Output VAT', 0, 20]]);
    assert.deepEqual([...docPostings(b, 'expenseClaims', 22).filter((x) => /VAT/.test(x[0]))].map((x) => [...x]), [['Input VAT', 5, 0], ['Output VAT', 0, 5]]);
    assert.equal(docPostings(b, 'salesInv', 23).filter((x) => /VAT/.test(x[0])).length, 0);
    const tb = GL.trial(b); assert.equal(tb.debit, tb.credit);
  });
  test('a tax code with its own account posts the tax there; without one, to Output / Input VAT', () => {
    const b0 = cur(); b0.coa.push({ id: 'avat2', type: 'account', name: 'VAT payable - Dubai', parent: 'liabilities', balance: 0 });
    b0.taxCodes.push({ name: 'Dubai VAT', rate: 5, taxRate: 'Custom %', account: 'avat2' }); App.saveBiz(b0);
    const b = edit((b) => { b.records.salesInv = [
      { id: 31, issueDate: '2026-10-05', customer: b.records.customers[0].name, total: 210, lines: [
        { account: exp, net: 100, amount: 105, taxAmt: 5, taxCode: 'Dubai VAT' }, { account: exp, net: 100, amount: 105, taxAmt: 5, taxCode: 'VAT 5%' }] }]; });
    const p = docPostings(b, 'salesInv', 31);
    assert.deepEqual(p.find((x) => x[0] === 'VAT payable - Dubai'), ['VAT payable - Dubai', 0, 5]);
    assert.deepEqual(p.find((x) => x[0] === 'Output VAT'), ['Output VAT', 0, 5]);
  });
  test('designed purchase forms offer the code with a value that reads as 0 %', () => {
    const opts = App._liveOptionsFor(cur(), 'tax').join('');
    const tag = cur().taxCodes.find((t) => t.name === 'RCM 5%').rcTag;
    assert.ok(opts.includes('value="0e' + tag + '"'));
    assert.equal(Number('0e' + tag), 0);
    assert.ok(opts.includes('value="5"'), 'ordinary codes keep their rate');
  });
});

describe('118 themes', () => {
  test('Custom Themes shows only the Themes list (designer categories hidden for now)', () => {
    const keys = Object.keys(SP.PAGES.themes.items);
    assert.deepEqual(keys, ['html']);
    assert.equal(SP.PAGES.themes.items.html.title, 'Themes');
  });
  test('a theme renders a document through its placeholders and #doc', () => {
    const th = save('themes/html', { name: 'Sale invoice', content: '<html><head></head><body><h1>{{title}} {{reference}}</h1><p>{{party}} {{date}} {{total}}</p><main id="doc"></main></body></html>' });
    const b = cur();
    const rec = { id: 5, reference: 'INV-9', issueDate: '2026-12-31', customer: 'Al Noor', total: 1050, lines: [{ desc: 'Glass', qty: 2, price: 500, taxAmt: 50, amount: 1050 }] };
    const html = FX.renderTheme(b, 'salesInv', rec, th, '<div class="std">STANDARD</div>');
    assert.ok(html.includes('Sales Invoice INV-9') || html.includes('INV-9'));
    assert.ok(html.includes('Al Noor 31/12/2026 1,050.00'));
    assert.ok(html.includes('<main id="doc"><div class="std">STANDARD</div></main>'));
    assert.ok(html.includes('css/app.css'), 'the standard layout gets the app styles');
  });
  test('the view renders through the chosen theme', () => {
    const th = save('themes/html', { name: 'T1', content: '<p>{{reference}}</p>' });
    edit((b) => { b.records.salesInv = [{ id: 7, reference: 'X-1', issueDate: '2026-10-01', customer: 'C', total: 10, lines: [], theme: th.id }]; });
    App.wsSection = 'Sales Invoices'; App.editingId = 7;
    const c = App.cfg(), b = cur();
    const out = App.voucherDoc(b, c, b.records.salesInv[0]);
    assert.ok(out.startsWith('<iframe class="sfb-theme-frame"'));
    assert.ok(out.includes('X-1'));
    const view = App.viewHtml(b);
    assert.ok(view.includes('sfb-theme-sel') && view.includes('>T1<'));
  });
});

describe('119 user permissions', () => {
  test('New User Permissions creates a record for a chosen user and assigns the business', () => {
    const DB = ctx.DB;
    DB.set(DB.k.users, [{ id: 'u1', username: 'admin', role: 'Administrator', businesses: [] }, { id: 'u2', username: 'khan', name: 'Janan', role: 'Restricted user', businesses: [] }]);
    App.setView = 'permissions';
    assert.ok(App.set_permissions(cur()).includes('App.permNew()'));
    App.permNew();
    const html = App.set_permissions(cur());
    assert.ok(html.includes('id="permNewUser"') && html.includes('khan') && !html.includes('>admin'));
    App.permSave();
    assert.ok(App._permDraft.msg && /Choose the user/.test(App._permDraft.msg.error));
    App.permNewUser('u2'); App._permDraft.p.perms = { 'Sales Invoices': 'View' };
    App.permSave();
    assert.equal(cur().userPermissions.u2.access, 'Custom access');
    assert.ok(DB.get(DB.k.users).find((u) => u.id === 'u2').businesses.includes(cur().id));
  });
  test('buttons above the level are stripped from views drawn by other modules', () => {
    const html = '<button onclick="TxnForms.del()">Delete</button><button onclick="TxnForms.save(\'update\')">Update</button><button onclick="TxnForms.cloneDoc()">Clone</button><button onclick="App.printView()">Print</button>';
    assert.equal(FX.stripLevel(html, 1), '<button onclick="App.printView()">Print</button>');
    assert.ok(FX.stripLevel(html, 3).includes('Update') && !FX.stripLevel(html, 3).includes('Delete'));
    assert.equal(FX.stripLevel(html, 4), html);
  });
});

describe('120-121 email', () => {
  test('Email settings page like live and the relay gets every setting', () => {
    const html = render('email', 'smtp');
    for (const bit of ['Protocol', 'Hostname', 'Port', 'Username', 'Password', 'Send a copy of every email to', 'Receive email replies at a different address', 'Do not verify TLS certificate', 'Test email settings']) assert.ok(html.includes(bit), bit);
    save('email/smtp', { protocol: 'SMTP', relayUrl: 'https://relay.test/send', smtpHost: 'smtp.test', smtpPort: '465', smtpUser: 'u', smtpPass: 'p', fromAddr: 'a@test.ae', bcc: true, bccTo: 'copy@test.ae', reply: false, replyTo: 'x', noTls: true });
    const cfg = App.emailCfg(cur());
    assert.equal(cfg.mode, 'relay'); assert.equal(cfg.encryption, 'SSL'); assert.equal(cfg.replyTo, '');
    const p = App._sfbRelayPayload(cur(), cfg, { to: 't@x.ae', subject: 's', body: 'b' });
    assert.equal(p.bcc, 'copy@test.ae'); assert.equal(p.smtp.verifyTls, false); assert.equal(p.smtp.port, '465');
    assert.ok(App._mailtoHref(cfg, { to: 't@x.ae', subject: 's', body: 'b' }).includes('bcc=copy%40test.ae'));
    save('email/smtp', { relayUrl: '' });
    assert.equal(App.emailCfg(cur()).mode, 'mailto');
  });
  test('templates for every document type, used by the Email button with new placeholders', () => {
    const types = App._emTplTypes().map((t) => t[0]);
    for (const k of ['salesQuotes', 'salesOrders', 'salesInv', 'creditNotes', 'deliveryNotes', 'receipts', 'purchOrders', 'purchInv', 'debitNotes', 'payments', 'payslips']) assert.ok(types.includes(k), k);
    save('email/templates', { type: 'creditNotes', subject: 'CN {ref} due {due}', body: 'Balance {balance}' });
    const b = cur(); const t = App.emailTplFor(b, 'creditNotes');
    const vars = App.emailVars(b, 'creditNotes', { reference: 'CN-1', dueDate: '2026-11-30', balanceDue: 50 });
    assert.equal(App._emFill(t.subject, vars), 'CN CN-1 due 30/11/2026');
    assert.equal(App._emFill(t.body, vars), 'Balance 50.00');
    assert.ok(!SP.save('email/templates', { type: 'creditNotes', subject: 'dup' }).ok, 'one template per type');
  });
});

describe('122-126 settings pages', () => {
  test('no record id above a settings record form', () => {
    const d = save('divisions', { name: 'North' });
    const html = render('divisions', '', 'edit', d.id);
    assert.ok(!html.includes('sp-uid') && !html.includes('>' + d.id + '<'));
  });
  test('every settings list has Form Defaults and Batch Operations; every page a crumb and Back', () => {
    for (const p of SP.paths()) {
      if (p.kind === 'link' || p.kind === 'legacy') continue;
      const html = render(p.key, p.sub);
      assert.ok(html.includes('ws-crumb') && html.includes('sfb-back'), p.key + '/' + p.sub);
      if (p.kind === 'list') assert.ok(html.includes('sfb-fd-btn') && html.includes('sfb-bo-btn'), p.key + '/' + p.sub);
    }
    for (const t of App.setTiles()) { const html = render(t[2]); assert.ok(html.includes('Settings') && html.includes('sfb-back'), t[2]); }
  });
  test('Form Defaults pre-fill a new settings record', () => {
    FX.saveFormDefaults('divisions', { code: 'DV-' });
    const html = render('divisions', '', 'new');
    assert.ok(html.includes('value="DV-"'));
    const plain = render('projects', '', 'new');
    assert.ok(!plain.includes('value="DV-"'));
    assert.ok(render('divisions', '', 'new').includes('value="DV-"'), 'defaults restored after a render');
  });
  test('Batch Operations create, update and delete', () => {
    const rows = FX.parseTsv('id\tname\tcode\n\tEast\tE\n\tWest\tW');
    assert.deepEqual(JSON.parse(JSON.stringify(FX.batchApplyRows('divisions', rows))), { created: 2, updated: 0, errors: [] });
    const east = cur().divisions.find((d) => d.name === 'East');
    FX.batchApplyRows('divisions', [{ id: east.id, name: 'East', code: 'E2' }]);
    assert.equal(cur().divisions.find((d) => d.id === east.id).code, 'E2');
    assert.ok(FX.batchApplyRows('divisions', [{ name: '' }]).errors.length, 'validation applies');
  });
  test('complete country list', () => {
    assert.ok(FX.COUNTRIES.length >= 249);
    const html = render('business');
    for (const c of ['United Arab Emirates', 'Kenya', 'Oman', 'Zimbabwe', 'Bahrain']) assert.ok(html.includes('>' + c + '<'), c);
  });
  test('index: settings in use first, the rest below', () => {
    edit((b) => { b.divisions = [{ id: 'd1', name: 'North' }]; b.lockDate = '2026-01-31'; b.recurring = []; });
    App.setView = null;
    const html = App.settingsHtml(cur());
    const used = html.split('sfb-used')[1].split('sfb-rest')[0];
    assert.ok(used.includes("openSetting('divisions')") && used.includes("openSetting('lock')") && used.includes("openSetting('tax')"));
    const rest = html.split('sfb-rest')[1];
    assert.ok(rest.includes("openSetting('recurring')") && !rest.includes("openSetting('divisions')"));
  });
});

describe('65 stock at the chosen location', () => {
  test('qty beyond stock is reported per location; sales at a custom location draw from it', () => {
    const b = edit((b) => {
      b.locations = [{ id: 'l1', name: 'Warehouse' }];
      b.records.inventory = [{ id: 1, name: 'Glass', qty: 10 }];
      b.records.invTransfers = [{ id: 2, date: '2026-10-01', fromLocation: 'Main location', toLocation: 'Warehouse', lines: [{ item: 'Glass', qty: 4 }] }];
    });
    assert.deepEqual(JSON.parse(JSON.stringify(FX.stockShortfalls(b, [{ item: 'Glass', qty: 7 }], 'Main location'))), [{ item: 'Glass', qty: 7, available: 6 }]);
    assert.equal(FX.stockShortfalls(b, [{ item: 'Glass', qty: 4 }], 'Warehouse').length, 0);
    assert.equal(FX.stockShortfalls(b, [{ item: 'Glass', qty: 5 }], 'Warehouse').length, 1);
    const b2 = edit((b) => { b.records.salesInv = [{ id: 9, issueDate: '2026-10-02', location: 'Warehouse', lines: [{ item: 'Glass', qty: 3 }] }]; });
    assert.equal(vm.runInContext('invQtyAtLocation', ctx)(b2, 'Glass', 'Warehouse'), 1);
    /* editing the same invoice adds its own qty back */
    assert.equal(FX.stockShortfalls(b2, [{ item: 'Glass', qty: 4 }], 'Warehouse', 9).length, 0);
  });
});

describe('Trial Balance grouped by account type', () => {
  test('groups in order with subtotals and Dr = Cr', () => {
    const b = edit((b) => {
      const exp = GL.sysAcct(b, 'salaries', true).id;
      b.records.payments = [{ id: 1, date: '2026-10-01', paidFrom: b.records.bankCash[0].name, amount: 300, lines: [{ account: exp, amount: 300 }] }];
      b.records.receipts = [];
    });
    const tb = GL.trial(b), byId = {}; tb.rows.forEach((r) => { byId[r.id] = r; });
    const g = FX.trialGroups(b, [{}], (n) => { const r = byId[n.id]; if (!r) return 0; return vm.runInContext('acctNature', ctx)(b, n) === 'C' ? r.credit - r.debit : r.debit - r.credit; });
    const labels = [...g.groups.map((x) => x.label)];
    const order = ['Assets', 'Liabilities', 'Equity', 'Income', 'Expenses'];
    assert.deepEqual(labels, order.filter((l) => labels.includes(l)));
    assert.ok(labels.includes('Assets') && labels.includes('Expenses'));
    assert.ok(Math.abs(g.totals[0].dr - g.totals[0].cr) < 0.005);
    const sum = g.groups.reduce((s, x) => s + x.sub[0].dr, 0);
    assert.ok(Math.abs(sum - g.totals[0].dr) < 0.005);
    const html = App.trialBalanceHtml(b);
    assert.ok(html.includes('tb-grouped') && html.includes('Total Assets') && html.includes('Total Expenses'));
  });
});
