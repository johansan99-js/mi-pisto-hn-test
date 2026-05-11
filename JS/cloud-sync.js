/**
 * Mi Pisto HN — cloud-sync.js
 * ─────────────────────────────────────────────────────────
 * Sincronización E2E con Supabase.
 * El servidor NUNCA ve datos en plano — solo blobs cifrados.
 * Merge inteligente para ediciones offline concurrentes.
 * Requiere: utils.js, crypto.js, storage.js
 * SDK externo: @supabase/supabase-js (cargado async desde CDN)
 */

// ─────────────────────────────────────────────────────────────────────
async function renderCloudSyncUI() {
  const container = document.getElementById('cloud-sync-status-container');
  if (!container) return;

  // Estado 1: Supabase no disponible (offline o el CDN falló)
  if (!cloudSync.sdkAvailable()) {
    container.innerHTML =
      '<div style="padding:14px;background:var(--bg3);border-radius:10px;border-left:3px solid var(--amber);font-size:12px;color:var(--text2);line-height:1.5">' +
        '⚠️ No hay conexión con el servidor de sincronización.<br>' +
        'Verifica tu internet y recarga la app.' +
      '</div>';
    return;
  }

  // Inicializar si no se hizo
  if (!cloudSync.ready) {
    await cloudSync.init();
  }

  // Estado 2: usuario autenticado → mostrar info + botones de sync
  if (cloudSync.user) {
    const devices = await cloudSync.listDevices();
    const deviceItems = devices.length
      ? devices.map(d => {
          const fecha = new Date(d.last_seen).toLocaleString('es-HN', { dateStyle: 'short', timeStyle: 'short' });
          const esActual = d.device_id === cloudSync.getDeviceId();
          return '<div style="display:flex;justify-content:space-between;padding:8px 10px;background:var(--bg2);border-radius:6px;margin-bottom:4px;font-size:11px;align-items:center">' +
            '<div><strong>' + esc(d.device_name || 'Dispositivo') + '</strong>' +
            (esActual ? ' <span style="color:var(--green);font-size:9px">● ESTE</span>' : '') +
            '</div>' +
            '<div style="color:var(--text2);font-size:10px">' + fecha + '</div>' +
          '</div>';
        }).join('')
      : '<div style="font-size:11px;color:var(--text2);padding:8px">Solo este dispositivo registrado.</div>';

    // Bajar metadata del blob remoto (no descifra nada, solo info)
    const remoteInfo = await cloudSync.getRemoteInfo();
    let remoteStatusHtml;
    if (remoteInfo) {
      const fecha = new Date(remoteInfo.updated_at);
      const ahora = new Date();
      const diffMin = Math.floor((ahora - fecha) / 60000);
      let cuando;
      if (diffMin < 1)        cuando = 'hace unos segundos';
      else if (diffMin < 60)  cuando = 'hace ' + diffMin + ' min';
      else if (diffMin < 1440)cuando = 'hace ' + Math.floor(diffMin/60) + ' h';
      else                    cuando = fecha.toLocaleDateString('es-HN', { dateStyle: 'medium' });
      const sizeKB = (remoteInfo.size_bytes / 1024).toFixed(1);
      remoteStatusHtml =
        '<div style="background:rgba(76,175,80,.08);border:1px solid rgba(76,175,80,.25);padding:10px 12px;border-radius:8px;font-size:11px;margin-bottom:10px;line-height:1.6">' +
          '<div>📦 <strong>Última sincronización:</strong> ' + cuando + '</div>' +
          '<div>📏 Tamaño cifrado: ' + sizeKB + ' KB · Versión #' + remoteInfo.version + '</div>' +
          '<div style="color:var(--text2)">📱 Subido desde: ' + esc(remoteInfo.device_name || '?') + '</div>' +
        '</div>';
    } else {
      remoteStatusHtml =
        '<div style="background:var(--bg3);padding:10px 12px;border-radius:8px;font-size:11px;margin-bottom:10px;color:var(--text2);line-height:1.5">' +
          '☁️ Aún no has subido tus datos. Toca <strong>"Subir ahora"</strong> para empezar.' +
        '</div>';
    }

    container.innerHTML =
      '<div style="padding:14px;background:linear-gradient(135deg,rgba(76,175,80,.1),rgba(76,175,80,.04));border:1px solid rgba(76,175,80,.3);border-radius:10px;margin-bottom:12px">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">' +
          '<span style="font-size:20px">✅</span>' +
          '<div style="flex:1">' +
            '<div style="font-weight:700;font-size:13px">Conectado</div>' +
            '<div style="font-size:11px;color:var(--text2);word-break:break-all">' + esc(cloudSync.user.email || '') + '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +
      // Nota para iOS: el auto-sync solo funciona con la app abierta
      (/iPhone|iPad|iPod/.test(navigator.userAgent) ?
        '<div style="background:rgba(245,200,0,.1);border:1px solid rgba(245,200,0,.3);padding:10px 12px;border-radius:8px;font-size:11px;margin-bottom:12px;line-height:1.5;color:var(--text)">' +
          '🍎 <strong>iOS detectado:</strong> el auto-sync solo funciona con la app abierta. ' +
          'Usá el botón <strong>"⬆️ Subir ahora"</strong> antes de cambiar de dispositivo.' +
        '</div>' : '') +

      remoteStatusHtml +

      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">' +
        '<button class="btn btn-primary" onclick="subirDatosCloud()" id="btn-cloud-upload" style="font-size:13px;padding:12px 8px">⬆️ Subir ahora</button>' +
        '<button class="btn btn-secondary" onclick="abrirModalBajarCloud()" id="btn-cloud-download" style="font-size:13px;padding:12px 8px">⬇️ Bajar de la nube</button>' +
      '</div>' +

      '<h5 style="font-size:11px;text-transform:uppercase;color:var(--text2);margin:14px 0 8px;letter-spacing:.5px">📱 Tus dispositivos</h5>' +
      deviceItems +

      '<button class="btn btn-secondary" onclick="cerrarSesionCloud()" style="margin-top:14px;width:100%;font-size:12px">🚪 Cerrar sesión en este dispositivo</button>';
    return;
  }

  // Estado 3: no autenticado → mostrar botón para activar
  container.innerHTML =
    '<div style="padding:14px;background:var(--bg3);border-radius:10px;font-size:12px;color:var(--text2);margin-bottom:12px;line-height:1.5">' +
      '🔒 La sincronización está <strong>desactivada</strong>.<br>' +
      'Tus datos están solo en este dispositivo.' +
    '</div>' +
    '<button class="btn btn-primary" onclick="abrirModalCloudLogin()" style="width:100%">' +
      '☁️ Activar sincronización' +
    '</button>';
}

window.renderCloudSyncUI = renderCloudSyncUI;

function abrirModalCloudLogin() {
  const emailInput = document.getElementById('cloud-email');
  if (emailInput) emailInput.value = '';
  const status = document.getElementById('cloud-login-status');
  if (status) status.style.display = 'none';
  const btn = document.getElementById('btn-enviar-magic');
  if (btn) { btn.disabled = false; btn.textContent = '📧 Enviar enlace'; }
  openModal('modal-cloud-login');
  setTimeout(() => emailInput?.focus(), 100);
}
window.abrirModalCloudLogin = abrirModalCloudLogin;

async function enviarMagicLink() {
  const emailInput = document.getElementById('cloud-email');
  const status = document.getElementById('cloud-login-status');
  const btn = document.getElementById('btn-enviar-magic');
  const email = (emailInput?.value || '').trim().toLowerCase();

  // Validación simple de email
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    if (status) {
      status.style.display = 'block';
      status.style.color = 'var(--red)';
      status.textContent = '⚠️ Ingresa un email válido';
    }
    return;
  }

  if (btn) { btn.disabled = true; btn.textContent = '⏳ Enviando...'; }
  if (status) {
    status.style.display = 'block';
    status.style.color = 'var(--text2)';
    status.textContent = 'Conectando con el servidor...';
  }

  const result = await cloudSync.sendMagicLink(email);

  if (result.ok) {
    if (status) {
      status.style.color = 'var(--green)';
      status.innerHTML = '✅ ¡Enlace enviado!<br><span style="font-size:11px">Revisa tu bandeja de entrada (y la carpeta de spam) en <strong>' + esc(email) + '</strong>.<br>Toca el enlace para iniciar sesión.</span>';
    }
    if (btn) btn.textContent = '✅ Enviado';
    // Marcar sync como activado (aunque el login se complete después)
    localStorage.setItem(CLOUD_SYNC_CONFIG.enabledKey, 'true');
  } else {
    if (status) {
      status.style.color = 'var(--red)';
      status.textContent = '❌ ' + (result.error || 'Error desconocido');
    }
    if (btn) { btn.disabled = false; btn.textContent = '📧 Reintentar'; }
  }
}
window.enviarMagicLink = enviarMagicLink;

async function cerrarSesionCloud() {
  if (!confirm('¿Cerrar sesión en este dispositivo?\n\nTus datos locales (cifrados con tu PIN) NO se borrarán. Solo se desconectará la sincronización en la nube.')) return;
  await cloudSync.signOut();
  alert('🚪 Sesión cerrada. Tus datos locales siguen intactos.');
}
window.cerrarSesionCloud = cerrarSesionCloud;

// ─────────────────────────────────────────────────────────────────────
// FASE 2 UI: Subir / Bajar datos cifrados
// ─────────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════
// SEGURIDAD: backup pre-merge + overlay de solo-lectura
// ═══════════════════════════════════════════════════════════════════

/** Guarda una snapshot del state actual en sessionStorage antes de
    sobrescribirlo con datos de la nube. Válido por 5 minutos.
    (sessionStorage se borra al cerrar la pestaña — perfect scope) */
function _createPreMergeBackup() {
  try {
    const snapshot = JSON.stringify(state);
    sessionStorage.setItem('mph_premerge_backup', snapshot);
    sessionStorage.setItem('mph_premerge_backup_time', Date.now().toString());
    console.log('☁️ Backup pre-merge creado (' + (snapshot.length/1024).toFixed(1) + ' KB)');
    return true;
  } catch(e) {
    console.warn('Backup pre-merge falló:', e.message);
    return false;
  }
}

/** Restaura el backup pre-merge si existe y no expiró (5 min).
    Retorna true si restauró, false si no había backup válido. */
async function _restorePreMergeBackup() {
  try {
    const snapshot = sessionStorage.getItem('mph_premerge_backup');
    const timeStr  = sessionStorage.getItem('mph_premerge_backup_time');
    if (!snapshot || !timeStr) return false;
    const age = Date.now() - parseInt(timeStr);
    if (age > 5 * 60 * 1000) {
      sessionStorage.removeItem('mph_premerge_backup');
      sessionStorage.removeItem('mph_premerge_backup_time');
      return false;
    }
    const parsed = JSON.parse(snapshot);
    Object.keys(state).forEach(k => delete state[k]);
    Object.assign(state, parsed);
    if (_sessionDEK) {
      const enc = await _encryptState(state, _sessionDEK);
      localStorage.setItem(LS_KEY, enc);
      saveStateToDB(state).catch(()=>{});
    }
    sessionStorage.removeItem('mph_premerge_backup');
    sessionStorage.removeItem('mph_premerge_backup_time');
    if (typeof renderAll === 'function') renderAll();
    return true;
  } catch(e) {
    console.error('Restaurar backup pre-merge falló:', e);
    return false;
  }
}

/** Muestra overlay semitransparente durante el merge para prevenir
    ediciones concurrentes mientras se resuelven conflictos */
function _showMergeOverlay(msg) {
  if (document.getElementById('merge-readonly-overlay')) return;
  const el = document.createElement('div');
  el.id = 'merge-readonly-overlay';
  el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9998;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px)';
  el.innerHTML =
    '<div style="background:var(--bg2);border-radius:16px;padding:24px 28px;text-align:center;max-width:280px;border:1px solid var(--border)">' +
      '<div style="font-size:32px;margin-bottom:12px">☁️</div>' +
      '<div style="font-weight:800;font-size:15px;margin-bottom:6px">' + (msg||'Combinando datos…') + '</div>' +
      '<div style="font-size:12px;color:var(--text2);line-height:1.5">Espera un momento.<br>No cierres la app.</div>' +
    '</div>';
  document.body.appendChild(el);
}

function _hideMergeOverlay() {
  document.getElementById('merge-readonly-overlay')?.remove();
}

/** Muestra el botón "↩️ Deshacer merge" por 5 minutos si hay backup disponible */
function _mostrarBotonDeshacer() {
  const timeStr = sessionStorage.getItem('mph_premerge_backup_time');
  if (!timeStr) return;
  const age = Date.now() - parseInt(timeStr);
  if (age > 5 * 60 * 1000) return; // Ya expiró

  const existing = document.getElementById('cloud-undo-merge-btn');
  if (existing) return;

  const btn = document.createElement('button');
  btn.id = 'cloud-undo-merge-btn';
  btn.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);' +
    'background:linear-gradient(135deg,var(--bg2),var(--bg3));border:1px solid var(--amber);' +
    'color:var(--amber);padding:10px 20px;border-radius:20px;font-size:12px;font-weight:700;' +
    'cursor:pointer;z-index:500;box-shadow:0 4px 16px rgba(0,0,0,.4);white-space:nowrap';
  btn.textContent = '↩️ Deshacer merge (5 min)';
  btn.onclick = async function() {
    if (!confirm('¿Deshacer el merge y volver a tus datos locales anteriores?\n\nLos datos de la nube que se combinaron se perderán.')) return;
    btn.remove();
    const ok = await _restorePreMergeBackup();
    if (ok) {
      alert('✅ Datos restaurados al estado anterior al merge.');
    } else {
      alert('⚠️ El backup expiró (válido 5 minutos). No se puede deshacer.');
    }
  };
  document.body.appendChild(btn);

  // Auto-ocultar cuando expire el backup
  const remaining = 5 * 60 * 1000 - age;
  setTimeout(() => btn.remove(), remaining);
}

window._createPreMergeBackup = _createPreMergeBackup;
window._restorePreMergeBackup = _restorePreMergeBackup;
window._showMergeOverlay = _showMergeOverlay;
window._hideMergeOverlay = _hideMergeOverlay;
window._mostrarBotonDeshacer = _mostrarBotonDeshacer;

let _pendingMerge = null; // Estado del merge pendiente para confirmarEstrategiaMerge

async function subirDatosCloud() {
  const btn = document.getElementById('btn-cloud-upload');
  if (!btn) return;
  if (typeof _sessionDEK === 'undefined' || _sessionDEK === null) {
    alert('⚠️ Para subir tus datos a la nube necesitás:\n\n1. Tener un PIN configurado\n2. Haber desbloqueado la app con tu PIN en esta sesión');
    return;
  }
  // Verificar si hay versión más nueva en la nube
  const remoteInfo = await cloudSync.getRemoteInfo();
  const localV = cloudSync.getLocalSyncVersion();

  if (remoteInfo && remoteInfo.version > localV) {
    // Descargar y calcular diff para mostrar en el modal
    const dl = await cloudSync._downloadAndDecrypt();
    if (dl.ok) {
      const { merged, diff } = cloudSync.mergeStates(state, dl.data);
      const hasChanges = diff.totalLocalNew > 0 || diff.totalRemoteNew > 0 || diff.totalConflicts > 0;
      if (hasChanges) {
        _pendingMerge = { merged, diff, remoteDeviceName: dl.deviceName||remoteInfo.device_name, remoteDate: new Date(remoteInfo.updated_at).toLocaleString('es-HN',{dateStyle:'short',timeStyle:'short'}) };
        const diffEl = document.getElementById('cloud-merge-diff');
        if (diffEl) diffEl.innerHTML = cloudSync.buildDiffHtml(diff, cloudSync.getDeviceName(), _pendingMerge.remoteDeviceName, _pendingMerge.remoteDate);
        openModal('modal-cloud-merge');
        return;
      }
    }
    // Si diff vacío o download falló, subir normalmente
  }
  await _doDirectUpload(btn);
}
window.subirDatosCloud = subirDatosCloud;

async function _doDirectUpload(btn) {
  const origText = (btn && btn.textContent) || '⬆️ Subir ahora';
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Cifrando y subiendo...'; }
  const result = await cloudSync.uploadState();
  if (btn) { btn.disabled = false; btn.textContent = origText; }
  if (result.ok) {
    alert('✅ Subido exitosamente\n\n📦 ' + (result.sizeBytes/1024).toFixed(1) + ' KB · Versión #' + result.version + '\n🔒 Cifrado E2E con AES-256.');
    renderCloudSyncUI();
  } else {
    alert('❌ Error al subir:\n\n' + (result.error || 'Error desconocido'));
  }
}
window._doDirectUpload = _doDirectUpload;

async function confirmarEstrategiaMerge(strategy) {
  closeModal('modal-cloud-merge');
  const btn = document.getElementById('btn-cloud-upload');

  if (strategy === 'local') {
    // Subir solo lo local sin hacer merge
    await _doDirectUpload(btn);
    _pendingMerge = null;
    return;
  }
  if (strategy === 'merge' && _pendingMerge) {
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Combinando y subiendo...'; }
    // Backup de seguridad antes de sobrescribir
    _createPreMergeBackup();
    _showMergeOverlay('Combinando datos…');
    // Aplicar merged sin disparar otro auto-sync
    const { merged } = _pendingMerge;
    Object.keys(state).forEach(k => delete state[k]);
    Object.assign(state, merged);
    ['pagosRecurrentes','prestamos','goals','tarjetas','receivables','payables'].forEach(f => { if (!state[f]) state[f] = []; });
    // Persistir localmente
    try {
      if (_sessionDEK) {
        const enc = await _encryptState(state, _sessionDEK);
        localStorage.setItem(LS_KEY, enc);
        saveStateToDB(state).catch(()=>{});
      }
    } catch(e) {}
    // Subir
    const result = await cloudSync.uploadState();
    _hideMergeOverlay();
    if (btn) { btn.disabled = false; btn.textContent = '⬆️ Subir ahora'; }
    _pendingMerge = null;
    if (result.ok) {
      if (typeof renderAll === 'function') renderAll();
      alert('✅ Combinado y subido\n\n📦 ' + (result.sizeBytes/1024).toFixed(1) + ' KB · Versión #' + result.version);
      _mostrarBotonDeshacer();
      renderCloudSyncUI();
    } else {
      alert('❌ Error al subir:\n\n' + (result.error || 'Error desconocido'));
    }
  }
}
window.confirmarEstrategiaMerge = confirmarEstrategiaMerge;

// Handler del banner flotante "Hay datos nuevos en la nube"
window._onCloudBannerDownload = function() {
  document.getElementById('cloud-newer-banner')?.remove();
  if (typeof switchView === 'function') switchView('config');
  setTimeout(() => { if (typeof subirDatosCloud === 'function') subirDatosCloud(); }, 300);
};

function abrirModalBajarCloud() {
  // Verificar que hay datos en la nube antes de pedir PIN
  cloudSync.getRemoteInfo().then(info => {
    if (!info) {
      alert('☁️ No hay datos sincronizados en la nube todavía.\n\nDesde otro dispositivo, primero usá "⬆️ Subir ahora" para crear el primer respaldo. Luego podés bajarlo en este dispositivo.');
      return;
    }
    // Mostrar el modal con info del blob remoto
    const fecha = new Date(info.updated_at).toLocaleString('es-HN', { dateStyle: 'medium', timeStyle: 'short' });
    const sizeKB = (info.size_bytes / 1024).toFixed(1);
    document.getElementById('cloud-download-info').innerHTML =
      '📦 <strong>Datos disponibles en la nube:</strong><br>' +
      '• Subido: ' + fecha + '<br>' +
      '• Desde: ' + esc(info.device_name || '?') + '<br>' +
      '• Tamaño: ' + sizeKB + ' KB · Versión #' + info.version;
    document.getElementById('cloud-download-pin').value = '';
    const status = document.getElementById('cloud-download-status');
    if (status) status.style.display = 'none';
    const btn = document.getElementById('btn-confirmar-bajar');
    if (btn) { btn.disabled = false; btn.textContent = '⬇️ Sí, sobrescribir con datos de la nube'; }
    openModal('modal-cloud-download');
    setTimeout(() => document.getElementById('cloud-download-pin')?.focus(), 100);
  });
}
window.abrirModalBajarCloud = abrirModalBajarCloud;

async function confirmarBajarCloud() {
  const pin = (document.getElementById('cloud-download-pin')?.value || '').trim();
  const status = document.getElementById('cloud-download-status');
  const btn = document.getElementById('btn-confirmar-bajar');
  if (!/^\d{4,8}$/.test(pin)) {
    if (status) {
      status.style.display = 'block';
      status.style.color = 'var(--red)';
      status.textContent = '⚠️ Ingresa tu PIN (4 a 8 dígitos)';
    }
    return;
  }
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Bajando y descifrando...'; }
  if (status) {
    status.style.display = 'block';
    status.style.color = 'var(--text2)';
    status.textContent = '🔓 Descifrando con tu PIN...';
  }

  // Backup de seguridad y overlay antes de sobrescribir
  _createPreMergeBackup();
  _showMergeOverlay('Restaurando datos…');

  const result = await cloudSync.downloadState({ pin });

  if (result.ok) {
    _hideMergeOverlay();
    if (status) {
      status.style.color = 'var(--green)';
      status.textContent = '✅ Datos restaurados. Recargando app...';
    }
    setTimeout(() => {
      closeModal('modal-cloud-download');
      if (typeof renderAll === 'function') renderAll();
      alert('✅ Datos sincronizados desde la nube.\n\nVersión #' + result.version + ' · Subido desde: ' + (result.deviceName || '?') + '\n\nTus datos locales fueron reemplazados por los de la nube.');
      _mostrarBotonDeshacer();
      renderCloudSyncUI();
    }, 800);
  } else {
    _hideMergeOverlay(); // Si falló, quitar el overlay
    if (status) {
      status.style.color = 'var(--red)';
      status.textContent = '❌ ' + (result.error || 'Error desconocido');
    }
    if (btn) { btn.disabled = false; btn.textContent = '⬇️ Reintentar'; }
  }
}
window.confirmarBajarCloud = confirmarBajarCloud;

// Inicializar cloudSync al cargar (si el SDK ya estaba listo) o cuando esté disponible
function _initCloudSyncWhenReady() {
  if (cloudSync.sdkAvailable()) {
    cloudSync.init().then(() => {
      // Si el contenedor de UI existe, refrescarlo
      if (document.getElementById('cloud-sync-status-container')) {
        renderCloudSyncUI();
      }
    });
  } else {
    // El SDK puede tardar en cargar (CDN). Reintentar 5 veces con 1s entre cada uno.
    if (!_initCloudSyncWhenReady._attempts) _initCloudSyncWhenReady._attempts = 0;
    _initCloudSyncWhenReady._attempts++;
    if (_initCloudSyncWhenReady._attempts < 5) {
      setTimeout(_initCloudSyncWhenReady, 1000);
    } else {
      console.log('☁️ Supabase SDK no cargó tras 5 intentos. Sync deshabilitado.');
    }
  }
}
// Disparar después de que el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _initCloudSyncWhenReady);
} else {
  _initCloudSyncWhenReady();
}

console.log('✅ Mi Pisto HN v2.0 listo');
