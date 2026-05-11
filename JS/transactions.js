/**
 * Mi Pisto HN — transactions.js
 * ─────────────────────────────────────────────────────────
 * Registro de gastos, ingresos, metas, deudas, préstamos,
 * tarjetas, pagos recurrentes y conciliación de cuentas.
 * Requiere: utils.js, storage.js, crypto.js
 */

function saveGasto(){
    const montoInput = parseMonto(document.getElementById('gasto-monto').value),
          moneda = document.getElementById('gasto-moneda')?.value || 'HNL',
          cat = document.getElementById('gasto-cat').value || 'General',
          subcat = document.getElementById('gasto-subcat').value || '',
          pago = (document.getElementById('gasto-cuenta')?.value||document.getElementById('gasto-pago').value),
          tipo = document.getElementById('gasto-tipo').value || 'extra',
          banco = document.getElementById('gasto-banco').value || '',
          etiqueta = (document.getElementById('etiqueta-input')?.value || '').trim();
          
    if(montoInput===null || montoInput<=0) return alert('Monto inválido (no se permite notación científica ni valores >1.000.000.000)');
    
    // ─────────────────────────────────────────────────────────────
    // MULTIMONEDA: convertir a HNL si es necesario
    // Gasto → tasa ASK (banco te VENDE la moneda extranjera)
    // ─────────────────────────────────────────────────────────────
    let monto = montoInput;
    let originalAmount = null;
    let originalCurrency = null;
    let conversionRate = null;
    let conversionSide = null;
    if (moneda && moneda !== 'HNL' && window.currencyManager) {
      const rate = window.currencyManager.getRate(moneda);
      if (!rate) return alert('⚠️ No hay tasa configurada para ' + moneda + '. Configúrala en Configuración → Tasas.');
      monto = Math.round(montoInput * rate.ask * 100) / 100;
      originalAmount = montoInput;
      originalCurrency = moneda;
      conversionRate = rate.ask;
      conversionSide = 'ask';
    }
    
    // Recuperar ID de imagen desde IDB (no base64 de localStorage)
    const facturaImagenId = _tempFacturaId || null;

    // P0-4: normalizar la cuenta de imputación.
    //   'efectivo' / 'ahorro' afectan el saldo de esa cuenta.
    //   'credito' impacta el saldo de la tarjeta, no toca cuentas líquidas → cuenta=null.
    //   Cualquier otro valor heredado (debito, transferencia, etc.) se imputa a 'efectivo'.
    let cuentaImputacion = null;
    if (pago === 'efectivo' || pago === 'ahorro') cuentaImputacion = pago;
    else if (pago === 'credito') cuentaImputacion = null;
    else cuentaImputacion = 'efectivo';

    const transaction = {
        id: uid(),
        type: 'expense',
        amount: monto,
        cat: cat,
        subcat: subcat,
        pago: pago,
        cuenta: cuentaImputacion,            // P0-4: explícito para getCuentaBalance
        tipo: tipo,
        banco: banco,
        etiqueta: etiqueta,
        date: new Date().toISOString(),
        facturaImagenId: facturaImagenId,
        facturaImagen: null,
        numeroFactura: `FAC-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${Math.floor(Math.random()*1000).toString().padStart(3,'0')}`
    };
    // MULTIMONEDA: agregar campos opcionales solo si la transacción fue en moneda extranjera
    if (originalCurrency) {
        transaction.originalAmount = originalAmount;
        transaction.originalCurrency = originalCurrency;
        transaction.conversionRate = conversionRate;
        transaction.conversionSide = conversionSide;
    }
    
    if(pago === 'credito'){
        const tarjetaId = document.getElementById('gasto-tarjeta').value; // P1-4: no parseInt
        if(tarjetaId){
            const tarjeta = state.tarjetas.find(t => String(t.id) === String(tarjetaId));
            if(tarjeta){
                tarjeta.saldo += monto;
                transaction.tarjetaId = tarjeta.id;
                transaction.tarjetaNombre = tarjeta.nombre;
            }
        }
    }
    
    state.transactions.push(transaction);
    save();
    
    // P0-2: Limpiar estado temporal de imagen (ya NO toca localStorage)
    _tempFacturaId = null;
    window._tempFacturaDataURL = null;
    
    closeModal('modal-gasto');
    renderAll();
    
    ['gasto-monto','gasto-cat','gasto-subcat','gasto-banco'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('gasto-tipo').value = 'extra';
    // MULTIMONEDA: resetear moneda y ocultar info de conversión
    const monedaSel = document.getElementById('gasto-moneda');
    if (monedaSel) monedaSel.value = 'HNL';
    const convInfo = document.getElementById('gasto-conversion-info');
    if (convInfo) convInfo.style.display = 'none';
    document.getElementById('ocr-status').style.display = 'none';
    const prevEl = document.getElementById('ocr-preview');
    if (prevEl) prevEl.style.display = 'none';
    clearEtiqueta();
    
    alert('✅ Gasto guardado. Factura adjuntada si fue escaneada.');
    // Actualizar presupuesto por categoría y verificar alertas
    if (typeof renderBudgetCategorySummary === 'function') renderBudgetCategorySummary();
    if (typeof renderBudgetAlerts === 'function') renderBudgetAlerts();
}

function saveIngreso(){
  const montoInput=parseMonto(document.getElementById('ingreso-monto').value);
  if(montoInput===null||montoInput<=0)return alert('Monto inválido');
  const moneda = document.getElementById('ingreso-moneda')?.value || 'HNL';
  // P0-4: capturar la cuenta de destino y la nota — antes ambos campos se ignoraban
  const cuentaSel=document.getElementById('ingreso-cuenta')?.value||'efectivo';
  const cuenta=(cuentaSel==='efectivo'||cuentaSel==='ahorro')?cuentaSel:'efectivo';
  const tipoSel=document.getElementById('ingreso-tipo').value;
  const nota=(document.getElementById('ingreso-nota')?.value||'').trim();
  
  // ─────────────────────────────────────────────────────────────
  // MULTIMONEDA: convertir a HNL si es necesario
  // Ingreso → tasa BID (banco te COMPRA la moneda extranjera)
  // ─────────────────────────────────────────────────────────────
  let monto = montoInput;
  let extraFields = {};
  if (moneda && moneda !== 'HNL' && window.currencyManager) {
    const rate = window.currencyManager.getRate(moneda);
    if (!rate) return alert('⚠️ No hay tasa configurada para ' + moneda + '. Configúrala en Configuración → Tasas.');
    monto = Math.round(montoInput * rate.bid * 100) / 100;
    extraFields = {
      originalAmount: montoInput,
      originalCurrency: moneda,
      conversionRate: rate.bid,
      conversionSide: 'bid'
    };
  }
  
  state.transactions.push(Object.assign({
    id:uid(),
    type:'income',
    amount:monto,
    cat: tipoSel==='salario' ? 'Salario' : 'Extra',
    subcat: tipoSel,
    cuenta: cuenta,
    nota: nota,
    date:new Date().toISOString()
  }, extraFields));
  save();closeModal('modal-ingreso');renderAll();
  document.getElementById('ingreso-monto').value='';
  if(document.getElementById('ingreso-nota'))document.getElementById('ingreso-nota').value='';
  // MULTIMONEDA: resetear moneda y ocultar info de conversión
  const monedaSel = document.getElementById('ingreso-moneda');
  if (monedaSel) monedaSel.value = 'HNL';
  const convInfo = document.getElementById('ingreso-conversion-info');
  if (convInfo) convInfo.style.display = 'none';
  renderWelcome();
}

// ============================================================
// 🗑️ SOFT DELETE CON TOAST (reemplaza deleteTx y confirm())
// ============================================================
let _undoTimer = null;
let _undoTxId  = null;

function softDeleteTx(id) {
  const t = state.transactions.find(x => x.id === id);
  if (!t) return;

  // Marcar como eliminado
  t.deletedAt = new Date().toISOString();
  _undoTxId = id;
  save();
  renderAll();

  // Cancelar toast anterior si existía
  if (_undoTimer) { clearTimeout(_undoTimer); _dismissToast(); }

  // Construir toast
  const label = t.type === 'income' ? `+${fL(t.amount)}` : `-${fL(t.amount)}`;
  _showUndoToast(
    `${t.cat || 'Movimiento'} eliminado`,
    label,
    () => { _undoDelete(id); }
  );
}

function _showUndoToast(title, sub, onUndo) {
  _dismissToast();

  const toast = document.createElement('div');
  toast.className = 'undo-toast';
  toast.id = 'undo-toast-el';
  toast.innerHTML = `
    <div class="undo-toast-info">
      <div class="undo-toast-title">🗑️ ${title}</div>
      <div class="undo-toast-sub">${sub}</div>
    </div>
    <button class="btn-undo" onclick="_undoDeleteFromToast()">Deshacer</button>
    <div class="undo-toast-bar"><div class="undo-toast-bar-fill" id="undo-bar" style="width:100%"></div></div>
  `;
  document.body.appendChild(toast);

  // Barra que se vacía en 5 segundos
  requestAnimationFrame(() => {
    const bar = document.getElementById('undo-bar');
    if (bar) { bar.style.transitionDuration = '5000ms'; bar.style.width = '0%'; }
  });

  _undoTimer = setTimeout(() => {
    _dismissToast();
    _undoTxId = null;
  }, 5000);
}

function _undoDeleteFromToast() {
  if (_undoTxId !== null) _undoDelete(_undoTxId);
}

function _undoDelete(id) {
  if (_undoTimer) { clearTimeout(_undoTimer); _undoTimer = null; }
  const t = state.transactions.find(x => x.id === id);
  if (t) { t.deletedAt = null; save(); renderAll(); }
  _undoTxId = null;
  _dismissToast();
}

function _dismissToast() {
  const el = document.getElementById('undo-toast-el');
  if (!el) return;
  el.classList.add('hiding');
  setTimeout(() => el.remove(), 220);
}

// Alias para compatibilidad con código existente
function deleteTx(id) { softDeleteTx(id); }

function saveMeta(){const nombre=document.getElementById('meta-nombre').value,objetivo=parseFloat(document.getElementById('meta-objetivo').value);if(!nombre||!objetivo)return alert('Completa nombre y monto');state.goals.push({id:uid(),nombre,objetivo,actual:parseFloat(document.getElementById('meta-actual').value)||0});save();closeModal('modal-meta');renderAll();['meta-nombre','meta-objetivo','meta-actual'].forEach(id=>document.getElementById(id).value=id==='meta-actual'?'0':'')}
function openAbono(id){
  const g=state.goals.find(x=>String(x.id)===String(id));
  if(!g)return;
  document.getElementById('abono-meta-nombre').textContent='🎯 '+g.nombre;
  const pct=Math.min(100,(g.actual/g.objetivo)*100);
  const restante=Math.max(0,g.objetivo-g.actual);
  document.getElementById('abono-meta-progreso').innerHTML=
    `Progreso: <strong>${fL(g.actual)}</strong> de ${fL(g.objetivo)} (${pct.toFixed(0)}%) · Te falta <strong style="color:var(--amber)">${fL(restante)}</strong>`;
  document.getElementById('abono-meta-id').value=id;
  document.getElementById('abono-monto').value='';
  // Default: efectivo, pero si no hay saldo en efectivo y sí en ahorro, sugerir ahorro
  const sel=document.getElementById('abono-cuenta');
  const efSaldo=getCuentaBalance('efectivo');
  const ahSaldo=getCuentaBalance('ahorro');
  sel.value=(efSaldo<=0 && ahSaldo>0)?'ahorro':'efectivo';
  actualizarSaldoAbono();
  // Listener una sola vez
  if(!sel.dataset.bound){
    sel.addEventListener('change',actualizarSaldoAbono);
    sel.dataset.bound='1';
  }
  openModal('modal-abono');
}
function actualizarSaldoAbono(){
  const sel=document.getElementById('abono-cuenta');
  const info=document.getElementById('abono-saldo-info');
  if(!sel||!info)return;
  const cuenta=sel.value;
  const saldo=getCuentaBalance(cuenta);
  const nombre=cuenta==='efectivo'?'💵 Efectivo':'🏦 Cuenta de Ahorro';
  const color=saldo<=0?'var(--red)':(saldo<100?'var(--amber)':'var(--green)');
  info.innerHTML=`Saldo disponible en ${nombre}: <strong style="color:${color}">${fL(saldo)}</strong>`;
}
function saveAbono(){
  const id=document.getElementById('abono-meta-id').value;
  const monto=parseMonto(document.getElementById('abono-monto').value);
  const cuenta=document.getElementById('abono-cuenta')?.value||'efectivo';
  if(monto===null||monto<=0)return alert('⚠️ Monto inválido');
  const g=state.goals.find(x=>String(x.id)===String(id));
  if(!g)return alert('⚠️ Meta no encontrada');
  // Validar saldo disponible en la cuenta seleccionada
  const saldoCuenta=getCuentaBalance(cuenta);
  if(monto>saldoCuenta){
    const nomCuenta=cuenta==='efectivo'?'efectivo':'cuenta de ahorro';
    return alert(`⚠️ Saldo insuficiente en ${nomCuenta}.\n\nDisponible: ${fL(saldoCuenta)}\nQuieres abonar: ${fL(monto)}`);
  }
  // Aplicar abono a la meta
  g.actual+=monto;
  // Registrar como gasto de tipo "Ahorro" CON el campo cuenta para que getCuentaBalance lo descuente
  state.transactions.push({
    id:uid(),
    type:'expense',
    amount:monto,
    cat:'Ahorros',
    subcat:`Meta: ${g.nombre}`,
    pago:cuenta,
    cuenta:cuenta,
    tipo:'fijo',
    metaId:g.id,
    date:new Date().toISOString()
  });
  save();
  closeModal('modal-abono');
  renderAll();
  document.getElementById('abono-monto').value='';
  // Mensaje de confirmación simple (sin confeti)
  const pct=Math.min(100,(g.actual/g.objetivo)*100);
  if(pct>=100){
    setTimeout(()=>alert(`🎯 ¡Meta "${g.nombre}" completada!`),100);
  }
}
function deleteMeta(id){
  const g=state.goals.find(x=>String(x.id)===String(id));
  if(!g)return;
  const pct=((g.actual/g.objetivo)*100).toFixed(0);
  if(confirm(`¿Eliminar la meta "${g.nombre}"?\n\nProgreso actual: ${fL(g.actual)} de ${fL(g.objetivo)} (${pct}%)\n\nEsta acción no se puede deshacer. Los abonos ya registrados como transacciones permanecerán en tu historial.`)){
    state.goals=state.goals.filter(x=>String(x.id)!==String(id));
    save();renderAll();
  }
}

// FIX: Función global editarMeta (faltaba en la versión original)
function editarMeta(id) {
  const g = state.goals.find(x => String(x.id) === String(id));
  if (!g) return;
  
  let modal = document.getElementById('modal-editar-meta');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'modal-editar-meta';
    modal.className = 'modal';
    modal.onclick = e => { if (e.target === modal) modal.style.display = 'none'; };
    modal.innerHTML = `
      <div class="modal-content">
        <h3 style="margin-bottom:16px">✏️ Editar Meta</h3>
        <input type="text" id="edit-meta-nombre" class="input-field" placeholder="Nombre de la meta">
        <input type="number" id="edit-meta-objetivo" class="input-field" placeholder="Monto objetivo (L)" inputmode="decimal" step="0.01">
        <input type="number" id="edit-meta-actual" class="input-field" placeholder="Monto actual ahorrado (L)" inputmode="decimal" step="0.01">
        <input type="hidden" id="edit-meta-id">
        <div style="display:flex;gap:10px;margin-top:8px">
          <button class="btn btn-secondary" onclick="document.getElementById('modal-editar-meta').style.display='none'" style="flex:1">Cancelar</button>
          <button class="btn btn-primary" onclick="guardarEdicionMeta()" style="flex:2">💾 Guardar</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }
  
  document.getElementById('edit-meta-nombre').value = g.nombre;
  document.getElementById('edit-meta-objetivo').value = g.objetivo;
  document.getElementById('edit-meta-actual').value = g.actual;
  document.getElementById('edit-meta-id').value = g.id;
  modal.style.display = 'flex';
}

function guardarEdicionMeta() {
  const id = document.getElementById('edit-meta-id').value;
  const nombre = document.getElementById('edit-meta-nombre').value.trim();
  const objetivo = parseFloat(document.getElementById('edit-meta-objetivo').value);
  const actual = parseFloat(document.getElementById('edit-meta-actual').value) || 0;
  
  if (!nombre) { alert('⚠️ El nombre es obligatorio'); return; }
  if (!objetivo || objetivo <= 0) { alert('⚠️ El monto objetivo debe ser mayor a 0'); return; }
  if (actual < 0) { alert('⚠️ El monto actual no puede ser negativo'); return; }
  
  const g = state.goals.find(x => String(x.id) === String(id));
  if (!g) return;
  
  g.nombre = nombre;
  g.objetivo = objetivo;
  g.actual = actual;
  
  save();
  document.getElementById('modal-editar-meta').style.display = 'none';
  renderAll();
}
function renderDashboardGoals(){const container=document.getElementById('dashboard-goals');if(!container)return;container.innerHTML=state.goals.slice(0,3).map(g=>{const pct=Math.min(100,(g.actual/g.objetivo)*100);return `<div class="goal-mini"><div class="goal-mini-header"><span>${esc(g.nombre)}</span><span>${pct.toFixed(0)}%</span></div><div class="goal-mini-bar"><div class="goal-mini-progress" style="width:${pct}%"></div></div></div>`}).join('')}

// ========== COBRAR Y PAGAR (MEJORADO CON FLUJO DE CAJA) ==========
function saveCobrar(){const persona=document.getElementById('cobrar-persona').value.trim(),monto=parseFloat(document.getElementById('cobrar-monto').value),pagado=parseFloat(document.getElementById('cobrar-pagado').value)||0;if(!persona||!monto)return;state.receivables.push({id:uid(),persona,monto,pagado,fecha:document.getElementById('cobrar-fecha').value});save();closeModal('modal-cobrar');renderAll();}
function renderCobrar(){const c=document.getElementById('cobrar-list');if(!c)return;if(state.receivables.length===0){c.innerHTML=`<div class="empty-state-simple"><div class="es-icon">🤝</div><div class="es-title">Nadie te debe dinero</div><div class="es-sub">Registra aquí los préstamos que has hecho a otras personas para llevar el control.</div><button class="btn-empty-secondary" onclick="openModal('modal-cobrar')">➕ Registrar cobro pendiente</button></div>`;return;}c.innerHTML=state.receivables.map(r=>{
  const pendiente=r.monto-(r.pagado||0);
  return `<div class="card card-receivable">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div>
        <div style="font-weight:700;font-size:15px">${esc(r.persona)}</div>
        <div style="font-size:12px;color:var(--text2)">Total: ${fL(r.monto)} · Pagado: ${fL(r.pagado||0)}</div>
      </div>
      <div style="font-weight:800;font-size:16px;color:var(--amber)">${fL(pendiente)}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center">
      <button class="btn btn-primary" onclick=\"abonarCobrar('${esc(r.id)}')\"" style="min-height:40px;font-size:13px">Abonar</button>
      <button onclick=\"editarCobrar('${esc(r.id)}')\"" style="width:40px;height:40px;border-radius:10px;border:1.5px solid rgba(245,200,0,.4);background:rgba(245,200,0,.1);cursor:pointer;display:flex;align-items:center;justify-content:center">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F5C800" stroke-width="2.2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button onclick=\"eliminarCobrar('${esc(r.id)}')\"" style="width:40px;height:40px;border-radius:10px;border:1.5px solid rgba(255,68,68,.4);background:rgba(255,68,68,.1);cursor:pointer;display:flex;align-items:center;justify-content:center">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF4444" stroke-width="2.2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>
    </div>
  </div>`;}).join('')}
function renderPagar(){const c=document.getElementById('pagar-list');if(!c)return;if(state.payables.length===0){c.innerHTML=`<div class="empty-state-simple"><div class="es-icon">✅</div><div class="es-title">Sin deudas personales</div><div class="es-sub">Cuando debas dinero a alguien (no a un banco), regístralo aquí para no olvidarlo.</div><button class="btn-empty-secondary" onclick="openModal('modal-pagar')">➕ Registrar deuda personal</button></div>`;return;}c.innerHTML=state.payables.map(p=>{
  const pendiente=p.monto-(p.pagado||0);
  return `<div class="card card-debt">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <div>
        <div style="font-weight:700;font-size:15px">${esc(p.creditor)}</div>
        <div style="font-size:12px;color:var(--text2)">Total: ${fL(p.monto)} · Pagado: ${fL(p.pagado||0)}</div>
      </div>
      <div style="font-weight:800;font-size:16px;color:var(--red)">${fL(pendiente)}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center">
      <button class="btn btn-secondary" onclick=\"abonarPagar('${esc(p.id)}')\"" style="min-height:40px;font-size:13px">Abonar</button>
      <button onclick=\"editarPagar('${esc(p.id)}')\"" style="width:40px;height:40px;border-radius:10px;border:1.5px solid rgba(245,200,0,.4);background:rgba(245,200,0,.1);cursor:pointer;display:flex;align-items:center;justify-content:center">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F5C800" stroke-width="2.2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button onclick=\"eliminarPagar('${esc(p.id)}')\"" style="width:40px;height:40px;border-radius:10px;border:1.5px solid rgba(255,68,68,.4);background:rgba(255,68,68,.1);cursor:pointer;display:flex;align-items:center;justify-content:center">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF4444" stroke-width="2.2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>
    </div>
  </div>`;}).join('')}
function abonarCobrar(id){
  const r=state.receivables.find(x=>x.id===id);
  if(!r)return;
  const pendiente=r.monto-(r.pagado||0);
  if(pendiente<=0)return alert('Este cobro ya está saldado ✅');
  const m=parseFloat(prompt(`¿Cuánto te pagó ${esc(r.persona)}?\nPendiente: ${fL(pendiente)}`));
  if(!m||m<=0)return;
  const abono=Math.min(m,pendiente);
  r.pagado=(r.pagado||0)+abono;
  if(!state.cuentas)state.cuentas={efectivo:0,ahorro:0};
  state.cuentas.efectivo=(state.cuentas.efectivo||0)+abono;
  state.transactions.push({id:uid(),type:'income',amount:abono,cat:'Cobro Deuda',subcat:`Cobro a ${esc(r.persona)}`,cuenta:'efectivo',date:new Date().toISOString()});
  if(r.pagado>=r.monto){if(confirm(`✅ Cobro saldado. ¿Eliminar el registro de "${esc(r.persona)}"?`)){state.receivables=state.receivables.filter(x=>x.id!==id);}}
  save();renderAll();
}

function savePagar(){const creditor=document.getElementById('pagar-creditor').value.trim(),monto=parseFloat(document.getElementById('pagar-monto').value),pagado=parseFloat(document.getElementById('pagar-pagado').value)||0;if(!creditor||!monto)return;state.payables.push({id:uid(),creditor,monto,pagado,fecha:document.getElementById('pagar-fecha').value});save();closeModal('modal-pagar');renderAll();}
function abonarPagar(id){
  const p=state.payables.find(x=>x.id===id);
  if(!p)return;
  const pendiente=p.monto-(p.pagado||0);
  if(pendiente<=0)return alert('Esta deuda ya está saldada ✅');
  const m=parseFloat(prompt(`¿Cuánto le pagas a ${esc(p.creditor)}?\nPendiente: ${fL(pendiente)}`));
  if(!m||m<=0)return;
  const abono=Math.min(m,pendiente);
  p.pagado=(p.pagado||0)+abono;
  if(!state.cuentas)state.cuentas={efectivo:0,ahorro:0};
  state.cuentas.efectivo=Math.max(0,(state.cuentas.efectivo||0)-abono);
  state.transactions.push({id:uid(),type:'expense',amount:abono,cat:'Pago Deuda',subcat:`Pago a ${esc(p.creditor)}`,cuenta:'efectivo',tipo:'fijo',date:new Date().toISOString()});
  if(p.pagado>=p.monto){if(confirm(`✅ Deuda con "${esc(p.creditor)}" saldada. ¿Eliminar el registro?`)){state.payables=state.payables.filter(x=>x.id!==id);}}
  save();renderAll();
}

// ========== PRÉSTAMOS ==========
function savePrestamo(){const entidad=document.getElementById('prest-entidad').value,monto=parseFloat(document.getElementById('prest-monto').value);state.prestamos.push({id:uid(),entidad,monto,cuota:calculateLoan(),cuotasPagadas:0,cuotasTotal:parseInt(document.getElementById('prest-cuotas').value)});save();closeModal('modal-prestamo');renderAll();}
function renderPrestamos(){
    const c=document.getElementById('prestamos-list');if(!c)return;
    if(state.prestamos.length===0){c.innerHTML=`<div class="empty-state-simple"><div class="es-icon">🏦</div><div class="es-title">Sin préstamos registrados</div><div class="es-sub">Agrega tus préstamos bancarios para llevar control de cuotas, intereses y saldo.</div><button class="btn-empty-secondary" onclick="openModal('modal-prestamo')">➕ Agregar préstamo</button></div>`;return;}
    let totalPrestado=0;
    c.innerHTML=state.prestamos.map(p=>{
        totalPrestado+=p.monto;
        const cuotasPagadas=p.cuotasPagadas||0,progreso=(cuotasPagadas/p.cuotasTotal)*100,restante=p.monto-(p.cuota*cuotasPagadas);
        return `<div class="card card-debt"><div class="debt-header"><div><div class="debt-title">${esc(p.entidad)}</div><div class="debt-meta">Cuota mensual: ${fL(p.cuota)}</div></div><div class="interest-badge">${p.cuotasPagadas||0}/${p.cuotasTotal} pagadas</div></div><div class="debt-progress"><div class="debt-progress-bar" style="width: ${progreso}%; background: var(--blue);"></div></div><div class="debt-stats"><div class="debt-stat"><span>Total Préstamo</span><strong>${fL(p.monto)}</strong></div><div class="debt-stat"><span>Saldo Aprox.</span><strong>${fL(restante)}</strong></div></div><div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;margin-top:10px">
  <button class="btn btn-secondary" onclick=\"pagarCuotaPrestamo('${esc(p.id)}')\"" style="font-size:13px">Registrar Pago (${fL(p.cuota)})</button>
  <button onclick=\"editarPrestamo('${esc(p.id)}')\"" style="width:40px;height:40px;border-radius:10px;border:1.5px solid rgba(245,200,0,.4);background:rgba(245,200,0,.1);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F5C800" stroke-width="2.2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
  </button>
  <button onclick=\"eliminarPrestamo('${esc(p.id)}')\"" style="width:40px;height:40px;border-radius:10px;border:1.5px solid rgba(255,68,68,.4);background:rgba(255,68,68,.1);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF4444" stroke-width="2.2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
  </button>
</div></div>`;
    }).join('');
    document.getElementById('total-prestamos').textContent=fL(totalPrestado);
}
function pagarCuotaPrestamo(id){
  const prestamo=state.prestamos.find(p=>p.id===id);
  if(!prestamo)return;
  if((prestamo.cuotasPagadas||0)>=(prestamo.cuotasTotal||99))return alert('🎉 ¡Felicidades! Ya terminaste de pagar este préstamo.');
  const cuentaOpc=confirm(`¿Pagar cuota de ${fL(prestamo.cuota)}?\n\n[Aceptar] = desde Cuenta de Ahorro\n[Cancelar] = desde Efectivo`);
  const cuenta=cuentaOpc?'ahorro':'efectivo';
  prestamo.cuotasPagadas=(prestamo.cuotasPagadas||0)+1;
  if(!state.cuentas)state.cuentas={efectivo:0,ahorro:0};
  if(cuenta==='ahorro')state.cuentas.ahorro=Math.max(0,(state.cuentas.ahorro||0)-prestamo.cuota);
  else state.cuentas.efectivo=Math.max(0,(state.cuentas.efectivo||0)-prestamo.cuota);
  state.transactions.push({id:uid(),type:'expense',amount:prestamo.cuota,cat:'Préstamo',subcat:`Cuota ${prestamo.entidad}`,cuenta,tipo:'fijo',date:new Date().toISOString()});
  const restantes=(prestamo.cuotasTotal||0)-(prestamo.cuotasPagadas||0);
  const msg=restantes<=0?`🎉 ¡Préstamo con ${prestamo.entidad} pagado completamente!`:`✅ Cuota registrada. Quedan ${restantes} cuotas.`;
  save();renderAll();alert(msg);
}

// ========== TARJETAS (MEJORADO) ==========
function saveTarjeta(){
    const nombre=document.getElementById('tc-nombre').value.trim(),corte=parseInt(document.getElementById('tc-corte').value)||1,pago=parseInt(document.getElementById('tc-pago').value)||15,limite=parseFloat(document.getElementById('tc-limite').value)||0,saldo=parseFloat(document.getElementById('tc-saldo').value)||0,tasa=parseFloat(document.getElementById('tc-tasa').value)||48,calcMinimo=document.getElementById('tc-calcular-minimo').checked;
    if(!nombre)return alert('Nombre requerido');
    state.tarjetas.push({id:uid(),nombre,corte,pago,limite,saldo,tasaInteres:tasa,calcularMinimo:calcMinimo,historialPagos:[]});
    save();closeModal('modal-tarjeta');renderAll();limpiarFormTarjeta();
}
function limpiarFormTarjeta(){['tc-nombre','tc-corte','tc-pago','tc-limite','tc-saldo','tc-tasa'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=''});document.getElementById('tc-calcular-minimo').checked=true;}
function renderTarjetas(){
    const container=document.getElementById('tarjetas-list'),resumenContainer=document.getElementById('resumen-pagos-minimos');if(!container)return;
    if(state.tarjetas.length===0){container.innerHTML=`<div class="empty-state-simple"><div class="es-icon">💳</div><div class="es-title">Sin tarjetas registradas</div><div class="es-sub">Agrega tus tarjetas de crédito para monitorear saldos, fechas de corte y pagos mínimos.</div><button class="btn-empty-secondary" onclick="openModal('modal-tarjeta')">➕ Agregar tarjeta</button></div>`;return;}
    let totalDeuda=0,totalPagoMinimo=0;
    container.innerHTML=state.tarjetas.map(t=>{
        totalDeuda+=t.saldo;
        const pagoMinimo=t.calcularMinimo?Math.max(t.saldo*0.05,100):0,interesMensual=t.saldo*(t.tasaInteres/100/12);totalPagoMinimo+=pagoMinimo;
        const hoy=new Date().getDate();let estadoCorte='';if(hoy>=t.corte&&hoy<=t.pago)estadoCorte='🟡 En periodo de pago';else if(hoy>t.pago)estadoCorte='🔴 Pago vencido';
        return `<div class="card card-credit"><div style="display: flex; justify-content: space-between; align-items: start;"><div><div style="font-weight:700; font-size:16px;">${esc(t.nombre)}</div><div style="font-size:11px; color: var(--text2);">📅 Corte: día ${t.corte} | 📅 Pago: día ${t.pago} <span style="color: ${hoy>t.pago?'var(--red)':'var(--green)'}">${estadoCorte}</span></div></div><div style="text-align: right;"><div style="font-weight: 700; color: var(--red);">${fL(t.saldo)}</div><div style="font-size: 10px;">Límite: ${fL(t.limite)}</div></div></div><div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 15px 0; background: var(--bg3); padding: 10px; border-radius: 8px;"><div><span style="font-size: 10px; color: var(--text2);">💸 Interés Est. (${t.tasaInteres}%):</span><span style="display: block; font-weight: 600; color: var(--red);">${fL(interesMensual)} / mes</span></div><div><span style="font-size: 10px; color: var(--text2);">⚠️ Pago Mínimo:</span><span style="display: block; font-weight: 600;">${fL(pagoMinimo)}</span></div></div><div class="debt-actions"><button class="btn btn-primary" style="padding: 8px;" onclick=\"pagarTarjeta('${esc(t.id)}')\"">💳 Registrar Pago</button><button class="btn btn-secondary" style="padding: 8px;" onclick=\"ajustarSaldoTarjeta('${esc(t.id)}')\"">✏️ Ajustar</button><button class="btn btn-danger" style="padding: 8px;" onclick=\"deleteTarjeta('${esc(t.id)}')\"">🗑️</button></div></div>`;
    }).join('');
    document.getElementById('total-deuda-tc').textContent=fL(totalDeuda);
    if(resumenContainer){
        if(totalPagoMinimo>0){resumenContainer.innerHTML=`<div class="alert-card" style="border-left-color: var(--amber);"><div class="alert-icon">💳</div><div class="alert-content"><div class="alert-title">Pago Mínimo Total Recomendado</div><div class="alert-detail">Para mantener tus tarjetas al día, considera pagar al menos <strong>${fL(totalPagoMinimo)}</strong> este mes.</div></div></div>`;}
        else{resumenContainer.innerHTML='<p style="font-size:12px; color:var(--text2); text-align:center;">Sin saldos en tarjetas de crédito.</p>';}
    }
}
function pagarTarjeta(id){
    const tarjeta=state.tarjetas.find(t=>t.id===id);if(!tarjeta)return;
    const pagoMinimo=tarjeta.calcularMinimo?Math.max(tarjeta.saldo*0.05,100):0;
    const montoStr=prompt(`Ingresa el monto a abonar a ${esc(tarjeta.nombre)}\nSaldo actual: ${fL(tarjeta.saldo)}\nPago mínimo sugerido: ${fL(pagoMinimo)}`,pagoMinimo.toFixed(2));
    if(!montoStr)return;const monto=parseFloat(montoStr);if(isNaN(monto)||monto<=0)return alert('Monto inválido');
    if(monto>tarjeta.saldo){if(!confirm(`Estás pagando ${fL(monto)} pero solo debes ${fL(tarjeta.saldo)}. ¿Deseas dejar la tarjeta con saldo a favor?`))return;}
    tarjeta.saldo=Math.max(0,tarjeta.saldo-monto);
    state.transactions.push({id:uid(),type:'expense',amount:monto,cat:'Pago Tarjeta',subcat:`Pago a ${esc(tarjeta.nombre)}`,pago:'efectivo',tipo:'fijo',date:new Date().toISOString(),notas:`Abono a tarjeta ${esc(tarjeta.nombre)}`});
    save();renderAll();alert(`✅ Pago de ${fL(monto)} registrado.\nNuevo saldo de tarjeta: ${fL(tarjeta.saldo)}`);
}
function ajustarSaldoTarjeta(id){const tarjeta=state.tarjetas.find(t=>t.id===id);if(!tarjeta)return;const nuevoSaldo=parseFloat(prompt(`Saldo actual: ${fL(tarjeta.saldo)}\nNuevo saldo:`));if(!isNaN(nuevoSaldo)){tarjeta.saldo=nuevoSaldo;save();renderAll();}}
function deleteTarjeta(id){if(confirm('¿Eliminar esta tarjeta? Se perderá el registro.')){state.tarjetas=state.tarjetas.filter(t=>t.id!==id);save();renderAll();}}

// ========== PAGOS RECURRENTES ==========
function savePagoRecurrente(){const servicio=document.getElementById('pago-servicio').value,monto=parseFloat(document.getElementById('pago-monto').value),dia=parseInt(document.getElementById('pago-dia').value);state.pagosRecurrentes.push({id:uid(),servicio,monto,dia,pagado:0});save();closeModal('modal-pago-recurrente');renderAll();}

// ── EDITAR / ELIMINAR COBRAR (dinero que me deben) ──────────
function editarCobrar(id){
  const r=state.receivables.find(x=>x.id===id);if(!r)return;
  const nuevo=prompt(`Editar nombre de "${esc(r.persona)}":`,r.persona);
  if(nuevo===null)return;
  const monto=parseFloat(prompt('Monto total:',r.monto));
  if(isNaN(monto)||monto<=0)return;
  r.persona=nuevo.trim()||r.persona;
  r.monto=monto;
  save();renderAll();
}
function eliminarCobrar(id){
  const r=state.receivables.find(x=>x.id===id);if(!r)return;
  const pendR=fL(r.monto-(r.pagado||0));if(!confirm(`¿Eliminar cobro de "${esc(r.persona)}"?\nPendiente: ${pendR}`))return;
  state.receivables=state.receivables.filter(x=>x.id!==id);
  save();renderAll();
}

// ── EDITAR / ELIMINAR PAGAR (dinero que debo) ────────────────
function editarPagar(id){
  const p=state.payables.find(x=>x.id===id);if(!p)return;
  const nuevo=prompt(`Editar acreedor "${esc(p.creditor)}":`,p.creditor);
  if(nuevo===null)return;
  const monto=parseFloat(prompt('Monto total:',p.monto));
  if(isNaN(monto)||monto<=0)return;
  p.creditor=nuevo.trim()||p.creditor;
  p.monto=monto;
  save();renderAll();
}
function eliminarPagar(id){
  const p=state.payables.find(x=>x.id===id);if(!p)return;
  if(!confirm(`¿Eliminar deuda con "${esc(p.creditor)}"?`))return;
  state.payables=state.payables.filter(x=>x.id!==id);
  save();renderAll();
}

// ── EDITAR / ELIMINAR PRÉSTAMOS ──────────────────────────────
function editarPrestamo(id){
  const p=state.prestamos.find(x=>x.id===id);if(!p)return;
  const entidad=prompt('Entidad bancaria:',p.entidad);
  if(entidad===null)return;
  const cuota=parseFloat(prompt('Cuota mensual (L):',p.cuota));
  if(isNaN(cuota)||cuota<=0)return;
  p.entidad=entidad.trim()||p.entidad;
  p.cuota=cuota;
  save();renderAll();
}
function eliminarPrestamo(id){
  const p=state.prestamos.find(x=>x.id===id);if(!p)return;
  if(!confirm(`¿Eliminar préstamo de "${esc(p.entidad)}"?\n\nSe eliminará el registro pero NO se agregarán transacciones de cancelación.`))return;
  state.prestamos=state.prestamos.filter(x=>x.id!==id);
  save();renderAll();
}

// ── EDITAR / ELIMINAR PAGOS RECURRENTES ──────────────────────
function editarRecurrente(id){
  const p=state.pagosRecurrentes.find(x=>x.id===id);if(!p)return;
  const servicio=prompt('Nombre del servicio:',p.servicio);
  if(servicio===null)return;
  const dia=parseInt(prompt('Día de pago (1-31):',p.dia));
  if(isNaN(dia)||dia<1||dia>31)return;
  const monto=parseFloat(prompt('Monto estimado (L):',p.monto||0));
  p.servicio=servicio.trim()||p.servicio;
  p.dia=dia;
  if(!isNaN(monto))p.monto=monto;
  save();renderAll();
}
function eliminarRecurrente(id){
  const p=state.pagosRecurrentes.find(x=>x.id===id);if(!p)return;
  if(!confirm(`¿Eliminar "${esc(p.servicio)}"?`))return;
  state.pagosRecurrentes=state.pagosRecurrentes.filter(x=>x.id!==id);
  save();renderAll();
}

// ══════════════════════════════════════════════════════════════
// SISTEMA DE NOTIFICACIONES — real con Notification API
// ══════════════════════════════════════════════════════════════
async function solicitarPermisosNotificacion(){
  if(!('Notification' in window)){
    alert('Tu navegador no soporta notificaciones. Instala la app en tu pantalla de inicio para activarlas.');
    return false;
  }
  if(Notification.permission==='granted') return true;
  if(Notification.permission==='denied'){
    alert('Las notificaciones están bloqueadas.\nVe a Ajustes del navegador y permite las notificaciones para esta app.');
    return false;
  }
  const perm=await Notification.requestPermission();
  return perm==='granted';
}

function enviarNotificacion(titulo, cuerpo, icono){
  if(Notification.permission!=='granted')return;
  try{
    // Si hay service worker activo, usar SW notification (funciona en background)
    if('serviceWorker' in navigator && navigator.serviceWorker.controller){
      navigator.serviceWorker.ready.then(reg=>{
        reg.showNotification(titulo,{
          body: cuerpo,
          icon: './icon-192.png',
          badge: './icon-192.png',
          vibrate: [200,100,200],
          tag: 'mipistohn-alerta',
          renotify: true,
          data:{ url: window.location.href }
        });
      }).catch(()=>{
        new Notification(titulo,{body:cuerpo,icon:'./icon-192.png'});
      });
    } else {
      new Notification(titulo,{body:cuerpo,icon:'./icon-192.png'});
    }
  }catch(e){console.warn('Notif error:',e);}
}

function checkNotificacionesPagos(){
  // Solo ejecutar si hay permisos
  if(Notification.permission!=='granted') return;
  
  const hoy=new Date();
  const diaHoy=hoy.getDate();
  const alertasEnviadas=JSON.parse(localStorage.getItem('alertas_enviadas')||'{}');
  const claveHoy=`${hoy.getFullYear()}-${hoy.getMonth()+1}-${diaHoy}`;
  
  // Revisar pagos recurrentes
  (state.pagosRecurrentes||[]).forEach(p=>{
    const diasRestantes=p.dia>=diaHoy?p.dia-diaHoy:31-diaHoy+p.dia;
    const clave=`rec_${p.id}_${claveHoy}`;
    if(!alertasEnviadas[clave]){
      if(diasRestantes===0){
        enviarNotificacion('💳 ¡Pago vence HOY!',`${esc(p.servicio)} - Día ${p.dia}${p.monto?' (L. '+p.monto+')':''}`,null);
        alertasEnviadas[clave]=true;
      } else if(diasRestantes<=3){
        enviarNotificacion(`⏰ Pago en ${diasRestantes} día${diasRestantes>1?'s':''}`,`${esc(p.servicio)} vence el día ${p.dia}${p.monto?' - L. '+p.monto:''}`,null);
        alertasEnviadas[clave]=true;
      }
    }
  });
  
  // Revisar tarjetas de crédito
  (state.tarjetas||[]).forEach(t=>{
    const diasPago=t.pago>=diaHoy?t.pago-diaHoy:31-diaHoy+t.pago;
    const clave=`tc_${t.id}_${claveHoy}`;
    if(!alertasEnviadas[clave]&&diasPago<=3){
      const pagoMin=Math.max(t.saldo*0.05,100);
      enviarNotificacion(`💳 TC ${esc(t.nombre)} — ${diasPago===0?'¡VENCE HOY!':diasPago+'d restantes'}`,`Saldo: L. ${t.saldo.toLocaleString('es-HN',{minimumFractionDigits:2})} · Pago mín: L. ${pagoMin.toFixed(2)}`,null);
      alertasEnviadas[clave]=true;
    }
  });
  
  // Revisar préstamos (cuotas próximas)
  (state.prestamos||[]).forEach(p=>{
    // Asumimos que la cuota se paga el día 1 de cada mes como estándar
    const diasProxCuota=diaHoy<=5?0:31-diaHoy+1;
    const clave=`prest_${p.id}_${claveHoy}`;
    if(!alertasEnviadas[clave]&&diasProxCuota<=3&&(p.cuotasPagadas||0)<(p.cuotasTotal||99)){
      enviarNotificacion(`🏦 Cuota próxima: ${esc(p.entidad)}`,`L. ${p.cuota.toLocaleString('es-HN',{minimumFractionDigits:2})} · ${p.cuotasPagadas||0}/${p.cuotasTotal} pagadas`,null);
      alertasEnviadas[clave]=true;
    }
  });
  
  localStorage.setItem('alertas_enviadas',JSON.stringify(alertasEnviadas));
}

async function activarNotificacionesPagos(){
  const ok=await solicitarPermisosNotificacion();
  if(ok){
    localStorage.setItem('notif_activas','true');
    checkNotificacionesPagos();
    // Notificación de confirmación
    setTimeout(()=>{
      enviarNotificacion('✅ Mi Pisto HN — Alertas activas','Recibirás notificaciones antes del vencimiento de tus pagos.',null);
    },500);
    return true;
  }
  return false;
}
function renderPagosRecurrentes(){const c=document.getElementById('pagos-list');if(!c)return;if(state.pagosRecurrentes.length===0){c.innerHTML=`<div class="empty-state-simple"><div class="es-icon">🔔</div><div class="es-title">Sin pagos recurrentes</div><div class="es-sub">Registra tus servicios fijos (agua, luz, internet) y recibe alertas antes de su vencimiento.</div><button class="btn-empty-secondary" onclick="openModal('modal-pago-recurrente')">➕ Agregar servicio</button></div>`;return;}c.innerHTML=state.pagosRecurrentes.map(p=>{
  const hoy=new Date().getDate();
  const diasParaPago=p.dia>=hoy?p.dia-hoy:31-hoy+p.dia;
  const urgente=diasParaPago<=3;
  return `<div class="card card-credit" style="border-left:3px solid ${urgente?'var(--red)':'var(--green)'}">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
      <div style="font-weight:700;font-size:15px">${esc(p.servicio)}</div>
      <span style="font-size:11px;font-weight:700;padding:3px 9px;border-radius:20px;background:${urgente?'rgba(255,68,68,.15)':'rgba(76,175,80,.15)'};color:${urgente?'var(--red)':'var(--green)'}">Día ${p.dia}</span>
    </div>
    <div style="font-size:12px;color:var(--text2);margin-bottom:10px">
      ${p.monto?'L. '+p.monto.toLocaleString('es-HN',{minimumFractionDigits:2}):'Sin monto'} · 
      ${diasParaPago===0?'<span style="color:var(--red);font-weight:700">¡Hoy vence!</span>':diasParaPago===1?'<span style="color:var(--amber);font-weight:700">Vence mañana</span>':`En ${diasParaPago} días`}
    </div>
    <div style="display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center">
      <button class="btn btn-primary" onclick=\"marcarPagoRecurrente('${esc(p.id)}')\"" style="min-height:40px;font-size:13px">✓ Pagado</button>
      <button onclick=\"editarRecurrente('${esc(p.id)}')\"" style="width:40px;height:40px;border-radius:10px;border:1.5px solid rgba(245,200,0,.4);background:rgba(245,200,0,.1);cursor:pointer;display:flex;align-items:center;justify-content:center">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F5C800" stroke-width="2.2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
      </button>
      <button onclick=\"eliminarRecurrente('${esc(p.id)}')\"" style="width:40px;height:40px;border-radius:10px;border:1.5px solid rgba(255,68,68,.4);background:rgba(255,68,68,.1);cursor:pointer;display:flex;align-items:center;justify-content:center">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FF4444" stroke-width="2.2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
      </button>
    </div>
  </div>`;}).join('')}
function marcarPagoRecurrente(id){const p=state.pagosRecurrentes.find(x=>x.id===id);if(p){p.pagado+=p.monto;save();renderAll()}}

// ========== CONCILIACIÓN v2 — ASIENTO COMPENSATORIO (Opción 3) ==========
function previewConciliacion(){
  // P0-4: leer saldo derivado en lugar de snapshot estático
  const cuentaSel=document.getElementById('reconcile-cuenta')?.value||'efectivo';
  const saldoActual=getCuentaBalance(cuentaSel);
  const currentEl=document.getElementById('reconcile-current');
  if(currentEl)currentEl.textContent=fL(saldoActual);
  const realInput=parseFloat(document.getElementById('reconcile-balance')?.value);
  const preview=document.getElementById('reconcile-diff-preview');
  const notaWrap=document.getElementById('reconcile-nota-wrap');
  if(!preview)return;
  if(isNaN(realInput)){preview.innerHTML='';if(notaWrap)notaWrap.style.display='none';return;}
  const diff=realInput-saldoActual;
  if(Math.abs(diff)<0.01){
    preview.innerHTML=`<span style="color:var(--green)">✅ Saldo exacto — no se necesita ajuste</span>`;
    if(notaWrap)notaWrap.style.display='none';
  } else {
    const tipo=diff>0?'Ingreso':'Gasto';
    const color=diff>0?'var(--green)':'var(--red)';
    const etiqueta=diff>0?'↑ Ajuste positivo (ingreso no registrado)':'↓ Ajuste negativo (gasto no registrado)';
    preview.innerHTML=`<div style="color:${color};font-size:12px;font-weight:700">${etiqueta}</div><div style="font-size:13px;margin-top:4px">Diferencia: <strong style="color:${color}">${diff>0?'+':''}${fL(diff)}</strong></div>`;
    if(notaWrap)notaWrap.style.display='block';
  }
}

function reconcileBalance(){
  // P0-4: leer saldo derivado, no mutamos state.cuentas
  const cuentaSel=document.getElementById('reconcile-cuenta')?.value||'efectivo';
  const cuentaNombre=cuentaSel==='ahorro'?'Cuenta de Ahorro':'Efectivo';
  const saldoActual=getCuentaBalance(cuentaSel);
  const saldoReal=parseFloat(document.getElementById('reconcile-balance')?.value);
  if(isNaN(saldoReal))return alert('Ingresa el saldo real de tu '+cuentaNombre);
  const diff=saldoReal-saldoActual;
  if(Math.abs(diff)<0.01)return alert('✅ El saldo ya está correcto. No se necesita ajuste.');
  const nota=document.getElementById('reconcile-nota')?.value||`Conciliación ${cuentaNombre} — ajuste automático`;
  if(!confirm(`¿Confirmar ajuste de ${cuentaNombre}?\n\nSaldo registrado: ${fL(saldoActual)}\nSaldo real: ${fL(saldoReal)}\nDiferencia: ${fL(diff)}\n\nSe creará un asiento de ${diff>0?'ingreso':'gasto'} por esta diferencia.`))return;
  // Crear transacción de conciliación
  state.transactions.push({
    id:uid(),
    type:diff>0?'income':'expense',
    amount:Math.abs(diff),
    cat:'Conciliación',
    subcat:`Ajuste ${cuentaNombre}`,
    cuenta:cuentaSel,
    nota,
    tipo:'fijo',
    date:new Date().toISOString(),
    esConciliacion:true
  });
  // P0-4: ya NO mutamos state.cuentas — el balance se recalcula desde transactions tras añadir el asiento
  save();renderAll();
  document.getElementById('reconcile-balance').value='';
  document.getElementById('reconcile-diff-preview').innerHTML='';
  if(document.getElementById('reconcile-nota'))document.getElementById('reconcile-nota').value='';
  if(document.getElementById('reconcile-nota-wrap'))document.getElementById('reconcile-nota-wrap').style.display='none';
  alert(`✅ Conciliación completada.\n${cuentaNombre}: ${fL(saldoReal)}`);
}

function renderGastos(){
    // P0-2: ocultar transferencias internas y conciliaciones del listado y del KPI
    const gastos = state.transactions.filter(t => t.type === 'expense' && !t.deletedAt && !t.esTransferencia && !t.esConciliacion);
    const total = gastos.reduce((a,b) => a + b.amount, 0);
    document.getElementById('gastos-mes').textContent = fL(total);
    const container = document.getElementById('gastos-list');
    if (!container) return;
    if (gastos.length === 0) {
        container.innerHTML = `<div class="empty-state-simple">
          <div class="es-icon">📭</div>
          <div class="es-title">Sin gastos registrados</div>
          <div class="es-sub">Registra tu primer gasto tocando el botón ➕ o escaneando un recibo.</div>
          <button class="btn-empty-secondary" onclick="openModal('modal-gasto')">📝 Registrar gasto</button>
        </div>`; return; }
    container.innerHTML = gastos.slice().reverse().map(t => {
        const tieneFactura = t.facturaImagenId || t.facturaImagen; // P0-2: IDB o legacy
        const etiqPill = t.etiqueta ? `<span class="etiqueta-pill">#${esc(t.etiqueta)}</span>` : '';
        const concBadge = t.esConciliacion ? `<span class="badge-conciliacion">⚖️</span> ` : '';
        return `<div class="card" style="padding:14px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
                <div style="flex:1;min-width:0">
                    <div style="font-weight:700;font-size:14px">${concBadge}${esc(t.cat)}${tieneFactura?' 🧾':''}</div>
                    <div style="font-size:11px;color:var(--text2);margin-top:2px">${esc(t.subcat||'')} ${t.banco?'· '+t.banco:''}</div>
                    <div style="font-size:11px;color:var(--text2)">${new Date(t.date).toLocaleDateString('es-HN')}</div>
                    ${etiqPill}
                </div>
                ${renderMontoTx(t, '-', 'var(--red)')}
            </div>
            <div class="tx-actions" style="${tieneFactura?'grid-template-columns:1fr 1fr 1fr':'grid-template-columns:1fr 1fr'}">
                <button class="btn-tx-edit" onclick=\"abrirEdicionTx('${esc(t.id)}')\"">✏️ Editar</button>
                ${tieneFactura?`<button class="btn-tx-edit" style="background:rgba(245,200,0,.15);color:var(--amber);border:1px solid rgba(245,200,0,.3)" onclick=\"verFactura('${esc(t.id)}')\"">🧾 Factura</button>`:''}
                <button class="btn-tx-delete" onclick=\"softDeleteTx('${esc(t.id)}')\"">🗑️ Eliminar</button>
            </div>
        </div>`;
    }).join('');
}

function renderIngresos(){
    // P0-2: ocultar transferencias internas y conciliaciones
    const ingresos = state.transactions.filter(t => t.type === 'income' && !t.deletedAt && !t.esTransferencia && !t.esConciliacion);
    document.getElementById('ingreso-salario').textContent = fL(ingresos.reduce((a,b)=>a+b.amount,0));
    const container = document.getElementById('ingresos-list');
    if (!container) return;
    if (ingresos.length === 0) {
        container.innerHTML = `<div class="empty-state-simple">
          <div class="es-icon">💵</div>
          <div class="es-title">Sin ingresos registrados</div>
          <div class="es-sub">Registra tu salario u otro ingreso tocando el botón ➕.</div>
          <button class="btn-empty-secondary" onclick="openModal('modal-ingreso')">💰 Registrar ingreso</button>
        </div>`; return; }
    container.innerHTML = ingresos.slice().reverse().map(t => `
        <div class="card" style="padding:14px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start">
                <div>
                    <div style="font-weight:700;font-size:14px">${esc(t.cat)}</div>
                    <div style="font-size:11px;color:var(--text2)">${new Date(t.date).toLocaleDateString('es-HN')}</div>
                </div>
                ${renderMontoTx(t, '+', 'var(--green)')}
            </div>
            <div class="tx-actions">
                <button class="btn-tx-edit" onclick=\"abrirEdicionTx('${esc(t.id)}')\"">✏️ Editar</button>
                <button class="btn-tx-delete" onclick=\"softDeleteTx('${esc(t.id)}')\"">🗑️ Eliminar</button>
            </div>
        </div>`).join('');
}

function renderDashboard(){
    // P0-2: KPIs reales — excluyen transferencias internas Y conciliaciones (no son ingresos/gastos genuinos del mes)
    const realTx=state.transactions.filter(t=>!t.deletedAt && !t.esTransferencia && !t.esConciliacion);
    const income=realTx.filter(t=>t.type==='income').reduce((a,b)=>a+b.amount,0);
    const expense=realTx.filter(t=>t.type==='expense').reduce((a,b)=>a+b.amount,0);
    const extra=realTx.filter(t=>t.type==='expense'&&t.tipo==='extra').reduce((a,b)=>a+b.amount,0);
    // Balance global SÍ incluye conciliaciones (ajustes legítimos), pero NO transferencias (son neutras)
    const balanceTx=state.transactions.filter(t=>!t.deletedAt && !t.esTransferencia);
    const balanceIncome=balanceTx.filter(t=>t.type==='income').reduce((a,b)=>a+b.amount,0);
    const balanceExpense=balanceTx.filter(t=>t.type==='expense').reduce((a,b)=>a+b.amount,0);
    const balance=state.saldoInicial+balanceIncome-balanceExpense;
    
    document.getElementById('balance-amount').textContent=fL(balance);
    document.getElementById('balance-amount').style.color=balance>=0?'var(--green)':'var(--red)';
    // P0-4: saldos por cuenta DERIVADOS desde transactions (sin snapshot estático)
    const efEl=document.getElementById('cuenta-efectivo-val');
    const ahEl=document.getElementById('cuenta-ahorro-val');
    if(efEl)efEl.textContent=fL(getCuentaBalance('efectivo'));
    if(ahEl)ahEl.textContent=fL(getCuentaBalance('ahorro'));
    document.getElementById('balance-status').textContent=income>0?'Basado en tus movimientos':'Esperando movimientos';
    document.getElementById('total-income').textContent=fL(income);
    document.getElementById('total-expense').textContent=fL(expense);
    document.getElementById('total-extra').textContent=fL(extra);

    // ── EMPTY STATE: sin movimientos ──
    const recent = state.transactions.filter(t => !t.deletedAt).slice().reverse().slice(0,5);
    const recentEl = document.getElementById('recent-history');
    if (recent.length === 0) {
        recentEl.innerHTML = `
        <div class="empty-state-dashboard">
          <h3>👋 ¡Bienvenido a Mi Pisto HN!</h3>
          <p>Aún no tienes movimientos registrados.<br>Empieza en 3 pasos simples:</p>
          <div class="empty-steps">
            <div class="empty-step">
              <div class="empty-step-num">1</div>
              <div>
                <div class="empty-step-text">Registra tu primer ingreso</div>
                <div class="empty-step-sub">Toca ➕ abajo → "Nuevo Ingreso"</div>
              </div>
            </div>
            <div class="empty-step">
              <div class="empty-step-num">2</div>
              <div>
                <div class="empty-step-text">Agrega un gasto de hoy</div>
                <div class="empty-step-sub">Toca ➕ abajo → "Nuevo Gasto" o escanea un recibo</div>
              </div>
            </div>
            <div class="empty-step">
              <div class="empty-step-num">3</div>
              <div>
                <div class="empty-step-text">Mira tu saldo real</div>
                <div class="empty-step-sub">El dashboard se actualiza automáticamente</div>
              </div>
            </div>
          </div>
          <button class="btn-empty-cta" onclick="toggleFabMenu()">
            ➕ Registrar primer movimiento
          </button>
        </div>`;
    } else {
        recentEl.innerHTML = recent.map(t => {
        const tieneFactura = t.facturaImagenId || t.facturaImagen; // P0-2: IDB o legacy
        const etiqPill = t.etiqueta ? `<span class="etiqueta-pill">#${esc(t.etiqueta)}</span>` : '';
        return `
        <div style="padding:12px 0;border-bottom:1px solid var(--border)">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">
                <div style="flex:1;min-width:0">
                    <div style="font-weight:600">${esc(t.cat)} ${tieneFactura?'🧾':''} ${t.esConciliacion?'<span class="badge-conciliacion">⚖️</span>':''}</div>
                    <div style="font-size:11px;color:var(--text2)">${esc(t.subcat||'')} ${t.banco?'('+t.banco+')':''}</div>
                    ${etiqPill}
                </div>
                ${renderMontoTx(t, t.type==='income'?'+':'-', t.esConciliacion?(t.type==='income'?'var(--blue)':'var(--purple)'):(t.type==='income'?'var(--green)':'var(--red)'))}
            </div>
            <div class="tx-actions" style="${tieneFactura?'grid-template-columns:1fr 1fr 1fr':'grid-template-columns:1fr 1fr'}">
                <button class="btn-tx-edit" onclick=\"abrirEdicionTx('${esc(t.id)}')\"">✏️ Editar</button>
                ${tieneFactura?`<button class="btn-tx-edit" style="background:rgba(245,200,0,.15);color:var(--amber);border:1px solid rgba(245,200,0,.3)" onclick=\"verFactura('${esc(t.id)}')\"">🧾 Factura</button>`:''}
                <button class="btn-tx-delete" onclick=\"softDeleteTx('${esc(t.id)}')\"">🗑️ Eliminar</button>
            </div>
        </div>
        `;
    }).join('');
    }
    
    renderDashboardGoals();
    updateSurvivalIndex(balance);
    renderDoughnutChart();
}

function renderHistorico() {
    const chartContainer = document.getElementById('history-chart');
    if (!chartContainer) return;
    const meses = {};
    const ahora = new Date();
    for (let i = 5; i >= 0; i--) {
        const fecha = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
        const key = fecha.getFullYear() + '-' + String(fecha.getMonth() + 1).padStart(2, '0');
        const nombreMes = fecha.toLocaleDateString('es-HN', { month: 'short', year: '2-digit' });
        meses[key] = { nombre: nombreMes, ingresos: 0, gastos: 0 };
    }
    state.transactions.forEach(t => {
        if (t.deletedAt) return;
        // P0-2: excluir transferencias internas y conciliaciones del gráfico histórico
        if (t.esTransferencia || t.esConciliacion) return;
        const fecha = new Date(t.date);
        const key = fecha.getFullYear() + '-' + String(fecha.getMonth() + 1).padStart(2, '0');
        if (meses[key]) {
            if (t.type === 'income') meses[key].ingresos += t.amount;
            else if (t.type === 'expense') meses[key].gastos += t.amount;
        }
    });
    let maxValor = 0;
    Object.values(meses).forEach(m => {
        if (m.ingresos > maxValor) maxValor = m.ingresos;
        if (m.gastos > maxValor) maxValor = m.gastos;
    });
    if (maxValor === 0) {
        chartContainer.innerHTML = '<p style="text-align:center;color:var(--text2);padding:20px">Sin datos para mostrar</p>';
        return;
    }
    let html = '';
    Object.values(meses).forEach(mes => {
        const altIngresos = (mes.ingresos / maxValor) * 100;
        const altGastos = (mes.gastos / maxValor) * 100;
        html += '<div class="history-bar">';
        html += '<div style="display:flex;gap:3px;align-items:flex-end;height:100px">';
        html += '<div style="width:8px;height:' + altIngresos + 'px;background:var(--green);border-radius:2px 2px 0 0;min-height:2px" title="Ingresos: L.' + mes.ingresos.toFixed(2) + '"></div>';
        html += '<div style="width:8px;height:' + altGastos + 'px;background:var(--red);border-radius:2px 2px 0 0;min-height:2px" title="Gastos: L.' + mes.gastos.toFixed(2) + '"></div>';
        html += '</div>';
        html += '<span style="font-size:10px;color:var(--text2);margin-top:5px">' + mes.nombre + '</span>';
        html += '</div>';
    });
    chartContainer.innerHTML = html;
}
function exportFullReport() {
    try {
        let csv = 'REPORTE FINANCIERO COMPLETO\n';
        csv += 'Cliente: ' + (state.nombre || 'Usuario') + '\n';
        csv += 'Fecha: ' + new Date().toLocaleDateString() + '\n\n';
        const ingresos = state.transactions.filter(t => t.type === 'income' && !t.deletedAt).reduce((a,b) => a+b.amount, 0);
        const gastos = state.transactions.filter(t => t.type === 'expense' && !t.deletedAt).reduce((a,b) => a+b.amount, 0);
        const balance = state.saldoInicial + ingresos - gastos;
        csv += 'RESUMEN\n';
        csv += 'Saldo Inicial,L.' + state.saldoInicial.toFixed(2) + '\n';
        csv += 'Total Ingresos,L.' + ingresos.toFixed(2) + '\n';
        csv += 'Total Gastos,L.' + gastos.toFixed(2) + '\n';
        csv += 'Balance Actual,L.' + balance.toFixed(2) + '\n\n';
        csv += 'TRANSACCIONES\n';
        csv += 'Fecha,Tipo,Categoria,Subcategoria,Monto,Banco/Tarjeta\n';
        const txOrdenadas = state.transactions.filter(t => !t.deletedAt).sort((a, b) => new Date(b.date) - new Date(a.date));
        txOrdenadas.forEach(t => {
            const fecha = new Date(t.date).toLocaleDateString();
            const tipo = t.type === 'income' ? 'INGRESO' : 'GASTO';
            const cat = (t.cat || '').replace(/,/g, ';');
            const subcat = (t.subcat || '').replace(/,/g, ';');
            const monto = t.type === 'income' ? '+' + t.amount.toFixed(2) : '-' + t.amount.toFixed(2);
            const banco = (t.banco || t.tarjetaNombre || '').replace(/,/g, ';');
            csv += fecha + ',' + tipo + ',' + cat + ',' + subcat + ',' + monto + ',' + banco + '\n';
        });
        csv += '\n';
        if (state.receivables && state.receivables.length > 0) {
            csv += 'CUENTAS POR COBRAR\nPersona,Monto Total,Pagado,Pendiente\n';
            state.receivables.forEach(r => {
                const pendiente = r.monto - (r.pagado || 0);
                csv += r.persona + ',' + r.monto.toFixed(2) + ',' + (r.pagado || 0).toFixed(2) + ',' + pendiente.toFixed(2) + '\n';
            });
            csv += '\n';
        }
        if (state.payables && state.payables.length > 0) {
            csv += 'CUENTAS POR PAGAR\nAcreedor,Monto Total,Pagado,Pendiente\n';
            state.payables.forEach(p => {
                const pendiente = p.monto - (p.pagado || 0);
                csv += p.creditor + ',' + p.monto.toFixed(2) + ',' + (p.pagado || 0).toFixed(2) + ',' + pendiente.toFixed(2) + '\n';
            });
            csv += '\n';
        }
        if (state.tarjetas && state.tarjetas.length > 0) {
            csv += 'TARJETAS DE CREDITO\nNombre,Saldo,Limite,Tasa,Dia Corte,Dia Pago\n';
            state.tarjetas.forEach(t => {
                csv += t.nombre + ',' + t.saldo.toFixed(2) + ',' + (t.limite || 0).toFixed(2) + ',' + (t.tasaInteres || 0) + '%,' + t.corte + ',' + t.pago + '\n';
            });
        }
        const BOM = '\uFEFF';
        const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'Finanzas_' + (state.nombre || 'Usuario') + '_' + todayStr() + '.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert('✅ Reporte CSV generado');
    } catch (error) {
        alert('❌ Error: ' + error.message);
    }
}
function exportData(){const data=JSON.stringify(state);const a=document.createElement('a');a.href='data:text/json;charset=utf-8,'+encodeURIComponent(data);a.download='backup.json';a.click();}
// ═══════════════════════════════════════════════════════════════════════
// P0-5: CIFRADO REAL con AES-GCM + PBKDF2 (Web Crypto API)
// ─────────────────────────────────────────────────────────────────────
// El antiguo "cifrado XOR" se rompía en segundos: con plaintext conocido
// (todos los backups empiezan con {"setup":...) se recuperaba la contraseña
// directamente. Ahora usamos el mismo patrón que ya empleamos para el hash
// del PIN: PBKDF2 → clave AES-GCM-256.
//
// Helpers de codificación:
function _b64Encode(bytes) {
  let bin = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}
function _b64Decode(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function _deriveBackupKey(password, salt) {
  const baseKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password),
    { name: 'PBKDF2' }, false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false, ['encrypt', 'decrypt']
  );
}

async function exportDataEncriptado() {
  try {
    const password = prompt('🔐 Crea una contraseña para cifrar el respaldo:\n(Mínimo 8 caracteres — GUÁRDALA en un lugar seguro)');
    if (password === null) return;
    if (!password || password.length < 8) {
      alert('❌ La contraseña debe tener al menos 8 caracteres');
      return;
    }
    const confirmar = prompt('🔐 Confirma la contraseña:');
    if (password !== confirmar) {
      alert('❌ Las contraseñas no coinciden');
      return;
    }

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv   = crypto.getRandomValues(new Uint8Array(12));
    const key  = await _deriveBackupKey(password, salt);
    const plaintext = new TextEncoder().encode(JSON.stringify(state));
    const cipherBuf = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv }, key, plaintext
    );

    const archivoFinal = {
      version: '2.0',
      tipo: 'mipistohn-aes-gcm',
      algoritmo: 'AES-GCM-256 + PBKDF2-SHA256 (250k iter)',
      fecha: new Date().toISOString(),
      cliente: state.nombre || 'Usuario',
      salt: _b64Encode(salt),
      iv:   _b64Encode(iv),
      datos: _b64Encode(cipherBuf)
    };
    const blob = new Blob([JSON.stringify(archivoFinal, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Backup_MiPistoHN_' + todayStr() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    alert('✅ Respaldo cifrado generado con AES-GCM-256.\n⚠️ NO OLVIDES TU CONTRASEÑA — sin ella el archivo es irrecuperable.');
  } catch (error) {
    console.error('Error al exportar:', error);
    alert('❌ Error al cifrar el respaldo: ' + error.message);
  }
}

async function _descifrarBackupAES(archivo, password) {
  const salt = _b64Decode(archivo.salt);
  const iv   = _b64Decode(archivo.iv);
  const datos = _b64Decode(archivo.datos);
  const key  = await _deriveBackupKey(password, salt);
  const plainBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv }, key, datos
  );
  return JSON.parse(new TextDecoder().decode(plainBuf));
}

// Compatibilidad hacia atrás: descifrar backups antiguos en formato XOR
function _descifrarBackupXORLegacy(archivo, password) {
  try {
    const cifrado = decodeURIComponent(escape(atob(archivo.datos)));
    let descifrado = '';
    for (let i = 0; i < cifrado.length; i++) {
      descifrado += String.fromCharCode(
        cifrado.charCodeAt(i) ^ password.charCodeAt(i % password.length)
      );
    }
    return JSON.parse(descifrado);
  } catch { return null; }
}
function resetApp(){
  if(!confirm('⚠️ ZONA DE PELIGRO\n\n¿Estás seguro de que deseas BORRAR TODOS tus datos?\n\nEsto eliminará:\n• Todos tus gastos e ingresos\n• Préstamos y tarjetas\n• Metas de ahorro\n• Configuración personal\n\nEsta acción NO se puede deshacer.')) return;
  if(!confirm('¿Confirmas? Se borrará TODO y volverás al tutorial inicial.')) return;
  
  // 1. Limpiar localStorage
  localStorage.clear();
  
  // 2. Limpiar IndexedDB
  try {
    if(window.indexedDB) {
      indexedDB.databases().then(dbs => {
        dbs.forEach(db => indexedDB.deleteDatabase(db.name));
      }).catch(()=>{});
    }
  } catch(e){}
  
  // 3. Limpiar Service Worker caches
  try {
    if('caches' in window) {
      caches.keys().then(keys => {
        keys.forEach(k => caches.delete(k));
      }).catch(()=>{});
    }
  } catch(e){}
  
  // 4. Desregistrar Service Workers
  try {
    if('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(reg => reg.unregister());
      }).catch(()=>{});
    }
  } catch(e){}
  
  // 5. Recargar a la pantalla de onboarding
  setTimeout(() => location.reload(), 300);
}

// ========== IMPORTAR DATOS ==========
// P0-5 + P1-6: soporta backups planos, AES-GCM (nuevo) y XOR legacy.
// Valida la estructura antes de aceptar para cerrar el vector XSS por
// import malicioso (un .json con <script> en state.nombre, etc.).

// ────────────────────────────────────────────────────────────────────
// VALIDACIÓN ENDURECIDA DE BACKUPS — defensa contra XSS por import
// ────────────────────────────────────────────────────────────────────
// Quick Fix XSS: validar estrictamente IDs, montos, strings para evitar
// inyección de código malicioso vía backups manipulados.
function _validarSchemaBackup(obj) {
  if (typeof obj !== 'object' || obj === null) return 'No es un objeto';
  
  // ── Validar campos top-level ──
  if (typeof obj.setup !== 'boolean') return 'Falta setup:boolean';
  if (obj.nombre !== undefined) {
    if (typeof obj.nombre !== 'string' || obj.nombre.length > 200) return 'Campo nombre inválido';
    // Rechazar caracteres de control y scripts
    if (/[<>]/.test(obj.nombre)) return 'nombre contiene caracteres prohibidos';
  }
  if (obj.saldoInicial !== undefined) {
    if (typeof obj.saldoInicial !== 'number' || !isFinite(obj.saldoInicial)) return 'saldoInicial inválido';
    if (obj.saldoInicial < 0 || obj.saldoInicial > 1e12) return 'saldoInicial fuera de rango';
  }
  
  // ── Validar arrays esperados ──
  const arrays = ['transactions','goals','receivables','payables','prestamos','tarjetas','pagosRecurrentes'];
  for (const k of arrays) {
    if (obj[k] !== undefined && !Array.isArray(obj[k])) return `${k} debe ser array`;
  }
  
  // ── Validar tamaño total ──
  if (JSON.stringify(obj).length > 10 * 1024 * 1024) return 'Archivo demasiado grande (>10MB)';
  
  // ── Regex de validación ──
  // UUID v4: 8-4-4-4-12 dígitos hex
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  // ID legacy (timestamp_random): hasta 20 caracteres alfanuméricos con guión bajo
  const legacyIdRegex = /^[a-z0-9_]{5,20}$/i;
  
  function esIdValido(id) {
    if (typeof id !== 'string') return false;
    return uuidRegex.test(id) || legacyIdRegex.test(id);
  }
  
  function esFechaValida(fecha) {
    if (!fecha) return true; // opcional
    if (typeof fecha !== 'string') return false;
    const d = new Date(fecha);
    return !isNaN(d.getTime()) && d.getFullYear() > 2000 && d.getFullYear() < 2100;
  }
  
  function esStringSeguro(str, maxLen = 500) {
    if (str === undefined || str === null) return true; // opcional
    if (typeof str !== 'string') return false;
    if (str.length > maxLen) return false;
    // Rechazar <script>, <iframe>, javascript:, data:, on* attributes
    const dangerous = /<script|<iframe|javascript:|data:image|onerror=|onclick=/i;
    return !dangerous.test(str);
  }
  
  // ── Validar transacciones (muestreo de 100) ──
  if (Array.isArray(obj.transactions)) {
    for (const t of obj.transactions.slice(0, 100)) {
      if (typeof t !== 'object' || t === null) return 'Transacción inválida';
      
      // ID obligatorio y válido
      if (!esIdValido(t.id)) return `ID inválido en transacción: ${JSON.stringify(t.id || 'missing')}`;
      
      // Type obligatorio
      if (t.type !== 'income' && t.type !== 'expense') return `type inválido: ${t.type}`;
      
      // Amount obligatorio y razonable
      if (typeof t.amount !== 'number' || !isFinite(t.amount)) return 'amount inválido';
      if (t.amount < 0 || t.amount > 1e9) return `amount fuera de rango: ${t.amount}`;
      
      // Fecha válida si existe
      if (t.date && !esFechaValida(t.date)) return `fecha inválida: ${t.date}`;
      
      // Strings seguros
      if (!esStringSeguro(t.cat, 100)) return `categoría sospechosa: ${t.cat}`;
      if (!esStringSeguro(t.subcat, 100)) return `subcategoría sospechosa`;
      if (!esStringSeguro(t.nota, 1000)) return `nota sospechosa`;
      if (!esStringSeguro(t.etiqueta, 100)) return `etiqueta sospechosa`;
    }
  }
  
  // ── Validar metas ──
  if (Array.isArray(obj.goals)) {
    for (const g of obj.goals.slice(0, 50)) {
      if (!esIdValido(g.id)) return `ID inválido en meta: ${g.id}`;
      if (!esStringSeguro(g.nombre, 200)) return 'nombre de meta sospechoso';
      if (typeof g.objetivo !== 'number' || g.objetivo < 0 || g.objetivo > 1e9) return 'objetivo inválido';
    }
  }
  
  // ── Validar cuentas por cobrar ──
  if (Array.isArray(obj.receivables)) {
    for (const r of obj.receivables.slice(0, 50)) {
      if (!esIdValido(r.id)) return `ID inválido en cobrar: ${r.id}`;
      if (!esStringSeguro(r.persona, 200)) return 'persona sospechosa en cobrar';
    }
  }
  
  // ── Validar cuentas por pagar ──
  if (Array.isArray(obj.payables)) {
    for (const p of obj.payables.slice(0, 50)) {
      if (!esIdValido(p.id)) return `ID inválido en pagar: ${p.id}`;
      if (!esStringSeguro(p.creditor, 200)) return 'acreedor sospechoso';
    }
  }
  
  // ── Validar préstamos ──
  if (Array.isArray(obj.prestamos)) {
    for (const p of obj.prestamos.slice(0, 50)) {
      if (!esIdValido(p.id)) return `ID inválido en préstamo: ${p.id}`;
      if (!esStringSeguro(p.entidad, 200)) return 'entidad sospechosa';
    }
  }
  
  // ── Validar tarjetas ──
  if (Array.isArray(obj.tarjetas)) {
    for (const tc of obj.tarjetas.slice(0, 20)) {
      if (!esIdValido(tc.id)) return `ID inválido en tarjeta: ${tc.id}`;
      if (!esStringSeguro(tc.nombre, 100)) return 'nombre de tarjeta sospechoso';
    }
  }
  
  return null; // ✅ Validación pasada
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { alert('❌ Archivo demasiado grande (>10MB)'); event.target.value=''; return; }

  const reader = new FileReader();
  reader.onload = async (e) => {
    let parsed;
    try {
      parsed = JSON.parse(e.target.result);
    } catch {
      alert('❌ Archivo de respaldo inválido (JSON corrupto)');
      event.target.value=''; return;
    }

    let datosRecuperados = null;

    // 1) Backup plano (sin cifrar): el archivo ES el state directamente
    if (parsed && typeof parsed === 'object' && typeof parsed.setup === 'boolean') {
      datosRecuperados = parsed;
    }
    // 2) Backup cifrado AES-GCM (nuevo formato P0-5)
    else if (parsed && parsed.tipo === 'mipistohn-aes-gcm' && parsed.salt && parsed.iv && parsed.datos) {
      const password = prompt('🔐 Contraseña del respaldo cifrado:');
      if (!password) { event.target.value=''; return; }
      try {
        datosRecuperados = await _descifrarBackupAES(parsed, password);
      } catch {
        alert('❌ Contraseña incorrecta o archivo corrupto');
        event.target.value=''; return;
      }
    }
    // 3) Backup XOR legacy (compatibilidad con versiones < 2.0)
    else if (parsed && parsed.tipo === 'finanzas-hn-encriptado' && parsed.datos) {
      const password = prompt('🔐 Contraseña del respaldo (formato antiguo):');
      if (!password) { event.target.value=''; return; }
      datosRecuperados = _descifrarBackupXORLegacy(parsed, password);
      if (!datosRecuperados) {
        alert('❌ Contraseña incorrecta o archivo corrupto');
        event.target.value=''; return;
      }
      alert('⚠️ Estás importando un respaldo en formato antiguo (XOR). Tras importar, exporta uno nuevo en formato seguro AES-GCM.');
    }
    else {
      alert('❌ Formato de respaldo no reconocido');
      event.target.value=''; return;
    }

    // Validación de schema antes de reemplazar el state — cierra XSS por import malicioso
    const errorSchema = _validarSchemaBackup(datosRecuperados);
    if (errorSchema) {
      alert('❌ Estructura del respaldo inválida: ' + errorSchema);
      event.target.value=''; return;
    }

    if (!confirm('⚠️ Esto reemplazará TODOS tus datos actuales con los del respaldo.\n\n¿Continuar?')) {
      event.target.value=''; return;
    }

    state = datosRecuperados;
    save();
    location.reload();
  };
  reader.readAsText(file);
}

// ========== VISOR DE FACTURAS ==========
async function verFactura(id) {
    const gasto = state.transactions.find(t => String(t.id) === String(id));
    if (!gasto) return alert('Transacción no encontrada.');
    
    // P0-2: Cargar desde IDB si existe facturaImagenId, o usar facturaImagen legacy
    let imagenBase64 = null;
    if (gasto.facturaImagenId) {
        imagenBase64 = await _obtenerFactura(gasto.facturaImagenId);
    } else if (gasto.facturaImagen) {
        imagenBase64 = gasto.facturaImagen; // legacy base64
    }
    
    if (!imagenBase64) {
        alert('No hay factura adjunta a este gasto.');
        return;
    }
    
    const modal = document.createElement('div');
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:1000;display:flex;justify-content:center;align-items:center;padding:20px';
    modal.innerHTML = `
        <div style="position:relative;max-width:90%;max-height:90%">
            <button onclick="this.parentElement.parentElement.remove()" style="position:absolute;top:-40px;right:0;background:var(--red);color:white;border:none;padding:10px 20px;border-radius:8px;cursor:pointer">✕ Cerrar</button>
            <img src="${imagenBase64}" style="max-width:100%;max-height:90vh;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.5)">
            <div style="position:absolute;bottom:-40px;left:0;color:var(--text2);font-size:12px">Factura #${gasto.numeroFactura || 'N/A'} • ${new Date(gasto.date).toLocaleDateString()}</div>
        </div>
    `;
    document.body.appendChild(modal);
    
    const closeOnEsc = (e) => { if(e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', closeOnEsc); } };
    document.addEventListener('keydown', closeOnEsc);
}

async function eliminarFactura(id) {
    const gasto = state.transactions.find(t => String(t.id) === String(id));
    if (!gasto) return alert('Transacción no encontrada.');
    
    // P0-2: Verificar si tiene factura en IDB o legacy
    const tieneFac = gasto.facturaImagenId || gasto.facturaImagen;
    if (!tieneFac) {
        alert('No hay factura para eliminar.');
        return;
    }
    
    if (confirm('¿Eliminar la factura adjunta a este gasto?')) {
        if (gasto.facturaImagenId) {
            await _eliminarFactura(gasto.facturaImagenId);
            gasto.facturaImagenId = null;
        }
        gasto.facturaImagen = null; // limpiar legacy si existía
        save();
        renderAll();
        alert('✅ Factura eliminada');
    }
}

async function reemplazarFactura(id) {
    const gasto = state.transactions.find(t => String(t.id) === String(id));
    if (!gasto) return;
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            // P0-2: Guardar en IDB (no en la transacción)
            const nuevoId = await _guardarTempFactura(ev.target.result);
            if (gasto.facturaImagenId) {
                await _eliminarFactura(gasto.facturaImagenId); // eliminar vieja
            }
            gasto.facturaImagenId = nuevoId;
            gasto.facturaImagen = null; // limpiar legacy
            save();
            renderAll();
            alert('✅ Factura reemplazada');
        };
        reader.readAsDataURL(file);
    };
    input.click();
}

// ========== EXPORTACIÓN A EXCEL PROFESIONAL ==========
function exportToExcelPro() {
    if (typeof XLSX === 'undefined') { alert("❌ Error: Librería de Excel no cargada."); return; }
    try {
        const wb = XLSX.utils.book_new();
        const balanceActual = state.saldoInicial + state.transactions.filter(t=>t.type==='income').reduce((a,b)=>a+b.amount,0) - state.transactions.filter(t=>t.type==='expense').reduce((a,b)=>a+b.amount,0);
        const gastosFijos = state.transactions.filter(t => t.type === 'expense' && t.tipo === 'fijo').reduce((a,b)=>a+b.amount,0);
        const gastosExtra = state.transactions.filter(t => t.type === 'expense' && t.tipo === 'extra').reduce((a,b)=>a+b.amount,0);
        
        // Portada
        const resumenData = [["REPORTE FINANCIERO PROFESIONAL"],["Cliente", state.nombre],["Fecha", new Date().toLocaleDateString()],[],["INDICADORES"],["Patrimonio Neto", balanceActual],["Días Supervivencia", document.getElementById('survival-val')?.textContent||0],["Gastos Fijos", gastosFijos],["Gastos Extra", gastosExtra]];
        const wsPortada = XLSX.utils.aoa_to_sheet(resumenData);
        XLSX.utils.book_append_sheet(wb, wsPortada, "📊 Portada");

        // Libro Mayor
        const mayorData = state.transactions.sort((a,b)=>new Date(b.date)-new Date(a.date)).map(t=>({"Fecha":new Date(t.date).toLocaleDateString(),"Tipo":t.type==='income'?'INGRESO':'GASTO',"Categoría":t.cat,"Monto":t.type==='income'?t.amount:-t.amount,"Banco/Tarjeta":t.banco||t.tarjetaNombre||'N/A'}));
        const wsMayor = XLSX.utils.json_to_sheet(mayorData);
        XLSX.utils.book_append_sheet(wb, wsMayor, "📋 Libro Mayor");

        // Deudas
        const deudas = [...state.receivables.map(c=>({"Tipo":"COBRAR","Persona":c.persona,"Saldo":c.monto-(c.pagado||0)})),...state.payables.map(p=>({"Tipo":"PAGAR","Persona":p.creditor,"Saldo":p.monto-(p.pagado||0)}))];
        if(deudas.length>0){const wsDeudas = XLSX.utils.json_to_sheet(deudas); XLSX.utils.book_append_sheet(wb, wsDeudas, "💰 Deudas");}

        const nombreArchivo = `Finanzas_${state.nombre||'Usuario'}_${todayStr()}.xlsx`;
        XLSX.writeFile(wb, nombreArchivo);
        alert("✅ Reporte Profesional generado.");
    } catch(e) { console.error(e); alert("Error al generar Excel."); }
}

// ========== NAVEGACIÓN Y MODALES (v2 — Bottom Nav) ==========

// Mapa: vista → tab activo en la barra
const NAV_TAB_MAP = {
  dashboard: 'tab-dashboard',
  historico: 'tab-historico',
  tarjetas:  'tab-tarjetas',
  config:    'tab-config',
};

function switchView(v){
  closeFabMenu();
  document.querySelectorAll('.view').forEach(x=>x.classList.remove('active'));
  const el = document.getElementById('view-'+v);
  if(el) el.classList.add('active');
  // Actualizar tab activo en la barra
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  const tabId = NAV_TAB_MAP[v];
  if(tabId) document.getElementById(tabId)?.classList.add('active');
  // Renders según vista
  if(v==='gastos')renderGastos();
  if(v==='ingresos')renderIngresos();
  if(v==='metas')renderMetas();
  if(v==='cobrar')renderCobrar();
  if(v==='pagar')renderPagar();
  if(v==='prestamos')renderPrestamos();
  // Scroll to top on desktop
  const mainArea=document.getElementById('main-scroll-area');
  if(mainArea) mainArea.scrollTo({top:0,behavior:'smooth'});
  if(v==='tarjetas')renderTarjetas();
  if(v==='pagos')renderPagosRecurrentes();
  if(v==='historico')renderHistorico();
  // Cloud sync: refrescar estado al entrar a config
  if(v==='config') {
    if (typeof renderCloudSyncUI === 'function') renderCloudSyncUI();
    if (typeof renderPerfilIngresos === 'function') renderPerfilIngresos();
    if (typeof renderAIKeyConfig === 'function') renderAIKeyConfig();
  }
  // Botón flotante de IA: visible solo en el dashboard
  const aiFab = document.getElementById('ai-fab');
  if (aiFab) aiFab.style.display = (v === 'dashboard') ? 'flex' : 'none';
}

function toggleHamburger(){
  const panel=document.getElementById('hamburgerPanel');
  const overlay=document.getElementById('hamburgerOverlay');
  const isOpen=panel.classList.contains('active');
  if(isOpen){panel.classList.remove('active');overlay.classList.remove('active');document.body.style.overflow=''}
  else{closeFabMenu();panel.classList.add('active');overlay.classList.add('active');document.body.style.overflow='hidden'}
}

function openModal(id){
  document.getElementById(id).style.display='flex';
  closeFabMenu();
}
function closeModal(id){document.getElementById(id).style.display='none'}
function closeModalIfBg(e,id){if(e.target.id===id){if(hasUnsavedModalData){if(confirm("¿Descartar los datos ingresados?")){{hasUnsavedModalData=false;closeModal(id)}}}else{closeModal(id)}}}

let _fabOpen = false;
function toggleFabMenu(){
  _fabOpen = !_fabOpen;
  const menu=document.getElementById('fab-menu');
  const btn=document.getElementById('nav-fab-btn');
  if(menu) menu.classList.toggle('open',_fabOpen);
  if(btn)  btn.classList.toggle('open',_fabOpen);
}
function closeFabMenu(){
  _fabOpen=false;
  document.getElementById('fab-menu')?.classList.remove('open');
  document.getElementById('nav-fab-btn')?.classList.remove('open');
}

// Cerrar FAB al tocar fuera
document.addEventListener('click',e=>{
  const menu=document.getElementById('fab-menu');
  const btn=document.getElementById('nav-fab-btn');
  if(_fabOpen && menu && btn && !menu.contains(e.target) && !btn.contains(e.target)) closeFabMenu();
});

// ═══════════════════════════════════════════════════════════════════════
// PRESUPUESTO POR CATEGORÍA — CRUD
// ═══════════════════════════════════════════════════════════════════════

/** Guarda o actualiza un presupuesto de categoría */
function saveBudget() {
  const categoria = (document.getElementById('budget-cat-select')?.value || '').trim();
  const monto     = parseMonto(document.getElementById('budget-monto')?.value);
  const emoji     = (document.getElementById('budget-emoji')?.value || '').trim() || '📌';
  const color     = document.getElementById('budget-color')?.value || '#F5C800';
  const editId    = document.getElementById('budget-edit-id')?.value || '';

  if (!categoria) return alert('⚠️ Seleccioná una categoría');
  if (!monto || monto <= 0) return alert('⚠️ Ingresá un monto mayor a 0');

  if (!state.budgets) state.budgets = [];

  if (editId) {
    // Editar existente
    const idx = state.budgets.findIndex(b => b.id === editId);
    if (idx >= 0) {
      state.budgets[idx] = { ...state.budgets[idx], categoria, montoMensual: monto, emoji, color, activo: true };
    }
  } else {
    // Verificar que no haya uno para esa categoría ya
    const existe = state.budgets.find(b => b.categoria === categoria && b.activo !== false);
    if (existe) {
      if (!confirm('Ya tenés un presupuesto para "' + categoria + '". ¿Querés reemplazarlo?')) return;
      existe.montoMensual = monto; existe.emoji = emoji; existe.color = color;
    } else {
      state.budgets.push({ id: uid(), categoria, montoMensual: monto, activo: true, emoji, color });
    }
  }

  save();
  closeModal('modal-budget-category');
  renderBudgetCategorySummary();
  // Limpiar form
  ['budget-cat-select','budget-monto','budget-emoji'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = id === 'budget-emoji' ? '' : '';
  });
  const editEl = document.getElementById('budget-edit-id');
  if (editEl) editEl.value = '';
  renderBudgetAlerts();
}
window.saveBudget = saveBudget;

/** Elimina un presupuesto por ID */
function deleteBudget(id) {
  if (!confirm('¿Eliminar este presupuesto?')) return;
  state.budgets = (state.budgets || []).filter(b => b.id !== id);
  save();
  renderBudgetCategorySummary();
}
window.deleteBudget = deleteBudget;

/** Verifica presupuestos excedidos y dispara notificaciones locales */
function renderBudgetAlerts() {
  if (!state.budgets?.length) return;
  const gastos  = (typeof calcularGastosPorCategoria === 'function') ? calcularGastosPorCategoria() : {};
  const hoy     = new Date().toISOString().slice(0, 7); // YYYY-MM
  const alertKey= 'mph_budget_alert_' + hoy;
  const alertadas = JSON.parse(localStorage.getItem(alertKey) || '[]');

  for (const b of (state.budgets || [])) {
    if (!b.activo) continue;
    const gastado = gastos[b.categoria] || 0;
    const pct = b.montoMensual > 0 ? gastado / b.montoMensual : 0;
    const alertId = b.id + '_100';
    if (pct >= 1.0 && !alertadas.includes(alertId)) {
      alertadas.push(alertId);
      // Notificación local si el permiso está otorgado
      if (Notification.permission === 'granted') {
        navigator.serviceWorker?.ready.then(reg => {
          reg.showNotification('⛔ Presupuesto superado: ' + b.categoria, {
            body: 'Gastaste ' + fL(gastado) + ' de ' + fL(b.montoMensual) + ' presupuestados.',
            icon: './icon-192.png',
            tag: 'budget-' + b.id
          });
        }).catch(() => {
          new Notification('⛔ Presupuesto superado: ' + b.categoria, {
            body: 'Gastaste ' + fL(gastado) + ' de ' + fL(b.montoMensual) + ' presupuestados.'
          });
        });
      }
    }
  }
  localStorage.setItem(alertKey, JSON.stringify(alertadas));
}
window.renderBudgetAlerts = renderBudgetAlerts;
