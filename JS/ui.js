/**
 * Mi Pisto HN — ui.js
 * ─────────────────────────────────────────────────────────
 * Interfaz: PIN/biometría (WebAuthn), modales, PWA install,
 * notificaciones locales de pagos, verificaciones varias,
 * exportación Excel/JSON, importación, resetApp.
 * Requiere: utils.js, crypto.js, storage.js, render.js
 */

// SOBRESCRIBIR window.onload (async + IDB)
// ==========================================
// ── P1-5: Purga de soft-delete con más de 30 días ────────────
function purgarEliminadosViejos() {
  const LIMITE_MS = 30 * 24 * 60 * 60 * 1000; // 30 días
  const ahora = Date.now();
  const antes = state.transactions.length;
  state.transactions = state.transactions.filter(t => {
    if (!t.deletedAt) return true; // transacción activa: conservar
    return (ahora - new Date(t.deletedAt).getTime()) < LIMITE_MS;
  });
  const purgados = antes - state.transactions.length;
  if (purgados > 0) {
    console.log(`🗑️ Purga: ${purgados} transacciones eliminadas hace >30 días`);
    save();
  }
}

// ── P0-1: Migración PIN legado (texto plano → PBKDF2) ─────────
async function migrarPINLegadoSiNecesario() {
  const oldPIN = localStorage.getItem('finanzas_pin');
  const newHash = localStorage.getItem('finanzas_pin_hash');
  if (oldPIN && !newHash) {
    console.log('🔐 Migrando PIN a PBKDF2...');
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await _derivarHashPIN(oldPIN, salt);
    localStorage.setItem('finanzas_pin_hash', hash);
    localStorage.setItem('finanzas_pin_salt', btoa(String.fromCharCode(...salt)));
    localStorage.removeItem('finanzas_pin');
    appPIN = hash;
    console.log('✅ PIN migrado a hash seguro');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// FIX SEGURIDAD: Helper para completar la carga de la app DESPUÉS de
// verificar el PIN exitosamente. Antes, loadStateFromDB() se llamaba al
// inicio sin importar el PIN — los datos quedaban en memoria aunque no
// hubieras ingresado el PIN, lo que invalidaba todo el cifrado AES-256.
// ═══════════════════════════════════════════════════════════════════════
async function _completarCargaApp() {
  // Cargar state desde IndexedDB (ya pasamos la verificación de PIN)
  const idbState = await loadStateFromDB();
  if (idbState) {
    Object.keys(state).forEach(key => {
      if (idbState[key] !== undefined) state[key] = idbState[key];
    });
    if (!state.pagosRecurrentes) state.pagosRecurrentes = [];
    if (!state.prestamos) state.prestamos = [];
    if (!state.budgetRules) state.budgetRules = { gastos: 65, ahorro: 20, extra: 15 };
    if (!state.receivables) state.receivables = [];
    if (!state.payables) state.payables = [];
    if (!state.tarjetas) state.tarjetas = [];
    if (!state.goals) state.goals = [];
    console.log('✅ Estado restaurado desde IndexedDB (post-PIN)');
  } else {
    if (!state.pagosRecurrentes) state.pagosRecurrentes = [];
    if (!state.prestamos) state.prestamos = [];
    if (!state.budgetRules) state.budgetRules = { gastos: 65, ahorro: 20, extra: 15 };
    if (state.setup) saveStateToDB(state);
  }
  purgarEliminadosViejos();
  // Renderizar la app con los datos ya cargados
  if (state.setup) {
    if (typeof renderAll === 'function') renderAll();
  } else {
    const ob = document.getElementById('onboarding');
    if (ob) ob.style.display = 'flex';
  }
  // Fix Bug 4: resolver la promesa global — la app ya está lista
  // Cualquier código que esperaba window.appReadyPromise puede continuar
  if (typeof window._resolveAppReady === 'function') {
    window._resolveAppReady();
    window._resolveAppReady = null;
  }
  // Si no había PIN (flujo sin promesa), crear una resuelta de inmediato
  if (!window.appReadyPromise) {
    window.appReadyPromise = Promise.resolve();
  }
}
window._completarCargaApp = _completarCargaApp; // exponer por si el IIFE lo necesita
