/* ---------------------------- STATE ---------------------------- */
const LS = {
  invoices: 'tp_invoices', clients: 'tp_clients', templates: 'tp_templates', settings: 'tp_settings', counter: 'tp_counter'
};
function load(key, fallback){ try{ const v = localStorage.getItem(key); return v? JSON.parse(v): fallback; }catch(e){ return fallback; } }
function save(key, val){ try{ localStorage.setItem(key, JSON.stringify(val)); }catch(e){} }

let invoices = load(LS.invoices, []);
let clients = load(LS.clients, []);
let templates = load(LS.templates, defaultTemplates());
let settings = load(LS.settings, defaultSettings());
let counter = load(LS.counter, 1);
let currentItems = [];
let editingInvoiceId = null;

function defaultSettings(){
  return { name:'Temipixel Design Studio', address:'', email:'', phone:'', website:'', social:'', currency:'$', numFormat:'TP-INV-{n}', color:'#182548', logo:'' };
}
function defaultTemplates(){
  const groups = {
    Branding:['Logo Design','Brand Identity','Brand Guidelines','Visual Identity System','Brand Strategy'],
    Design:['Graphic Design','Social Media Design','Presentation Design','Marketing Design','Print Design'],
    Motion:['Motion Graphics','Logo Animation','2D Animation','Video Editing','Social Media Motion Design'],
    Photography:['Photography','Photo Editing','Product Photography','Event Photography'],
    Consulting:['Design Consultation','Brand Consultation','Creative Direction']
  };
  let arr = [];
  Object.keys(groups).forEach(cat=>{
    groups[cat].forEach(name=> arr.push({id:uid(), category:cat, name, desc:'', price:''}));
  });
  return arr;
}
function uid(){ return Math.random().toString(36).slice(2,10)+Date.now().toString(36); }
function fmtMoney(n, cur){ cur = cur || (settings.currency||'$'); n = Number(n)||0; return cur + n.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}); }
function todayISO(){ return new Date().toISOString().slice(0,10); }
function addDays(dateStr, days){ const d = new Date(dateStr); d.setDate(d.getDate()+days); return d.toISOString().slice(0,10); }
function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'), 2200); }

/* ---------------------------- NAV ---------------------------- */
document.querySelectorAll('.nav-item').forEach(item=>{
  item.addEventListener('click', ()=> goTo(item.dataset.view));
});
function goTo(view){
  document.querySelectorAll('.view').forEach(v=>v.hidden = v.id !== 'view-'+view);
  document.querySelectorAll('.nav-item').forEach(n=> n.classList.toggle('active', n.dataset.view===view));
  if(view==='dashboard') renderDashboard();
  if(view==='invoices') renderInvoicesList();
  if(view==='clients') renderClientsList();
  if(view==='templates') renderTemplates();
  if(view==='new-invoice' && !editingInvoiceId) prepNewInvoiceForm();
  if(view==='settings') fillSettingsForm();
}

/* ---------------------------- DASHBOARD ---------------------------- */
function renderDashboard(){
  const total = invoices.length;
  const draft = invoices.filter(i=>i.status==='Draft').length;
  const sent = invoices.filter(i=>i.status==='Sent').length;
  const paid = invoices.filter(i=>i.status==='Paid').length;
  const overdue = invoices.filter(i=> isOverdue(i)).length;
  const revenue = invoices.reduce((s,i)=> s + (Number(i.paid)||0), 0);
  const outstanding = invoices.reduce((s,i)=> s + Math.max((Number(i.total)||0) - (Number(i.paid)||0),0), 0);

  document.getElementById('statGrid').innerHTML = `
    ${stat('Total invoices', total)}
    ${stat('Draft', draft)}
    ${stat('Sent', sent)}
    ${stat('Paid', paid)}
    ${stat('Overdue', overdue, 'warn-b')}
    ${stat('Revenue collected', fmtMoney(revenue), 'accent')}
    ${stat('Outstanding', fmtMoney(outstanding), 'warn-b')}
  `;
  const recent = [...invoices].sort((a,b)=> b.createdAt - a.createdAt).slice(0,6);
  document.getElementById('recentInvoicesBody').innerHTML = recent.length ? recent.map(rowHtml).join('') :
    `<tr class="empty-row"><td colspan="7">No invoices yet — create your first one.</td></tr>`;
}
function stat(label, value, cls){ return `<div class="card stat ${cls||''}"><div class="label">${label}</div><div class="value">${value}</div></div>`; }
function isOverdue(inv){ return inv.status!=='Paid' && inv.status!=='Cancelled' && inv.dueDate && inv.dueDate < todayISO(); }
function statusOf(inv){ return isOverdue(inv) && inv.status!=='Draft' ? 'Overdue' : inv.status; }
function badgeClass(s){
  return {Draft:'badge-draft',Sent:'badge-sent',Paid:'badge-paid','Partially Paid':'badge-partial',Overdue:'badge-overdue',Cancelled:'badge-cancelled'}[s] || 'badge-draft';
}
function rowHtml(inv){
  const st = statusOf(inv);
  return `<tr>
    <td class="mono">${inv.number}</td>
    <td>${escapeHtml(inv.clientName||'—')}</td>
    <td class="mono">${inv.date||''}</td>
    <td class="mono">${inv.dueDate||''}</td>
    <td class="mono">${fmtMoney(inv.total, inv.currency)}</td>
    <td><span class="badge ${badgeClass(st)}">${st}</span></td>
    <td><button class="btn btn-sm" onclick="openInvoice('${inv.id}')">Open</button></td>
  </tr>`;
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ---------------------------- INVOICES LIST ---------------------------- */
function renderInvoicesList(){
  const curSel = document.getElementById('filterCurrency');
  const curSet = [...new Set(invoices.map(i=>i.currency).filter(Boolean))];
  curSel.innerHTML = '<option value="">All currencies</option>' + curSet.map(c=>`<option>${c}</option>`).join('');
  const clientSel = document.getElementById('filterClient');
  const clientSet = [...new Set(invoices.map(i=>i.clientName).filter(Boolean))];
  clientSel.innerHTML = '<option value="">All clients</option>' + clientSet.map(c=>`<option>${escapeHtml(c)}</option>`).join('');
  filterInvoices();
}
['invSearch','filterStatus','filterCurrency','filterClient'].forEach(id=>{
  document.addEventListener('input', e=>{ if(e.target && e.target.id===id) filterInvoices(); });
  document.addEventListener('change', e=>{ if(e.target && e.target.id===id) filterInvoices(); });
});
function filterInvoices(){
  const q = (document.getElementById('invSearch').value||'').toLowerCase();
  const st = document.getElementById('filterStatus').value;
  const cur = document.getElementById('filterCurrency').value;
  const cl = document.getElementById('filterClient').value;
  let list = invoices.filter(i=>{
    const matchQ = !q || (i.number+i.clientName+(i.project||'')).toLowerCase().includes(q);
    const matchSt = !st || statusOf(i)===st;
    const matchCur = !cur || i.currency===cur;
    const matchCl = !cl || i.clientName===cl;
    return matchQ && matchSt && matchCur && matchCl;
  }).sort((a,b)=> b.createdAt - a.createdAt);
  document.getElementById('allInvoicesBody').innerHTML = list.length ? list.map(inv=>{
    const s = statusOf(inv);
    const payStatus = inv.paid>=inv.total && inv.total>0 ? 'Paid' : inv.paid>0 ? 'Partial' : 'Unpaid';
    return `<tr>
      <td class="mono">${inv.number}</td>
      <td>${escapeHtml(inv.clientName||'—')}</td>
      <td class="mono">${inv.date||''}</td>
      <td class="mono">${inv.dueDate||''}</td>
      <td class="mono">${fmtMoney(inv.total, inv.currency)}</td>
      <td><span class="badge ${badgeClass(s)}">${s}</span></td>
      <td>${payStatus}</td>
      <td style="display:flex;gap:6px;">
        <button class="btn btn-sm" onclick="openInvoice('${inv.id}')">Open</button>
        <button class="btn btn-sm btn-danger" onclick="deleteInvoice('${inv.id}')">Delete</button>
      </td>
    </tr>`;
  }).join('') : `<tr class="empty-row"><td colspan="8">No invoices match.</td></tr>`;
}
function deleteInvoice(id){
  if(!confirm('Delete this invoice? This cannot be undone.')) return;
  invoices = invoices.filter(i=>i.id!==id);
  save(LS.invoices, invoices);
  renderInvoicesList(); renderDashboard();
  toast('Invoice deleted');
}
function openInvoice(id){
  const inv = invoices.find(i=>i.id===id);
  if(!inv) return;
  editingInvoiceId = id;
  goTo('new-invoice');
  document.getElementById('invoiceFormTitle').textContent = 'Edit Invoice ' + inv.number;
  document.getElementById('projectName').value = inv.project||'';
  document.getElementById('clientName').value = inv.clientName||'';
  document.getElementById('clientCompany').value = inv.clientCompany||'';
  document.getElementById('clientEmail').value = inv.clientEmail||'';
  document.getElementById('clientPhone').value = inv.clientPhone||'';
  document.getElementById('clientAddress').value = inv.clientAddress||'';
  document.getElementById('invoiceNumber').value = inv.number;
  document.getElementById('invoiceDate').value = inv.date;
  document.getElementById('dueDate').value = inv.dueDate;
  document.getElementById('invoiceCurrency').value = inv.currency;
  document.getElementById('paymentTerms').value = inv.terms||'';
  document.getElementById('poNumber').value = inv.po||'';
  document.getElementById('invoiceNotes').value = inv.notes||'';
  document.getElementById('discountInput').value = inv.discount||0;
  document.getElementById('feeInput').value = inv.fee||0;
  document.getElementById('paidInput').value = inv.paid||0;
  currentItems = JSON.parse(JSON.stringify(inv.items||[]));
  renderItemsTable();
  recalcTotals();
}

/* ---------------------------- NEW INVOICE FORM ---------------------------- */
function prepNewInvoiceForm(){
  document.getElementById('invoiceFormTitle').textContent = 'New Invoice';
  document.getElementById('projectName').value='';
  document.getElementById('clientSelect').value='';
  document.getElementById('clientName').value='';
  document.getElementById('clientCompany').value='';
  document.getElementById('clientEmail').value='';
  document.getElementById('clientPhone').value='';
  document.getElementById('clientAddress').value='';
  document.getElementById('invoiceNumber').value = nextInvoiceNumber();
  document.getElementById('invoiceDate').value = todayISO();
  document.getElementById('dueDate').value = addDays(todayISO(),14);
  document.getElementById('invoiceCurrency').value = settings.currency||'$';
  document.getElementById('paymentTerms').value='';
  document.getElementById('poNumber').value='';
  document.getElementById('invoiceNotes').value='';
  document.getElementById('discountInput').value=0;
  document.getElementById('feeInput').value=0;
  document.getElementById('paidInput').value=0;
  document.getElementById('aiPrompt').value='';
  document.getElementById('aiResult').classList.remove('show');
  currentItems = [];
  addLineItem();
  populateClientSelect();
  renderQuickAddServices();
  recalcTotals();
}
function nextInvoiceNumber(){
  return (settings.numFormat||'TP-INV-{n}').replace('{n}', String(counter).padStart(4,'0'));
}
function populateClientSelect(){
  const sel = document.getElementById('clientSelect');
  sel.innerHTML = '<option value="">— Select a saved client —</option>' + clients.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}${c.company? ' ('+escapeHtml(c.company)+')':''}</option>`).join('');
}
function applyClientSelection(){
  const id = document.getElementById('clientSelect').value;
  const c = clients.find(x=>x.id===id);
  if(!c) return;
  document.getElementById('clientName').value = c.name||'';
  document.getElementById('clientCompany').value = c.company||'';
  document.getElementById('clientEmail').value = c.email||'';
  document.getElementById('clientPhone').value = c.phone||'';
  document.getElementById('clientAddress').value = c.address||'';
  if(c.currency) document.getElementById('invoiceCurrency').value = c.currency;
}

/* line items */
function addLineItem(prefill){
  currentItems.push(Object.assign({id:uid(), name:'', desc:'', qty:1, price:'', tax:0}, prefill||{}));
  renderItemsTable();
}
function removeLineItem(id){
  currentItems = currentItems.filter(i=>i.id!==id);
  if(currentItems.length===0) addLineItem();
  renderItemsTable();
}
function renderItemsTable(){
  const body = document.getElementById('itemsBody');
  body.innerHTML = currentItems.map(it=>{
    const total = (Number(it.qty)||0) * (Number(it.price)||0) * (1 + (Number(it.tax)||0)/100);
    return `<tr data-id="${it.id}">
      <td>
        <input value="${escapeAttr(it.name)}" placeholder="Service name" oninput="updateItem('${it.id}','name',this.value)">
        <input value="${escapeAttr(it.desc)}" placeholder="Short description" style="margin-top:5px;" oninput="updateItem('${it.id}','desc',this.value)">
      </td>
      <td class="qty-col"><input type="number" min="0" value="${it.qty}" oninput="updateItem('${it.id}','qty',this.value)"></td>
      <td class="price-col"><input type="number" min="0" value="${it.price}" placeholder="0.00" oninput="updateItem('${it.id}','price',this.value)"></td>
      <td class="tax-col"><input type="number" min="0" value="${it.tax}" oninput="updateItem('${it.id}','tax',this.value)"></td>
      <td class="total-col mono">${total? total.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : '—'}</td>
      <td class="del-col"><button class="remove-item" onclick="removeLineItem('${it.id}')" title="Remove">✕</button></td>
    </tr>`;
  }).join('');
  recalcTotals();
}
function updateItem(id, field, val){
  const it = currentItems.find(i=>i.id===id);
  if(!it) return;
  it[field] = val;
  // Only patch this row's total cell -- never rebuild the whole table here.
  // Rebuilding on every keystroke destroys and recreates the <input> the
  // user is typing into, which loses focus and makes it look like only
  // one character can be typed at a time.
  const row = document.querySelector(`#itemsBody tr[data-id="${id}"]`);
  if(row){
    const total = (Number(it.qty)||0) * (Number(it.price)||0) * (1 + (Number(it.tax)||0)/100);
    const totalCell = row.querySelector('.total-col');
    if(totalCell) totalCell.textContent = total ? total.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}) : '—';
  }
  recalcTotals();
}
function escapeAttr(s){ return escapeHtml(s||''); }
function recalcTotals(){
  const subtotal = currentItems.reduce((s,it)=> s + (Number(it.qty)||0)*(Number(it.price)||0), 0);
  const taxTotal = currentItems.reduce((s,it)=> s + (Number(it.qty)||0)*(Number(it.price)||0)*((Number(it.tax)||0)/100), 0);
  const discount = Number(document.getElementById('discountInput').value)||0;
  const fee = Number(document.getElementById('feeInput').value)||0;
  const total = Math.max(subtotal + taxTotal + fee - discount, 0);
  const paid = Number(document.getElementById('paidInput').value)||0;
  const balance = Math.max(total - paid, 0);
  document.getElementById('tSubtotal').textContent = subtotal.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  document.getElementById('tTotal').textContent = total.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  document.getElementById('tBalance').textContent = balance.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  return {subtotal, taxTotal, discount, fee, total, paid, balance};
}

/* quick add services */
function renderQuickAddServices(){
  const cats = [...new Set(templates.map(t=>t.category))];
  document.getElementById('quickAddServices').innerHTML = cats.map(cat=>`
    <div class="svc-group">
      <div class="svc-group-title">${cat.toUpperCase()}</div>
      <div class="svc-chip-row">
        ${templates.filter(t=>t.category===cat).map(t=>`<div class="svc-chip" onclick='quickAdd(${JSON.stringify(t).replace(/'/g,"&#39;")})'>${escapeHtml(t.name)}</div>`).join('')}
      </div>
    </div>
  `).join('');
}
function quickAdd(t){
  addLineItem({name:t.name, desc:t.desc||'', qty:1, price:t.price||'', tax:0});
}

/* ---------------------------- AI ASSISTANT (rule-based parser) ---------------------------- */
function runAiAssistant(){
  const text = document.getElementById('aiPrompt').value.trim();
  if(!text){ toast('Describe the project first'); return; }
  const parsed = parseInvoicePrompt(text);

  if(parsed.clientName) document.getElementById('clientName').value = parsed.clientName;
  if(parsed.project) document.getElementById('projectName').value = parsed.project;
  if(parsed.currencySymbol) document.getElementById('invoiceCurrency').value = parsed.currencySymbol;
  if(parsed.terms) document.getElementById('paymentTerms').value = parsed.terms;

  currentItems = [];
  if(parsed.services.length){
    parsed.services.forEach(s=> addLineItem({name:s, desc:'', qty:1, price: parsed.perServicePrice || ''}));
  } else if(parsed.amount){
    addLineItem({name: parsed.project || 'Project', desc:'', qty:1, price:parsed.amount});
  } else {
    addLineItem();
  }

  if(parsed.depositPct && parsed.amount){
    const deposit = Math.round(parsed.amount * (parsed.depositPct/100) * 100)/100;
    document.getElementById('paidInput').value = 0;
    document.getElementById('aiPrompt').dataset.deposit = deposit;
  }
  recalcTotals();

  const resultBox = document.getElementById('aiResult');
  let html = '<strong>Drafted from your description:</strong><ul>';
  if(parsed.clientName) html += `<li>Client: ${escapeHtml(parsed.clientName)}</li>`;
  if(parsed.services.length) html += `<li>Services: ${parsed.services.map(escapeHtml).join(', ')}</li>`;
  if(parsed.amount) html += `<li>Project value: ${fmtMoney(parsed.amount, parsed.currencySymbol||settings.currency)}</li>`;
  if(parsed.depositPct) html += `<li>Upfront: ${parsed.depositPct}% (${fmtMoney(Math.round(parsed.amount*(parsed.depositPct/100)*100)/100, parsed.currencySymbol||settings.currency)}) — remainder ${100-parsed.depositPct}% on completion</li>`;
  if(!parsed.amount) html += `<li>No price was mentioned — line item price left blank. Fill it in manually.</li>`;
  html += '</ul>';
  resultBox.innerHTML = html;
  resultBox.classList.add('show');
  toast('Draft applied — review before saving');
}

function parseInvoicePrompt(text){
  const result = { clientName:null, project:null, services:[], amount:null, currencySymbol:null, depositPct:null, terms:null, perServicePrice:null };

  // currency detection
  const curMap = [['₦','₦'],['NGN','₦'],['$','$'],['USD','$'],['£','£'],['GBP','£'],['€','€'],['EUR','€'],['GH₵','GH₵'],['KSh','KSh']];
  for(const [token,sym] of curMap){ if(text.includes(token)){ result.currencySymbol = sym; break; } }

  // amount detection: number possibly with commas/decimals near currency symbol or word "worth"/"costs"/"budget"
  const amountRegex = /(?:worth|costs?|budget(?:ed)? at|for|is|of)?\s*(?:₦|\$|£|€|GH₵|KSh)?\s?([0-9][0-9,]*(?:\.[0-9]+)?)\s*(k|K|thousand|m|M|million)?/g;
  let bestAmount = null;
  const currencyProximity = /(₦|\$|£|€|GH₵|KSh)\s?([0-9][0-9,]*(?:\.[0-9]+)?)\s*(k|K|thousand|m|M|million)?/;
  const cm = text.match(currencyProximity);
  if(cm){
    let num = parseFloat(cm[2].replace(/,/g,''));
    if(/k|thousand/i.test(cm[3]||'')) num *= 1000;
    if(/m|million/i.test(cm[3]||'')) num *= 1000000;
    bestAmount = num;
    if(!result.currencySymbol) result.currencySymbol = cm[1];
  } else {
    // fallback: look for standalone numbers with 3+ digits
    const nums = text.match(/\b([0-9][0-9,]{2,}(?:\.[0-9]+)?)\b/);
    if(nums) bestAmount = parseFloat(nums[1].replace(/,/g,''));
  }
  if(bestAmount) result.amount = bestAmount;

  // deposit / upfront percentage
  const pctMatches = [...text.matchAll(/(\d{1,3})\s?%/g)].map(m=>parseInt(m[1]));
  if(pctMatches.length){
    // prefer the one near "upfront" or "deposit"
    const upfrontMatch = text.match(/(\d{1,3})\s?%[^.]*?(upfront|deposit|advance|down\s?payment)/i) || text.match(/(upfront|deposit|advance|down\s?payment)[^.]*?(\d{1,3})\s?%/i);
    if(upfrontMatch){
      result.depositPct = parseInt(upfrontMatch[1].match(/\d+/) ? upfrontMatch[1] : upfrontMatch[2]);
    } else {
      result.depositPct = pctMatches[0];
    }
    if(pctMatches.length>=2){
      result.terms = `${pctMatches[0]}% upfront, ${pctMatches[1]}% on completion`;
    } else if(result.depositPct){
      result.terms = `${result.depositPct}% upfront, ${100-result.depositPct}% on completion`;
    }
  }

  // client name: "for John", "for a startup", "invoice for <Name>"
  const nameMatch = text.match(/invoice for ([A-Z][a-zA-Z]*)/) || text.match(/for ([A-Z][a-zA-Z]+)(?=[, ])/);
  if(nameMatch && !/^(a|an|the|his|her)$/i.test(nameMatch[1])) result.clientName = nameMatch[1];

  // services: match against known template names + common creative keywords
  const known = templates.map(t=>t.name);
  const extraKeywords = ['logo design','brand identity','brand guidelines','color palette','typography','social media templates','website design','packaging design','motion graphics','video editing','photography','photo editing','presentation design','pitch deck','brand strategy','visual identity'];
  const pool = [...new Set([...known, ...extraKeywords])];
  const lower = text.toLowerCase();
  pool.forEach(name=>{
    if(lower.includes(name.toLowerCase())) result.services.push(titleCase(name));
  });
  // dedupe near-duplicates
  result.services = [...new Set(result.services)];

  // project descriptor
  const projMatch = text.match(/(complete brand identity|brand identity|logo design project|website redesign|rebrand)/i);
  if(projMatch) result.project = titleCase(projMatch[1]);
  else if(result.services.length) result.project = result.services[0];

  if(result.services.length > 1 && result.amount){
    result.perServicePrice = null; // leave blank per-item, single lump handled by first item price instead
  }
  return result;
}
function titleCase(s){ return s.replace(/\w\S*/g, t=> t.charAt(0).toUpperCase()+t.slice(1).toLowerCase()); }

/* ---------------------------- SAVE / PREVIEW INVOICE ---------------------------- */
function collectInvoiceFromForm(){
  const t = recalcTotals();
  return {
    id: editingInvoiceId || uid(),
    number: document.getElementById('invoiceNumber').value || nextInvoiceNumber(),
    project: document.getElementById('projectName').value,
    clientName: document.getElementById('clientName').value,
    clientCompany: document.getElementById('clientCompany').value,
    clientEmail: document.getElementById('clientEmail').value,
    clientPhone: document.getElementById('clientPhone').value,
    clientAddress: document.getElementById('clientAddress').value,
    date: document.getElementById('invoiceDate').value,
    dueDate: document.getElementById('dueDate').value,
    currency: document.getElementById('invoiceCurrency').value,
    terms: document.getElementById('paymentTerms').value,
    po: document.getElementById('poNumber').value,
    notes: document.getElementById('invoiceNotes').value,
    items: JSON.parse(JSON.stringify(currentItems)),
    discount: t.discount, fee: t.fee, subtotal: t.subtotal, total: t.total, paid: t.paid, balance: t.balance,
    createdAt: editingInvoiceId ? (invoices.find(i=>i.id===editingInvoiceId)||{}).createdAt || Date.now() : Date.now(),
    status: editingInvoiceId ? (invoices.find(i=>i.id===editingInvoiceId)||{}).status || 'Draft' : 'Draft'
  };
}
function saveInvoice(statusIfNew){
  if(!document.getElementById('clientName').value.trim()){ toast('Add a client name first'); return; }
  const inv = collectInvoiceFromForm();
  if(!editingInvoiceId) inv.status = statusIfNew;
  const idx = invoices.findIndex(i=>i.id===inv.id);
  if(idx>-1) invoices[idx] = inv; else invoices.push(inv);
  save(LS.invoices, invoices);

  if(document.getElementById('saveClientToggle') && document.getElementById('saveClientToggle').checked){
    upsertClientFromInvoice(inv);
  }
  if(!editingInvoiceId){ counter++; save(LS.counter, counter); }
  editingInvoiceId = null;
  toast('Invoice saved');
  goTo('invoices');
}
function upsertClientFromInvoice(inv){
  let c = clients.find(c=> c.name.toLowerCase()===((inv.clientName||'').toLowerCase()) );
  if(!c){
    c = { id: uid(), name: inv.clientName, company: inv.clientCompany, email: inv.clientEmail, phone: inv.clientPhone, address: inv.clientAddress, country:'', tax:'', currency: inv.currency, notes:'', dateAdded: todayISO() };
    clients.push(c);
  } else {
    c.company = inv.clientCompany || c.company;
    c.email = inv.clientEmail || c.email;
    c.phone = inv.clientPhone || c.phone;
    c.address = inv.clientAddress || c.address;
  }
  save(LS.clients, clients);
}
function previewCurrentInvoice(){
  const inv = collectInvoiceFromForm();
  renderInvoicePreview(inv);
  document.getElementById('previewOverlay').hidden = false;
}
function renderInvoicePreview(inv){
  const s = settings;
  const itemsHtml = inv.items.filter(i=>i.name||i.price).map(it=>{
    const lineTotal = (Number(it.qty)||0)*(Number(it.price)||0)*(1+(Number(it.tax)||0)/100);
    return `<tr>
      <td>${escapeHtml(it.name||'—')}${it.desc?`<div class="inv-desc-sub">${escapeHtml(it.desc)}</div>`:''}</td>
      <td class="num-cell">${it.qty}</td>
      <td class="num-cell">${fmtMoney(it.price, inv.currency)}</td>
      <td class="num-cell">${it.tax||0}%</td>
      <td class="num-cell">${fmtMoney(lineTotal, inv.currency)}</td>
    </tr>`;
  }).join('');
  document.getElementById('invoicePreviewArea').innerHTML = `
    <div class="invoice-preview">
      <div class="inv-top">
        <div>
          ${s.logo?`<img src="${s.logo}">`:''}
          <div class="inv-biz-name" style="margin-top:${s.logo?'8px':'0'};">${escapeHtml(s.name||'Temipixel Design Studio')}</div>
          <div class="inv-meta-line">${escapeHtml(s.address||'')}${s.address?'<br>':''}${escapeHtml(s.email||'')} ${s.phone? '· '+escapeHtml(s.phone):''}<br>${escapeHtml(s.website||'')} ${s.social? '· '+escapeHtml(s.social):''}</div>
        </div>
        <div class="inv-title">
          <h2>Invoice</h2>
          <div class="num">${inv.number}</div>
        </div>
      </div>
      <div class="inv-parties">
        <div><div class="lbl">BILLED TO</div><div class="name">${escapeHtml(inv.clientName||'—')}</div><div class="detail">${escapeHtml(inv.clientCompany||'')}${inv.clientCompany?'<br>':''}${escapeHtml(inv.clientAddress||'')}${inv.clientAddress?'<br>':''}${escapeHtml(inv.clientEmail||'')} ${inv.clientPhone? '· '+escapeHtml(inv.clientPhone):''}</div></div>
        <div><div class="lbl">PROJECT</div><div class="name">${escapeHtml(inv.project||'—')}</div>${inv.po?`<div class="detail">Ref: ${escapeHtml(inv.po)}</div>`:''}</div>
      </div>
      <div class="inv-facts">
        <div><div class="lbl2">INVOICE DATE</div>${inv.date||''}</div>
        <div><div class="lbl2">DUE DATE</div>${inv.dueDate||''}</div>
        <div><div class="lbl2">PAYMENT TERMS</div>${escapeHtml(inv.terms||'—')}</div>
      </div>
      <table class="inv-items-table">
        <thead><tr><th>Service</th><th class="num-cell">Qty</th><th class="num-cell">Unit price</th><th class="num-cell">Tax</th><th class="num-cell">Total</th></tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>
      <div class="inv-totals">
        <div class="row"><span>Subtotal</span><span>${fmtMoney(inv.subtotal, inv.currency)}</span></div>
        ${inv.discount? `<div class="row"><span>Discount</span><span>-${fmtMoney(inv.discount, inv.currency)}</span></div>`:''}
        ${inv.fee? `<div class="row"><span>Additional fee</span><span>${fmtMoney(inv.fee, inv.currency)}</span></div>`:''}
        <div class="row grand"><span>Total</span><span>${fmtMoney(inv.total, inv.currency)}</span></div>
        <div class="row"><span>Amount paid</span><span>${fmtMoney(inv.paid, inv.currency)}</span></div>
        <div class="row balance"><span>Balance due</span><span>${fmtMoney(inv.balance, inv.currency)}</span></div>
      </div>
      ${inv.notes? `<div class="inv-notes">${escapeHtml(inv.notes)}</div>`:''}
    </div>
  `;
}

/* ---------------------------- CLIENTS ---------------------------- */
function renderClientsList(){
  const q = (document.getElementById('clientSearch').value||'').toLowerCase();
  const list = clients.filter(c=> !q || (c.name+c.company).toLowerCase().includes(q));
  document.getElementById('clientsBody').innerHTML = list.length ? list.map(c=>{
    const billed = invoices.filter(i=>i.clientName===c.name).reduce((s,i)=>s+(Number(i.total)||0),0);
    const paid = invoices.filter(i=>i.clientName===c.name).reduce((s,i)=>s+(Number(i.paid)||0),0);
    return `<tr>
      <td>${escapeHtml(c.name)}</td>
      <td>${escapeHtml(c.company||'—')}</td>
      <td>${escapeHtml(c.email||'—')}</td>
      <td class="mono">${fmtMoney(billed, c.currency)}</td>
      <td class="mono">${fmtMoney(paid, c.currency)}</td>
      <td class="mono">${fmtMoney(Math.max(billed-paid,0), c.currency)}</td>
      <td style="display:flex;gap:6px;">
        <button class="btn btn-sm" onclick="openClientModal('${c.id}')">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="deleteClient('${c.id}')">Delete</button>
      </td>
    </tr>`;
  }).join('') : `<tr class="empty-row"><td colspan="7">No clients yet — add one to speed up future invoices.</td></tr>`;
}
document.addEventListener('input', e=>{ if(e.target && e.target.id==='clientSearch') renderClientsList(); });
function openClientModal(id){
  document.getElementById('clientModalId').value = id||'';
  document.getElementById('clientModalTitle').textContent = id ? 'Edit Client' : 'Add Client';
  const c = id ? clients.find(x=>x.id===id) : null;
  document.getElementById('mClientName').value = c?.name||'';
  document.getElementById('mClientCompany').value = c?.company||'';
  document.getElementById('mClientEmail').value = c?.email||'';
  document.getElementById('mClientPhone').value = c?.phone||'';
  document.getElementById('mClientAddress').value = c?.address||'';
  document.getElementById('mClientCountry').value = c?.country||'';
  document.getElementById('mClientTax').value = c?.tax||'';
  document.getElementById('mClientCurrency').value = c?.currency||settings.currency||'$';
  document.getElementById('mClientNotes').value = c?.notes||'';
  document.getElementById('clientModalOverlay').hidden = false;
}
function saveClientModal(thenCreateInvoice){
  const id = document.getElementById('clientModalId').value;
  const name = document.getElementById('mClientName').value.trim();
  if(!name){ toast('Client name is required'); return; }
  const data = {
    name, company: document.getElementById('mClientCompany').value, email: document.getElementById('mClientEmail').value,
    phone: document.getElementById('mClientPhone').value, address: document.getElementById('mClientAddress').value,
    country: document.getElementById('mClientCountry').value, tax: document.getElementById('mClientTax').value,
    currency: document.getElementById('mClientCurrency').value, notes: document.getElementById('mClientNotes').value
  };
  if(id){
    const c = clients.find(x=>x.id===id); Object.assign(c, data);
  } else {
    clients.push(Object.assign({id:uid(), dateAdded: todayISO()}, data));
  }
  save(LS.clients, clients);
  closeModal('clientModalOverlay');
  renderClientsList();
  toast('Client saved');
  if(thenCreateInvoice){
    goTo('new-invoice');
    prepNewInvoiceForm();
    document.getElementById('clientName').value = data.name;
    document.getElementById('clientCompany').value = data.company;
    document.getElementById('clientEmail').value = data.email;
    document.getElementById('clientPhone').value = data.phone;
    document.getElementById('clientAddress').value = data.address;
  }
}
function deleteClient(id){
  if(!confirm('Delete this client?')) return;
  clients = clients.filter(c=>c.id!==id);
  save(LS.clients, clients);
  renderClientsList();
}

/* ---------------------------- TEMPLATES ---------------------------- */
function renderTemplates(){
  const cats = [...new Set(templates.map(t=>t.category))];
  document.getElementById('templatesArea').innerHTML = cats.map(cat=>`
    <div class="section-head"><h3>${cat}</h3></div>
    <div class="table-wrap"><table>
      <thead><tr><th>Service</th><th>Description</th><th>Default price</th><th></th></tr></thead>
      <tbody>
        ${templates.filter(t=>t.category===cat).map(t=>`<tr>
          <td>${escapeHtml(t.name)}</td><td>${escapeHtml(t.desc||'—')}</td>
          <td class="mono">${t.price? fmtMoney(t.price): '—'}</td>
          <td><button class="btn btn-sm btn-danger" onclick="deleteTemplate('${t.id}')">Delete</button></td>
        </tr>`).join('')}
      </tbody>
    </table></div>
  `).join('');
}
function openTemplateModal(){ document.getElementById('templateModalOverlay').hidden = false; }
function saveTemplateModal(){
  const name = document.getElementById('tName').value.trim();
  if(!name){ toast('Service name required'); return; }
  templates.push({ id:uid(), category: document.getElementById('tCategory').value, name, desc: document.getElementById('tDesc').value, price: document.getElementById('tPrice').value });
  save(LS.templates, templates);
  closeModal('templateModalOverlay');
  document.getElementById('tName').value=''; document.getElementById('tDesc').value=''; document.getElementById('tPrice').value='';
  renderTemplates();
  toast('Service added');
}
function deleteTemplate(id){
  templates = templates.filter(t=>t.id!==id);
  save(LS.templates, templates);
  renderTemplates();
}

/* ---------------------------- SETTINGS ---------------------------- */
function fillSettingsForm(){
  document.getElementById('bizName').value = settings.name||'';
  document.getElementById('bizAddress').value = settings.address||'';
  document.getElementById('bizEmail').value = settings.email||'';
  document.getElementById('bizPhone').value = settings.phone||'';
  document.getElementById('bizWebsite').value = settings.website||'';
  document.getElementById('bizSocial').value = settings.social||'';
  document.getElementById('bizCurrency').value = settings.currency||'$';
  document.getElementById('numFormat').value = settings.numFormat||'TP-INV-{n}';
  document.getElementById('bizColor').value = settings.color||'#182548';
  const logoBox = document.getElementById('logoUpload');
  logoBox.innerHTML = settings.logo ? `<img src="${settings.logo}">` : '<span>Upload logo</span>';
}
function handleLogoUpload(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{ settings.logo = reader.result; document.getElementById('logoUpload').innerHTML = `<img src="${settings.logo}">`; };
  reader.readAsDataURL(file);
}
function removeLogo(){ settings.logo=''; document.getElementById('logoUpload').innerHTML = '<span>Upload logo</span>'; }
function saveSettings(){
  settings.name = document.getElementById('bizName').value;
  settings.address = document.getElementById('bizAddress').value;
  settings.email = document.getElementById('bizEmail').value;
  settings.phone = document.getElementById('bizPhone').value;
  settings.website = document.getElementById('bizWebsite').value;
  settings.social = document.getElementById('bizSocial').value;
  settings.currency = document.getElementById('bizCurrency').value;
  settings.numFormat = document.getElementById('numFormat').value || 'TP-INV-{n}';
  settings.color = document.getElementById('bizColor').value;
  save(LS.settings, settings);
  toast('Settings saved');
}

/* ---------------------------- MODALS ---------------------------- */
function closeModal(id){ document.getElementById(id).hidden = true; }
document.querySelectorAll('.modal-overlay').forEach(ov=>{
  ov.addEventListener('click', e=>{ if(e.target===ov) ov.hidden = true; });
});

/* ---------------------------- INIT ---------------------------- */
document.getElementById('yearNow').textContent = new Date().getFullYear();
renderDashboard();