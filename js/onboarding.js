/**
 * Mi Pisto HN — onboarding.js
 * ─────────────────────────────────────────────────────────
 * Wizard de 4 pasos para nuevos usuarios.
 * Perfil de ingresos recurrente y auto-registro de salario.
 * Requiere: utils.js, crypto.js, storage.js
 */

function syncObSaldo() {
  const ef = parseMonto(document.getElementById('ob-efectivo')?.value) || 0;
  const ah = parseMonto(document.getElementById('ob-ahorro')?.value) || 0;
  const total = ef + ah;
  const totalEl = document.getElementById('ob-total-val');
  if (totalEl) totalEl.textContent = fL(total);
}

function actualizarObDiaCobro() {
  const freq = document.getElementById('ob-frecuencia')?.value;
  const wrap = document.getElementById('ob-dia-cobro-wrap');
  if (!wrap) return;
  if (freq === 'variable') {
    wrap.style.display = 'none';
  } else {
    wrap.style.display = 'block';
    const sel = document.getElementById('ob-dia-cobro');
    if (freq === 'quincenal') {
      sel.innerHTML = '<option value="1">Día 1 (y día 16)</option><option value="5">Día 5 (y día 20)</option><option value="10">Día 10 (y día 25)</option><option value="15" selected>Día 15 (y día 30)</option>';
    } else if (freq === 'mensual') {
      sel.innerHTML = '<option value="1">Día 1</option><option value="5">Día 5</option><option value="10">Día 10</option><option value="15" selected>Día 15</option><option value="25">Día 25</option><option value="30">Día 30</option>';
    } else if (freq === 'semanal') {
      sel.innerHTML = '<option value="lunes" selected>Lunes</option><option value="viernes">Viernes</option><option value="sabado">Sábado</option>';
    }
  }
}

function toggleObDeuda() {
  const val = document.getElementById('ob-tiene-deuda')?.value;
  const form = document.getElementById('ob-deuda-form');
  if (form) form.style.display = val === 'si' ? 'block' : 'none';
}

function obIrAStep(step) {
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById('ob-step-' + i);
    if (el) el.style.display = i === step ? 'block' : 'none';
  }
  const pcts = { 1: 25, 2: 50, 3: 75, 4: 100 };
  const bar = document.getElementById('ob-progress-bar');
  if (bar) bar.style.width = pcts[step] + '%';
  const label = document.getElementById('ob-step-label');
  if (label) label.textContent = 'Paso ' + step + ' de 4';
  // Scroll al tope del modal
  const content = document.querySelector('#onboarding .modal-content div[style*="overflow-y"]');
  if (content) content.scrollTop = 0;
}

async function obSiguiente(fromStep, skip = false) {
  if (fromStep === 1) {
    // Validar nombre y PIN
    const nombre = document.getElementById('ob-nombre')?.value?.trim();
    if (!nombre) return alert('⚠️ Ingresa tu nombre para continuar');
    const pin1 = document.getElementById('ob-pin1')?.value;
    const pin2 = document.getElementById('ob-pin2')?.value;
    if (!pin1 || !/^\d{4}$/.test(pin1)) return alert('⚠️ El PIN debe tener exactamente 4 dígitos');
    if (pin1 !== pin2) return alert('⚠️ Los PINs no coinciden. Vuelve a ingresarlos.');
    // Crear PIN y DEK ya en este paso
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await _derivarHashPIN(pin1, salt);
    const dek = _generateDEK();
    _sessionDEK = dek;
    _sessionPIN = pin1;
    const kek = await _deriveKEKFromPIN(pin1, salt);
    const { encrypted, iv } = await _encryptDEK(dek, kek);
    localStorage.setItem('finanzas_pin_hash', hash);
    localStorage.setItem('finanzas_pin_salt', btoa(String.fromCharCode(...salt)));
    _saveDEKToStorage(encrypted, iv);
    appPIN = hash;
    obIrAStep(2);
  } else if (fromStep === 2) {
    obIrAStep(3);
  } else if (fromStep === 3) {
    obIrAStep(4);
  }
}

function obAnterior(fromStep) {
  obIrAStep(fromStep - 1);
}


/** Verifica si ya corresponde registrar el salario de este período y lo crea si es así */
function _registrarSalarioSiCorresponde(stateRef) {
  const perfil = stateRef.perfilIngresos;
  if (!perfil || !perfil.activo || !perfil.monto) return;
  const hoy = new Date();
  const diaCobro = parseInt(perfil.dia) || 15;
  const diaHoy = hoy.getDate();
  // Registrar si hoy ES el día de cobro o si el día de cobro ya pasó este mes y no hay ingreso de salario este mes
  if (diaHoy >= diaCobro) {
    const mesActual = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0');
    const yaRegistrado = (stateRef.transactions || []).some(t =>
      t.tipo === 'salario' && t.date && t.date.startsWith(mesActual)
    );
    if (!yaRegistrado) {
      stateRef.transactions.push({
        id: uid(),
        type: 'income',
        amount: perfil.monto,
        cat: 'Salario',
        subcat: 'Salario mensual',
        cuenta: perfil.cuenta || 'ahorro',
        tipo: 'salario',
        date: new Date(hoy.getFullYear(), hoy.getMonth(), diaCobro).toISOString()
      });
    }
  }
}

// UI de perfil de ingresos en Configuración
function renderPerfilIngresos() {
  const container = document.getElementById('perfil-ingresos-ui');
  if (!container) return;
  const perfil = state.perfilIngresos || JSON.parse(localStorage.getItem('mph_perfil_ingresos') || 'null');
  const FREQ_LABELS = { quincenal:'Quincenal', mensual:'Mensual', semanal:'Semanal', variable:'Variable / Freelance' };
  if (perfil && perfil.activo && perfil.monto > 0) {
    container.innerHTML =
      '<div style="background:linear-gradient(135deg,rgba(76,175,80,.1),rgba(76,175,80,.04));border:1px solid rgba(76,175,80,.3);padding:12px;border-radius:10px;margin-bottom:12px">' +
        '<div style="font-weight:700;font-size:13px;margin-bottom:4px">✅ Salario automático activo</div>' +
        '<div style="font-size:12px;color:var(--text2);line-height:1.6">' +
          '💰 ' + fL(perfil.monto) + ' · ' + (FREQ_LABELS[perfil.frecuencia]||perfil.frecuencia) + '<br>' +
          '📅 Día ' + perfil.dia + ' · ' + (perfil.cuenta === 'ahorro' ? '🏦 Cuenta de ahorro' : '💵 Efectivo') +
        '</div>' +
      '</div>' +
      '<button class="btn btn-secondary" onclick="abrirModalPerfilIngresos()" style="width:100%">✏️ Editar perfil de ingresos</button>';
  } else {
    container.innerHTML =
      '<div style="background:var(--bg3);padding:12px;border-radius:10px;font-size:12px;color:var(--text2);margin-bottom:12px;line-height:1.5">' +
        '⚠️ Sin perfil de ingresos configurado. La app no puede registrar tu salario automáticamente.' +
      '</div>' +
      '<button class="btn btn-primary" onclick="abrirModalPerfilIngresos()" style="width:100%">💰 Configurar mi salario</button>';
  }
}

function abrirModalPerfilIngresos() {
  const perfil = state.perfilIngresos || JSON.parse(localStorage.getItem('mph_perfil_ingresos') || 'null') || {};
  // Usar el modal de edición del perfil
  const modal = document.getElementById('modal-perfil-ingresos');
  if (!modal) return;
  document.getElementById('pi-monto').value = perfil.monto || '';
  document.getElementById('pi-frecuencia').value = perfil.frecuencia || 'quincenal';
  document.getElementById('pi-dia').value = perfil.dia || '15';
  document.getElementById('pi-cuenta').value = perfil.cuenta || 'ahorro';
  document.getElementById('pi-activo').checked = perfil.activo !== false;
  openModal('modal-perfil-ingresos');
}
window.abrirModalPerfilIngresos = abrirModalPerfilIngresos;

function savePerfilIngresos() {
  const monto = parseMonto(document.getElementById('pi-monto')?.value) || 0;
  const frecuencia = document.getElementById('pi-frecuencia')?.value || 'quincenal';
  const dia = document.getElementById('pi-dia')?.value || '15';
  const cuenta = document.getElementById('pi-cuenta')?.value || 'ahorro';
  const activo = document.getElementById('pi-activo')?.checked !== false;
  if (!monto || monto <= 0) return alert('⚠️ Ingresa el monto de tu salario');
  const perfil = { monto, frecuencia, dia, cuenta, activo };
  state.perfilIngresos = perfil;
  localStorage.setItem('mph_perfil_ingresos', JSON.stringify(perfil));
  // Intentar registrar el salario de este mes si ya corresponde
  if (activo) _registrarSalarioSiCorresponde(state);
  save();
  closeModal('modal-perfil-ingresos');
  renderPerfilIngresos();
  renderAll();
  alert('✅ Perfil de ingresos guardado.\n\nLa app registrará tu salario automáticamente cada ' + { quincenal:'quincena', mensual:'mes', semanal:'semana' }[frecuencia] + '.');
}
window.savePerfilIngresos = savePerfilIngresos;

// Chequeo diario: al abrir la app, verificar si hay salario que registrar
function _checkSalarioHoy() {
  if (!state.setup || !state.perfilIngresos?.activo) return;
  const antes = (state.transactions || []).length;
  _registrarSalarioSiCorresponde(state);
  if ((state.transactions || []).length > antes) {
    save();
    renderAll();
    console.log('✅ Salario registrado automáticamente');
  }
}
window._checkSalarioHoy = _checkSalarioHoy;
async function finishOnboarding(){
  const nombre=document.getElementById('ob-nombre').value.trim();
  const saldoInicial=parseFloat(document.getElementById('ob-salario').value)||0;
  if(!nombre||saldoInicial===0)return alert('Completa todos los campos');
  const saldoEfectivo=parseFloat(document.getElementById('ob-efectivo')?.value)||0;
  const saldoAhorro=parseFloat(document.getElementById('ob-ahorro')?.value)||0;
  
  // ────────────────────────────────────────────────────────────
  // OBLIGAR creación de PIN antes de finalizar onboarding
  // ────────────────────────────────────────────────────────────
  const tienePIN = localStorage.getItem('finanzas_pin_hash');
  if (!tienePIN) {
    const crearPIN = confirm(
      '🔐 Para proteger tus datos, necesitas crear un PIN de 4 dígitos.\n\n' +
      'Tu PIN cifra todos tus movimientos con AES-256.\n' +
      'Sin el PIN, nadie puede acceder a tus datos.\n\n' +
      '¿Crear PIN ahora?'
    );
    if (!crearPIN) {
      alert('⚠️ No puedes continuar sin crear un PIN.');
      return;
    }
    
    // Solicitar PIN
    const nuevoPIN = prompt('Crea tu PIN de 4 dígitos:');
    if (!nuevoPIN || !/^\d{4}$/.test(nuevoPIN)) {
      alert('❌ PIN inválido. Debe tener 4 números.');
      return;
    }
    
    const confirmaPIN = prompt('Confirma tu PIN:');
    if (nuevoPIN !== confirmaPIN) {
      alert('❌ Los PINs no coinciden.');
      return;
    }
    
    // Generar salt + hash + DEK
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await _derivarHashPIN(nuevoPIN, salt);
    const dek = _generateDEK();
    _sessionDEK = dek;
    _sessionPIN = nuevoPIN;
    
    // Cifrar DEK con KEK
    const kek = await _deriveKEKFromPIN(nuevoPIN, salt);
    const { encrypted, iv } = await _encryptDEK(dek, kek);
    
    // Guardar todo
    localStorage.setItem('finanzas_pin_hash', hash);
    localStorage.setItem('finanzas_pin_salt', btoa(String.fromCharCode(...salt)));
    _saveDEKToStorage(encrypted, iv);
    appPIN = hash;
  }
  
  // ────────────────────────────────────────────────────────────
  // Crear state inicial
  // ────────────────────────────────────────────────────────────
  state={
    setup:true,
    nombre,
    saldoInicial,
    cuentasIniciales:{efectivo:saldoEfectivo,ahorro:saldoAhorro},
    cuentas:{efectivo:saldoEfectivo,ahorro:saldoAhorro}, // legacy
    transactions:[],
    goals:[],
    receivables:[],
    payables:[],
    prestamos:[],
    tarjetas:[],
    pagosRecurrentes:[],
    budgetRules:{gastos:65,ahorro:20,extra:15}
  };
  
  // save() ahora cifra automáticamente (porque _sessionDEK está cargado)
  save();
  
  document.getElementById('onboarding').style.display='none';
  renderAll();
  renderWelcome();
  
  // Notificar al usuario
  alert('✅ ¡Bienvenido a Mi Pisto HN!\n\n🔒 Tus datos están protegos con cifrado AES-256.');
}

function toggleFabMenu_legacy(){/* reemplazada por la v2 */}
document.addEventListener('click_legacy',(e)=>{/* reemplazado por la v2 */});

function calculateLoan(){const P=parseFloat(document.getElementById('prest-monto').value)||0,r=(parseFloat(document.getElementById('prest-tasa').value)||0)/100/12,n=parseInt(document.getElementById('prest-cuotas').value)||1;let cuota=r===0?P/n:P*(r*Math.pow(1+r,n))/(Math.pow(1+r,n)-1);document.getElementById('prest-cuota-calc').value=fL(cuota);const interes=P*r,capital=cuota-interes;document.getElementById('prest-breakdown').classList.remove('hidden');document.getElementById('prest-breakdown').innerHTML=`<div class="loan-breakdown-row"><span>Cuota mensual:</span><strong>${fL(cuota)}</strong></div><div class="loan-breakdown-row"><span>→ Interés:</span><span style="color:var(--red)">${fL(interes)}</span></div>`;return cuota}
function checkCreditCard(){const cuentaEl=document.getElementById('gasto-cuenta');const pagoType=cuentaEl?cuentaEl.value:document.getElementById('gasto-pago').value;const tarjetaSelect=document.getElementById('gasto-tarjeta');if(pagoType==='credito'){tarjetaSelect.classList.remove('hidden');tarjetaSelect.innerHTML='<option value="">Selecciona tarjeta...</option>';state.tarjetas.forEach(t=>{tarjetaSelect.innerHTML+=`<option value="${t.id}">${esc(t.nombre)} (Saldo: ${fL(t.saldo)})</option>`})}else{tarjetaSelect.classList.add('hidden')}}

// ═══════════════════════════════════════════════════════════════════════
// MULTIMONEDA: helpers para conversión en vivo en modales de gasto/ingreso
// ─────────────────────────────────────────────────────────────────────
// REGLA DE NEGOCIO:
//   Gasto en USD  → necesitas USD para pagar → banco te VENDE USD → tasa ASK
//   Ingreso en USD → recibiste USD y los conviertes → banco te COMPRA USD → tasa BID
// ═══════════════════════════════════════════════════════════════════════

function _formatMoneda(amount, code) {
  const cm = window.currencyManager;
  if (cm && typeof cm.format === 'function') return cm.format(amount, code);
  return code + ' ' + Number(amount).toFixed(2);
}

function _renderConversion(infoEl, monto, moneda, tipoTx) {
  if (!infoEl) return;
  if (!moneda || moneda === 'HNL' || !monto || monto <= 0) {
    infoEl.style.display = 'none';
    return;
  }
  const cm = window.currencyManager;
  if (!cm) {
    infoEl.style.display = 'none';
    return;
  }
  const rate = cm.getRate(moneda);
  if (!rate) {
    infoEl.className = 'conversion-info error';
    infoEl.innerHTML = '⚠️ No hay tasa configurada para ' + moneda;
    infoEl.style.display = 'block';
    return;
  }
  // Gasto → ask (compras moneda extranjera). Ingreso → bid (vendes moneda extranjera).
  const usaAsk = (tipoTx === 'expense');
  const tasa = usaAsk ? rate.ask : rate.bid;
  const ladoLabel = usaAsk ? 'venta' : 'compra';
  const ladoIcon = usaAsk ? '📤' : '📥';
  const equivalenteHNL = monto * tasa;
  infoEl.className = 'conversion-info';
  infoEl.innerHTML =
    '💱 Equivale a <span class="conv-amount">L. ' + equivalenteHNL.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}) + '</span>' +
    '<span class="conv-note">' + ladoIcon + ' Tasa de ' + ladoLabel + ' del banco: 1 ' + moneda + ' = L. ' + tasa.toFixed(4) + ' · Se guardará en HNL</span>';
  infoEl.style.display = 'block';
}

function actualizarConversionGasto() {
  const monto = parseMonto(document.getElementById('gasto-monto')?.value);
  const moneda = document.getElementById('gasto-moneda')?.value || 'HNL';
  const info = document.getElementById('gasto-conversion-info');
  _renderConversion(info, monto, moneda, 'expense');
}

function actualizarConversionIngreso() {
  const monto = parseMonto(document.getElementById('ingreso-monto')?.value);
  const moneda = document.getElementById('ingreso-moneda')?.value || 'HNL';
  const info = document.getElementById('ingreso-conversion-info');
  _renderConversion(info, monto, moneda, 'income');
}

/** MULTIMONEDA: Helper para renderizar el monto de una transacción.
    Si la transacción tiene originalCurrency, muestra:
       - badge de moneda extranjera (ej: $50.00 USD)
       - valor convertido en HNL debajo (ej: L 1,336.48 al cambio)
    Si no, muestra solo el HNL como antes. */
function renderMontoTx(t, signo, color) {
  const sign = signo || '';
  const colorStyle = color ? 'color:' + color + ';' : '';
  if (t.originalCurrency && t.originalAmount && t.originalCurrency !== 'HNL' && window.currencyManager) {
    const originalFormatted = window.currencyManager.format(t.originalAmount, t.originalCurrency);
    const sideLabel = t.conversionSide === 'ask' ? 'venta' : (t.conversionSide === 'bid' ? 'compra' : '');
    const tasaInfo = t.conversionRate ? ' @ L. ' + Number(t.conversionRate).toFixed(4) + (sideLabel ? ' (' + sideLabel + ')' : '') : '';
    return '<div style="text-align:right">' +
      '<div style="font-size:17px;font-weight:800;' + colorStyle + '">' + sign + originalFormatted +
        '<span class="tx-currency-badge">' + esc(t.originalCurrency) + '</span></div>' +
      '<div class="tx-original-amount">≈ ' + sign + fL(t.amount) + tasaInfo + '</div>' +
    '</div>';
  }
  return '<div style="font-size:17px;font-weight:800;' + colorStyle + 'margin-left:12px;flex-shrink:0">' + sign + fL(t.amount) + '</div>';
}

// ========== GUARDAR GASTO CON FACTURA ADJUNTA ==========