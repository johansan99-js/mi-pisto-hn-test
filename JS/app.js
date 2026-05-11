/**
 * Mi Pisto HN — app.js  
 * ─────────────────────────────────────────────────────────
 * Punto de entrada de la aplicación.
 * Inicialización, window.onload, mejoras de UX post-carga.
 * DEBE CARGARSE AL FINAL — depende de todos los módulos.
 */

(function () {
  'use strict';

  /* 1. Ocultar secciones vacías del dashboard */
  function hideEmptyDashboardSections() {
    const sections = [
      { c:'dashboard-goals',      e:null },
      { c:'card-alerts',          e:'no-card-alerts' },
      { c:'upcoming-payments',    e:'no-upcoming-payments' },
      { c:'upcoming-receivables', e:'no-upcoming-receivables' }
    ];
    sections.forEach(s => {
      const container = document.getElementById(s.c);
      if (!container) return;
      const isEmpty = container.children.length === 0 || container.innerHTML.trim() === '';
      const heading = container.previousElementSibling;
      const emptyMsg = s.e ? document.getElementById(s.e) : null;
      if (isEmpty) {
        if (heading && heading.tagName === 'H3') heading.style.display = 'none';
        if (emptyMsg) emptyMsg.style.display = 'none';
        container.style.display = 'none';
      } else {
        if (heading && heading.tagName === 'H3') heading.style.display = '';
        if (emptyMsg) emptyMsg.style.display = 'none';
        container.style.display = '';
      }
    });
    const recentEl = document.getElementById('recent-history');
    const recentHeading = recentEl ? recentEl.previousElementSibling : null;
    if (recentEl && recentEl.children.length === 0 && recentHeading && recentHeading.tagName === 'H3') {
      recentHeading.style.display = 'none';
    } else if (recentHeading && recentHeading.tagName === 'H3') {
      recentHeading.style.display = '';
    }
  }

  /* 2. Arreglar botón "Registrar primer movimiento" */
  function fixEmptyStateButton() {
    const observer = new MutationObserver(() => {
      const btn = document.querySelector('.btn-empty-cta');
      if (btn && !btn.dataset.fixed) {
        btn.dataset.fixed = '1';
        btn.classList.add('btn-empty-cta-pro');
        btn.onclick = function (e) {
          e.preventDefault(); e.stopPropagation();
          const candidatos = ['modal-ingreso','modal-income','modal-tx-income','modal-nuevo-ingreso','modal-gasto'];
          for (const id of candidatos) {
            if (document.getElementById(id) && typeof window.openModal === 'function') {
              window.openModal(id); return;
            }
          }
          if (typeof window.toggleFabMenu === 'function') {
            const fab = document.getElementById('nav-fab-btn') || document.getElementById('desktop-fab-btn');
            if (fab) fab.scrollIntoView({behavior:'smooth',block:'center'});
            window.toggleFabMenu();
          }
        };
      }
    });
    observer.observe(document.body, { childList:true, subtree:true });
    // Fix Bug 5: guardar referencia para desconectar en pagehide
    window._emptyStateBtnObserver = observer;
  }

  // Limpiar observer y timers al salir de la página
  window.addEventListener('pagehide', () => {
    if (window._emptyStateBtnObserver) {
      window._emptyStateBtnObserver.disconnect();
      window._emptyStateBtnObserver = null;
    }
    // Cancelar auto-sync pendiente si lo hay
    if (typeof cloudSync !== 'undefined' && cloudSync._cancelAutoSync) {
      cloudSync._cancelAutoSync();
    }
  });

  /* 3. Mejorar metas con barra RGB + acciones */
  function enhanceMetasRendering() {
    if (typeof window.renderMetas !== 'function') { setTimeout(enhanceMetasRendering, 300); return; }
    window.renderMetas = function () {
      const container = document.getElementById('metas-list');
      if (!container) return;
      const goals = (window.state && window.state.goals) || [];
      if (goals.length === 0) {
        container.innerHTML = `
          <div style="text-align:center;padding:40px 20px">
            <div style="font-size:48px;margin-bottom:12px">🎯</div>
            <div style="font-weight:800;font-size:16px;margin-bottom:6px">Sin metas de ahorro</div>
            <div style="font-size:13px;color:var(--text2);margin-bottom:20px;max-width:280px;margin:0 auto 20px">
              Define una meta (viaje, fondo de emergencia, auto) y rastrea tu progreso.
            </div>
            <button class="btn-empty-cta-pro" onclick="openModal('modal-meta')" style="max-width:260px;margin:0 auto">
              ➕ Crear primera meta
            </button>
          </div>`;
        return;
      }
      container.innerHTML = goals.map(g => {
        const pct = Math.min(100, (g.actual / g.objetivo) * 100);
        const isComplete = pct >= 100;
        const escFn = window.esc || (s => String(s||'').replace(/[<>"']/g, ''));
        return `
          <div class="goal-card-pro ${isComplete?'completed':''}" data-goal-id="${escFn(g.id)}">
            <div class="goal-pro-header">
              <div class="goal-pro-name">${isComplete?'🏆 ':''}${escFn(g.nombre)}</div>
              <div class="goal-pro-pct">${pct.toFixed(0)}%</div>
            </div>
            <div class="goal-pro-amounts">
              <strong>${fL(g.actual)}</strong> de ${fL(g.objetivo)}
              ${isComplete?'· ✅ ¡Completada!':''}
            </div>
            <div class="goal-pro-bar-wrap">
              <div class="goal-pro-bar ${isComplete?'completed':''}" style="width:${pct}%"></div>
            </div>
            <div class="goal-pro-actions">
              <button class="goal-pro-btn abonar"   onclick="openAbono('${escFn(g.id)}')" ${isComplete?'disabled style="opacity:.5;cursor:not-allowed"':''}>💰 Abonar</button>
              <button class="goal-pro-btn editar"   onclick="window.editarMeta('${escFn(g.id)}')">✏️ Editar</button>
              <button class="goal-pro-btn eliminar" onclick="window.eliminarMetaPro('${escFn(g.id)}')">🗑️ Eliminar</button>
            </div>
          </div>`;
      }).join('');
    };

    window.editarMeta = function (id) {
      const g = window.state.goals.find(x => String(x.id) === String(id));
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
            <input type="text"   id="edit-meta-nombre"   class="input-field" placeholder="Nombre">
            <input type="number" id="edit-meta-objetivo" class="input-field" placeholder="Monto objetivo" inputmode="decimal">
            <input type="number" id="edit-meta-actual"   class="input-field" placeholder="Monto actual"   inputmode="decimal">
            <input type="hidden" id="edit-meta-id">
            <div style="display:flex;gap:10px">
              <button class="btn btn-secondary" onclick="document.getElementById('modal-editar-meta').style.display='none'" style="flex:1">Cancelar</button>
              <button class="btn btn-primary"   onclick="window.guardarEdicionMeta()" style="flex:2">Guardar</button>
            </div>
          </div>`;
        document.body.appendChild(modal);
      }
      document.getElementById('edit-meta-nombre').value   = g.nombre;
      document.getElementById('edit-meta-objetivo').value = g.objetivo;
      document.getElementById('edit-meta-actual').value   = g.actual;
      document.getElementById('edit-meta-id').value       = g.id;
      modal.style.display = 'flex';
    };

    window.guardarEdicionMeta = function () {
      const id = document.getElementById('edit-meta-id').value;
      const nombre = document.getElementById('edit-meta-nombre').value.trim();
      const objetivo = parseFloat(document.getElementById('edit-meta-objetivo').value);
      const actual = parseFloat(document.getElementById('edit-meta-actual').value) || 0;
      if (!nombre || !objetivo || objetivo <= 0) { alert('⚠️ Datos inválidos'); return; }
      const g = window.state.goals.find(x => String(x.id) === String(id));
      if (!g) return;
      const wasIncomplete = (g.actual / g.objetivo) < 1;
      g.nombre = nombre; g.objetivo = objetivo; g.actual = actual;
      const isNowComplete = (actual / objetivo) >= 1;
      if (typeof window.save === 'function') window.save();
      document.getElementById('modal-editar-meta').style.display = 'none';
      if (typeof window.renderAll === 'function') window.renderAll();
      if (wasIncomplete && isNowComplete) setTimeout(() => alert(`🎯 ¡Meta "${nombre}" completada!`), 300);
    };

    window.eliminarMetaPro = function (id) {
      const g = window.state.goals.find(x => String(x.id) === String(id));
      if (!g) return;
      const pct = ((g.actual/g.objetivo)*100).toFixed(0);
      if (!confirm(`¿Eliminar la meta "${g.nombre}"?\n\nProgreso actual: ${pct}%\nEsta acción no se puede deshacer.`)) return;
      window.state.goals = window.state.goals.filter(x => String(x.id) !== String(id));
      if (typeof window.save === 'function') window.save();
      if (typeof window.renderAll === 'function') window.renderAll();
    };

    if (window.state && window.state.goals && window.state.goals.length) window.renderMetas();
  }

  /* 3b. Confeti DESACTIVADO (a petición del usuario) */
  function lanzarConfeti(durationMs) {
    /* no-op */
  }

  function mostrarFelicitacion(nombreMeta) {
    /* no-op — la felicitación ahora es un alert simple desde saveAbono */
  }

  window.celebrarMeta = function (id) {
    /* no-op — sin confeti ni toast animado */
  };

  /* Hook saveAbono — DESACTIVADO (saveAbono ya muestra alert al completar) */
  function hookAbonoParaConfeti() {
    /* no-op */
  }

  /* 4. Hamburguesa desktop */
  function buildDesktopHamburger() {
    if (document.getElementById('desktop-hamburger-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'desktop-hamburger-btn';
    btn.className = 'desktop-hamburger';
    btn.setAttribute('aria-label','Abrir menú');
    btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg>`;
    document.body.appendChild(btn);

    const menu = document.createElement('div');
    menu.id = 'desktop-hamburger-menu';
    menu.className = 'desktop-hamburger-menu';
    menu.innerHTML = `
      <div class="hb-menu-section">Acciones rápidas</div>
      <div class="hb-menu-item" data-fab="ingreso">
        <svg viewBox="0 0 24 24" fill="none" stroke="#4CAF50" stroke-width="2"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>
        Nuevo ingreso
      </div>
      <div class="hb-menu-item" data-fab="gasto">
        <svg viewBox="0 0 24 24" fill="none" stroke="#FF4444" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
        Nuevo gasto
      </div>
      <div class="hb-menu-item" data-fab="transferir">
        <svg viewBox="0 0 24 24" fill="none" stroke="#F5C800" stroke-width="2" stroke-linecap="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        Transferir
      </div>
      <div class="hb-menu-divider"></div>
      <div class="hb-menu-section">Navegación</div>
      <div class="hb-menu-item" data-view="dashboard">
        <svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="8" height="8" rx="2"/><rect x="13" y="3" width="8" height="8" rx="2" opacity=".6"/><rect x="3" y="13" width="8" height="8" rx="2" opacity=".6"/><rect x="13" y="13" width="8" height="8" rx="2" opacity=".35"/></svg>
        Inicio
      </div>
      <div class="hb-menu-item" data-view="metas">
        <svg viewBox="0 0 24 24" fill="none" stroke="#4285F4" stroke-width="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2" fill="#4285F4"/></svg>
        Metas de ahorro
      </div>
      <div class="hb-menu-item" data-view="historico">
        <svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="14" width="4" height="7" rx="1.5" opacity=".5"/><rect x="10" y="9" width="4" height="12" rx="1.5" opacity=".75"/><rect x="17" y="4" width="4" height="17" rx="1.5"/></svg>
        Historial
      </div>
      <div class="hb-menu-item" data-view="tarjetas">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="3"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
        Tarjetas
      </div>
      <div class="hb-menu-divider"></div>
      <div class="hb-menu-item" data-view="config">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
        Configuración
      </div>`;
    document.body.appendChild(menu);

    btn.addEventListener('click', e => { e.stopPropagation(); menu.classList.toggle('open'); });
    document.addEventListener('click', e => {
      if (!menu.contains(e.target) && !btn.contains(e.target)) menu.classList.remove('open');
    });
    menu.addEventListener('click', e => {
      const item = e.target.closest('.hb-menu-item');
      if (!item) return;
      menu.classList.remove('open');
      const view = item.dataset.view;
      const fabAction = item.dataset.fab;
      if (view && typeof window.switchView === 'function') {
        window.switchView(view);
        if (typeof window.setSidebarActive === 'function') window.setSidebarActive('sb-' + view);
      }
      if (fabAction) {
        const map = {
          ingreso:    ['modal-ingreso','modal-income'],
          gasto:      ['modal-gasto','modal-expense'],
          transferir: ['modal-transferir','modal-transfer']
        };
        const candidatos = map[fabAction] || [];
        for (const id of candidatos) {
          if (document.getElementById(id) && typeof window.openModal === 'function') {
            window.openModal(id); return;
          }
        }
        if (typeof window.toggleFabMenu === 'function') window.toggleFabMenu();
      }
    });
  }

  /* Hook al renderDashboard para ocultar secciones vacías cada vez que se renderiza */
  function hookRenderDashboard() {
    if (typeof window.renderDashboard !== 'function') { setTimeout(hookRenderDashboard, 300); return; }
    const original = window.renderDashboard;
    window.renderDashboard = function () {
      original.apply(this, arguments);
      setTimeout(hideEmptyDashboardSections, 50);
    };
  }

  function init() {
    console.log('🎨 UX Improvements + Multimoneda v1.0 cargando...');
    hookRenderDashboard();
    setTimeout(hideEmptyDashboardSections, 500);
    fixEmptyStateButton();
    enhanceMetasRendering();
    hookAbonoParaConfeti();
    buildDesktopHamburger();
    if (typeof window.switchView === 'function') {
      const orig = window.switchView;
      window.switchView = function () {
        orig.apply(this, arguments);
        setTimeout(hideEmptyDashboardSections, 100);
      };
    }
    console.log('✅ Listo');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// ═══ Inicialización ═══

window.onload = async function() {
  console.log('🚀 Mi Pisto HN cargando...');

  // ── TIMEOUT DE PANTALLA CARGANDO ────────────────────────────────────
  // Si en 5 segundos no se inicializó (JS bloqueado, error de red, etc.)
  // mostrar un mensaje amigable en lugar de quedar congelado en "Cargando..."
  const _loadingTimeout = setTimeout(() => {
    const nameEl = document.getElementById('dt-greeting-name');
    if (nameEl && nameEl.textContent === 'Cargando...') {
      nameEl.textContent = 'Mi Pisto HN';
      nameEl.style.cssText = '';
    }
    // Si el modal de PIN no está visible y la app no está cargada, mostrar error
    const pinVisible  = document.getElementById('modal-pin')?.style.display === 'flex';
    const onbVisible  = document.getElementById('onboarding')?.style.display === 'flex';
    const appLoaded   = document.querySelector('.view.active') !== null && state.setup;
    if (!pinVisible && !onbVisible && !appLoaded) {
      const anyView = document.getElementById('view-dashboard');
      if (anyView) {
        const errBanner = document.createElement('div');
        errBanner.style.cssText = 'position:fixed;top:0;left:0;right:0;background:rgba(255,68,68,.95);color:white;padding:14px 16px;font-size:13px;font-weight:700;z-index:9999;text-align:center;line-height:1.5';
        errBanner.innerHTML = '⚠️ La app tardó demasiado en cargar.<br><button onclick="location.reload()" style="background:white;color:#c00;border:none;padding:6px 16px;border-radius:6px;font-weight:800;margin-top:8px;cursor:pointer">🔄 Recargar</button>';
        document.body.appendChild(errBanner);
      }
    }
  }, 5000);
  // _loadingTimeout se limpia cuando la app termina de cargar (ver más abajo)

  // 0. Migrar PIN legado a PBKDF2 si es necesario
  await migrarPINLegadoSiNecesario();

  // 1. Solicitar persistencia al SO
  await requestPersistence();

  // 2. ¿Hay PIN configurado?
  const tienePIN = !!localStorage.getItem('finanzas_pin_hash');

  if (tienePIN) {
    // 🔒 NO cargar state desde IDB hasta que el PIN se verifique.
    // El state queda con valores por defecto (vacío) hasta el desbloqueo.
    console.log('🔒 PIN detectado — esperando verificación antes de cargar datos');
    // Resetear el state a vacío por si localStorage cargó algo en plano (legacy)
    state = {
      setup: false, nombre: '', saldoInicial: 0,
      cuentas: { efectivo: 0, ahorro: 0 },
      transactions: [], goals: [], receivables: [], payables: [],
      prestamos: [], tarjetas: [], pagosRecurrentes: [],
      budgetRules: { gastos: 65, ahorro: 20, extra: 15 }
    };
    // Exponer promesa global: cualquier código que asuma app lista debe esperarla
    // Ej: saveGasto(), renderAll() de botones sueltos no bloquean si no se llamó aún
    let _appReadyResolve;
    window.appReadyPromise = new Promise(res => { _appReadyResolve = res; });
    window._resolveAppReady = _appReadyResolve;
    // Mostrar modal de PIN (o biometría si está disponible)
    verificarPINmejorado();
    renderBiometriaConfig();
    _updatePinBioBtn();
    // El resto se completa en _completarCargaApp() después de verificar el PIN
    var recordarEl = document.getElementById('recordar-pin');
    if (recordarEl) recordarEl.checked = recordarPIN;
    if (typeof setupCurrencyHandlers === 'function') setupCurrencyHandlers();
    if (typeof initOfflineDetection === 'function') initOfflineDetection();
    return;
  }

  // 3. Sin PIN: flujo normal (primera vez o usuario sin cifrado)
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
    console.log('✅ Estado restaurado desde IndexedDB');
  } else {
    if (!state.pagosRecurrentes) state.pagosRecurrentes = [];
    if (!state.prestamos) state.prestamos = [];
    if (!state.budgetRules) state.budgetRules = { gastos: 65, ahorro: 20, extra: 15 };
    if (state.setup) saveStateToDB(state);
  }

  purgarEliminadosViejos();
  verificarPINmejorado();
  renderBiometriaConfig();
  _updatePinBioBtn();

  // 4. Resto de inicialización
  var recordarEl = document.getElementById('recordar-pin');
  if (recordarEl) recordarEl.checked = recordarPIN;
  // Fix Bug 4: sin PIN, la app ya está lista inmediatamente
  window.appReadyPromise = Promise.resolve();
  renderBudgetRules();
  setTimeout(ejecutarVerificacionesNuevas, 500);
  // Mostrar banner PWA iOS si corresponde
  showPwaBanner();
  
  // Renderizar saludo personalizado
  renderWelcome();

  // Verificar y enviar notificaciones de pagos próximos
  if(localStorage.getItem('notif_activas')==='true'){
    setTimeout(checkNotificacionesPagos, 2000);
    // FIX: Usar createInterval para cleanup automático y evitar memory leaks
    window.createInterval(checkNotificacionesPagos, 60*60*1000); // cada hora
  }
  
  // Actualizar estado botón de notificaciones
  if(Notification.permission==='granted'){
    const btn=document.getElementById('btn-activar-notif');
    if(btn)btn.innerHTML='<span style="color:var(--green)">✓ Alertas activas</span>';
  }

  console.log('✅ App lista');
  clearTimeout(_loadingTimeout);
  // Chequeo de salario automático al abrir la app
  setTimeout(() => { if (typeof _checkSalarioHoy === 'function') _checkSalarioHoy(); }, 1500);
};

// SOBRESCRIBIR renderAll para incluir verificaciones
var originalRenderAll = renderAll;
renderAll = function() {
  originalRenderAll();
  setTimeout(function() {
    verificarAlertasPresupuesto();
    calcularProyeccionCaja();
    detectarDuplicados();
    renderPapelera();
  }, 100);
};

// ═══════════════════════════════════════════════════════════════════════
// FIX CRÍTICO: Exponer state, fL, esc en window para que el IIFE de UX
// (definido en otro <script> tag, scope independiente) pueda leerlos.
// Sin esto, window.state es undefined → el IIFE muestra "Sin metas" aunque
// state.goals tenga datos. Usamos getter para que sobreviva la reasignación
// de state en línea ~4210 cuando se carga desde IndexedDB.
// ═══════════════════════════════════════════════════════════════════════
try {
  Object.defineProperty(window, 'state', {
    get: () => state,
    set: v => { state = v; },
    configurable: true
  });
} catch (e) {
  window.state = state;
  console.warn('No se pudo definir getter de window.state, usando asignación directa:', e);
}
window.fL = fL;
window.esc = esc;

// ═══════════════════════════════════════════════════════════════════════
// CLOUD SYNC v1 (Fase 1): conexión a Supabase + auth con magic link
// ─────────────────────────────────────────────────────────────────────
// Filosofía:
//   • TODO es opcional. Si el usuario no activa sync, la app es 100% local
//     como siempre.
//   • Si Supabase JS no carga (offline), no rompe nada — verificamos
//     window.supabase antes de cualquier operación.
//   • Las credenciales son la "anon key" (publishable), diseñada para estar
//     en el frontend. La protección real es RLS en Supabase.
//   • En esta Fase 1 NO sincronizamos datos todavía — solo establecemos la
//     conexión y el flujo de auth. Sync de datos viene en Fase 2.
// ═══════════════════════════════════════════════════════════════════════

const CLOUD_SYNC_CONFIG = {
  url: 'https://aetaktkexbtluoxehuwi.supabase.co',
  // anon JWT legacy — el SDK 2.45.x espera este formato (no el sb_publishable_*)
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFldGFrdGtleGJ0bHVveGVodXdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc3MzcwNzYsImV4cCI6MjA5MzMxMzA3Nn0.4kvz7wVxK-H69jY208bqEuF06UP9-p_ysHzo1_jfERE',
  // localStorage flag: si true, el usuario activó sync en este dispositivo
  enabledKey: 'mph_cloud_sync_enabled',
  // localStorage flag: identificador único del dispositivo (persistente)
  deviceIdKey: 'mph_device_id',
  deviceNameKey: 'mph_device_name'
};

const cloudSync = {
  client: null,        // Cliente Supabase (lazy-initialized)
  user: null,          // Usuario autenticado (auth.user object)
  ready: false,        // Una vez inicializado correctamente

  /** Verifica si el SDK de Supabase está disponible (puede no haber cargado si offline) */
  sdkAvailable() {
    return typeof window.supabase !== 'undefined' &&
           typeof window.supabase.createClient === 'function';
  },

  /** ¿El usuario activó sync en este dispositivo? */
  isEnabled() {
    return localStorage.getItem(CLOUD_SYNC_CONFIG.enabledKey) === 'true';
  },

  /** ID único del dispositivo (para el device_log) */
  getDeviceId() {
    let id = localStorage.getItem(CLOUD_SYNC_CONFIG.deviceIdKey);
    if (!id) {
      // Generar uno nuevo
      id = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'dev-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
      localStorage.setItem(CLOUD_SYNC_CONFIG.deviceIdKey, id);
    }
    return id;
  },

  /** Nombre legible del dispositivo (auto-detectado, editable después) */
  getDeviceName() {
    let name = localStorage.getItem(CLOUD_SYNC_CONFIG.deviceNameKey);
    if (!name) {
      const ua = navigator.userAgent;
      if (/iPhone/.test(ua))      name = 'iPhone';
      else if (/iPad/.test(ua))   name = 'iPad';
      else if (/Android/.test(ua))name = 'Android';
      else if (/Mac/.test(ua))    name = 'Mac';
      else if (/Windows/.test(ua))name = 'Windows';
      else if (/Linux/.test(ua))  name = 'Linux';
      else                        name = 'Dispositivo';
      localStorage.setItem(CLOUD_SYNC_CONFIG.deviceNameKey, name);
    }
    return name;
  },

  /** Inicializa el cliente Supabase y restaura sesión si existía */
  async init() {
    if (this.ready) return true;
    if (!this.sdkAvailable()) {
      console.log('☁️ Supabase SDK no disponible (¿offline?). Sync deshabilitado.');
      return false;
    }
    try {
      this.client = window.supabase.createClient(
        CLOUD_SYNC_CONFIG.url,
        CLOUD_SYNC_CONFIG.anonKey,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,  // detecta el token del magic link en la URL
            flowType: 'pkce'
          }
        }
      );
      // Restaurar sesión existente si la hay
      const { data: { session } } = await this.client.auth.getSession();
      if (session) {
        this.user = session.user;
        console.log('☁️ Sesión restaurada:', this.user.email);
        this._logDevice().catch(e => console.warn('device_log:', e.message));
        // FASE 3: Mostrar indicador y chequear si hay versión nueva en nube
        setTimeout(() => {
          this._updateIndicator('synced');
          this.checkForNewerVersion();
        }, 3000); // Esperar 3s para que la app termine de cargar primero
      }
      // Listener para cambios de auth (login, logout, token refresh)
      this.client.auth.onAuthStateChange((event, session) => {
        console.log('☁️ Auth event:', event);
        this.user = session ? session.user : null;
        if (event === 'SIGNED_IN') {
          this._logDevice().catch(()=>{});
          renderCloudSyncUI();
          // Si veníamos del magic link, mostrar feedback
          const url = new URL(window.location.href);
          if (url.searchParams.has('code') || window.location.hash.includes('access_token')) {
            history.replaceState({}, document.title, window.location.pathname);
            setTimeout(async () => {
              const isNewDevice = !state.setup || !state.transactions || state.transactions.length === 0;
              if (isNewDevice) {
                // FASE 3: dispositivo nuevo — ofrecer restaurar de la nube
                const remInfo = await this.getRemoteInfo();
                if (remInfo) {
                  const ok = confirm(
                    '☁️ Sesión iniciada como ' + this.user.email + '\n\n' +
                    '¡Bienvenido a un dispositivo nuevo!\n\n' +
                    'Encontramos datos en la nube:\n' +
                    '• Versión #' + remInfo.version + '\n' +
                    '• Subidos: ' + new Date(remInfo.updated_at).toLocaleString('es-HN') + '\n' +
                    '• Desde: ' + (remInfo.device_name || 'otro dispositivo') + '\n\n' +
                    '¿Querés restaurar tus datos aquí?\n' +
                    '(Vas a necesitar tu PIN)'
                  );
                  if (ok) {
                    if (typeof switchView === 'function') switchView('config');
                    setTimeout(() => { if (typeof abrirModalBajarCloud === 'function') abrirModalBajarCloud(); }, 300);
                  } else {
                    alert('✅ Sesión iniciada. Podés descargar tus datos en cualquier momento desde Configuración → Sincronización.');
                  }
                } else {
                  alert('✅ Sesión iniciada como ' + this.user.email + '\n\nLa sincronización de datos está activa. Subí tus datos desde Configuración → Sincronización.');
                }
              } else {
                // Dispositivo que ya tenía datos — solo avisamos y chequeamos versiones
                alert('✅ Sesión iniciada como ' + this.user.email);
                setTimeout(() => this.checkForNewerVersion(), 1000);
              }
            }, 100);
          } else {
            // Login en segundo plano (refresh de token) — solo chequear versiones
            setTimeout(() => this.checkForNewerVersion(), 2000);
          }
        } else if (event === 'SIGNED_OUT') {
          this._cancelAutoSync();
          renderCloudSyncUI();
        } else if (event === 'TOKEN_REFRESHED') {
          // Sesión renovada: chequear si hay cambios en la nube
          setTimeout(() => this.checkForNewerVersion(), 1000);
        }
      });
      this.ready = true;
      return true;
    } catch (e) {
      console.error('☁️ Error inicializando Supabase:', e);
      return false;
    }
  },

  /** Envía el magic link al email del usuario */
  async sendMagicLink(email) {
    if (!await this.init()) {
      return { ok: false, error: 'No hay conexión con el servidor' };
    }
    try {
      const { error } = await this.client.auth.signInWithOtp({
        email: email,
        options: {
          emailRedirectTo: window.location.origin + window.location.pathname,
          shouldCreateUser: true
        }
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  /** Cierra sesión y deshabilita sync en este dispositivo */
  async signOut() {
    if (!this.ready) return;
    try { await this.client.auth.signOut(); } catch(e) {}
    this.user = null;
    localStorage.setItem(CLOUD_SYNC_CONFIG.enabledKey, 'false');
    renderCloudSyncUI();
  },

  /** Registra/actualiza el dispositivo en device_log */
  async _logDevice() {
    if (!this.user || !this.client) return;
    const deviceId   = this.getDeviceId();
    const deviceName = this.getDeviceName();
    try {
      // upsert: si existe (user_id + device_id) actualiza last_seen, si no inserta
      const { error } = await this.client
        .from('device_log')
        .upsert({
          user_id: this.user.id,
          device_id: deviceId,
          device_name: deviceName,
          last_seen: new Date().toISOString(),
          user_agent: navigator.userAgent.substr(0, 500)
        }, {
          onConflict: 'user_id,device_id'
        });
      if (error) console.warn('device_log upsert:', error.message);
    } catch (e) {
      console.warn('device_log:', e.message);
    }
  },

  /** Lista todos los dispositivos del usuario actual */
  async listDevices() {
    if (!this.user || !this.client) return [];
    try {
      const { data, error } = await this.client
        .from('device_log')
        .select('device_id, device_name, last_seen, user_agent')
        .order('last_seen', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (e) {
      console.warn('listDevices:', e.message);
      return [];
    }
  },

  // ═══════════════════════════════════════════════════════════════════
  // FASE 2: UPLOAD / DOWNLOAD del state cifrado E2E
  // ───────────────────────────────────────────────────────────────────
  // Modelo: el servidor recibe SIEMPRE blobs cifrados que NO puede leer:
  //   • ciphertext: state completo cifrado con DEK del usuario
  //   • dek_ciphertext + dek_iv: la DEK cifrada con KEK derivada del PIN
  //   • pin_salt: salt PBKDF2 (público por diseño, necesario para
  //     que un dispositivo nuevo pueda re-derivar la KEK desde el PIN)
  // ═══════════════════════════════════════════════════════════════════

  /** Sube el state local cifrado a Supabase. Requiere que el usuario
      esté autenticado Y que tenga la DEK desbloqueada (sesión activa). */
  async uploadState() {
    if (!this.user) return { ok: false, error: 'No has iniciado sesión en la nube' };
    if (!await this.init()) return { ok: false, error: 'Sin conexión con el servidor' };
    // Validar que tengamos la DEK en sesión (usuario desbloqueó con PIN)
    if (typeof _sessionDEK === 'undefined' || _sessionDEK === null) {
      return { ok: false, error: 'Necesitas tener PIN configurado y la sesión desbloqueada para subir' };
    }
    // Validar que tengamos la DEK cifrada y el salt en localStorage
    const dekData = (typeof _loadDEKFromStorage === 'function') ? _loadDEKFromStorage() : null;
    if (!dekData) return { ok: false, error: 'No se encontró la DEK cifrada local. Reconfigura el PIN.' };
    const pinSalt = localStorage.getItem('finanzas_pin_salt');
    if (!pinSalt) return { ok: false, error: 'No se encontró el salt del PIN. Reconfigura el PIN.' };

    try {
      // 1) Cifrar el state con la DEK actual (el resultado ya incluye IV embebido)
      const stateClone = JSON.parse(JSON.stringify(state));
      const ciphertextB64 = await _encryptState(stateClone, _sessionDEK);
      if (!ciphertextB64) return { ok: false, error: 'Error al cifrar el state' };

      // 2) Empaquetar la DEK cifrada (ya está en localStorage en formato base64)
      const dekCiphertextB64 = _b64EncodeArr(dekData.encrypted);
      const dekIvB64         = _b64EncodeArr(dekData.iv);

      // 3) Construir payload
      const payload = {
        user_id: this.user.id,
        ciphertext:     ciphertextB64,
        iv:             '',  // IV embebido en ciphertext, columna queda vacía pero no NULL
        dek_ciphertext: dekCiphertextB64,
        dek_iv:         dekIvB64,
        pin_salt:       pinSalt,
        device_id:      this.getDeviceId(),
        device_name:    this.getDeviceName(),
        size_bytes:     ciphertextB64.length
      };

      // 4) Upsert (insert si no existe, update si ya tenía blob este usuario)
      // El trigger en SQL incrementa `version` automáticamente en cada update.
      const { data, error } = await this.client
        .from('encrypted_states')
        .upsert(payload, { onConflict: 'user_id' })
        .select()
        .single();

      if (error) return { ok: false, error: error.message };

      // 5) Actualizar device_log también (último uso)
      this._logDevice().catch(()=>{});

      console.log('☁️ Upload OK. Versión nube:', data.version, 'Tamaño:', ciphertextB64.length, 'B');
      // FASE 3: guardar la versión para detección de conflictos
      cloudSync.setLocalSyncVersion(data.version);
      return { ok: true, version: data.version, sizeBytes: ciphertextB64.length, updatedAt: data.updated_at };
    } catch (e) {
      console.error('☁️ uploadState:', e);
      return { ok: false, error: e.message || String(e) };
    }
  },

  /** Bajá el blob de Supabase y descifralo con el PIN dado.
      Si todo va bien, REEMPLAZA el state local con el de la nube,
      sincroniza la DEK y el salt local, y guarda en localStorage+IDB.
      
      Esta función está diseñada para funcionar incluso si el dispositivo
      perdió la DEK local (ej. tras un reset) — solo necesita el PIN. */
  async downloadState({ pin } = {}) {
    if (!this.user) return { ok: false, error: 'No has iniciado sesión en la nube' };
    if (!await this.init()) return { ok: false, error: 'Sin conexión con el servidor' };
    if (!pin || !/^\d{4,8}$/.test(pin)) return { ok: false, error: 'PIN inválido' };

    try {
      // 1) Bajar el blob
      const { data, error } = await this.client
        .from('encrypted_states')
        .select('ciphertext, dek_ciphertext, dek_iv, pin_salt, version, updated_at, size_bytes, device_name')
        .eq('user_id', this.user.id)
        .maybeSingle();

      if (error) return { ok: false, error: error.message };
      if (!data) return { ok: false, error: 'No hay datos sincronizados todavía. Sube primero desde otro dispositivo.' };
      if (!data.ciphertext || !data.dek_ciphertext || !data.dek_iv || !data.pin_salt) {
        return { ok: false, error: 'El blob de la nube está incompleto o corrupto.' };
      }

      // 2) Derivar la KEK desde el PIN ingresado y el salt bajado
      const saltBytes = _b64DecodeArr(data.pin_salt);
      const kek = await _deriveKEKFromPIN(pin, saltBytes);

      // 3) Descifrar la DEK con la KEK
      const dekEncrypted = _b64DecodeArr(data.dek_ciphertext);
      const dekIv        = _b64DecodeArr(data.dek_iv);
      const dek = await _decryptDEK(dekEncrypted, dekIv, kek);
      if (!dek) {
        return { ok: false, error: 'PIN incorrecto. No se pudo descifrar la clave de tus datos.' };
      }

      // 4) Descifrar el state con la DEK
      const decryptedState = await _decryptState(data.ciphertext, dek);
      if (!decryptedState) {
        return { ok: false, error: 'Datos en la nube corruptos o de versión incompatible.' };
      }

      // 5) Validación básica: el state debe verse como un state real
      if (typeof decryptedState !== 'object' || decryptedState === null) {
        return { ok: false, error: 'Formato del state descifrado inválido.' };
      }

      // 6) ÉXITO. Sincronizar todo localmente:
      //    a) Reemplazar la DEK en sesión y en localStorage
      _sessionDEK = dek;
      _sessionPIN = pin;
      _saveDEKToStorage(dekEncrypted, dekIv);
      localStorage.setItem('finanzas_pin_salt', data.pin_salt);
      // Hash del PIN local para que verificarPIN funcione
      const pinHash = await _derivarHashPIN(pin, saltBytes);
      localStorage.setItem('finanzas_pin_hash', pinHash);
      appPIN = pinHash;

      //    b) Reemplazar state global y persistir cifrado en localStorage
      Object.keys(state).forEach(k => delete state[k]);
      Object.assign(state, decryptedState);
      // Migraciones de campos faltantes
      if (!state.pagosRecurrentes) state.pagosRecurrentes = [];
      if (!state.prestamos) state.prestamos = [];
      if (!state.budgetRules) state.budgetRules = { gastos: 65, ahorro: 20, extra: 15 };
      if (!state.receivables) state.receivables = [];
      if (!state.payables) state.payables = [];
      if (!state.tarjetas) state.tarjetas = [];
      if (!state.goals) state.goals = [];
      if (!state.cuentas) state.cuentas = { efectivo: 0, ahorro: 0 };

      //    c) Re-cifrar y guardar en localStorage + IDB
      const reEncryptedB64 = await _encryptState(state, dek);
      localStorage.setItem(LS_KEY, reEncryptedB64);
      try { await saveStateToDB(state); } catch(e) { console.warn('IDB sync:', e); }

      console.log('☁️ Download OK. Versión:', data.version, 'Subido por:', data.device_name);
      // FASE 3: sincronizar versión local
      cloudSync.setLocalSyncVersion(data.version);
      return {
        ok: true,
        version: data.version,
        sizeBytes: data.size_bytes,
        updatedAt: data.updated_at,
        deviceName: data.device_name
      };
    } catch (e) {
      console.error('☁️ downloadState:', e);
      return { ok: false, error: e.message || String(e) };
    }
  },

  /** Descarga y descifra el estado remoto SIN reemplazar el local.
      Usa _sessionDEK que ya está en memoria — no pide PIN de nuevo. */
  async fetchRemoteState() {
    if (!this.user || !this.client) return { ok: false, error: 'No autenticado' };
    if (typeof _sessionDEK === 'undefined' || !_sessionDEK) {
      return { ok: false, error: 'PIN no desbloqueado en esta sesión' };
    }
    try {
      const { data, error } = await this.client
        .from('encrypted_states')
        .select('ciphertext, version, updated_at, device_name, size_bytes')
        .eq('user_id', this.user.id)
        .maybeSingle();
      if (error) return { ok: false, error: error.message };
      if (!data || !data.ciphertext) return { ok: false, noData: true };
      const decrypted = await _decryptState(data.ciphertext, _sessionDEK);
      if (!decrypted) return { ok: false, error: 'No se pudo descifrar el blob remoto' };
      return { ok: true, state: decrypted, version: data.version,
               updatedAt: data.updated_at, deviceName: data.device_name };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  },



  // ═══════════════════════════════════════════════════════════════════
  // FASE 3 + 4: AUTO-SYNC, INDICADOR, CHECK ON-OPEN, MERGE INTELIGENTE
  // ═══════════════════════════════════════════════════════════════════

  getLocalSyncVersion() {
    return parseInt(localStorage.getItem('mph_cloud_version') || '0', 10);
  },
  setLocalSyncVersion(v) {
    localStorage.setItem('mph_cloud_version', String(v));
  },

  _updateIndicator(st, msg) {
    const el = document.getElementById('cloud-sync-indicator');
    if (!el) return;
    el.className = st;
    const icons  = { synced:'☁️✓', pending:'☁️…', uploading:'☁️⬆', error:'☁️⚠', offline:'☁️✗' };
    const labels = { synced:'Sincronizado', pending:'Guardando…', uploading:'Subiendo…', error:'Error sync', offline:'Offline', hidden:'' };
    if (st === 'hidden') { el.style.display = 'none'; return; }
    el.innerHTML = (icons[st]||'☁️') + ' ' + (msg || labels[st]);
  },

  _scheduleAutoSync() {
    if (!this.user || !this.isEnabled() || this._isSyncing) return;
    if (this._autoSyncTimer) clearTimeout(this._autoSyncTimer);
    this._updateIndicator('pending');
    this._autoSyncTimer = setTimeout(async () => {
      this._autoSyncTimer = null;
      if (!navigator.onLine) { this._updateIndicator('offline'); return; }
      this._updateIndicator('uploading');
      const result = await this._autoMergeAndUpload();
      if (result.ok) {
        this._syncRetryCount = 0; // reset contador en éxito
        this.setLocalSyncVersion(result.version);
        const msg = result.mergeStats ? '✓ +' + result.mergeStats.totalRemoteNew + ' fusionados' : 'v' + result.version;
        this._updateIndicator('synced', msg);
        setTimeout(() => { if (document.getElementById('cloud-sync-indicator')?.className==='synced') this._updateIndicator('hidden'); }, 4000);
      } else {
        // Exponential backoff: reintenta hasta 3 veces (1s, 2s, 4s)
        this._syncRetryCount = (this._syncRetryCount || 0) + 1;
        if (this._syncRetryCount <= 3) {
          const delay = Math.min(1000 * Math.pow(2, this._syncRetryCount - 1), 8000); // 1s, 2s, 4s
          console.warn(`☁️ Auto-sync falló (intento ${this._syncRetryCount}/3), reintentando en ${delay}ms:`, result.error);
          this._updateIndicator('error', `Reintento ${this._syncRetryCount}/3…`);
          this._autoSyncTimer = setTimeout(() => {
            this._autoSyncTimer = null;
            this._scheduleAutoSync();
          }, delay);
        } else {
          // Agotados los reintentos: indicar error persistente
          this._syncRetryCount = 0;
          this._updateIndicator('error', result.error?.substr(0,20) || 'Error sync');
          console.error('☁️ Auto-sync falló tras 3 reintentos:', result.error);
        }
      }
    }, 3000);
  },

  _cancelAutoSync() {
    if (this._autoSyncTimer) { clearTimeout(this._autoSyncTimer); this._autoSyncTimer = null; }
    this._syncRetryCount = 0;
    this._updateIndicator('hidden');
  },

  async checkForNewerVersion() {
    if (!this.user || !this.isEnabled()) return;
    try {
      const info = await this.getRemoteInfo();
      if (!info) return;
      const remoteV = info.version || 0;
      const localV  = this.getLocalSyncVersion();
      const diffMs  = Date.now() - new Date(info.updated_at).getTime();
      if (remoteV > localV && diffMs > 10000 && info.device_name !== this.getDeviceName()) {
        this._showNewerVersionBanner(info);
      } else {
        this._updateIndicator('synced', 'v' + remoteV);
        setTimeout(() => this._updateIndicator('hidden'), 3000);
      }
    } catch (e) { console.warn('checkForNewerVersion:', e.message); }
  },

  _showNewerVersionBanner(info) {
    const existing = document.getElementById('cloud-newer-banner');
    if (existing) existing.remove();
    const fecha = new Date(info.updated_at);
    const diffMin = Math.floor((Date.now() - fecha) / 60000);
    const cuando = diffMin < 1 ? 'hace unos segundos' : diffMin < 60 ? 'hace ' + diffMin + ' min' : fecha.toLocaleTimeString('es-HN',{timeStyle:'short'});
    const banner = document.createElement('div');
    banner.id = 'cloud-newer-banner';
    banner.className = 'cloud-banner';
    banner.innerHTML =
      '<span>☁️ Datos nuevos en la nube (' + cuando + ', desde <strong>' + (info.device_name||'otro dispositivo') + '</strong>)</span>' +
      '<button onclick="window._onCloudBannerDownload()">⬇️ Combinar</button>' +
      '<button onclick="document.getElementById(\'cloud-newer-banner\')?.remove()" style="background:rgba(255,255,255,.1)">✕</button>';
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 20000);
  },

  // ─────────── FASE 4: MERGE INTELIGENTE ─────────────────────────────

  /** Descifra el blob remoto con la DEK de la sesión (para auto-merge) */
  async _downloadAndDecrypt() {
    if (!this.user || !this.client) return { ok: false, error: 'Sin sesión' };
    if (typeof _sessionDEK === 'undefined' || !_sessionDEK) return { ok: false, error: 'PIN no desbloqueado' };
    try {
      const { data, error } = await this.client
        .from('encrypted_states')
        .select('ciphertext, version, updated_at, device_name, size_bytes')
        .eq('user_id', this.user.id)
        .maybeSingle();
      if (error) return { ok: false, error: error.message };
      if (!data || !data.ciphertext) return { ok: false, noRemote: true };
      const decrypted = await _decryptState(data.ciphertext, _sessionDEK);
      if (!decrypted) return { ok: false, error: 'Error descifrando (¿PIN cambiado en otro dispositivo?)' };
      return { ok: true, data: decrypted, version: data.version, updatedAt: data.updated_at, deviceName: data.device_name };
    } catch (e) { return { ok: false, error: e.message }; }
  },

  /**
   * MERGE de 2 estados. Retorna { merged, diff }.
   * diff = { localNew:{}, remoteNew:{}, conflicts:{}, totalLocalNew, totalRemoteNew, totalConflicts }
   */
  mergeStates(localState, remoteState) {
    const diff = { localNew:{}, remoteNew:{}, conflicts:{}, totalLocalNew:0, totalRemoteNew:0, totalConflicts:0 };
    const merged = {};
    // Escalares: remoto gana
    ['nombre','saldoInicial','cuentas','cuentasIniciales','budgetRules','setup'].forEach(f => {
      merged[f] = (remoteState[f] !== undefined) ? remoteState[f] : localState[f];
    });
    // Arrays: unión inteligente por ID
    const LABELS = { transactions:'transacciones', goals:'metas de ahorro', receivables:'deudas a cobrar',
      payables:'deudas a pagar', prestamos:'préstamos', tarjetas:'tarjetas', pagosRecurrentes:'pagos recurrentes' };
    for (const field of Object.keys(LABELS)) {
      const localArr  = Array.isArray(localState[field])  ? localState[field]  : [];
      const remoteArr = Array.isArray(remoteState[field]) ? remoteState[field] : [];
      const localMap  = new Map(localArr.map(x  => [String(x.id),  x]));
      const remoteMap = new Map(remoteArr.map(x => [String(x.id), x]));
      const allIds    = new Set([...localMap.keys(), ...remoteMap.keys()]);
      const result    = [];
      for (const id of allIds) {
        const L = localMap.get(id), R = remoteMap.get(id);
        if (L && !R) {
          result.push(L);
          if (!L.deletedAt) { if (!diff.localNew[field]) diff.localNew[field]=[]; diff.localNew[field].push(L); diff.totalLocalNew++; }
        } else if (!L && R) {
          result.push(R);
          if (!R.deletedAt) { if (!diff.remoteNew[field]) diff.remoteNew[field]=[]; diff.remoteNew[field].push(R); diff.totalRemoteNew++; }
        } else if (JSON.stringify(L) === JSON.stringify(R)) {
          result.push(L);
        } else {
          const lDel = !!L.deletedAt, rDel = !!R.deletedAt;
          if (lDel || rDel) {
            result.push((lDel && rDel) ? (new Date(L.deletedAt)>=new Date(R.deletedAt)?L:R) : (lDel?L:R));
          } else if (field === 'goals') {
            const resolved = { ...R, actual: Math.max(L.actual||0, R.actual||0) };
            result.push(resolved);
            if (!diff.conflicts[field]) diff.conflicts[field]=[];
            diff.conflicts[field].push({ local:L, remote:R, resolved, label:LABELS[field] });
            diff.totalConflicts++;
          } else {
            result.push(R); // Remoto gana como tiebreaker
            if (!diff.conflicts[field]) diff.conflicts[field]=[];
            diff.conflicts[field].push({ local:L, remote:R, resolved:R, label:LABELS[field] });
            diff.totalConflicts++;
          }
        }
      }
      merged[field] = result;
    }
    return { merged, diff };
  },

  /** Genera HTML del diff para el modal de merge */
  buildDiffHtml(diff, localDeviceName, remoteDeviceName, remoteDate) {
    const LABELS = { transactions:'transacciones', goals:'metas de ahorro', receivables:'deudas a cobrar',
      payables:'deudas a pagar', prestamos:'préstamos', tarjetas:'tarjetas', pagosRecurrentes:'pagos recurrentes' };
    let html = '';
    const renderSection = (title, color, entries) => {
      html += '<div style="margin-bottom:10px"><div style="font-weight:700;font-size:11px;color:var(--text2);text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">' + title + '</div>';
      if (entries.length) {
        entries.forEach(([field, items]) => {
          html += '<div style="padding:4px 8px;background:' + color + ';border-radius:4px;margin-bottom:3px;font-size:12px">';
          html += '➕ ' + items.length + ' ' + (LABELS[field]||field) + ' nueva' + (items.length>1?'s':'');
          html += '</div>';
        });
      } else {
        html += '<div style="font-size:12px;color:var(--text2);padding:4px 8px">Sin cambios nuevos</div>';
      }
      html += '</div>';
    };
    renderSection('📱 ESTE DISPOSITIVO (' + esc(localDeviceName||'Local') + ')', 'rgba(76,175,80,.12)', Object.entries(diff.localNew));
    renderSection('☁️ NUBE (' + esc(remoteDeviceName||'otro dispositivo') + (remoteDate?', '+remoteDate:'') + ')', 'rgba(66,133,244,.12)', Object.entries(diff.remoteNew));
    if (diff.totalConflicts > 0) {
      html += '<div style="margin-bottom:10px"><div style="font-weight:700;font-size:11px;color:var(--amber);text-transform:uppercase;letter-spacing:.5px;margin-bottom:5px">⚠️ CONFLICTOS RESUELTOS (' + diff.totalConflicts + ')</div>';
      Object.entries(diff.conflicts).forEach(([field, items]) => {
        html += '<div style="padding:4px 8px;background:rgba(245,200,0,.1);border-radius:4px;margin-bottom:3px;font-size:12px">';
        html += '🔀 ' + items.length + ' ' + (LABELS[field]||field) + (field==='goals' ? ': se tomó el progreso más alto' : ': se usó la versión de la nube');
        html += '</div>';
      });
      html += '</div>';
    }
    const totalNew = diff.totalLocalNew + diff.totalRemoteNew;
    html += '<div style="background:rgba(76,175,80,.08);border:1px solid rgba(76,175,80,.25);padding:10px;border-radius:8px;font-size:12px;line-height:1.7">';
    html += '<strong style="color:var(--green)">✅ RESULTADO COMBINADO:</strong><br>';
    if (totalNew > 0) html += '• ' + totalNew + ' elemento' + (totalNew>1?'s nuevos':' nuevo') + ' de ambos dispositivos incluido' + (totalNew>1?'s':'') + '<br>';
    if (diff.totalConflicts > 0) html += '• ' + diff.totalConflicts + ' conflicto' + (diff.totalConflicts>1?'s resueltos':' resuelto') + ' automáticamente<br>';
    if (totalNew === 0 && diff.totalConflicts === 0) html += '• Cambios menores en configuración o metadatos<br>';
    html += '</div>';
    return html;
  },

  /** AUTO-MERGE silencioso: descarga → merge → sube. No interrumpe al usuario. */
  async _autoMergeAndUpload() {
    if (this._isSyncing) return { ok: false, error: 'Sync en progreso' };
    this._isSyncing = true;
    try {
      if (!this.user || !await this.init()) return { ok: false, error: 'Sin sesión' };
      if (typeof _sessionDEK === 'undefined' || !_sessionDEK) return { ok: false, error: 'PIN no desbloqueado' };
      const dekData = (typeof _loadDEKFromStorage === 'function') ? _loadDEKFromStorage() : null;
      if (!dekData || !localStorage.getItem('finanzas_pin_salt')) return { ok: false, error: 'Faltan datos de cifrado' };

      const remoteInfo = await this.getRemoteInfo();
      const localV = this.getLocalSyncVersion();
      let mergeStats = null;

      if (remoteInfo && remoteInfo.version > localV) {
        const dl = await this._downloadAndDecrypt();
        if (dl.ok) {
          const { merged, diff } = this.mergeStates(state, dl.data);
          const hasChanges = diff.totalLocalNew>0 || diff.totalRemoteNew>0 || diff.totalConflicts>0;
          if (hasChanges) {
            // Backup de seguridad antes de aplicar el merge automático
            _createPreMergeBackup();
            // Mostrar overlay brevemente durante el merge
            _showMergeOverlay('Sincronizando…');
            // Aplicar merged sin disparar otro auto-sync
            Object.keys(state).forEach(k => delete state[k]);
            Object.assign(state, merged);
            ['pagosRecurrentes','prestamos','goals','tarjetas','receivables','payables'].forEach(f => { if (!state[f]) state[f] = []; });
            // Persistir localmente sin trigger
            try {
              const enc = await _encryptState(state, _sessionDEK);
              localStorage.setItem(LS_KEY, enc);
              saveStateToDB(state).catch(()=>{});
            } catch(e) {}
            _hideMergeOverlay();
            // Refrescar UI con los nuevos datos
            if (typeof renderAll === 'function') setTimeout(() => renderAll(), 150);
            _mostrarBotonDeshacer();
            mergeStats = diff;
            console.log('☁️ Auto-merge OK: +'+ diff.totalRemoteNew +' remotos, +'+ diff.totalLocalNew +' locales');
          }
        } else if (!dl.noRemote) {
          console.warn('☁️ Auto-merge download falló:', dl.error);
        }
      }

      const uploadResult = await this.uploadState();
      if (uploadResult.ok && mergeStats) uploadResult.mergeStats = mergeStats;
      return uploadResult;
    } finally {
      this._isSyncing = false;
    }
  }
};

window.cloudSync = cloudSync;

// ─────────────────────────────────────────────────────────────────────
// UI: render del estado actual de sincronización en Configuración
// ─────────────────────────────────────────────────────────────────────