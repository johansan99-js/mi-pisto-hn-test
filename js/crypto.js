/**
 * Mi Pisto HN — crypto.js
 * ─────────────────────────────────────────────────────────
 * Cifrado AES-256-GCM, derivación de claves (PBKDF2),
 * gestión de PIN, DEK y KEK.
 * Requiere: utils.js
 */

// Helpers de codificación (reutilizados de P0-5)
function _b64EncodeArr(arr) {
  let bin = '';
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin);
}
function _b64DecodeArr(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ────────────────────────────────────────────────────────────────────
// Derivar KEK desde el PIN (PBKDF2 + AES-GCM, 250k iteraciones)
// ────────────────────────────────────────────────────────────────────
async function _deriveKEKFromPIN(pin, salt) {
  const encoder = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(pin),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 250000,
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ────────────────────────────────────────────────────────────────────
// Generar DEK aleatoria (256 bits) — solo se hace UNA vez al crear la cuenta
// ────────────────────────────────────────────────────────────────────
function _generateDEK() {
  return crypto.getRandomValues(new Uint8Array(32)); // 256 bits
}

// ────────────────────────────────────────────────────────────────────
// Cifrar la DEK con la KEK (derivada del PIN)
// ────────────────────────────────────────────────────────────────────
async function _encryptDEK(dek, kek) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    kek,
    dek
  );
  return { encrypted: new Uint8Array(encrypted), iv };
}

// ────────────────────────────────────────────────────────────────────
// Descifrar la DEK con la KEK
// ────────────────────────────────────────────────────────────────────
async function _decryptDEK(encryptedDEK, iv, kek) {
  try {
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      kek,
      encryptedDEK
    );
    return new Uint8Array(decrypted);
  } catch (error) {
    // Si falla, el PIN es incorrecto o los datos están corruptos
    console.error('Error descifrando DEK:', error);
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────
// Convertir DEK (Uint8Array) a CryptoKey para usar con AES-GCM
// ────────────────────────────────────────────────────────────────────
async function _importDEKAsCryptoKey(dek) {
  return crypto.subtle.importKey(
    'raw',
    dek,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// ────────────────────────────────────────────────────────────────────
// Cifrar el state completo con la DEK
// ────────────────────────────────────────────────────────────────────
async function _encryptState(stateObj, dek) {
  const key = await _importDEKAsCryptoKey(dek);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const plaintext = encoder.encode(JSON.stringify(stateObj));
  
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  );
  
  // Retornar: iv + ciphertext concatenados (para simplicidad)
  const result = new Uint8Array(iv.length + ciphertext.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertext), iv.length);
  
  return _b64EncodeArr(result);
}

// ────────────────────────────────────────────────────────────────────
// Descifrar el state desde localStorage con la DEK
// ────────────────────────────────────────────────────────────────────
async function _decryptState(encryptedB64, dek) {
  try {
    const key = await _importDEKAsCryptoKey(dek);
    const combined = _b64DecodeArr(encryptedB64);
    
    // Extraer IV (primeros 12 bytes) y ciphertext (resto)
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);
    
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    );
    
    const decoder = new TextDecoder();
    return JSON.parse(decoder.decode(decrypted));
  } catch (error) {
    console.error('Error descifrando state:', error);
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────
// Guardar DEK cifrada en localStorage
// ────────────────────────────────────────────────────────────────────
function _saveDEKToStorage(encryptedDEK, iv) {
  localStorage.setItem('finanzas_dek_encrypted', _b64EncodeArr(encryptedDEK));
  localStorage.setItem('finanzas_dek_iv', _b64EncodeArr(iv));
}

// ────────────────────────────────────────────────────────────────────
// Cargar DEK cifrada desde localStorage
// ────────────────────────────────────────────────────────────────────
function _loadDEKFromStorage() {
  const encB64 = localStorage.getItem('finanzas_dek_encrypted');
  const ivB64 = localStorage.getItem('finanzas_dek_iv');
  if (!encB64 || !ivB64) return null;
  return {
    encrypted: _b64DecodeArr(encB64),
    iv: _b64DecodeArr(ivB64)
  };
}

// ────────────────────────────────────────────────────────────────────
// Verificar si el state está cifrado o en texto plano (migración)
// ────────────────────────────────────────────────────────────────────
function _isStateEncrypted() {
  // Si existe la DEK cifrada, asumimos que el state está cifrado
  return localStorage.getItem('finanzas_dek_encrypted') !== null;
}

// ────────────────────────────────────────────────────────────────────
// MIGRACIÓN: usuarios legacy con state en plano → cifrado
// ────────────────────────────────────────────────────────────────────
// Se llama automáticamente la primera vez que un usuario con PIN pero
// sin DEK cifrada ingresa a la app.
async function _migrarStatePlanoACifrado(pin, salt) {
  try {
    console.log('🔄 Iniciando migración a cifrado...');
    
    // 1. Generar nueva DEK (nunca cambiará)
    const dek = _generateDEK();
    _sessionDEK = dek;
    
    // 2. Derivar KEK desde el PIN
    const kek = await _deriveKEKFromPIN(pin, salt);
    
    // 3. Cifrar la DEK con la KEK
    const { encrypted, iv } = await _encryptDEK(dek, kek);
    
    // 4. Guardar DEK cifrada en localStorage
    _saveDEKToStorage(encrypted, iv);
    
    // 5. Cifrar y guardar el state actual (que está en memoria en plano)
    const encryptedState = await _encryptState(state, dek);
    localStorage.setItem(LS_KEY, encryptedState);
    
    console.log('✅ Migración completada: state cifrado con DEK');
    
    // Mostrar notificación al usuario
    setTimeout(() => {
      alert('🔒 Tus datos ahora están protegidos con cifrado AES-256.\n\n' +
            'Tu PIN es la única forma de acceder. Si lo olvidas, necesitarás ' +
            'un respaldo cifrado para recuperar tus datos.');
    }, 1000);
    
  } catch (error) {
    console.error('❌ Error en migración:', error);
    alert('Error migrando tus datos a cifrado. Contacta soporte.');
  }
}


// P1-4: ID único garantizado — crypto.randomUUID() con polyfill
const uid = () => (typeof crypto !== 'undefined' && crypto.randomUUID)
  ? crypto.randomUUID()
  : `${Date.now().toString(36)}_${Math.random().toString(36).slice(2,9)}`;
// ────────────────────────────────────────────────────────────────────
// SAVE — cifra el state con DEK antes de guardar en localStorage
// ────────────────────────────────────────────────────────────────────