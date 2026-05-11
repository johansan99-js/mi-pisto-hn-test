/**
 * Mi Pisto HN — render.js
 * ─────────────────────────────────────────────────────────
 * Renderizado de todas las vistas: dashboard, historial,
 * metas, deudas, préstamos, tasas, configuración.
 * Incluye gráfica de evolución de patrimonio.
 * Requiere: utils.js, transactions.js
 */

function renderAll(){
    renderDashboard();renderGastos();renderIngresos();renderMetas();renderCobrar();renderPagar();renderPrestamos();renderTarjetas();renderPagosRecurrentes();renderHistorico();renderBudgetRules();
    setTimeout(function(){
      renderLiquidez7Dias();
      renderChipsRapidas();
      renderPatrimonioChart();
      renderBudgetCategorySummary(); // Presupuesto por categoría
    }, 50);
}

// ─────────────────────────────────────────────────────────────────────
// GRÁFICA DE EVOLUCIÓN DE PATRIMONIO — últimos 6 meses
// ─────────────────────────────────────────────────────────────────────
let _patrimonioChart = null;
function renderPatrimonioChart() {
  const canvas = document.getElementById('patrimonio-chart');
  const emptyEl = document.getElementById('patrimonio-chart-empty');
  const pctEl = document.getElementById('patrimonio-evol-pct');
  if (!canvas) return;

  // Calcular patrimonio neto por mes (últimos 6 meses)
  const hoy = new Date();
  const labels = [];
  const datos = [];
  const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  for (let i = 5; i >= 0; i--) {
    const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const mesStr = fecha.getFullYear() + '-' + String(fecha.getMonth() + 1).padStart(2, '0');
    labels.push(MESES[fecha.getMonth()]);
    // Balance acumulado hasta el último día de ese mes
    const hastaFin = new Date(fecha.getFullYear(), fecha.getMonth() + 1, 0, 23, 59, 59).getTime();
    const txHasta = (state.transactions || []).filter(t =>
      !t.deletedAt && !t.esTransferencia && new Date(t.date).getTime() <= hastaFin
    );
    const ingresos  = txHasta.filter(t => t.type === 'income').reduce((a, b) => a + b.amount, 0);
    const egresos   = txHasta.filter(t => t.type === 'expense').reduce((a, b) => a + b.amount, 0);
    const saldoBase = (state.cuentasIniciales?.efectivo || 0) + (state.cuentasIniciales?.ahorro || 0);
    const patrimonio = saldoBase + ingresos - egresos;
    datos.push(Math.max(0, patrimonio));
  }

  // Si todos son 0, mostrar estado vacío
  const hayDatos = datos.some(v => v > 0);
  if (!hayDatos) {
    canvas.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'block';
    if (pctEl) pctEl.textContent = '';
    return;
  }
  canvas.style.display = 'block';
  if (emptyEl) emptyEl.style.display = 'none';

  // Calcular % de cambio entre primer y último mes
  const primero = datos[0] || 1;
  const ultimo  = datos[datos.length - 1] || 0;
  const pct = ((ultimo - primero) / primero) * 100;
  if (pctEl) {
    const signo = pct >= 0 ? '+' : '';
    pctEl.textContent = signo + pct.toFixed(1) + '%';
    pctEl.style.color = pct >= 0 ? 'var(--green)' : 'var(--red)';
  }

  // Destruir gráfica anterior si existe
  if (_patrimonioChart) { try { _patrimonioChart.destroy(); } catch(e) {} }

  const ctx = canvas.getContext('2d');
  const gradiente = ctx.createLinearGradient(0, 0, 0, 110);
  gradiente.addColorStop(0, 'rgba(66,133,244,0.3)');
  gradiente.addColorStop(1, 'rgba(66,133,244,0.02)');

  _patrimonioChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: datos,
        borderColor: '#4285F4',
        backgroundColor: gradiente,
        borderWidth: 2.5,
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: '#4285F4',
        pointBorderColor: '#130507',
        pointBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ' L. ' + ctx.parsed.y.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
          },
          backgroundColor: 'rgba(19,5,7,0.9)',
          titleColor: '#F5C800',
          bodyColor: '#fff',
          padding: 10,
          borderColor: 'rgba(66,133,244,0.5)',
          borderWidth: 1
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10 } },
          border: { display: false }
        },
        y: {
          display: false,
          beginAtZero: false
        }
      },
      interaction: { mode: 'index', intersect: false }
    }
  });
}
// ========== INICIALIZACIÓN ==========
// P1-7: ELIMINADA esta versión obsoleta de window.onload (era código muerto:
// el archivo asigna window.onload de nuevo más abajo con la versión async + IDB
// + biometría). Mantener dos definiciones inducía bugs latentes.


// ══════════════════════════════════════════════════════════════
//  SALUDO PERSONALIZADO + TOPBAR DESKTOP
// ══════════════════════════════════════════════════════════════
function calcBalance(){
  if(!state.setup)return 0;
  // P0-2: excluir transferencias internas (neutras); las conciliaciones SÍ cuentan en el balance global
  const normal=state.transactions.filter(t=>!t.deletedAt && !t.esTransferencia);
  const income=normal.filter(t=>t.type==='income').reduce((a,b)=>a+b.amount,0);
  const expense=normal.filter(t=>t.type==='expense').reduce((a,b)=>a+b.amount,0);
  return (state.saldoInicial||0)+income-expense;
}

// ═══════════════════════════════════════════════════════════════════════
// P0-4: BALANCE POR CUENTA DERIVADO desde transactions (no almacenado).
// ─────────────────────────────────────────────────────────────────────
// Antes, state.cuentas.efectivo / state.cuentas.ahorro eran "snapshots"
// que sólo se actualizaban en onboarding y conciliación, pero NUNCA en
// saveGasto / saveIngreso. Resultado: el badge de cuenta y el balance
// global divergían con cada movimiento.
//
// Ahora ambos saldos se calculan en tiempo real desde el log de
// transacciones. state.cuentasIniciales guarda los saldos del onboarding
// como punto de partida y NO se muta jamás.
//
// Las transferencias internas SÍ afectan getCuentaBalance porque cambian
// el saldo de cada cuenta individualmente, aunque el balance global sea
// neutral.
// ═══════════════════════════════════════════════════════════════════════
function getCuentaBalance(cuenta) {
  // Migración invisible: si el usuario viene de versión vieja, copiar state.cuentas
  if (!state.cuentasIniciales) {
    state.cuentasIniciales = {
      efectivo: (state.cuentas && typeof state.cuentas.efectivo === 'number') ? state.cuentas.efectivo : 0,
      ahorro:   (state.cuentas && typeof state.cuentas.ahorro   === 'number') ? state.cuentas.ahorro   : 0,
    };
  }
  const inicial = state.cuentasIniciales[cuenta] || 0;
  return state.transactions
    .filter(t => !t.deletedAt && t.cuenta === cuenta)
    .reduce((acc, t) => acc + (t.type === 'income' ? t.amount : -t.amount), inicial);
}

function getGreeting(){
  const h=new Date().getHours();
  if(h>=5 && h<12)  return {saludo:'Buenos días',emoji:'🌅'};
  if(h>=12 && h<18) return {saludo:'Buenas tardes',emoji:'☀️'};
  return {saludo:'Buenas noches',emoji:'🌙'};
}

function getMotivationalMsg(nombre, balance){
  const msgs=[
    `Tu economía está en buenas manos, ${nombre}.`,
    `Cada decisión que tomas te acerca a tu libertad financiera.`,
    `El control de tu dinero comienza con información. ¡Y la tienes!`,
    `${nombre}, hoy es un buen día para revisar tus finanzas.`,
    `Quien controla su dinero, controla su futuro.`
  ];
  const day=new Date().getDay();
  return msgs[day % msgs.length];
}

function renderWelcome(){
  if(!state.setup||!state.nombre) return;
  const nombre=state.nombre;
  const {saludo,emoji}=getGreeting();
  const balance=calcBalance();
  const inicial=nombre.charAt(0).toUpperCase();
  
  // ── Actualizar topbar desktop ──
  const dtSub=document.getElementById('dt-greeting-sub');
  const dtName=document.getElementById('dt-greeting-name');
  const dtDate=document.getElementById('dt-date');
  if(dtSub)  dtSub.textContent=`${emoji} ${saludo}`;
  if(dtName) dtName.textContent=nombre;
  if(dtDate){
    const now=new Date();
    const dias=['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
    const meses=['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    dtDate.innerHTML=`<strong style="color:var(--text)">${dias[now.getDay()]}</strong><br>${now.getDate()} de ${meses[now.getMonth()]}`;
  }
  
  // ── Avatar sidebar ──
  const sbAvatar=document.getElementById('sb-avatar');
  if(sbAvatar) sbAvatar.textContent=inicial;
  const sbName=document.getElementById('sb-user-name');
  if(sbName) sbName.textContent=nombre;
  
  // ── Welcome card MÓVIL ──
  const mobileWrap=document.getElementById('mobile-welcome-wrap');
  if(mobileWrap){
    mobileWrap.innerHTML=`
      <div style="
        background:linear-gradient(135deg,var(--bg2),var(--bg3));
        border:1px solid var(--border);
        border-radius:16px;
        padding:18px 16px 14px;
        margin-bottom:14px;
        position:relative;
        overflow:hidden;
      ">
        <!-- Fondo decorativo -->
        <div style="position:absolute;top:-20px;right:-20px;width:100px;height:100px;background:radial-gradient(circle,rgba(245,200,0,.08),transparent 70%);border-radius:50%;pointer-events:none"></div>
        <div style="position:absolute;bottom:-15px;left:-15px;width:80px;height:80px;background:radial-gradient(circle,rgba(255,68,68,.06),transparent 70%);border-radius:50%;pointer-events:none"></div>

        <div style="display:flex;align-items:center;gap:12px;position:relative">
          <!-- Avatar -->
          <div style="
            width:46px;height:46px;border-radius:50%;flex-shrink:0;
            background:linear-gradient(135deg,#FF4444,#F5C800);
            display:flex;align-items:center;justify-content:center;
            font-size:20px;font-weight:900;color:#130507;
            box-shadow:0 4px 12px rgba(245,200,0,.3);
            animation:glowPulse 3s ease-in-out infinite;
          ">${inicial}</div>
          <!-- Texto -->
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;color:var(--text2);font-weight:500;margin-bottom:1px">${emoji} ${saludo}</div>
            <div style="
              font-size:22px;font-weight:900;letter-spacing:-.5px;
              background:linear-gradient(90deg,#FF4444,#F5C800);
              -webkit-background-clip:text;-webkit-text-fill-color:transparent;
              background-clip:text;
              line-height:1.1;
              white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
            ">${nombre}</div>
          </div>
        </div>
        
        <!-- Frase motivacional -->
        <div style="
          margin-top:10px;
          font-size:11.5px;
          color:var(--text2);
          line-height:1.5;
          font-style:italic;
          border-top:1px solid var(--border);
          padding-top:9px;
        ">"${getMotivationalMsg(nombre, balance)}"</div>
      </div>
    `;
  }
}

// ── Activar sidebar item correcto al switchView ──
function setSidebarActive(id){
  document.querySelectorAll('.sidebar-item').forEach(el=>{
    el.classList.remove('active');
    const icon=el.querySelector('.si-icon');
    if(icon) icon.style.background='';
  });
  const el=document.getElementById(id);
  if(el){
    el.classList.add('active');
  }
}


function openTransferirCuentas(){
  updateTransferPreview();
  openModal('modal-transferir');
}
function updateTransferPreview(){
  // P0-4: lecturas derivadas
  const from=document.getElementById('transfer-from')?.value||'efectivo';
  const to=document.getElementById('transfer-to')?.value||'ahorro';
  const monto=parseFloat(document.getElementById('transfer-monto')?.value)||0;
  const saldoFrom=getCuentaBalance(from);
  const saldoTo=getCuentaBalance(to);
  const fromBal=document.getElementById('transfer-from-bal');
  const toBal=document.getElementById('transfer-to-bal');
  const preview=document.getElementById('transfer-preview');
  if(fromBal)fromBal.textContent=fL(saldoFrom);
  if(toBal)toBal.textContent=fL(saldoTo);
  if(preview&&monto>0){
    if(monto>saldoFrom)preview.innerHTML=`<span style="color:var(--red)">⚠️ Saldo insuficiente en ${from==='efectivo'?'Efectivo':'Ahorro'}</span>`;
    else preview.innerHTML=`Después: <strong>${from==='efectivo'?'Efectivo':'Ahorro'}</strong> ${fL(saldoFrom-monto)} → <strong>${to==='efectivo'?'Efectivo':'Ahorro'}</strong> ${fL(saldoTo+monto)}`;
  }
}
function ejecutarTransferencia(){
  const from=document.getElementById('transfer-from')?.value||'efectivo';
  const to=document.getElementById('transfer-to')?.value||'ahorro';
  const monto=parseFloat(document.getElementById('transfer-monto')?.value);
  if(!monto||monto<=0)return alert('Ingresa un monto válido');
  if(from===to)return alert('Las cuentas deben ser diferentes');
  // P0-4: validación con saldo derivado
  const saldoDisponible=getCuentaBalance(from);
  if(monto>saldoDisponible)return alert('Saldo insuficiente en '+(from==='efectivo'?'Efectivo':'Ahorro'));
  const fromNom=from==='efectivo'?'Efectivo':'Ahorro';
  const toNom=to==='efectivo'?'Efectivo':'Ahorro';
  // Registrar como par de transacciones internas — el saldo se recalcula automáticamente
  state.transactions.push({id:uid(),type:'expense',amount:monto,cat:'Transferencia',subcat:`Salida de ${fromNom}`,cuenta:from,tipo:'fijo',date:new Date().toISOString(),esTransferencia:true});
  state.transactions.push({id:uid(),type:'income',amount:monto,cat:'Transferencia',subcat:`Entrada a ${toNom}`,cuenta:to,date:new Date().toISOString(),esTransferencia:true});
  save();closeModal('modal-transferir');renderAll();
  alert(`✅ Transferencia completada.\n${fromNom}: ${fL(getCuentaBalance(from))}\n${toNom}: ${fL(getCuentaBalance(to))}`);
}

// Registro del Service Worker (fuera del window.onload, aquí sí va)
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
    .then(reg => {
      console.log('✅ Service Worker registrado', reg);
      // P1-10: detectar versión nueva y ofrecer recargar al usuario.
      // Sin esto, el SW viejo sigue sirviendo la app vieja hasta cerrar todas las pestañas.
      reg.addEventListener('updatefound', () => {
        const nuevoSW = reg.installing;
        if (!nuevoSW) return;
        nuevoSW.addEventListener('statechange', () => {
          if (nuevoSW.state === 'installed' && navigator.serviceWorker.controller) {
            // Hay versión nueva esperando a tomar el control
            if (confirm('🆕 Hay una nueva versión de Mi Pisto HN disponible. ¿Actualizar ahora?')) {
              nuevoSW.postMessage({ type: 'SKIP_WAITING' });
              // Cuando el nuevo SW tome control, recargamos
              navigator.serviceWorker.addEventListener('controllerchange', () => {
                window.location.reload();
              }, { once: true });
            }
          }
        });
      });
    })
    .catch(err => console.error('❌ Error al registrar SW:', err));
}


// ========================================================
// ========== MEJORAS CRITICAS v1.1 ==========
// ========================================================

function verificarPINmejorado() {
  const credId = localStorage.getItem(WEBAUTHN_KEY);
  const tienePin = appPIN && appPIN.length > 0;
  _updatePinBioBtn();

  // FIX SEGURIDAD: si hay PIN configurado, SIEMPRE exigir verificación.
  // El antiguo "Recordar PIN 30 días" entraba sin verificar y dependía
  // de que IDB tuviera state plano — eso ya no aplica.
  if (!tienePin) {
    // Sin PIN: flujo libre
    if (!state.setup) document.getElementById('onboarding').style.display = 'flex';
    else renderAll();
    return;
  }

  // Si biometría está configurada, intentarla primero
  if (credId && isWebAuthnAvailable()) {
    _showBioScreen();
    authenticateWithWebAuthn().then(async ok => {
      _setBioResult(ok);
      setTimeout(async () => {
        _hideBioScreen();
        if (ok) {
          // Biometría OK → simular el flujo completo de verificarPIN: descifrar y cargar
          // (esto requiere que el PIN esté guardado o que la biometría libere la DEK
          //  por otro mecanismo; si no, caemos al PIN)
          const tieneSesionPIN = !!_sessionPIN;
          if (tieneSesionPIN) {
            sessionStorage.setItem('pinVerificado','true');
            if (!state.setup) document.getElementById('onboarding').style.display='flex';
            else renderAll();
          } else {
            // Biometría OK pero sin DEK accesible — pedir PIN para descifrar
            document.getElementById('modal-pin').style.display = 'flex';
            document.getElementById('pin-input')?.focus();
          }
        } else {
          // Falló biometría → caer al PIN
          document.getElementById('modal-pin').style.display = 'flex';
          document.getElementById('pin-input')?.focus();
        }
      }, 1000);
    });
    return;
  }

  // Sin biometría: siempre pedir PIN (ignoramos recordarPIN por seguridad)
  document.getElementById('modal-pin').style.display = 'flex';
  document.getElementById('pin-input')?.focus();
}

// P0-1: verificarPIN async con comparación de hash PBKDF2
var verificarPINoriginal = null; // ya no se usa, se mantiene por compatibilidad
verificarPIN = async function() {
  const intento = document.getElementById('pin-input').value;
  const storedHash = localStorage.getItem('finanzas_pin_hash');
  const storedSaltB64 = localStorage.getItem('finanzas_pin_salt');
  
  if (!storedHash || !storedSaltB64) {
    // Sin PIN configurado: acceso directo (onboarding inicial)
    sessionStorage.setItem('pinVerificado','true');
    document.getElementById('modal-pin').style.display='none';
    if (!state.setup) document.getElementById('onboarding').style.display='flex';
    else renderAll();
    return;
  }
  
  const salt = Uint8Array.from(atob(storedSaltB64), c => c.charCodeAt(0));
  const intentoHash = await _derivarHashPIN(intento, salt);
  
  if (intentoHash === storedHash) {
    // ✅ PIN correcto
    sessionStorage.setItem('pinVerificado','true');
    _sessionPIN = intento; // Guardar PIN en memoria para esta sesión
    
    // ────────────────────────────────────────────────────────────
    // Si existe DEK cifrada, descifrarla con la KEK (derivada del PIN)
    // ────────────────────────────────────────────────────────────
    const dekData = _loadDEKFromStorage();
    
    if (dekData) {
      // Hay DEK cifrada → descifrarla y cargar state cifrado
      const kek = await _deriveKEKFromPIN(intento, salt);
      _sessionDEK = await _decryptDEK(dekData.encrypted, dekData.iv, kek);
      
      if (!_sessionDEK) {
        // Fallo al descifrar DEK (datos corruptos o PIN incorrecto — pero el hash coincidió)
        alert('❌ Error descifrando los datos. Contacta soporte o restaura desde backup.');
        return;
      }
      
      // Descifrar state desde localStorage
      const loaded = await loadAndDecryptState();
      if (!loaded) {
        // No había LS cifrado → cargar desde IDB (usuario que solo tenía IDB)
        if (typeof _completarCargaApp === 'function') {
          await _completarCargaApp();
          document.getElementById('modal-pin').style.display='none';
          document.getElementById('pin-input').value='';
          document.getElementById('pin-error').style.display='none';
          return;
        }
        alert('❌ Error cargando tus datos. Restaura desde backup cifrado.');
        return;
      }
      
      // FIX SEGURIDAD: re-sincronizar IDB con el state descifrado.
      // (Antes IDB tenía una copia plana que se cargaba sin PIN; ahora la
      //  sobreescribimos con los datos descifrados y autoritativos.)
      try { await saveStateToDB(state); } catch(e) { console.warn('Sync IDB tras unlock:', e); }
      
      console.log('🔓 Datos descifrados correctamente');
    } else {
      // No hay DEK cifrada → usuario legacy con state en plano
      // Necesitamos MIGRAR: generar DEK, cifrar state, guardar
      console.log('📦 Migrando usuario legacy a cifrado...');
      // Si el state está vacío (porque no lo cargamos en onload por seguridad),
      // primero hay que cargar desde IDB para tener algo que migrar
      if (!state.setup) {
        try {
          const idbState = await loadStateFromDB();
          if (idbState) {
            Object.keys(state).forEach(key => {
              if (idbState[key] !== undefined) state[key] = idbState[key];
            });
          }
        } catch(e) { console.warn('Carga IDB pre-migración:', e); }
      }
      await _migrarStatePlanoACifrado(intento, salt);
    }
    
    document.getElementById('modal-pin').style.display='none';
    document.getElementById('pin-input').value='';
    document.getElementById('pin-error').style.display='none';
    
    if (!state.setup) {
      document.getElementById('onboarding').style.display='flex';
    } else {
      renderAll();
    }
  } else {
    // ❌ PIN incorrecto
    document.getElementById('pin-error').style.display='block';
    document.getElementById('pin-input').value='';
    setTimeout(function(){ document.getElementById('pin-error').style.display='none'; }, 3000);
  }
};

// SISTEMA DE PAPELERA
function eliminarGastoConPapelera(id) {
  var gasto = state.transactions.find(function(t) { return t.id === id; });
  if (!gasto) return;
  if (confirm('Eliminar este gasto? Puedes recuperarlo desde la papelera.')) {
    gasto.deletedAt = new Date().toISOString();
    save();
    renderAll();
    alert('Eliminado. Ve a Configuracion > Papelera para restaurar si lo necesitas.');
  }
}

function restaurarGastoDePapelera(id) {
  var gasto = state.transactions.find(function(t) { return t.id == id && t.deletedAt; });
  if (!gasto) return;
  gasto.deletedAt = null;
  save();
  renderAll();
  alert('Gasto restaurado correctamente');
}

function vaciarPapelera() {
  var deleted = state.transactions.filter(function(t) { return t.deletedAt; });
  if (deleted.length === 0) { alert('Papelera vacia'); return; }
  if (confirm('Eliminar permanentemente ' + deleted.length + ' gastos? Esta accion NO se puede deshacer.')) {
    state.transactions = state.transactions.filter(function(t) { return !t.deletedAt; });
    save();
    renderAll();
    alert('Papelera vaciada');
  }
}

function renderPapelera() {
  var deleted = state.transactions.filter(function(t) { return t.deletedAt; })
    .sort(function(a, b) { return new Date(b.deletedAt) - new Date(a.deletedAt); });
  var trashList = document.getElementById('trash-list');
  if (!trashList) return;
  if (deleted.length === 0) {
    trashList.innerHTML = '<p style="text-align:center;color:var(--text2);padding:10px;font-size:12px">Papelera vacia</p>';
    var emptyBtn = document.getElementById('empty-trash-btn');
    if (emptyBtn) emptyBtn.style.display = 'none';
    return;
  }
  var html = '';
  for (var i = 0; i < deleted.length; i++) {
    var t = deleted[i];
    html += '<div class="trash-item">';
    html += '<div><strong>' + (t.cat || 'Sin categoria') + '</strong> - L.' + t.amount.toFixed(2);
    html += '<br/><small>' + new Date(t.date).toLocaleDateString() + '</small></div>';
    html += '<button class="btn btn-restore" onclick="restaurarGastoDePapelera(' + t.id + ')">Restaurar</button>';
    html += '</div>';
  }
  trashList.innerHTML = html;
  var emptyBtn = document.getElementById('empty-trash-btn');
  if (emptyBtn) emptyBtn.style.display = 'block';
}

// ALERTAS DE PRESUPUESTO
function verificarAlertasPresupuesto() {
  // P0-2: excluir transferencias internas y conciliaciones del cálculo de presupuesto
  var realTx = state.transactions.filter(function(t) { return !t.deletedAt && !t.esTransferencia && !t.esConciliacion; });
  var ingresos = realTx.filter(function(t) { return t.type === 'income'; }).reduce(function(a, b) { return a + b.amount; }, 0);
  var gastos = realTx.filter(function(t) { return t.type === 'expense'; }).reduce(function(a, b) { return a + b.amount; }, 0);
  var porcentaje = ingresos > 0 ? (gastos / ingresos) * 100 : 0;
  var alertasDiv = document.getElementById('budget-alerts');
  if (!alertasDiv) return;
  var html = '';
  if (porcentaje >= 100) {
    html = '<div class="alert-budget-critical"><span style="font-size:20px">🚨</span><div class="alert-content"><div class="alert-title">PRESUPUESTO EXCEDIDO!</div><div class="alert-detail">Gastaste L.' + gastos.toFixed(2) + ' de L.' + ingresos.toFixed(2) + ' (' + porcentaje.toFixed(0) + '%)</div></div></div>';
  } else if (porcentaje >= 80) {
    html = '<div class="alert-budget-warning"><span style="font-size:20px">⚠️</span><div class="alert-content"><div class="alert-title">Presupuesto al ' + Math.round(porcentaje) + '%</div><div class="alert-detail">Te quedan L.' + (ingresos - gastos).toFixed(2) + ' para gastar</div></div></div>';
  }
  alertasDiv.innerHTML = html;
}

// PROYECCION DE FLUJO DE CAJA
function calcularProyeccionCaja() {
  // P0-2: excluir transferencias internas (las conciliaciones SÍ cuentan en el balance real)
  var balTx = state.transactions.filter(function(t) { return !t.deletedAt && !t.esTransferencia; });
  var ingresos = balTx.filter(function(t) { return t.type === 'income'; }).reduce(function(a, b) { return a + b.amount; }, 0);
  var gastos = balTx.filter(function(t) { return t.type === 'expense'; }).reduce(function(a, b) { return a + b.amount; }, 0);
  var balance = (state.saldoInicial || 0) + ingresos - gastos;
  var hace30dias = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  // Promedio diario: excluir conciliaciones (ajustes grandes distorsionan la proyección)
  var gastosUltimos30 = state.transactions.filter(function(t) { return t.type === 'expense' && !t.deletedAt && !t.esTransferencia && !t.esConciliacion && new Date(t.date) > hace30dias; }).reduce(function(a, b) { return a + b.amount; }, 0);
  var gastoDiario = gastosUltimos30 / 30;
  var diasSupervivencia = gastoDiario > 0 ? Math.floor(balance / gastoDiario) : 999;
  var proyectDiv = document.getElementById('cashflow-projection');
  if (!proyectDiv) return;
  if (diasSupervivencia < 999 && balance > 0) {
    var html = '<div class="cashflow-projection">';
    html += '<span class="cashflow-number">' + diasSupervivencia + '</span>';
    html += '<span class="cashflow-label">Dias hasta fin de fondos</span>';
    html += '<small style="color:var(--text2);display:block;margin-top:5px">Con gasto promedio de L.' + gastoDiario.toFixed(2) + '/dia</small>';
    html += '</div>';
    proyectDiv.innerHTML = html;
  } else {
    proyectDiv.innerHTML = '';
  }
}

// DETECCION DE DUPLICADOS
function detectarDuplicados() {
  var recientes = state.transactions.filter(function(t) { return !t.deletedAt; }).sort(function(a, b) { return new Date(b.date) - new Date(a.date); }).slice(0, 20);
  var duplicadosHtml = [];
  var procesados = {};
  for (var i = 0; i < recientes.length - 1; i++) {
    var t1 = recientes[i];
    if (procesados[t1.id]) continue;
    for (var j = i + 1; j < recientes.length; j++) {
      var t2 = recientes[j];
      if (procesados[t2.id]) continue;
      var mismaCantidad = t1.amount === t2.amount;
      var mismaCategoria = t1.cat === t2.cat;
      var fechaCercana = Math.abs(new Date(t1.date) - new Date(t2.date)) < 5 * 60 * 1000;
      if (mismaCantidad && mismaCategoria && fechaCercana) {
        var html = '<div class="duplicate-warning">';
        html += '<span><strong>⚠️ Duplicado posible:</strong> ' + t1.cat + ' L.' + t1.amount + '</span>';
        html += '<button class="btn btn-duplicate-action" onclick="eliminarGastoConPapelera(' + t2.id + ')">Eliminar</button>';
        html += '</div>';
        duplicadosHtml.push(html);
        procesados[t2.id] = true;
      }
    }
  }
  var duplicadosDiv = document.getElementById('duplicates-alert');
  if (!duplicadosDiv) return;
  if (duplicadosHtml.length > 0) {
    duplicadosDiv.innerHTML = duplicadosHtml.join('');
    duplicadosDiv.style.display = 'block';
  } else {
    duplicadosDiv.innerHTML = '';
    duplicadosDiv.style.display = 'none';
  }
}

// VALIDACION DE MONTO
function validarMonto(input) {
  var valor = input.value.replace(/[^0-9.]/g, '');
  var partes = valor.split('.');
  if (partes.length > 2) valor = partes[0] + '.' + partes.slice(1).join('');
  if (partes[1] && partes[1].length > 2) valor = partes[0] + '.' + partes[1].slice(0, 2);
  input.value = valor;
}

// VER TUTORIAL DE NUEVO
function mostrarTutorialDeNuevo() {
  document.getElementById('onboarding').style.display = 'flex';
}

// INYECTAR ELEMENTOS NUEVOS EN DOM
function inyectarElementosNuevos() {
  var dashboard = document.getElementById('view-dashboard');
  if (dashboard && !document.getElementById('budget-alerts')) {
    var alertasDiv = document.createElement('div');
    alertasDiv.id = 'budget-alerts';
    alertasDiv.style.marginBottom = '15px';
    dashboard.insertBefore(alertasDiv, dashboard.firstChild);
  }
  if (dashboard && !document.getElementById('duplicates-alert')) {
    var dupDiv = document.createElement('div');
    dupDiv.id = 'duplicates-alert';
    dupDiv.style.marginBottom = '15px';
    dupDiv.style.display = 'none';
    dashboard.insertBefore(dupDiv, dashboard.firstChild);
  }
  if (dashboard && !document.getElementById('cashflow-projection')) {
    var projDiv = document.createElement('div');
    projDiv.id = 'cashflow-projection';
    dashboard.appendChild(projDiv);
  }
  var configView = document.getElementById('view-config');
  if (configView && !document.getElementById('tutorial-btn')) {
    var btn = document.createElement('button');
    btn.id = 'tutorial-btn';
    btn.className = 'btn btn-secondary';
    btn.innerHTML = '❓ Ver tutorial nuevamente';
    btn.onclick = mostrarTutorialDeNuevo;
    btn.style.marginTop = '10px';
    configView.appendChild(btn);
  }
  if (configView && !document.getElementById('trash-section-wrapper')) {
    var trashDiv = document.createElement('div');
    trashDiv.id = 'trash-section-wrapper';
    trashDiv.className = 'trash-section';
    trashDiv.innerHTML = '<h4 style="margin-bottom:10px">🗑️ Papelera de Gastos</h4><div id="trash-list"></div><button id="empty-trash-btn" class="btn btn-danger" onclick="vaciarPapelera()" style="margin-top:10px;display:none">Vaciar Papelera</button>';
    configView.appendChild(trashDiv);
  }
}

function ejecutarVerificacionesNuevas() {
  inyectarElementosNuevos();
  setTimeout(function() {
    verificarAlertasPresupuesto();
    calcularProyeccionCaja();
    renderLiquidez7Dias();
    detectarDuplicados();
    renderPapelera();
    renderChipsRapidas();
    // Notificaciones locales de pagos próximos
    if (typeof verificarNotificacionesPagos === 'function') verificarNotificacionesPagos();
  }, 200);
}

// ─────────────────────────────────────────────────────────────────────
// NOTIFICACIONES LOCALES — pagos próximos (sin backend)
// Usa la Web Notifications API nativa del navegador + localStorage
// para evitar repetir la misma notificación el mismo día.
// ─────────────────────────────────────────────────────────────────────
async function verificarNotificacionesPagos() {
  if (!state.setup || !state.pagosRecurrentes?.length) return;
  // Pedir permiso si no se ha pedido aún
  if (Notification.permission === 'default') return; // no pedir automáticamente al cargar
  if (Notification.permission !== 'granted') return;

  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const hoyStr = hoy.toISOString().slice(0, 10);
  const notifHoy = JSON.parse(localStorage.getItem('mph_notif_dia_' + hoyStr) || '[]');

  const sw = navigator.serviceWorker?.controller
    || (await navigator.serviceWorker?.ready?.then(r => r)?.catch(() => null));

  for (const pago of state.pagosRecurrentes) {
    if (pago.esIngreso) continue; // no notificar ingresos
    if (!pago.notificacion) continue;
    const alerta = parseInt(pago.alerta) || 3; // días de anticipación
    let fpago = new Date(hoy.getFullYear(), hoy.getMonth(), pago.dia);
    if (fpago < hoy) fpago.setMonth(fpago.getMonth() + 1);
    const diasRestantes = Math.ceil((fpago - hoy) / 86400000);
    if (diasRestantes <= alerta && diasRestantes >= 0 && !notifHoy.includes(pago.id)) {
      const titulo = diasRestantes === 0
        ? '🔴 ¡Hoy vence: ' + pago.servicio + '!'
        : '⏰ Pago en ' + diasRestantes + ' día' + (diasRestantes > 1 ? 's' : '') + ': ' + pago.servicio;
      const cuerpo = 'Monto: ' + fL(pago.monto) + ' · Vence el día ' + pago.dia;

      // Mostrar notificación via SW (más confiable) o directa
      try {
        const reg = await navigator.serviceWorker?.ready;
        if (reg) {
          reg.showNotification(titulo, {
            body: cuerpo,
            icon: './icon-192.png',
            badge: './icon-192.png',
            tag: 'pago-' + pago.id,
            vibrate: [200, 100, 200]
          });
        } else {
          new Notification(titulo, { body: cuerpo, icon: './icon-192.png' });
        }
        notifHoy.push(pago.id);
      } catch(e) { console.warn('Notificación falló:', e); }
    }
  }
  localStorage.setItem('mph_notif_dia_' + hoyStr, JSON.stringify(notifHoy));
  // Limpiar notificaciones de días anteriores (mantener solo hoy)
  for (let i = 1; i <= 7; i++) {
    const d = new Date(hoy); d.setDate(d.getDate() - i);
    localStorage.removeItem('mph_notif_dia_' + d.toISOString().slice(0, 10));
  }
}
window.verificarNotificacionesPagos = verificarNotificacionesPagos;

// ==========================================
// 📊 OPCIÓN 6: LIQUIDEZ PROYECTADA 7 DÍAS
// ==========================================
function renderLiquidez7Dias() {
  const container = document.getElementById('liquidez-7dias');
  if (!container) return;
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  // P0-2: excluir transferencias internas (las conciliaciones SÍ son ajustes legítimos del balance)
  const saldoActual = state.saldoInicial
    + state.transactions.filter(t=>t.type==='income'&&!t.deletedAt&&!t.esTransferencia).reduce((a,b)=>a+b.amount,0)
    - state.transactions.filter(t=>t.type==='expense'&&!t.deletedAt&&!t.esTransferencia).reduce((a,b)=>a+b.amount,0);
  const pagosProximos = [];
  (state.pagosRecurrentes||[]).forEach(p => {
    let fp = new Date(hoy.getFullYear(), hoy.getMonth(), p.dia);
    if (fp < hoy) fp.setMonth(fp.getMonth()+1);
    const dias = Math.ceil((fp-hoy)/86400000);
    if (dias>=0 && dias<=7) pagosProximos.push({nombre:p.servicio, monto:p.monto, dias});
  });
  (state.prestamos||[]).forEach(p => {
    if (!p.cuota || p.cuotasPagadas >= p.cuotasTotal) return;
    const diaPago = p.fechaPago ? new Date(p.fechaPago).getDate() : 5;
    let fp = new Date(hoy.getFullYear(), hoy.getMonth(), diaPago);
    if (fp < hoy) fp.setMonth(fp.getMonth()+1);
    const dias = Math.ceil((fp-hoy)/86400000);
    if (dias>=0 && dias<=7) pagosProximos.push({nombre:'Cuota: '+p.entidad, monto:p.cuota, dias});
  });
  (state.tarjetas||[]).forEach(t => {
    if (t.saldo<=0) return;
    let fp = new Date(hoy.getFullYear(), hoy.getMonth(), t.pago||15);
    if (fp < hoy) fp.setMonth(fp.getMonth()+1);
    const dias = Math.ceil((fp-hoy)/86400000);
    if (dias>=0 && dias<=7) pagosProximos.push({nombre:'Mín. '+t.nombre, monto:Math.max(t.saldo*0.05,100), dias});
  });
  const totalEgresos = pagosProximos.reduce((a,b)=>a+b.monto,0);
  const liquidezReal = saldoActual - totalEgresos;
  const ratio = saldoActual>0 ? Math.max(0, liquidezReal/saldoActual) : 0;
  let estado, barColor;
  if (liquidezReal<0)    { estado='danger';  barColor='var(--red)'; }
  else if (ratio<0.3)    { estado='warning'; barColor='var(--amber)'; }
  else                   { estado='safe';    barColor='var(--green)'; }
  const badges = {safe:'badge-liq-safe',warning:'badge-liq-warning',danger:'badge-liq-danger'};
  const labels = {safe:'✅ Liquidez Saludable',warning:'⚠️ Liquidez Ajustada',danger:'🚨 Riesgo de Iliquidez'};
  const pct = Math.min(100,(ratio*100)).toFixed(0);
  const filas = pagosProximos.length > 0
    ? pagosProximos.sort((a,b)=>a.dias-b.dias).map(p=>{
        const dc = p.dias===0?'liq-dias-hoy':p.dias<=2?'liq-dias-1-2':'liq-dias-3-7';
        const dl = p.dias===0?'HOY':p.dias===1?'1 día':p.dias+' días';
        return `<div class="liquidez-pago-row"><span style="font-weight:600">${esc(p.nombre)}</span><div style="display:flex;align-items:center;gap:8px"><span class="liq-dias ${dc}">${dl}</span><span style="font-weight:700;color:var(--red)">-${fL(p.monto)}</span></div></div>`;
      }).join('')
    : `<div style="text-align:center;font-size:12px;color:var(--text2);padding:6px 0">✅ Sin pagos en los próximos 7 días</div>`;
  container.innerHTML = `<div class="liquidez-widget">
    <div class="liquidez-header"><span class="liquidez-title">💧 Liquidez · próximos 7 días</span><span class="liquidez-badge ${badges[estado]}">${labels[estado]}</span></div>
    <div class="liquidez-grid">
      <div class="liquidez-box"><div class="liquidez-box-label">Saldo Actual</div><div class="liquidez-box-value" style="color:var(--blue)">${fL(saldoActual)}</div></div>
      <div class="liquidez-box"><div class="liquidez-box-label">Egresos 7d</div><div class="liquidez-box-value" style="color:var(--red)">-${fL(totalEgresos)}</div></div>
      <div class="liquidez-box"><div class="liquidez-box-label">Disponible Real</div><div class="liquidez-box-value" style="color:${barColor}">${fL(liquidezReal)}</div></div>
    </div>
    <div class="liquidez-bar-wrap"><div class="liquidez-bar" style="width:${pct}%;background:${barColor}"></div></div>
    <div class="liquidez-pagos">${filas}</div>
  </div>`;
}

// ==========================================
// ✏️ EDITAR / ELIMINAR TRANSACCIONES
// ==========================================
let _editTxType = 'expense';

function abrirEdicionTx(id) {
  const t = state.transactions.find(x => x.id === id);
  if (!t) return;
  _editTxType = t.type;
  document.getElementById('edit-tx-id').value = id;
  document.getElementById('edit-monto').value = t.amount;
  document.getElementById('edit-cat').value = t.cat || '';
  document.getElementById('edit-subcat').value = t.subcat || '';
  document.getElementById('edit-etiqueta').value = t.etiqueta || '';
  // Fecha
  const d = new Date(t.date);
  const localISO = new Date(d.getTime() - d.getTimezoneOffset()*60000).toISOString().slice(0,16);
  document.getElementById('edit-fecha').value = localISO;
  // Tipo de gasto
  const tipoWrap = document.getElementById('edit-tipo-wrap');
  if (t.type === 'expense') {
    tipoWrap.style.display = 'block';
    document.getElementById('edit-tipo').value = t.tipo || 'extra';
  } else {
    tipoWrap.style.display = 'none';
  }
  // Toggle tipo
  document.getElementById('edit-type-income').className = 'edit-type-btn' + (t.type==='income'?' active-income':'');
  document.getElementById('edit-type-expense').className = 'edit-type-btn' + (t.type==='expense'?' active-expense':'');
  openModal('modal-edit-tx');
}

function setEditType(tipo) {
  _editTxType = tipo;
  document.getElementById('edit-type-income').className = 'edit-type-btn' + (tipo==='income'?' active-income':'');
  document.getElementById('edit-type-expense').className = 'edit-type-btn' + (tipo==='expense'?' active-expense':'');
  document.getElementById('edit-tipo-wrap').style.display = tipo==='expense' ? 'block' : 'none';
}

function guardarEdicionTx() {
  const id = document.getElementById('edit-tx-id').value; // P1-4: UUID string, no parseInt
  const t = state.transactions.find(x => String(x.id) === String(id));
  if (!t) return;
  const nuevoMonto = parseFloat(document.getElementById('edit-monto').value);
  if (!nuevoMonto || nuevoMonto <= 0) { alert('Monto inválido'); return; }
  // Ajustar saldo si cambió el monto o tipo
  const montoDiff = nuevoMonto - t.amount;
  const tipoCambio = _editTxType !== t.type;
  // Actualizar campos
  t.amount   = nuevoMonto;
  t.cat      = document.getElementById('edit-cat').value || t.cat;
  t.subcat   = document.getElementById('edit-subcat').value;
  t.etiqueta = document.getElementById('edit-etiqueta').value.trim();
  t.date     = new Date(document.getElementById('edit-fecha').value).toISOString();
  if (_editTxType === 'expense') t.tipo = document.getElementById('edit-tipo').value;
  if (tipoCambio) t.type = _editTxType;
  save();
  closeModal('modal-edit-tx');
  renderAll();
}

// ==========================================
// 🏷️ OPCIÓN 4: ETIQUETAS CON AUTOCOMPLETE
// ==========================================
function getEtiquetasGuardadas() {
  const freq = {};
  (state.transactions||[]).forEach(t => {
    if (t.etiqueta && t.etiqueta.trim()) {
      const e = t.etiqueta.trim().toLowerCase();
      freq[e] = (freq[e]||0)+1;
    }
  });
  return Object.entries(freq).sort((a,b)=>b[1]-a[1]).map(([label,count])=>({label,count}));
}

function onEtiquetaInput() {
  const val = (document.getElementById('etiqueta-input')?.value||'').trim().toLowerCase();
  const todas = getEtiquetasGuardadas();
  const matches = val ? todas.filter(e=>e.label.includes(val)) : todas.slice(0,5);
  renderEtiquetaDropdown(matches, val);
  toggleClearBtn();
}

function onEtiquetaFocus() {
  const todas = getEtiquetasGuardadas().slice(0,5);
  renderEtiquetaDropdown(todas, '');
}

function onEtiquetaBlur() {
  setTimeout(()=>{ document.getElementById('etiqueta-dropdown')?.classList.remove('open'); }, 150);
}

function onEtiquetaKeydown(e) {
  if(e.key==='Escape') clearEtiqueta();
  if(e.key==='Enter'){ e.preventDefault(); document.getElementById('etiqueta-dropdown')?.classList.remove('open'); }
}

function renderEtiquetaDropdown(matches, query) {
  const dd = document.getElementById('etiqueta-dropdown');
  if(!dd) return;
  if(matches.length===0 && !query){ dd.classList.remove('open'); return; }
  let html = matches.map(e=>`<div class="etiqueta-option" onclick="selectEtiqueta('${e.label}')"><span>${e.label}</span><span class="etiqueta-option-count">${e.count}x</span></div>`).join('');
  const exact = matches.find(e=>e.label===query);
  if(query && !exact) html += `<div class="etiqueta-option" onclick="selectEtiqueta('${query}')"><span class="etiqueta-option-new">+ Crear "${query}"</span></div>`;
  if(!html){ dd.classList.remove('open'); return; }
  dd.innerHTML = html;
  dd.classList.add('open');
}

function selectEtiqueta(val) {
  const input = document.getElementById('etiqueta-input');
  if(input) input.value = val;
  document.getElementById('etiqueta-dropdown')?.classList.remove('open');
  toggleClearBtn();
  renderChipsRapidas();
}

function clearEtiqueta() {
  const input = document.getElementById('etiqueta-input');
  if(input) input.value='';
  toggleClearBtn();
  document.getElementById('etiqueta-dropdown')?.classList.remove('open');
}

function toggleClearBtn() {
  const btn = document.getElementById('etiqueta-clear');
  const val = document.getElementById('etiqueta-input')?.value;
  if(btn) btn.classList.toggle('visible', !!(val&&val.length>0));
}

function renderChipsRapidas() {
  const container = document.getElementById('chips-rapidas-gasto');
  if(!container) return;
  const top5 = getEtiquetasGuardadas().slice(0,5);
  if(top5.length===0){ container.innerHTML=''; return; }
  const activa = document.getElementById('etiqueta-input')?.value||'';
  container.innerHTML = top5.map(e=>`<span class="chip-etiqueta ${e.label===activa?'active':''}" onclick="selectEtiqueta('${e.label}')">${e.label}</span>`).join('');
}

// ==========================================
// 🔐 OPCIÓN 5: WEBAUTHN — BIOMETRÍA NATIVA
// ==========================================
const WEBAUTHN_KEY = 'mipistohn_webauthn_credId';

function isWebAuthnAvailable() {
  return !!(window.PublicKeyCredential &&
    typeof navigator.credentials?.create === 'function' &&
    typeof navigator.credentials?.get === 'function');
}
function _bufToB64(buf) {
  const b = new Uint8Array(buf); let s = '';
  b.forEach(x => s += String.fromCharCode(x));
  return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
}
function _b64ToBuf(b64) {
  const s = atob(b64.replace(/-/g,'+').replace(/_/g,'/'));
  const b = new Uint8Array(s.length);
  for (let i=0;i<s.length;i++) b[i]=s.charCodeAt(i);
  return b;
}
function _getRpId() { return window.location.hostname || 'localhost'; }

async function registrarBiometria() {
  if (!isWebAuthnAvailable()) { alert('❌ Tu dispositivo no soporta biometría.'); return; }
  try {
    const cred = await navigator.credentials.create({ publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'Mi Pisto HN', id: _getRpId() },
      user: { id: crypto.getRandomValues(new Uint8Array(16)), name: 'usuario', displayName: 'Mi Pisto HN' },
      pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'preferred' },
      timeout: 60000, attestation: 'none'
    }});
    localStorage.setItem(WEBAUTHN_KEY, _bufToB64(cred.rawId));
    renderBiometriaConfig();
    alert('✅ ¡Biometría activada! La próxima vez usa tu huella o Face ID.');
  } catch(e) {
    if (e.name==='NotAllowedError') alert('❌ Acceso denegado. Verifica los permisos del dispositivo.');
    else if (e.name==='InvalidStateError') alert('⚠️ Ya hay una credencial registrada.');
    else alert('❌ Error: ' + e.message);
  }
}

async function authenticateWithWebAuthn() {
  const credId = localStorage.getItem(WEBAUTHN_KEY);
  if (!credId || !isWebAuthnAvailable()) return false;
  try {
    await navigator.credentials.get({ publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      allowCredentials: [{ id: _b64ToBuf(credId), type: 'public-key' }],
      userVerification: 'required', timeout: 60000
    }});
    return true;
  } catch(e) { console.warn('WebAuthn:', e.name); return false; }
}

function desactivarBiometria() {
  if (!confirm('¿Desactivar la autenticación biométrica?')) return;
  localStorage.removeItem(WEBAUTHN_KEY);
  renderBiometriaConfig();
  alert('🚫 Biometría desactivada.');
}

function renderBiometriaConfig() {
  const el = document.getElementById('biometria-config');
  if (!el) return;
  if (!isWebAuthnAvailable()) {
    el.innerHTML = `<div class="bio-unavailable">
      <div style="font-size:24px;margin-bottom:6px">📵</div>
      <div style="font-weight:700;font-size:13px;margin-bottom:4px">No disponible en este dispositivo</div>
      <div style="font-size:11px;color:var(--text2)">Requiere iOS Safari 14+ o Chrome 70+ en HTTPS.</div>
    </div>`; return;
  }
  const credId = localStorage.getItem(WEBAUTHN_KEY);
  if (credId) {
    el.innerHTML = `
      <div class="bio-status-card bio-status-active">
        <div style="font-size:28px">✅</div>
        <div><div style="font-weight:700;font-size:13px;color:var(--green)">Biometría Activada</div>
        <div style="font-size:11px;color:var(--text2)">Huella / Face ID activos al abrir la app</div></div>
      </div>
      <button class="btn btn-secondary" onclick="desactivarBiometria()" style="border:1px solid rgba(255,68,68,.3);color:var(--red);min-height:52px">🚫 Desactivar Biometría</button>`;
  } else {
    el.innerHTML = `
      <div class="bio-status-card bio-status-inactive">
        <div style="font-size:28px">👆</div>
        <div><div style="font-weight:700;font-size:13px">Disponible en tu dispositivo</div>
        <div style="font-size:11px;color:var(--text2)">Activa para no escribir el PIN cada vez</div></div>
      </div>
      <button class="btn btn-primary" onclick="registrarBiometria()" style="min-height:52px">🔐 Activar Huella / Face ID</button>`;
  }
}

function _showBioScreen() {
  const icon=document.getElementById('bio-icon');
  const title=document.getElementById('bio-title');
  const sub=document.getElementById('bio-sub');
  if(icon){icon.className='biometric-icon';icon.textContent='👆';}
  if(title) title.textContent='Verificando identidad';
  if(sub) sub.textContent='Usa tu huella dactilar o Face ID para continuar';
  document.getElementById('bio-screen')?.classList.add('visible');
}
function _hideBioScreen() { document.getElementById('bio-screen')?.classList.remove('visible'); }
function _setBioResult(ok) {
  const icon=document.getElementById('bio-icon');
  const title=document.getElementById('bio-title');
  const sub=document.getElementById('bio-sub');
  if(ok){
    if(icon){icon.className='biometric-icon success';icon.textContent='✅';}
    if(title) title.textContent='¡Identidad verificada!';
    if(sub) sub.textContent='Entrando a Mi Pisto HN…';
  } else {
    if(icon){icon.className='biometric-icon error';icon.textContent='✕';}
    if(title) title.textContent='No se pudo verificar';
    if(sub) sub.textContent='Usa tu PIN para continuar.';
  }
}

function usarPINcomoFallback() {
  _hideBioScreen();
  document.getElementById('modal-pin').style.display = 'flex';
  document.getElementById('pin-input')?.focus();
}

async function intentarBiometriaDesdePin() {
  document.getElementById('modal-pin').style.display = 'none';
  _showBioScreen();
  const ok = await authenticateWithWebAuthn();
  _setBioResult(ok);
  setTimeout(() => {
    _hideBioScreen();
    if (ok) {
      sessionStorage.setItem('pinVerificado','true');
      if (!state.setup) document.getElementById('onboarding').style.display='flex';
      else renderAll();
    } else {
      document.getElementById('modal-pin').style.display='flex';
      document.getElementById('pin-input')?.focus();
    }
  }, 1000);
}

function _updatePinBioBtn() {
  const wrap = document.getElementById('pin-bio-btn-wrap');
  if (!wrap) return;
  wrap.style.display = (localStorage.getItem(WEBAUTHN_KEY) && isWebAuthnAvailable()) ? 'block' : 'none';
}

// ==========================================
// ==========================================

async function requestPersistence() {
  if (navigator.storage && navigator.storage.persist) {
    try {
      const isPersisted = await navigator.storage.persist();
      console.log('Persistencia ITP: ' + (isPersisted ? '🛡️ BLINDADA' : '⚠️ VOLÁTIL'));
      const persistDiv = document.getElementById('persistence-info');
      if (persistDiv) {
        if (isPersisted) {
          persistDiv.innerHTML = '<div class="card" style="border-left:4px solid var(--green);margin-top:15px"><h4 style="color:var(--green);margin-bottom:8px">✅ Almacenamiento Persistente Activado</h4><p style="font-size:12px;color:var(--text2)">Tu navegador garantiza que los datos no se limpiarán automáticamente. Igual se recomienda hacer respaldos periódicos.</p></div>';
        } else {
          persistDiv.innerHTML = '<div class="card" style="border-left:4px solid var(--amber);margin-top:15px"><h4 style="color:var(--amber);margin-bottom:8px">⚠️ Almacenamiento No Persistente</h4><p style="font-size:12px;color:var(--text2)">Safari/iOS puede borrar los datos después de 7 días sin uso. Exporta un respaldo regularmente.</p><button class="btn btn-primary" onclick="exportDataEncriptado()" style="margin-top:10px">💾 Exportar Respaldo Ahora</button></div>';
        }
      }
    } catch (error) {
      console.error('Error solicitando persistencia:', error);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════
// PRESUPUESTO POR CATEGORÍA — renderizado y cálculo
// ═══════════════════════════════════════════════════════════════════════

/** Suma los gastos del mes actual por categoría (excluye transferencias y conciliaciones) */
function calcularGastosPorCategoria(mesOffset = 0) {
  const ahora = new Date();
  const año   = new Date(ahora.getFullYear(), ahora.getMonth() + mesOffset, 1).getFullYear();
  const mes   = new Date(ahora.getFullYear(), ahora.getMonth() + mesOffset, 1).getMonth();
  const totales = {};
  (state.transactions || []).forEach(t => {
    if (t.deletedAt || t.esTransferencia || t.esConciliacion) return;
    if (t.type !== 'expense') return;
    const d = new Date(t.date);
    if (d.getFullYear() !== año || d.getMonth() !== mes) return;
    const cat = t.cat || 'Otros';
    totales[cat] = (totales[cat] || 0) + (t.amount || 0);
  });
  return totales;
}

/** Renderiza el widget de presupuestos por categoría en el dashboard */
function renderBudgetCategorySummary() {
  const container = document.getElementById('budget-category-summary');
  if (!container) return;

  if (!state.budgets) state.budgets = [];
  const activos = state.budgets.filter(b => b.activo !== false);

  if (activos.length === 0) {
    container.innerHTML =
      '<div class="empty-state-simple" style="padding:16px">' +
        '<div style="font-size:28px;margin-bottom:6px">📊</div>' +
        '<div style="font-weight:700;font-size:13px;margin-bottom:4px">Sin presupuestos por categoría</div>' +
        '<div style="font-size:11px;color:var(--text2);margin-bottom:12px;line-height:1.4">Define cuánto querés gastar por categoría y la app te avisará cuando te estés pasando.</div>' +
        '<button onclick="openModal(\'modal-budget-category\')" class="btn btn-primary" style="font-size:12px;padding:8px 16px">➕ Crear presupuesto</button>' +
      '</div>';
    return;
  }

  const gastos = calcularGastosPorCategoria();
  let html = '<div class="budget-category-grid">';
  for (const b of activos) {
    const gastado = gastos[b.categoria] || 0;
    const pct     = b.montoMensual > 0 ? Math.min(100, (gastado / b.montoMensual) * 100) : 0;
    const excedido = gastado > b.montoMensual;
    const color   = b.color || 'var(--amber)';
    const barColor = pct >= 100 ? 'var(--red)' : pct >= 80 ? 'var(--amber)' : color;
    html +=
      '<div class="budget-category-card' + (excedido ? ' excedido' : '') + '" onclick="openModal(\'modal-budget-category\')">' +
        '<div class="bcc-header">' +
          '<span class="bcc-emoji">' + (b.emoji || '📌') + '</span>' +
          '<span class="bcc-name">' + esc(b.categoria) + '</span>' +
          '<button class="bcc-delete" onclick="event.stopPropagation();deleteBudget(\'' + b.id + '\')" title="Eliminar">✕</button>' +
        '</div>' +
        '<div class="bcc-amounts">' +
          '<span style="color:' + (excedido ? 'var(--red)' : 'var(--text)') + ';font-weight:700">' + fL(gastado) + '</span>' +
          '<span style="color:var(--text2);font-size:10px"> / ' + fL(b.montoMensual) + '</span>' +
        '</div>' +
        '<div class="goal-pro-bar-wrap" style="margin:6px 0 4px">' +
          '<div class="goal-pro-bar" style="width:' + pct.toFixed(1) + '%;background:' + barColor + ';transition:width .4s ease"></div>' +
        '</div>' +
        '<div class="bcc-pct" style="color:' + barColor + ';font-size:10px">' +
          pct.toFixed(0) + '% ' + (excedido ? '⛔ Superado' : pct >= 80 ? '⚠️ Cerca del límite' : '✓') +
        '</div>' +
      '</div>';
  }
  html +=
    '<div class="budget-category-card add-card" onclick="openModal(\'modal-budget-category\')" style="display:flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;border:2px dashed var(--border)">' +
      '<span style="font-size:18px">➕</span>' +
      '<span style="font-size:12px;color:var(--text2)">Agregar</span>' +
    '</div>';
  html += '</div>';
  container.innerHTML = html;
}
