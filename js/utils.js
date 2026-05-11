/**
 * Mi Pisto HN — utils.js
 * ─────────────────────────────────────────────────────────
 * Variables globales del estado, helpers de formato,
 * seguridad de IDs, y utilidades generales.
 * Debe cargarse PRIMERO — todos los otros módulos dependen de esto.
 */

// ═════════════════════════════════════════════════════════════
// FIX: Utility - Fetch con timeout compatible con navegadores antiguos
// (Safari <15.3, Android <13 no tienen AbortSignal.timeout)
// ═════════════════════════════════════════════════════════════
function timeoutFetch(url, options = {}, ms = 3000) {
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
    // Navegadores modernos (2024+)
    return fetch(url, {
      ...options,
      signal: AbortSignal.timeout(ms)
    });
  }
  
  // Fallback para navegadores antiguos
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  
  return fetch(url, {
    ...options,
    signal: controller.signal
  }).finally(() => clearTimeout(timer));
}

// ═════════════════════════════════════════════════════════════
// FIX: Manager centralizado de timeouts (prevenir memory leaks)
// ═════════════════════════════════════════════════════════════
window._timeoutIds = [];
window._intervalIds = [];

window.createTimeout = function(fn, ms) {
  const id = setTimeout(() => {
    // Auto-remover de la lista al ejecutarse
    const idx = window._timeoutIds.indexOf(id);
    if (idx > -1) window._timeoutIds.splice(idx, 1);
    fn();
  }, ms);
  window._timeoutIds.push(id);
  return id;
};

window.createInterval = function(fn, ms) {
  const id = setInterval(fn, ms);
  window._intervalIds.push(id);
  return id;
};

window.clearAllTimeouts = function() {
  window._timeoutIds.forEach(id => clearTimeout(id));
  window._timeoutIds = [];
};

window.clearAllIntervals = function() {
  window._intervalIds.forEach(id => clearInterval(id));
  window._intervalIds = [];
};

// Cleanup automático al cerrar/recargar página
window.addEventListener('beforeunload', () => {
  window.clearAllTimeouts();
  window.clearAllIntervals();
});

// Cleanup también en pagehide (Safari móvil)
window.addEventListener('pagehide', () => {
  window.clearAllTimeouts();
  window.clearAllIntervals();
});

// ═════════════════════════════════════════════════════════════
// FIX: Constantes globales para validación de tasas
// ═════════════════════════════════════════════════════════════
const USD_HNL_VALID_RANGE = { min: 20, max: 35 };

// ========== VARIABLES GLOBALES Y ESTADO ==========
const LS_KEY='mifinanzashn_pro_v20_full';
let state = {
  setup: false,
  nombre: '',
  saldoInicial: 0,
  cuentas: { efectivo: 0, ahorro: 0 },
  transactions: [],
  goals: [],
  receivables: [],
  payables: [],
  prestamos: [],
  tarjetas: [],
  pagosRecurrentes: [],
  budgetRules: { gastos: 65, ahorro: 20, extra: 15 },
  budgets: []        // Presupuestos por categoría: [{id,categoria,montoMensual,activo,color,emoji}]
};

// ────────────────────────────────────────────────────────────────────
// CARGA INICIAL — detecta si el state está cifrado o en plano
// ────────────────────────────────────────────────────────────────────
// Nota: si está cifrado, el state se carga DESPUÉS de verificar el PIN.
// Aquí solo intentamos cargar si está en plano (usuarios legacy sin cifrado).
(function() {
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return; // No hay state guardado
  
  // Intentar parsear como JSON (state en plano, legacy)
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.setup === 'boolean') {
      // Es un state plano válido
      Object.keys(state).forEach(key => {
        if (parsed[key] !== undefined) {
          if (Array.isArray(state[key]) && !Array.isArray(parsed[key])) {
            state[key] = [];
          } else {
            state[key] = parsed[key];
          }
        }
      });
      // Migrate: ensure cuentas exists
      if (!state.cuentas) state.cuentas = {efectivo: state.saldoInicial||0, ahorro: 0};
      if (typeof state.cuentas.efectivo === 'undefined') state.cuentas.efectivo = 0;
      if (typeof state.cuentas.ahorro === 'undefined') state.cuentas.ahorro = 0;
      
      console.log('📂 State cargado en plano (legacy)');
    }
  } catch (e) {
    // No es JSON válido → probablemente está cifrado (base64)
    // El state se cargará después de verificar el PIN
    console.log('🔒 State cifrado detectado — se cargará tras verificar PIN');
  }
})();

// ────────────────────────────────────────────────────────────────────
// Función auxiliar: cargar y descifrar state con la DEK de sesión
// ────────────────────────────────────────────────────────────────────

let mainChart = null;
// P0-1: appPIN almacena el HASH (no el PIN en crudo)
let appPIN = localStorage.getItem('finanzas_pin_hash') || '';
try { localStorage.removeItem('finanzas_recordar'); } catch(e) {}
let recordarPIN = false;

// ─── MULTIMONEDA: fL delega en currencyManager si existe ─────────────
const fL = n => {
  if (window.currencyManager && typeof window.currencyManager.formatFromBase === 'function') {
    return window.currencyManager.formatFromBase(Number(n) || 0);
  }
  return 'L. ' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2 });
};

// ─── Escape HTML (cierra superficie XSS) ─────────────────────────────
const esc = s => String(s ?? '').replace(/[&<>\"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

// ─── Validación de IDs en runtime ────────────────────────────────────
const _idRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^[a-z0-9_]{5,20}$/i;
function _esIdSeguro(id) {
  if (typeof id !== 'string') return false;
  if (id.length > 50) return false;
  return _idRegex.test(id);
}
function _conIdValidado(func, nombreFunc) {
  return function(id, ...args) {
    if (!_esIdSeguro(id)) {
      console.error('⚠️ ID inválido bloqueado en ' + nombreFunc + ':', id);
      alert('❌ Error de seguridad: ID inválido detectado.');
      return;
    }
    return func(id, ...args);
  };
}
window.addEventListener('DOMContentLoaded', () => {
  ['abrirEdicionTx','softDeleteTx','openAbono','deleteMeta','editarMeta',
   'abonarCobrar','editarCobrar','eliminarCobrar','abonarPagar','editarPagar',
   'eliminarPagar','pagarCuotaPrestamo','editarPrestamo','eliminarPrestamo',
   'pagarTarjeta','ajustarSaldoTarjeta','deleteTarjeta','marcarPagoRecurrente',
   'editarRecurrente','eliminarRecurrente','verFactura'].forEach(nombre => {
    if (typeof window[nombre] === 'function') {
      window[nombre] = _conIdValidado(window[nombre], nombre);
    }
  });
  console.log('🛡️ Protección XSS activa');
}, { once: true });

// ─── parseMonto: parseo estricto de montos ────────────────────────────
function parseMonto(str) {
  if (str === null || str === undefined) return null;
  const s = String(str).trim().replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  const n = parseFloat(s);
  if (!Number.isFinite(n) || n < 0 || n > 1e9) return null;
  return Math.round(n * 100) / 100;
}

const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID)
  ? crypto.randomUUID()
  : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2,9)}`;
// ────────────────────────────────────────────────────────────────────
// SAVE — cifra el state con DEK antes de guardar en localStorage
// ────────────────────────────────────────────────────────────────────
