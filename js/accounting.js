/* ===================== demo data + accounting engine ===================== */
function seedDemoRecords(){
  let id=2000;
  const bank=[['ADCB',165568.42],['ADIB',0],['Bank of Baroda',0],['Cash Account',-155646.51],
    ['Cheque Return',-325.00],['EMIRATES NBD - MRS. BATUL',54500.00],['HBZ',15571.05],
    ['IBRAHIM BANK LTD',0],['Pdc Issued',0],['Pdc Recieved',0],['PETTY CASH A/C',0]]
    .map(([name,balance])=>({id:id++,name,currency:'AED',balance}));
  const rc=[['2025-05-31','43856','ADCB - ADCB','RIAZ MIRZA',660.00],
    ['2025-05-31','43855','ADCB - ADCB','MIRDIF ALUMINIUM & GLASS',4623.00],
    ['2025-05-31','43854','Cash Account - Cash Account','FAISAL BOOTA GLASS & ALUMINIUM',1000.00],
    ['2025-05-31','43853','Cash Account - Cash Account','ONEIRA TECH',1650.00],
    ['2025-05-31','43852','Cash Account - Cash Account','SAPNA TECH TECHNICAL SERVICES LLC',100.00],
    ['2025-05-31','43851','Cash Account - Cash Account','ADHAM GLASS',542.00],
    ['2025-05-31','43850','Cash Account - Cash Account','OSOUD AL SAHIRH',675.00],
    ['2025-05-31','43849','ADCB - ADCB','Al Batra Glass',624.00],
    ['2025-05-31','43848','ADCB - ADCB','MANCHESTER ALUMINIUM & GLASS WORKSHOP LLC',5091.00],
    ['2025-05-30','43790','ADCB - ADCB','TECH N TALENT',954.50],
    ['2025-05-30','43789','Cash Account - Cash Account','ABDULLA GLASS',1414.00],
    ['2025-05-30','43788','Cash Account - Cash Account','HUSSAIN BHAI',1000.00]]
    .map(([date,reference,receivedIn,description,amount])=>({id:id++,date,reference,receivedIn,description,paidBy:'',amount}));
  const customers=[
    {id:id++,name:'MIRDIF ALUMINIUM & GLASS',code:'C-001',address:'Industrial Area 12, Warehouse 7\nDubai, UAE',phone:'+971 4 555 0101',email:'accounts@mirdifglass.ae',trn:'100311223300003',balance:0},
    {id:id++,name:'MANCHESTER ALUMINIUM & GLASS WORKSHOP LLC',code:'C-002',address:'Al Quoz, Street 7\nDubai, UAE',phone:'+971 4 555 0102',email:'info@manchesterglass.ae',trn:'100455667700003',balance:0},
    {id:id++,name:'RIAZ MIRZA',code:'C-003',address:'Sharjah Industrial 5\nSharjah, UAE',phone:'+971 6 555 0103',email:'riaz@example.ae',trn:'',balance:0}];
  const suppliers=[
    {id:id++,name:'Gulf Glass Suppliers LLC',code:'S-001',address:'Jebel Ali Free Zone, Plot 220\nDubai, UAE',phone:'+971 4 555 0201',email:'sales@gulfglass.ae',trn:'100788990000003',balance:0}];
  return {bankCash:bank, receipts:rc, customers, suppliers};
}
function demoBusiness(){
  return {id:1001,name:'Abbass Tempering Industry LLC',country:'United Arab Emirates',created:'2026-01-01T00:00:00.000Z',
    period:defaultPeriod(),
    records:seedDemoRecords(),
    balanceSheet:[
      {title:'Assets',total:5172571.45,children:[
        {name:'Current Assets',total:2656185.05,children:[{name:'Accounts receivable',amt:2627821.09},
          {name:'Cash & cash equivalents',amt:79667.96},{name:'Deposits (Asset)',amt:1000.00},{name:'Loans & Advances (Asset)',amt:-52304.00}]},
        {name:'Non Current Assets',total:2516386.40,children:[{name:'Fixed assets, accumulated depreciation',amt:-282085.98},
          {name:'Fixed assets, at cost',amt:2798472.38}]}]},
      {title:'Liabilities',total:2254563.60,children:[{name:'Accounts payable',amt:2498023.76},
        {name:'Employee clearing account',amt:-331361.39},
        {name:'Tax Payable',total:88991.87,children:[{name:'Input VAT',amt:-92834.61},{name:'Output VAT',amt:181826.48}]},
        {name:'Unsecured Loans',amt:-1090.64}]},
      {title:'Equity',total:2918007.85,children:[{name:'Capital Accounts',amt:-129949.95},{name:'CURRENT ACCOUNT',amt:-44950.00},
        {name:'Retained earnings',amt:3041052.21},{name:'Suspense',amt:51855.59}]}],
    profitLoss:[], coaSeedV:3,
  };
}
function emptySummary(){
  return {balanceSheet:[{title:'Assets',total:0,children:[]},{title:'Liabilities',total:0,children:[]},{title:'Equity',total:0,children:[]}],
    profitLoss:[]};
}
function currencyForCountry(c){ const m={'United Arab Emirates':'AED','United States':'USD','United Kingdom':'GBP','India':'INR','Pakistan':'PKR','Saudi Arabia':'SAR','Australia':'AUD','Canada':'CAD','Singapore':'SGD','New Zealand':'NZD'}; return m[c]||'AED'; }
function defaultTaxCodes(){ return [{name:'VAT 5%',rate:5},{name:'Zero-rated',rate:0},{name:'Exempt',rate:0}]; }
function ensureSettings(b){
  if(!b.details) b.details={};
  if(!b.baseCurrency) b.baseCurrency=currencyForCountry(b.country);
  if(!b.fmt) b.fmt={date:'MM/DD/YYYY',sep:'comma-dot',decimals:2};
  if(!b.taxCodes) b.taxCodes=defaultTaxCodes();
  if(b.lockDate==null) b.lockDate='';
  if(b.id===1001 && !b.details.address){ b.details={legalName:'Abbass Tempering Industry LLC',
    address:'Industrial Area\nSharjah\nUnited Arab Emirates',email:'',phone:'',taxNumber:'100000000000003',logo:''}; }
}
const COA_SECTIONS_DEFAULT={assets:'Assets',liabilities:'Liabilities',equity:'Equity',income:'Income',expenses:'Less Cost Of Sales'};
const CONTROL_NAMES={'Accounts receivable':1,'Accounts payable':1,'Cash & cash equivalents':1,'Capital Accounts':1,'Inventory on hand':1,'Employee clearing account':1};
function ensureCoa(b){ _ensureCoaSchema(b); ensureCoreAccounts(b); }
function _ensureCoaSchema(b){
  if(!b.coaSections) b.coaSections={assets:'Assets',liabilities:'Liabilities',equity:'Equity'};
  if(b.balanceSheet) b.balanceSheet.forEach((s,i)=>{ const k=['assets','liabilities','equity'][i]; if(k&&s.title) b.coaSections[k]=s.title; });
  if(b.coa && b.coaV===2) return;                 // already on current schema
  const coa=[]; let c=0; const nid=p=>(p||'a')+(++c)+Math.random().toString(36).slice(2,5);
  const addBS=(children,parentKey)=>{ (children||[]).forEach(ch=>{ if(ch.children){ const gid=nid('g'); coa.push({id:gid,type:'group',name:ch.name,code:'',parent:parentKey}); addBS(ch.children,gid); }
    else coa.push({id:nid('a'),type:'account',name:ch.name,code:'',parent:parentKey,balance:(+ch.amt||0),control:!!CONTROL_NAMES[ch.name]}); }); };
  (b.balanceSheet||[]).forEach((s,i)=>{ const k=['assets','liabilities','equity'][i]; if(k) addBS(s.children,k); });
  let re=coa.find(n=>n.type==='account'&&/retained earnings/i.test(n.name));
  if(re){ re.mandatory=1; re.control=1; } else coa.push({id:nid('a'),type:'account',name:'Retained earnings',code:'',parent:'equity',balance:0,mandatory:1,control:1});
  // Profit & Loss: only build groups for sections that actually contain accounts (no empty default Income/Cost groups)
  const plTop=[];
  const addPL=(children,parentId)=>{ (children||[]).forEach(ch=>{ if(ch.children){ const gid=nid('g'); coa.push({id:gid,type:'group',name:ch.name,code:'',parent:parentId}); addPL(ch.children,gid); }
    else coa.push({id:nid('a'),type:'account',name:ch.name,code:'',parent:parentId,balance:(+ch.amt||0)}); }); };
  (b.profitLoss||[]).forEach((s,i)=>{ if(!(s.children&&s.children.length)) return; const kind=(i===0)?'income':'expense';
    const gid=nid('g'); coa.push({id:gid,type:'group',name:s.title||(kind==='income'?'Income':'Expenses'),code:'',parent:'pl',plkind:kind}); plTop.push(gid); addPL(s.children,gid); });
  const tid='t'+Math.random().toString(36).slice(2,9); coa.push({id:tid,type:'total',side:'pl',name:'Net profit (loss)'}); plTop.push(tid);
  b.coa=coa; b.coaTop={bs:['assets','liabilities','equity'],pl:plTop}; b.coaV=2;
}
/* ---------- posting / ledger engine ---------- */
function acctById(b,id){ return (b.coa||[]).find(n=>n.id===id); }
function findAcct(b,name){ return (b.coa||[]).find(n=>n.type==='account'&&n.name===name); }
function acctRoot(b,node){ let n=node,g=0; while(n&&g++<60){ if(['assets','liabilities','equity'].indexOf(n.parent)>=0) return n.parent; if(n.parent==='pl') return (n.plkind==='expense')?'expense':'income'; const p=(b.coa||[]).find(x=>x.id===n.parent); if(!p) break; n=p; } return 'assets'; }
function acctNature(b,node){ const r=acctRoot(b,node); return (r==='assets'||r==='expense')?'D':'C'; }
function bankMatch(ref,rec){ if(!ref) return false; if(ref===rec.name) return true; const head=String(ref).split(' - ')[0].trim(); return head===rec.name; }
/* Balances below are all read from the one general ledger (js/ledger-engine.js),
   so the Summary, reports, lists and statements always agree. */
function _glCtrl(b,key){ GL.get(b); return GL.sysAcct(b,key,false); }
function bankActual(b,rec){ const n=_glCtrl(b,'cash & cash equivalents'); if(!n||!rec) return Number(rec&&rec.balance)||0; return GL.balance(b,n.id,{sub:rec.name}); }
function cashTotal(b){ const n=_glCtrl(b,'cash & cash equivalents'); return n?GL.balance(b,n.id):0; }
function acctNameMatches(b,id,re){ const n=acctById(b,id); return !!(n && re.test(n.name||'')); }
var AR_RE=/^accounts receivable$/i, AP_RE=/^accounts payable$/i, CAP_RE=/^capital accounts$/i, EMP_RE=/^employee clearing account$/i, INV_RE=/^inventory on hand$/i, FAC_RE=/^fixed assets, at cost$/i;
function acctIsARorAP(b,id){ return acctNameMatches(b,id,AR_RE)||acctNameMatches(b,id,AP_RE); }
function acctNeedsSub(b,id){ const n=acctById(b,id); if(!n) return false; const nm=n.name||''; return AR_RE.test(nm)||AP_RE.test(nm)||CAP_RE.test(nm)||EMP_RE.test(nm)||INV_RE.test(nm)||FAC_RE.test(nm)||SUB_EXTRA_RE.test(nm); }
var SUB_EXTRA_RE=/^(expense claims|intangible assets, at cost|investments)$/i;
// a posting line "completes" only if it has a valid account AND (if that account is a control account) a sub-account is chosen; otherwise it routes to Suspense
function lineComplete(b,ln){ if(!ln||!ln.account||!acctById(b,ln.account)) return false; if(acctNeedsSub(b,ln.account) && (ln.sub==null||ln.sub==='')) return false; return true; }
function cashLineSumSub(b,recsKey,re){ const R=b.records||{}; let s=0; (R[recsKey]||[]).forEach(r=>{ const lns=(r.lines&&r.lines.length)?r.lines:[{account:r.account,sub:r.sub,amount:r.amount}]; lns.forEach(ln=>{ if(acctNameMatches(b,ln.account,re) && ln.sub!=null && ln.sub!=='') s+=Number(ln.amount)||0; }); }); return s; }
function jrnlNetSub(b,re){ const R=b.records||{}; let s=0; (R.journal||[]).forEach(j=>{ (j.lines||[]).forEach(ln=>{ if(acctNameMatches(b,ln.account,re) && ln.sub!=null && ln.sub!=='') s+=(Number(ln.debit)||0)-(Number(ln.credit)||0); }); }); return s; }
// sum receipt/payment LINE amounts whose account matches re; optional sub-name filter
function cashLineSum(b,recsKey,re,subName){ const R=b.records||{}; let s=0;
  (R[recsKey]||[]).forEach(r=>{ const lns=(r.lines&&r.lines.length)?r.lines:[{account:r.account,sub:r.sub,amount:r.amount}];
    lns.forEach(ln=>{ if(acctNameMatches(b,ln.account,re) && (subName==null || ln.sub===subName)) s+=Number(ln.amount)||0; }); });
  return s; }
// net debit-balance (debit − credit) of journal lines matching re; optional sub filter
function jrnlNet(b,re,subName){ const R=b.records||{}; let s=0;
  (R.journal||[]).forEach(j=>{ (j.lines||[]).forEach(ln=>{ if(acctNameMatches(b,ln.account,re) && (subName==null||ln.sub===subName)) s+=(Number(ln.debit)||0)-(Number(ln.credit)||0); }); });
  return s; }
/** Customer = starting balance + invoices − receipts − credit notes − withholding tax (+ refunds, journals, late fees). Negative = overpaid. */
function customerBalance(b,name){ const n=_glCtrl(b,'accounts receivable'); return n?GL.balance(b,n.id,{sub:name}):0; }
/** Supplier = starting balance + purchase invoices − payments − debit notes (+ refunds, journals). Negative = overpaid. */
function supplierBalance(b,name){ const n=_glCtrl(b,'accounts payable'); return n?GL.balance(b,n.id,{sub:name}):0; }
function arMovement(b){ const n=_glCtrl(b,'accounts receivable'); return n?GL.balance(b,n.id)-(Number(n.balance)||0)-custOpenings(b):0; }
function apMovement(b){ const n=_glCtrl(b,'accounts payable'); return n?GL.balance(b,n.id)-(Number(n.balance)||0)-suppOpenings(b):0; }
/** {accountId: movement} — the ledger balance less the account's own opening amount (callers add node.balance back). */
function accountMovements(b){ GL.get(b); const mov={}; (b.coa||[]).slice().forEach(n=>{ if(!n||n.type!=='account') return;
    const v=GL.balance(b,n.id)-(Number(n.balance)||0); if(Math.abs(v)>0.0000001) mov[n.id]=v; }); return mov; }
/** One account's ledger: opening = undated (starting balance) postings, rows = dated postings. */
function glEntries(b, acctId){ return GL.entries(b, acctId); }
function custOpenings(b){ return ((b.records&&b.records.customers)||[]).reduce((a,c)=>a+(Number(c.balance)||0),0); }
function suppOpenings(b){ return ((b.records&&b.records.suppliers)||[]).reduce((a,c)=>a+(Number(c.balance)||0),0); }
function employeeBalance(b,name){ const n=_glCtrl(b,'employee clearing account'); return n?GL.balance(b,n.id,{sub:name}):0; }
function capitalBalance(b,name){ const n=_glCtrl(b,'capital accounts'); return n?GL.balance(b,n.id,{sub:name}):0; }
function ensureCapitalControl(b){ if(!b.coa) return null; const R=b.records||{};
  const has=(R.capital&&R.capital.length)||(R.receipts||[]).some(r=>r.capitalAcc)||(R.payments||[]).some(p=>p.capitalAcc);
  if(!has) return null;
  let n=(b.coa||[]).find(x=>x.type==='account'&&/^capital accounts$/i.test(x.name||''));
  if(!n){ n={id:'a'+Math.random().toString(36).slice(2,9),type:'account',name:'Capital accounts',code:'',parent:'equity',balance:0,control:1}; b.coa.push(n); }
  n.control=1; n.capControl=1; return n; }
function liveBalance(b,node,mov){ return node?GL.balance(b,node.id):0; }
function flagControls(b){ if(!b.coa) return; b.coa.forEach(n=>{ if(n.type!=='account') return; if(/^accounts receivable$/i.test(n.name||'')){ n.arControl=1; n.control=1; } if(/^accounts payable$/i.test(n.name||'')){ n.apControl=1; n.control=1; } }); }
function ensureSubledgerControls(b){ if(!b.coa) return; const R=b.records||{};
  if((R.customers||[]).length || (R.salesInv||[]).length || (R.creditNotes||[]).length) ensureControl(b,'Accounts receivable','assets');
  if((R.suppliers||[]).length || (R.purchInv||[]).length || (R.debitNotes||[]).length) ensureControl(b,'Accounts payable','liabilities');
  if((R.employees||[]).length || (R.payslips||[]).length) ensureControl(b,'Employee clearing account','liabilities'); }
function ensureControl(b,name,section){ if(!b.coa) return null; let n=findAcct(b,name); if(!n){ n={id:'a'+Math.random().toString(36).slice(2,9),type:'account',name:name,code:'',parent:section,balance:0}; b.coa.push(n); } n.control=1; if(/^accounts receivable$/i.test(name)) n.arControl=1; if(/^accounts payable$/i.test(name)) n.apControl=1; return n; }
function plInsertTop(b,id){ b.coaTop=b.coaTop||{bs:['assets','liabilities','equity'],pl:[]}; b.coaTop.pl=b.coaTop.pl||[]; if(b.coaTop.pl.indexOf(id)>=0) return; const ti=b.coaTop.pl.findIndex(x=>{ const n=(b.coa||[]).find(y=>y.id===x); return n&&n.type==='total'; }); if(ti<0) b.coaTop.pl.push(id); else b.coaTop.pl.splice(ti,0,id); }
function ensureInventoryAccounts(b){ if(!b.coa) return; const R=b.records||{};
  if(!(R.inventory&&R.inventory.length)) return;
  const rnd=()=>Math.random().toString(36).slice(2,9);
  let incG=(b.coa||[]).find(n=>n.type==='group'&&n.plkind==='income');
  if(!incG){ incG={id:'gInc'+rnd(),type:'group',name:'Income',code:'',parent:'pl',plkind:'income'}; b.coa.push(incG); plInsertTop(b,incG.id); }
  if(!findAcct(b,'Inventory - sales')) b.coa.push({id:'a'+rnd(),type:'account',name:'Inventory - sales',code:'',parent:incG.id,balance:0});
  let expG=(b.coa||[]).find(n=>n.type==='group'&&n.plkind==='expense');
  if(!expG){ expG={id:'gExp'+rnd(),type:'group',name:'Expenses',code:'',parent:'pl',plkind:'expense'}; b.coa.push(expG); plInsertTop(b,expG.id); }
  if(!findAcct(b,'Inventory - cost')) b.coa.push({id:'a'+rnd(),type:'account',name:'Inventory - cost',code:'',parent:expG.id,balance:0});
  if(!findAcct(b,'Inventory on hand')) b.coa.push({id:'a'+rnd(),type:'account',name:'Inventory on hand',code:'',parent:'assets',balance:0,control:1}); }
function ensureFixedAssetAccounts(b){ if(!b.coa) return; const R=b.records||{};
  if(!(R.fixedAssets&&R.fixedAssets.length)) return;
  const rnd=()=>Math.random().toString(36).slice(2,9);
  if(!findAcct(b,'Fixed assets, at cost')) b.coa.push({id:'a'+rnd(),type:'account',name:'Fixed assets, at cost',code:'',parent:'assets',balance:0,control:1});
  if(!findAcct(b,'Fixed assets, accumulated depreciation')) b.coa.push({id:'a'+rnd(),type:'account',name:'Fixed assets, accumulated depreciation',code:'',parent:'assets',balance:0,control:1});
  let expG=(b.coa||[]).find(n=>n.type==='group'&&n.plkind==='expense');
  if(!expG){ expG={id:'gExp'+rnd(),type:'group',name:'Expenses',code:'',parent:'pl',plkind:'expense'}; b.coa.push(expG); plInsertTop(b,expG.id); }
  if(!findAcct(b,'Depreciation')) b.coa.push({id:'a'+rnd(),type:'account',name:'Depreciation',code:'',parent:expG.id,balance:0}); }
function _plGroup(b,kind,name){ const rnd=()=>Math.random().toString(36).slice(2,9);
  let g=(b.coa||[]).find(n=>n.type==='group'&&n.plkind===kind);
  if(!g){ g={id:'g'+kind+rnd(),type:'group',name:name||(kind==='income'?'Income':'Expenses'),code:'',parent:'pl',plkind:kind}; b.coa.push(g); plInsertTop(b,g.id); }
  return g; }
function _mkAcct(b,name,parent,opts){ if(findAcct(b,name)) return findAcct(b,name);
  const n=Object.assign({id:'a'+Math.random().toString(36).slice(2,9),type:'account',name:name,code:'',parent:parent,balance:0}, opts||{});
  b.coa.push(n); return n; }
function ensureExpenseClaimAccounts(b){ if(!b.coa) return; const R=b.records||{};
  if(!(R.expenseClaims&&R.expenseClaims.length)) return;
  _mkAcct(b,'Expense claims','liabilities',{control:1}); }
function ensureBillableTimeAccounts(b){ if(!b.coa) return; const R=b.records||{};
  if(!(R.billableTime&&R.billableTime.length)) return;
  _mkAcct(b,'Billable time','assets',{control:1});
  _mkAcct(b,'Billable time - movement', _plGroup(b,'income').id);
  _mkAcct(b,'Billable time - write-offs', _plGroup(b,'expense').id); }
function ensureWhtAccounts(b){ if(!b.coa) return; const R=b.records||{};
  if(!(R.whtReceipts&&R.whtReceipts.length)) return;
  _mkAcct(b,'Withholding tax receivable','assets'); }
function ensureIntangibleAccounts(b){ if(!b.coa) return; const R=b.records||{};
  if(!((R.intangibles&&R.intangibles.length)||(R.amortization&&R.amortization.length))) return;
  _mkAcct(b,'Intangible assets, at cost','assets',{control:1});
  _mkAcct(b,'Intangible assets, accumulated amortization','assets',{control:1});
  _mkAcct(b,'Amortization', _plGroup(b,'expense').id); }
function ensureInvestmentAccounts(b){ if(!b.coa) return; const R=b.records||{};
  if(!(R.investments&&R.investments.length)) return;
  _mkAcct(b,'Investments','assets',{control:1});
  _mkAcct(b,'Investment gains (losses)', _plGroup(b,'income').id); }
function ensureProductionAccounts(b){ if(!b.coa) return; const R=b.records||{};
  if(!(R.production&&R.production.length)) return;
  _mkAcct(b,'Production in progress', _plGroup(b,'expense').id); }
function ensureWriteOffAccounts(b){ if(!b.coa) return; const R=b.records||{};
  if(!(R.invWriteOffs&&R.invWriteOffs.length)) return;
  _mkAcct(b,'Inventory write-offs', _plGroup(b,'expense').id); }
function ensureAllControls(b){ try{
    ensureExpenseClaimAccounts(b); ensureBillableTimeAccounts(b); ensureWhtAccounts(b);
    ensureIntangibleAccounts(b); ensureInvestmentAccounts(b); ensureProductionAccounts(b); ensureWriteOffAccounts(b);
  }catch(e){} }
function faDeprFor(b,asset){ const R=b.records||{}; const name=asset&&asset.name; let s=0;
  (R.depreciation||[]).forEach(d=>{ (d.lines||[]).forEach(ln=>{ if(ln.asset===name) s+=Number((ln.amount!=null&&ln.amount!=='')?ln.amount:ln.depExpense)||0; }); }); return s; }
function faAccumDepExcl(b,asset,exclId){ const R=b.records||{}; const name=asset&&asset.name; let s=Number(asset&&asset.accumDep)||0;
  (R.depreciation||[]).forEach(d=>{ if(exclId!=null && d.id===exclId) return; (d.lines||[]).forEach(ln=>{ if(ln.asset===name) s+=Number((ln.amount!=null&&ln.amount!=='')?ln.amount:ln.depExpense)||0; }); }); return s; }
function faAccumDep(b,asset){ return (Number(asset&&asset.accumDep)||0)+faDeprFor(b,asset); }
function faCashAdd(b,asset){ return cashLineSum(b,'payments',FAC_RE,asset&&asset.name)-cashLineSum(b,'receipts',FAC_RE,asset&&asset.name)+jrnlNet(b,FAC_RE,asset&&asset.name); }
function faCost(b,asset){ return (Number(asset&&asset.cost)||0)+faCashAdd(b,asset); }
function faBookValue(b,asset){ return faCost(b,asset)-faAccumDep(b,asset); }
function invItemMovements(b,item){ const R=b.records||{}; const name=item&&item.name;
  const startQty=Number(item&&item.qty)||0; var _ocR=(item&&item.openingCost); var _ocSet=(_ocR!=null&&_ocR!==''); const startVal=_ocSet?(Number(_ocR)||0):(startQty*(Number(item&&item.purchasePrice)||0)); const startCost=startQty>0?startVal/startQty:(Number(item&&item.purchasePrice)||0); const ev=[];
  (R.purchInv||[]).forEach(d=>{ (d.lines||[]).forEach(ln=>{ if(ln.item===name){ const q=Number(ln.qty)||0; if(q){ const val=(ln.net!=null?Number(ln.net):q*(Number(ln.price)||0)); ev.push({date:d.issueDate||d.date,ref:d.reference,buy:1,q:q,val:val,party:d.supplier,src:'purchInv',id:d.id}); } } }); });
  (R.salesInv||[]).forEach(d=>{ (d.lines||[]).forEach(ln=>{ if(ln.item===name){ const q=Number(ln.qty)||0; if(q){ ev.push({date:d.issueDate||d.date,ref:d.reference,buy:0,q:q,party:d.customer,src:'salesInv',id:d.id}); } } }); });
  // a credit note returns the goods to stock at the average cost; a debit note sends them back to the supplier at the line value
  (R.creditNotes||[]).forEach(d=>{ (d.lines||[]).forEach(ln=>{ if((ln.item||ln.items)===name){ const q=Number(ln.qty)||0; if(q) ev.push({date:d.issueDate||d.date,ref:d.reference,ret:1,q:q,lbl:'Credit note'+(d.customer?' — '+d.customer:''),src:'creditNotes',id:d.id}); } }); });
  (R.debitNotes||[]).forEach(d=>{ (d.lines||[]).forEach(ln=>{ if((ln.item||ln.items)===name){ const q=Number(ln.qty)||0; if(q){ const val=(ln.net!=null&&ln.net!=='')?Number(ln.net):((ln.amountNoTax!=null&&ln.amountNoTax!=='')?Number(ln.amountNoTax):q*(Number(ln.price)||0)); ev.push({date:d.issueDate||d.date,ref:d.reference,buy:0,q:q,val:val,lbl:'Debit note'+(d.supplier?' — '+d.supplier:''),src:'debitNotes',id:d.id}); } } }); });
  (R.payments||[]).forEach(d=>{ (d.lines||[]).forEach(ln=>{ if(ln.sub===name && acctNameMatches(b,ln.account,INV_RE)){ const val=Number(ln.amount)||0; if(val) ev.push({date:d.date,ref:d.reference,adj:val,party:d.payee,src:'payments',id:d.id}); } }); });
  (R.receipts||[]).forEach(d=>{ (d.lines||[]).forEach(ln=>{ if(ln.sub===name && acctNameMatches(b,ln.account,INV_RE)){ const val=Number(ln.amount)||0; if(val) ev.push({date:d.date,ref:d.reference,adj:-val,party:d.paidBy,src:'receipts',id:d.id}); } }); });
  (R.journal||[]).forEach(d=>{ (d.lines||[]).forEach(ln=>{ if(ln.sub===name && acctNameMatches(b,ln.account,INV_RE)){ const adj=(Number(ln.debit)||0)-(Number(ln.credit)||0); if(adj) ev.push({date:d.date,ref:d.reference,adj:adj,lbl:'Journal entry',src:'journal',id:d.id}); } }); });
  (R.salesInv||[]).forEach(d=>{ (d.lines||[]).forEach(ln=>{ const comps=kitComponents(b,ln.item); if(!comps) return;
    const kq=Number(ln.qty)||0; if(!kq) return;
    comps.forEach(c=>{ if(c.item!==name) return; const q=kq*(Number(c.qty)||0); if(q)
      ev.push({date:d.issueDate||d.date,ref:d.reference,buy:0,q:q,lbl:'Kit — '+(ln.item||''),src:'salesInv',id:d.id}); }); }); });
  (R.invWriteOffs||[]).forEach(d=>{ (d.lines||[]).forEach(ln=>{ if(ln.item===name){ const q=Number(ln.qty)||0; if(q) ev.push({date:d.date,ref:d.reference,buy:0,q:q,lbl:'Inventory write-off',src:'invWriteOffs',id:d.id}); } }); });
  (R.production||[]).forEach(d=>{ (d.lines||[]).forEach(ln=>{ if(ln.item===name){ const q=Number(ln.qty)||0; if(q) ev.push({date:d.date,ref:d.reference,buy:0,q:q,lbl:'Production order — materials',src:'production',id:d.id}); } });
    if(d.item===name){ const q=Number(d.qty)||0; if(q){ const val=productionCost(b,d); ev.push({date:d.date,ref:d.reference,buy:1,q:q,val:val,lbl:'Production order — finished goods',src:'production',id:d.id}); } } });
  ev.sort((x,y)=>String(x.date||'').localeCompare(String(y.date||''))||String(x.ref||'').localeCompare(String(y.ref||'')));
  let qty=startQty, value=startVal, lastAvg=qty>0?value/qty:startCost, cogs=0;
  const rows=[{opening:1,type:'Starting balance',qin:startQty,qout:0,cin:value,cout:0,qbal:qty,cbal:value,src:'',id:null}];
  ev.forEach(e=>{ if(e.adj!=null){ value+=e.adj; if(qty>0) lastAvg=value/qty;
      rows.push({date:e.date,ref:e.ref,type:e.lbl?e.lbl:((e.adj>=0?'Cash purchase':'Cash sale')+(e.party?' — '+e.party:'')),qin:0,qout:0,cin:e.adj>0?e.adj:0,cout:e.adj<0?-e.adj:0,qbal:qty,cbal:value,src:e.src,id:e.id}); }
    else if(e.ret){ const avg=qty>0?value/qty:lastAvg; const ci=e.q*avg; qty+=e.q; value+=ci; if(qty>0) lastAvg=value/qty;
      rows.push({date:e.date,ref:e.ref,type:e.lbl,qin:e.q,qout:0,cin:ci,cout:0,qbal:qty,cbal:value,src:e.src,id:e.id}); }
    else if(e.buy){ qty+=e.q; value+=e.val; if(qty>0) lastAvg=value/qty;
      rows.push({date:e.date,ref:e.ref,type:e.lbl||('Purchase invoice'+(e.party?' — '+e.party:'')),qin:e.q,qout:0,cin:e.val,cout:0,qbal:qty,cbal:value,src:e.src,id:e.id}); }
    else { const avg=qty>0?value/qty:lastAvg; const co=(e.val!=null)?e.val:e.q*avg; if(e.src!=='debitNotes') cogs+=co; qty-=e.q; value-=co; if(qty>0) lastAvg=value/qty;
      rows.push({date:e.date,ref:e.ref,type:e.lbl||('Sales invoice'+(e.party?' — '+e.party:'')),qin:0,qout:e.q,cin:0,cout:co,qbal:qty,cbal:value,src:e.src,id:e.id}); } });
  const avgCost=qty>0?value/qty:lastAvg;
  return {rows,qtyOnHand:Math.round(qty*1e6)/1e6,totalValue:Math.round(value*1e6)/1e6,avgCost,cogs,startQty,startCost}; }
/* ---------- inventory kits ---------- */
function kitComponents(b,name){ if(!name) return null;
  const k=((b&&b.inventoryKits)||[]).find(x=>x&&x.name===name);
  return (k&&k.items&&k.items.length)?k.items:null; }
function kitCostOf(b,name){ const comps=kitComponents(b,name); if(!comps) return 0;
  return Math.round(comps.reduce((a,c)=>a+(Number(c.qty)||0)*invAvgCostByName(b,c.item),0)*100)/100; }

/* ---------- late payment fees ---------- */
function lateFeeFor(b,inv,asOf){ const cfg=(b&&b.lateFees)||{}; if(!cfg.enabled) return 0;
  if(!inv||!inv.lateFees) return 0;                       // opt in per invoice, as Manager does
  const due=String(inv.dueDate||'').slice(0,10); if(!due) return 0;
  const bal=Number(inv.balanceDue!=null?inv.balanceDue:inv.total)||0; if(bal<=0.005) return 0;
  const today=String(asOf||new Date().toISOString().slice(0,10)).slice(0,10);
  const P=v=>{ const m=String(v||'').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m?Date.UTC(+m[1],+m[2]-1,+m[3]):NaN; };
  const t=P(today), dd=P(due); if(isNaN(t)||isNaN(dd)) return 0;
  let days=Math.round((t-dd)/86400000);
  days-=(Number(cfg.grace)||0); if(days<=0) return 0;
  const rate=(Number(cfg.rate)||0)/100; if(!rate) return 0;
  let fee;
  if(cfg.period==='once') fee=bal*rate;
  else if(cfg.period==='year') fee=bal*rate*(days/365);
  else fee=bal*rate*(days/30);
  return Math.round(fee*100)/100; }
function lateFeesTotal(b,asOf){ return ((b.records&&b.records.salesInv)||[]).reduce((a,i)=>a+lateFeeFor(b,i,asOf),0); }

/* ---------- expense claims ---------- */
var EXPCLAIM_RE=/^expense claims$/i, BILLT_RE=/^billable time$/i, WHT_RE=/^withholding tax receivable$/i,
    IAC_RE=/^intangible assets, at cost$/i, IAA_RE=/^intangible assets, accumulated amortization$/i, INVEST_RE=/^investments$/i;
function claimTotal(rec){ const lns=(rec&&rec.lines)||[]; if(lns.length) return lns.reduce((a,ln)=>a+(Number(ln.amount!=null&&ln.amount!==''?ln.amount:ln.amountNoTax)||0),0); return Number(rec&&rec.amount)||0; }
function claimPayerBalance(b,name){ const n=_glCtrl(b,'expense claims'); return n?GL.balance(b,n.id,{sub:name}):0; }

/* ---------- billable time ---------- */
function billableAmount(rec){ if(rec&&rec.amount!=null&&rec.amount!=='') return Number(rec.amount)||0;
  return (Number(rec&&rec.hours)||0)*(Number(rec&&rec.rate)||0); }
function billableByStatus(b,status){ const R=b.records||{}; let s=0;
  (R.billableTime||[]).forEach(t=>{ if((t.status||'Uninvoiced')===status) s+=billableAmount(t); }); return s; }
function billableCustomer(b,name,status){ const R=b.records||{}; let s=0;
  (R.billableTime||[]).forEach(t=>{ if((t.customer||'')!==name) return; if(status&&(t.status||'Uninvoiced')!==status) return; s+=billableAmount(t); }); return s; }

/* ---------- withholding tax ---------- */
function whtTotal(b){ return ((b.records&&b.records.whtReceipts)||[]).reduce((a,r)=>a+(Number(r.amount)||0),0); }
function whtForCustomer(b,name){ return ((b.records&&b.records.whtReceipts)||[]).reduce((a,r)=>a+(((r.customer||'')===name)?(Number(r.amount)||0):0),0); }

/* ---------- inventory transfers / write-offs / production ---------- */
function lineQtyTotal(rec){ return ((rec&&rec.lines)||[]).reduce((a,ln)=>a+(Number(ln.qty)||0),0); }
function invAvgCostByName(b,name){ const it=((b.records&&b.records.inventory)||[]).find(x=>x.name===name); if(!it) return 0;
  const m=invItemMovements(b,it); return m.avgCost||0; }
function _invUnitCostAt(b,name,exclude){ const it=((b.records&&b.records.inventory)||[]).find(x=>x.name===name); if(!it) return 0;
  const startQty=Number(it.qty)||0; var _oc=it.openingCost; const startVal=(_oc!=null&&_oc!=='')?(Number(_oc)||0):(startQty*(Number(it.purchasePrice)||0));
  let qty=startQty, val=startVal;
  ((b.records&&b.records.purchInv)||[]).forEach(d=>{ (d.lines||[]).forEach(ln=>{ if(ln.item!==name) return; const q=Number(ln.qty)||0; if(!q) return;
    qty+=q; val+=(ln.net!=null?Number(ln.net):q*(Number(ln.price)||0)); }); });
  if(qty>0) return val/qty; return Number(it.purchasePrice)||0; }
function writeOffValue(b,rec){ let v=0; ((rec&&rec.lines)||[]).forEach(ln=>{ const q=Number(ln.qty)||0; if(!q) return;
  const unit=(ln.unitCost!=null&&ln.unitCost!=='')?Number(ln.unitCost):_invUnitCostAt(b,ln.item); v+=q*(unit||0); }); return Math.round(v*100)/100; }
function productionCost(b,rec){ let v=Number(rec&&rec.extraCost)||0;
  ((rec&&rec.lines)||[]).forEach(ln=>{ const q=Number(ln.qty)||0; if(!q) return;
    const unit=(ln.unitCost!=null&&ln.unitCost!=='')?Number(ln.unitCost):_invUnitCostAt(b,ln.item); v+=q*(unit||0); });
  return Math.round(v*100)/100; }
function invQtyByLocation(b,loc){ const out={}; const R=b.records||{};
  (R.invTransfers||[]).forEach(t=>{ (t.lines||[]).forEach(ln=>{ const q=Number(ln.qty)||0; if(!q||!ln.item) return;
    if((t.toLocation||'')===loc) out[ln.item]=(out[ln.item]||0)+q;
    if((t.fromLocation||'')===loc) out[ln.item]=(out[ln.item]||0)-q; }); });
  return out; }

/* ---------- intangible assets ---------- */
function iaAmortFor(b,asset){ const R=b.records||{}; const name=asset&&asset.name; let s=0;
  (R.amortization||[]).forEach(e=>{ (e.lines||[]).forEach(ln=>{ if(ln.asset===name) s+=Number((ln.amount!=null&&ln.amount!=='')?ln.amount:ln.amortExpense)||0; }); }); return s; }
function iaAccumAmortExcl(b,asset,exclId){ const R=b.records||{}; const name=asset&&asset.name; let s=Number(asset&&asset.accumAmort)||0;
  (R.amortization||[]).forEach(e=>{ if(exclId!=null&&e.id===exclId) return; (e.lines||[]).forEach(ln=>{ if(ln.asset===name) s+=Number((ln.amount!=null&&ln.amount!=='')?ln.amount:ln.amortExpense)||0; }); }); return s; }
function iaAccumAmort(b,asset){ return (Number(asset&&asset.accumAmort)||0)+iaAmortFor(b,asset); }
function iaCashAdd(b,asset){ return cashLineSum(b,'payments',IAC_RE,asset&&asset.name)-cashLineSum(b,'receipts',IAC_RE,asset&&asset.name)+jrnlNet(b,IAC_RE,asset&&asset.name); }
function iaCost(b,asset){ return (Number(asset&&asset.cost)||0)+iaCashAdd(b,asset); }
function iaBookValue(b,asset){ return iaCost(b,asset)-iaAccumAmort(b,asset); }

/* ---------- investments ---------- */
function investCost(b,rec){ return (Number(rec&&rec.cost)||0)
  + cashLineSum(b,'payments',INVEST_RE,rec&&rec.name) - cashLineSum(b,'receipts',INVEST_RE,rec&&rec.name) + jrnlNet(b,INVEST_RE,rec&&rec.name); }
function investMarketValue(rec){ if(rec&&rec.marketValue!=null&&rec.marketValue!=='') return Number(rec.marketValue)||0;
  return (Number(rec&&rec.qty)||0)*(Number(rec&&rec.marketPrice)||0); }
function investGain(b,rec){ const mv=investMarketValue(rec); if(!mv) return 0; return Math.round((mv-investCost(b,rec))*100)/100; }

function invItemStats(b,item){ const m=invItemMovements(b,item); return {qtyOnHand:m.qtyOnHand,avgCost:m.avgCost,totalCost:m.totalValue,cogs:m.cogs,startQty:m.startQty}; }
function invoiceCogs(b,invId){ let c=0; ((b.records&&b.records.inventory)||[]).forEach(it=>{ invItemMovements(b,it).rows.forEach(r=>{ if(r.src==='salesInv'&&r.id===invId) c+=r.cout; }); }); return c; }
function ensureCashControl(b){ if(!b.coa) return null;
  let n=b.coa.find(x=>x.cashControl); if(n){ n.balance=0; n.control=1; return n; }
  n=b.coa.find(x=>x.type==='account'&&/^cash & cash equivalents$/i.test(x.name||''));
  if(n){ n.cashControl=1; n.control=1; n.balance=0; return n; }
  n={id:'a'+Math.random().toString(36).slice(2,9),type:'account',name:'Cash & cash equivalents',code:'',parent:'assets',balance:0,control:1,cashControl:1};
  b.coa.push(n); return n; }
function ensureSuspense(b){ if(!b.coa) return null; GL.get(b); const n=GL.sysAcct(b,'suspense',false); if(n) n.suspenseControl=1; return n; }
/** What the ledger had to park in Suspense because documents did not balance (Dr − Cr). */
function suspensePlug(b){ const n=ensureSuspense(b); return n?GL.net(b,n.id):0; }
function acctName(b,id){ const n=acctById(b,id); return n? (n.name+(n.code?' ('+n.code+')':'')) : (id||''); }
function acctPath(b,node){ const parts=[node.name]; let p=node.parent,g=0; while(p&&['assets','liabilities','equity','pl'].indexOf(p)<0&&g++<60){ const x=acctById(b,p); if(!x)break; parts.unshift(x.name); p=x.parent; } return parts.join(' › '); }

function _isoDayBefore(iso){ const m=String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})/); if(!m) return null; const d=new Date(Date.UTC(+m[1],+m[2]-1,+m[3])); d.setUTCDate(d.getUTCDate()-1); return d.toISOString().slice(0,10); }
/**
 * Balance Sheet + Profit and Loss from the general ledger.
 * opts {from,to}: balance sheet as at `to`, profit and loss for from..to; profit
 * of earlier periods is carried in Retained earnings. No opts = everything to date.
 */
function summaryFromCoa(b,opts){ opts=opts||{}; GL.get(b);
  const T=b.coaSections||{assets:'Assets',liabilities:'Liabilities',equity:'Equity'}; const sc=k=>k.amt!=null?k.amt:(k.total||0);
  const from=opts.from||null, to=opts.to||null;
  const isPL=n=>{ const r=acctRoot(b,n); return r==='income'||r==='expense'; };
  const amtOf=n=> (isPL(n)&&from) ? GL.balance(b,n.id,{from:from,to:to,period:true}) : GL.balance(b,n.id,{to:to});
  const build=n=>{ if(n.type==='group'){ const kids=b.coa.filter(x=>x.parent===n.id).map(build); return {id:n.id,name:n.name,total:kids.reduce((a,k)=>a+sc(k),0),children:kids}; } return {id:n.id,name:n.name,amt:amtOf(n)}; };
  const kidsOf=key=>b.coa.filter(x=>x.parent===key&&x.type!=='total').map(build); const sum=arr=>arr.reduce((a,k)=>a+sc(k),0);
  const pl=[]; ((b.coaTop&&b.coaTop.pl)||[]).forEach(id=>{ const n=(b.coa||[]).find(x=>x.id===id); if(n&&n.type==='group'){ const kids=b.coa.filter(x=>x.parent===n.id).map(build); pl.push({title:n.name,total:kids.reduce((a,k)=>a+sc(k),0),children:kids,plkind:n.plkind}); } });
  const plNet=pl.reduce((a,g)=>a+((g.plkind==='expense'?-1:1)*(g.total||0)),0);
  // profit of the periods before `from` belongs to Retained earnings
  let prior=0; if(from){ const pb=_isoDayBefore(from); (b.coa||[]).forEach(n=>{ if(n.type!=='account'||!isPL(n)) return; const v=GL.balance(b,n.id,{to:pb}); prior+= (acctRoot(b,n)==='expense'?-v:v); }); }
  const aKids=kidsOf('assets'), lKids=kidsOf('liabilities'), eKids=kidsOf('equity');
  if(Math.abs(prior)>0.0049){ let put=false; const walk=(arr)=>arr.forEach(k=>{ if(put) return; if(k.children){ walk(k.children); if(put) k.total=k.children.reduce((a,c)=>a+sc(c),0); } else if(/retained earnings/i.test(k.name||'')){ k.amt+=prior; put=true; } }); walk(eKids);
    if(!put) eKids.push({name:'Retained earnings',amt:prior}); }
  const aTot=sum(aKids), lTot=sum(lKids), eBase=sum(eKids);
  const eChildren=eKids.slice();
  if(Math.abs(plNet)>0.0049) eChildren.push({name:'Net profit (loss)',amt:plNet});
  // the ledger always balances; anything left here is an account outside the Assets / Liabilities / Equity tree
  const rest=Math.round((aTot-lTot-eBase-plNet)*100)/100;
  if(Math.abs(rest)>0.0049) eChildren.push({name:'Out of balance — check the chart of accounts',amt:rest});
  const bs=[{title:T.assets,total:aTot,children:aKids},{title:T.liabilities,total:lTot,children:lKids},{title:T.equity,total:eBase+plNet+(Math.abs(rest)>0.0049?rest:0),children:eChildren}];
  return {balanceSheet:bs, profitLoss:pl};
}
function normalizeLineSubs(b){ if(!b||b._subsNormalized) return; if(b.records){ ['receipts','payments','journal','salesInv','purchInv','creditNotes','debitNotes'].forEach(function(k){ (b.records[k]||[]).forEach(function(r){ (r.lines||[]).forEach(function(ln){ if((ln.sub==null||ln.sub==='')&&ln.subAccount!=null&&ln.subAccount!==''){ ln.sub=ln.subAccount; } }); }); }); } b._subsNormalized=1; }

/* ================= payment ↔ invoice allocation =================
   A receipt or payment may carry `allocations`:

     [{ key:'salesInv'|'purchInv', uid:<invoice uid>, party:'ABC Ltd', amount:n }]

   which links the money sitting on that document's Accounts receivable /
   Accounts payable lines to specific invoices — the payment_allocations join
   table, kept on the document. It is bookkeeping metadata layered on top of the
   existing posting, never an extra posting: the double entry is still the AR/AP
   line itself, so balances, ledgers and the trial balance are untouched.

   Money on an AR/AP line that is NOT explicitly allocated keeps the old
   oldest-first behaviour, so documents entered before allocations existed still
   age exactly as they did. ================================================== */

/** Stable identity for a record across saves. */
function invUid(rec){ return (rec && (rec.uuid || (rec.id!=null ? 'id:'+rec.id : ''))) || ''; }

var ALLOC_SIDES = {
  cust:{ invKey:'salesInv', party:'customer', re:AR_RE, settle:'receipts', reverse:'payments',
         notes:'creditNotes', listKey:'customers' },
  sup: { invKey:'purchInv', party:'supplier', re:AP_RE, settle:'payments', reverse:'receipts',
         notes:'debitNotes',  listKey:'suppliers' }
};
function allocSideFor(invKey){ return invKey==='purchInv' ? 'sup' : 'cust'; }
function alloc2(n){ return Math.round((Number(n)||0)*100)/100; }

/** The signed AR/AP money one cash document moves, per party. */
function cashPartyTotals(b,doc,re,sign){
  var out={}; var lns=(doc.lines&&doc.lines.length)?doc.lines:[{account:doc.account,sub:doc.sub,amount:doc.amount}];
  lns.forEach(function(ln){
    if(!acctNameMatches(b,ln.account,re)) return;
    var nm=ln.sub; if(nm==null||nm==='') return;
    out[nm]=(out[nm]||0)+sign*(Number(ln.amount)||0);
  });
  return out;
}

/** Every allocation on a document that points at this side's invoices. */
function docAllocations(doc,invKey){
  return ((doc&&doc.allocations)||[]).filter(function(a){ return a && a.key===invKey && (Number(a.amount)||0)!==0; });
}

/**
 * Work out, for one side of the ledger, what has been paid against each invoice
 * and what is left over as an unallocated credit for each party.
 *
 * opts.to        — as at this date (inclusive), for the ageing reports
 * opts.skipDoc   — ignore this document's own allocations (uid), so the form
 *                  editing it sees the invoice as it was before this payment
 *
 * Returns { byUid:{uid:row}, byParty:{name:{invoices:[row], credit:n}} } where a
 * row is {invoice, party, total, allocated, implicit, paid, outstanding}.
 */
function settlementIndex(b,side,opts){
  opts=opts||{};
  var S=ALLOC_SIDES[side], R=(b&&b.records)||{}, to=opts.to||null, skip=opts.skipDoc||null;
  /* pool  — money the user never pinned to an invoice: aged oldest-first, which
              is how every document entered before allocations existed behaves.
     held  — the remainder of a document the user DID allocate: they chose which
              invoices it settles, so what is left stays an unallocated credit
              instead of quietly closing the next invoice in line. */
  var explicit={}, pool={}, held={};

  [[S.settle,1],[S.reverse,-1]].forEach(function(pair){
    (R[pair[0]]||[]).forEach(function(doc){
      if(to && String(doc.date||'').slice(0,10)>to) return;
      if(skip && invUid(doc)===skip) return;          // the document being edited
      var totals=cashPartyTotals(b,doc,S.re,pair[1]);
      var used={};
      docAllocations(doc,S.invKey).forEach(function(a){
        var amt=pair[1]*(Number(a.amount)||0);
        explicit[a.uid]=(explicit[a.uid]||0)+amt;
        used[a.party||'']=(used[a.party||'']||0)+amt;
      });
      Object.keys(totals).forEach(function(nm){
        if(nm in used) held[nm]=(held[nm]||0)+totals[nm]-used[nm];
        else pool[nm]=(pool[nm]||0)+totals[nm];
      });
      Object.keys(used).forEach(function(nm){ if(!(nm in totals)) held[nm]=(held[nm]||0)-used[nm]; });
    });
  });

  (R[S.notes]||[]).forEach(function(n){
    if(to && String(n.issueDate||n.date||'').slice(0,10)>to) return;
    var nm=n[S.party]; if(nm) pool[nm]=(pool[nm]||0)+(Number(n.total)||0);
  });
  if(side==='cust') (R.whtReceipts||[]).forEach(function(w){
    if(to && String(w.date||'').slice(0,10)>to) return;
    if(w.customer) pool[w.customer]=(pool[w.customer]||0)+(Number(w.amount)||0);
  });
  /* an opening balance is itself owed, and settles before any invoice does */
  (R[S.listKey]||[]).forEach(function(p){ if(p&&p.name) pool[p.name]=(pool[p.name]||0)-(Number(p.balance)||0); });

  var byParty={};
  (R[S.invKey]||[]).forEach(function(inv){
    var d=String(inv.issueDate||inv.date||'').slice(0,10); if(to && d && d>to) return;
    var nm=inv[S.party]||'(none)';
    (byParty[nm]=byParty[nm]||{invoices:[],credit:0}).invoices.push(inv);
  });
  Object.keys(pool).forEach(function(nm){ byParty[nm]=byParty[nm]||{invoices:[],credit:0}; });
  Object.keys(held).forEach(function(nm){ byParty[nm]=byParty[nm]||{invoices:[],credit:0}; });

  var byUid={};
  Object.keys(byParty).forEach(function(nm){
    var list=byParty[nm].invoices.slice().sort(function(x,y){
      return String(x.issueDate||x.date||'').localeCompare(String(y.issueDate||y.date||'')); });
    var left=pool[nm]||0;
    var rows=list.map(function(inv){
      var uid=invUid(inv), tot=Number(inv.total)||0;
      var ex=Math.max(0, Math.min(tot, explicit[uid]||0));
      var imp=Math.max(0, Math.min(left, tot-ex)); left-=imp;
      var row={ invoice:inv, uid:uid, party:nm, total:alloc2(tot), allocated:alloc2(ex),
                implicit:alloc2(imp), paid:alloc2(ex+imp), outstanding:alloc2(tot-ex-imp) };
      byUid[uid]=row; return row;
    });
    byParty[nm]={ invoices:rows, credit:alloc2(Math.max(0,left)+Math.max(0,held[nm]||0)) };
  });
  return { byUid:byUid, byParty:byParty };
}

/** The invoices a party can still be paid against, oldest first. */
function openInvoicesFor(b,side,party,opts){
  var ix=settlementIndex(b,side,opts);
  var row=ix.byParty[party];
  if(!row) return [];
  return row.invoices.filter(function(r){ return r.outstanding>0.005; });
}

/** What one document has already allocated, as {uid:amount}. */
function allocationsOf(doc,invKey){
  var out={}; docAllocations(doc,invKey).forEach(function(a){ out[a.uid]=(out[a.uid]||0)+(Number(a.amount)||0); });
  return out;
}

/**
 * Refresh the cached balanceDue / amountPaid on every invoice from what the
 * ledger actually says. These stay plain derived caches — every reader (status
 * badges, dashboards, late fees) keeps working unchanged, and nothing edits an
 * invoice balance by hand.
 */
function syncInvoiceBalances(b){
  if(!b||!b.records) return;
  ['cust','sup'].forEach(function(side){
    var S=ALLOC_SIDES[side], ix=settlementIndex(b,side);
    (b.records[S.invKey]||[]).forEach(function(inv){
      var row=ix.byUid[invUid(inv)]; if(!row) return;
      inv.amountPaid=row.paid; inv.balanceDue=row.outstanding;
    });
  });
}

function refreshSummary(b){ if(!b.coa) return; normalizeLineSubs(b); syncInvoiceBalances(b); ensureAllControls(b); const s=summaryFromCoa(b); b.balanceSheet=s.balanceSheet; b.profitLoss=s.profitLoss; }

/* ---------- reporting period ----------
   Preset periods are relative to today, so "Year to date" is always 1 January to
   today (never a date frozen when the business was created). */
function _isoToday(){ const d=new Date(); const p=n=>(n<10?'0':'')+n; return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate()); }
function presetPeriod(mode,todayIso){ const t=todayIso||_isoToday(); const y=+t.slice(0,4), m=+t.slice(5,7); const p=n=>(n<10?'0':'')+n;
  const last=(yy,mm)=>new Date(Date.UTC(yy,mm,0)).getUTCDate();
  if(mode==='thisMonth') return [y+'-'+p(m)+'-01', y+'-'+p(m)+'-'+p(last(y,m))];
  if(mode==='thisQuarter'){ const q0=Math.floor((m-1)/3)*3+1, q1=q0+2; return [y+'-'+p(q0)+'-01', y+'-'+p(q1)+'-'+p(last(y,q1))]; }
  if(mode==='thisYear') return [y+'-01-01', y+'-12-31'];
  if(mode==='ytd') return [y+'-01-01', t];
  return null; }
function defaultPeriod(){ const d=presetPeriod('ytd'); return {mode:'ytd',from:d[0],to:d[1],excludeZero:false,description:'Summary'}; }
/** The business's reporting period with presets resolved against today: {mode,from,to,...}. */
function periodOf(b){ const p=Object.assign({}, (b&&b.period)||{mode:'ytd'}); const d=p.mode?presetPeriod(p.mode):null;
  if(d && p.mode!=='custom'){ p.from=d[0]; p.to=d[1]; } if(!p.from||!p.to){ const y=presetPeriod('ytd'); p.from=p.from||y[0]; p.to=p.to||y[1]; } return p; }
/* Accounts receivable and payable exist from day one, so the first receipt or payment can use them. */
function ensureCoreAccounts(b){ if(!b||!b.coa) return; try{ GL.sysAcct(b,'accounts receivable',true); GL.sysAcct(b,'accounts payable',true); }catch(e){} }
