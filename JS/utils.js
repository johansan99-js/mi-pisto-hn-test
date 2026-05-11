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

// ── uid ──────────────────────────────────────────────────────────────

const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID)
  ? crypto.randomUUID()
  : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2,9)}`;
// ────────────────────────────────────────────────────────────────────
// SAVE — cifra el state con DEK antes de guardar en localStorage
// ────────────────────────────────────────────────────────────────────