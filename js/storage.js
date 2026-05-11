/**
 * Mi Pisto HN — storage.js
 * ─────────────────────────────────────────────────────────
 * Persistencia: localStorage cifrado (save/load),
 * variables de sesión DEK/PIN, IndexedDB para state
 * e imágenes de facturas.
 * Requiere: utils.js, crypto.js
 */

async function loadAndDecryptState() {
  if (!_sessionDEK) {
    console.error('❌ No hay DEK en sesión para descifrar');
    return false;
  }
  
  const raw = localStorage.getItem(LS_KEY);
  if (!raw) return false;
  
  // Intentar descifrar
  const decrypted = await _decryptState(raw, _sessionDEK);
  if (!decrypted) {
    console.error('❌ Error descifrando state');
    return false;
  }
  
  // Aplicar al state global
  Object.keys(state).forEach(key => {
    if (decrypted[key] !== undefined) {
      if (Array.isArray(state[key]) && !Array.isArray(decrypted[key])) {
        state[key] = [];
      } else {
        state[key] = decrypted[key];
      }
    }
  });
  
  // Migraciones
  if (!state.cuentas) state.cuentas = {efectivo: state.saldoInicial||0, ahorro: 0};
  if (typeof state.cuentas.efectivo === 'undefined') state.cuentas.efectivo = 0;
  if (typeof state.cuentas.ahorro === 'undefined') state.cuentas.ahorro = 0;
  
  console.log('✅ State descifrado y cargado');
  return true;
}

// Variables en memoria (solo existen durante la sesión)
let _sessionDEK = null;  // Data Encryption Key (256 bits, Uint8Array)
let _sessionPIN = null;  // PIN del usuario (solo en memoria, se limpia al cerrar)


// ─── Promise queue para save() — evita race condition ───────────────────
// Si el usuario hace dos cambios rápidos, el segundo espera a que el primero
// termine de cifrar antes de sobreescribir. Sin esto, el state podría
// cambiar entre _encryptState(state) y el .then(encrypted => ...).
let _saveQueue = Promise.resolve();

function save() {
  // Captura INMEDIATA del state para evitar race condition:
  // si el state cambia antes de que termine de cifrar,
  // lo que se guarda es la versión del momento de la llamada.
  const snapshot = JSON.parse(JSON.stringify(state));
  
  _saveQueue = _saveQueue.then(async () => {
    try {
      if (!_sessionDEK) {
        // Sin PIN desbloqueado: guardar en plano (onboarding o usuario sin PIN)
        localStorage.setItem(LS_KEY, JSON.stringify(snapshot));
        await saveStateToDB(snapshot);
        return;
      }
      const encrypted = await _encryptState(snapshot, _sessionDEK);
      localStorage.setItem(LS_KEY, encrypted);
      await saveStateToDB(snapshot);
      // FASE 3: disparar auto-sync si el usuario tiene la nube activada
      if (typeof cloudSync !== 'undefined') cloudSync._scheduleAutoSync();
    } catch (error) {
      console.error('❌ Error en save():', error);
      // Fallback: guardar en plano para no perder datos
      localStorage.setItem(LS_KEY, JSON.stringify(snapshot));
      saveStateToDB(snapshot).catch(console.warn);
    }
  }).catch(console.error);
}
const todayStr=()=>new Date().toISOString().split('T')[0];
const CATEGORIES={vivienda:{label:'🏠 Vivienda',sub:['Hipoteca/Alquiler','Teléfono','Electricidad','Gas','Agua','Mantenimiento']},transporte:{label:'🚗 Transporte',sub:['Pago de Auto','Combustible','Seguros','Mantenimiento']},alimentos:{label:'🍽️ Alimentación',sub:['Supermercado','Restaurantes','Delivery']},ocio:{label:'🎬 Ocio',sub:['Streaming','Salidas','Hobbies']},prestamos:{label:'💳 Préstamos',sub:['Personal','Estudiantil','Tarjeta de Crédito']},seguros:{label:'🛡️ Seguros',sub:['Salud','Vida','Hogar']},impuestos:{label:'📄 Impuestos',sub:['Federal','Estatal','Local']},ahorros:{label:'💰 Ahorros',sub:['Emergencia','Jubilación','Inversiones']},regalos:{label:'🎁 Regalos',sub:['Caridad','Familia','Amigos']},personal:{label:'✂️ Cuidado Personal',sub:['Médico','Ropa','Gimnasio']}};

// ========== FUNCIÓN OCR MEJORADA (PRICESMART, NECHOS, LITTLE CAESARS) ==========
// ========== FUNCIÓN OCR MEJORADA (DETECCIÓN AVANZADA DE COMERCIOS HONDUREÑOS) ==========

// ── P1-6: Singleton IDB + P0-2: store 'facturas' ─────────────
const IDB_NAME = 'MisFinanzasHN_DB';
const IDB_STORE = 'app_state';
const IDB_FACTURAS = 'facturas';
const IDB_VERSION = 2; // incrementado por el nuevo store

let _dbPromise = null; // P1-6: singleton

function initDB() {
  if (_dbPromise) return _dbPromise; // reutilizar conexión existente
  _dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_NAME, IDB_VERSION);
    request.onerror = () => { _dbPromise = null; reject('Error abriendo IndexedDB'); };
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(IDB_STORE))
        db.createObjectStore(IDB_STORE);
      if (!db.objectStoreNames.contains(IDB_FACTURAS)) // P0-2: store de imágenes
        db.createObjectStore(IDB_FACTURAS);
    };
    request.onsuccess = (e) => {
      const db = e.target.result;
      // FIX: invalidar el singleton si la conexión se cierra inesperadamente
      // (otra pestaña actualiza versión, navegador la descarta por inactividad, etc.)
      // Sin esto, db.transaction() lanza InvalidStateError "connection is closing".
      db.onclose = () => {
        console.warn('⚠️ Conexión IDB cerrada inesperadamente, invalidando singleton');
        _dbPromise = null;
      };
      db.onversionchange = () => {
        try { db.close(); } catch(_) {}
        _dbPromise = null;
        console.warn('⚠️ IDB versionchange detectado — conexión cerrada para permitir upgrade');
      };
      resolve(db);
    };
  });
  return _dbPromise;
}

// ── P0-2: Helpers para imágenes de facturas en IDB ───────────
let _tempFacturaId = null; // reemplaza localStorage('temp_factura_imagen')

async function _guardarTempFactura(dataURL) {
  if (!dataURL) return null;
  const id = (crypto.randomUUID ? crypto.randomUUID() : `fac_${Date.now()}_${Math.random().toString(36).slice(2,7)}`);
  try {
    const db = await initDB();
    await new Promise((res, rej) => {
      const tx = db.transaction(IDB_FACTURAS, 'readwrite');
      tx.objectStore(IDB_FACTURAS).put(dataURL, id);
      tx.oncomplete = res;
      tx.onerror = rej;
    });
    return id;
  } catch (e) { console.warn('IDB factura error:', e); return null; }
}

async function _obtenerFactura(id) {
  if (!id) return null;
  try {
    const db = await initDB();
    return await new Promise((res) => {
      const tx = db.transaction(IDB_FACTURAS, 'readonly');
      const req = tx.objectStore(IDB_FACTURAS).get(id);
      req.onsuccess = () => res(req.result || null);
      req.onerror = () => res(null);
    });
  } catch { return null; }
}

async function _eliminarFactura(id) {
  if (!id) return;
  try {
    const db = await initDB();
    const tx = db.transaction(IDB_FACTURAS, 'readwrite');
    tx.objectStore(IDB_FACTURAS).delete(id);
  } catch {}
}

async function saveStateToDB(stateObj) {
  // FIX: helper interno reutilizable para reintento con conexión fresca
  const _doSave = async () => {
    const db = await initDB();
    return new Promise((resolve, reject) => {
      let tx;
      try {
        tx = db.transaction(IDB_STORE, 'readwrite');
      } catch (e) {
        // La conexión estaba cerrándose — invalidar singleton para forzar
        // reapertura en el próximo intento
        _dbPromise = null;
        return reject(e);
      }
      const store = tx.objectStore(IDB_STORE);
      const toSave = Object.assign({}, stateObj, { _version: '1.0.0', _lastSave: new Date().toISOString() });
      try {
        store.put(toSave, 'current_state');
      } catch (e) {
        return reject(e);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(tx.error || e);
      tx.onabort = (e) => reject(tx.error || e);
    });
  };
  try {
    return await _doSave();
  } catch (error) {
    // Reintento único si la conexión vieja estaba cerrándose
    if (error && (error.name === 'InvalidStateError' ||
                  String(error.message || '').includes('closing'))) {
      console.warn('⚠️ IDB save: conexión cerrándose, reintentando con conexión fresca...');
      _dbPromise = null;
      try {
        return await _doSave();
      } catch (e2) {
        console.warn('IDB save falló tras reintento, fallback a localStorage:', e2);
      }
    } else {
      console.warn('IDB no disponible, usando solo localStorage:', error);
    }
  }
}

async function loadStateFromDB() {
  try {
    const db = await initDB();
    return new Promise((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const request = store.get('current_state');
      request.onsuccess = () => {
        if (request.result) {
          console.log('📂 Estado cargado desde IndexedDB');
          resolve(request.result);
        } else {
          console.log('⚠️ IDB vacío, usando localStorage como respaldo');
          resolve(null);
        }
      };
      request.onerror = () => resolve(null);
    });
  } catch (error) {
    console.warn('Error en loadStateFromDB:', error);
    return null;
  }
}

// ==========================================
// 🛑 PREVENCIÓN DE PÉRDIDA EN MODALES
// ==========================================
let hasUnsavedModalData = false;

window.addEventListener('beforeunload', (e) => {
  if (hasUnsavedModalData) {
    e.preventDefault();
    e.returnValue = '¿Seguro? Tienes datos sin guardar en pantalla.';
  }
});

// Marcar cuando el usuario escribe en un modal
document.addEventListener('input', (e) => {
  if (e.target.closest('.modal-content')) {
    if (e.target.value && e.target.value.trim().length > 0) hasUnsavedModalData = true;
  }
});

// Limpiar el flag al cerrar modales correctamente
const _origCloseModal = closeModal;
closeModal = function(id) {
  hasUnsavedModalData = false;
  _origCloseModal(id);
};

// ==========================================
// SOBRESCRIBIR window.onload (async + IDB)