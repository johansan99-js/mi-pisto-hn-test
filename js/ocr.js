/**
 * Mi Pisto HN — ocr.js
 * ─────────────────────────────────────────────────────────
 * Lectura de recibos con Tesseract.js (offline).
 * 3 estados visuales: analizando / detectado / no detectado.
 * Requiere: utils.js, storage.js
 */

async function procesarReciboOCR(event) {
    const file = event.target.files[0];
    if (!file) return;
    const statusEl = document.getElementById('ocr-status');
    const montoInput = document.getElementById('gasto-monto');
    
    // Estados visuales mejorados: contenedor con ícono + texto + barra de progreso
    statusEl.style.display = 'block';
    statusEl.style.cssText = 'display:block;padding:10px 12px;background:var(--bg3);border-radius:8px;margin-bottom:8px;border-left:3px solid var(--amber);font-size:12px';
    
    const updateStatus = (msg, type = 'loading') => {
      const colors = { loading:'var(--amber)', success:'var(--green)', error:'var(--red)', info:'#4285F4' };
      const borders = { loading:'var(--amber)', success:'var(--green)', error:'var(--red)', info:'#4285F4' };
      statusEl.style.borderLeftColor = borders[type] || 'var(--amber)';
      statusEl.innerHTML = '<span style="color:' + (colors[type]||'var(--amber)') + ';font-weight:700">' + msg + '</span>';
    };

    try {
        updateStatus('📥 Verificando motor OCR...', 'loading');
        if (typeof Tesseract === 'undefined') throw new Error('Tesseract no está cargado. Recarga la página.');
        const workerOptions = {
            logger: m => {
                console.log('Tesseract:', m);
                if (m.status === 'loading language traineddata') { updateStatus('📥 Descargando idioma español (primera vez, ~30 MB)…', 'info'); }
                else if (m.status === 'initializing api') { updateStatus('⚙️ Inicializando motor de reconocimiento…', 'loading'); }
                else if (m.status === 'recognizing text') {
                  const pct = m.progress ? Math.round(m.progress * 100) : 0;
                  updateStatus('🔍 Leyendo factura… ' + pct + '%', 'loading');
                }
            },
            workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/worker.min.js',
            langPath: 'https://tessdata.projectnaptha.com/4.0.0',
            corePath: 'https://cdn.jsdelivr.net/npm/tesseract.js-core@4/tesseract-core.wasm.js'
        };
        updateStatus('🚀 Iniciando motor OCR…', 'loading');
        const worker = await Tesseract.createWorker(workerOptions);
        updateStatus('🌐 Cargando idioma español…', 'loading');
        await worker.loadLanguage('spa');
        await worker.initialize('spa');
        updateStatus('📸 Procesando imagen…', 'loading');
        const imageUrl = URL.createObjectURL(file);
        const { data: { text } } = await worker.recognize(imageUrl);
        // P0-2: Guardar imagen en IndexedDB (no localStorage) para evitar QuotaExceededError
        await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = async function(e) {
                _tempFacturaId = await _guardarTempFactura(e.target.result);
                window._tempFacturaDataURL = e.target.result; // solo para preview en modal
                resolve();
            };
            reader.onerror = () => resolve();
            reader.readAsDataURL(file);
        });
        URL.revokeObjectURL(imageUrl);
        
        console.log('✅ Texto completo detectado:', text);
        
        // ========== NUEVA LÓGICA DE EXTRACCIÓN DE MONTO (MÁS ROBUSTA) ==========
        const lineas = text.split('\n');
        let mayorMonto = 0;
        
        // 1. Patrones Específicos por Tipo de Comercio
        const patronesEspecificos = [
            // Little Caesars / Restaurantes
            /PICK-?UP\s+TO\s+L\.?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2}))/i, /PICK-?UP\s+TOP\s+L\.?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2}))/i, /PICK\s*UP\s*:?\s*L\.?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2}))/i, /SON\s*:?\s*[A-Z\s]*L\.?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2}))/i,
            // Generales
            /TOTAL\s+L\.?\s*:?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2}))/i, /TOTAL\s+A\s+PAGAR\s*[:\s]*L?\.?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2}))/i, /IMPORTE\s+TOTAL\s*[:\s]*L?\.?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2}))/i, /A\s+PAGAR\s*[:\s]*L?\.?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2}))/i
        ];
        for (const patron of patronesEspecificos) {
            const matches = text.matchAll(new RegExp(patron.source, 'gi'));
            for (const match of matches) {
                const valorStr = match[1] || match[0];
                const valor = parseFloat(valorStr.replace(/,/g, ''));
                if (!isNaN(valor) && valor > 0 && valor < 1000000) { if (valor > mayorMonto) mayorMonto = valor; }
            }
        }

        // 2. Búsqueda línea por línea para casos donde el monto está en la línea siguiente
        if (mayorMonto === 0) {
            for (let i = 0; i < lineas.length; i++) {
                const linea = lineas[i].trim();
                if (linea.match(/TOTAL|IMPORTE|A\s+PAGAR|PICK-?UP|PICKUP/i)) {
                    const matchMismaLinea = linea.match(/(\d{1,3}(?:,\d{3})*(?:\.\d{2}))/);
                    if (matchMismaLinea) { const valor = parseFloat(matchMismaLinea[1].replace(/,/g, '')); if (valor > mayorMonto) mayorMonto = valor; }
                    if (i + 1 < lineas.length) {
                        const siguienteLinea = lineas[i + 1].trim();
                        const matchSiguienteLinea = siguienteLinea.match(/(\d{1,3}(?:,\d{3})*(?:\.\d{2}))/);
                        if (matchSiguienteLinea) { const valor = parseFloat(matchSiguienteLinea[1].replace(/,/g, '')); if (valor > mayorMonto) mayorMonto = valor; }
                    }
                }
            }
        }

        // 3. Respaldo: el número más grande con formato de moneda
        if (mayorMonto === 0) {
            const todosLosNumeros = text.match(/\d{1,3}(?:,\d{3})*(?:\.\d{2})/g) || [];
            const numeros = todosLosNumeros.map(n => parseFloat(n.replace(/,/g, ''))).filter(n => n > 10 && n < 1000000);
            if (numeros.length > 0) {
                numeros.sort((a, b) => b - a);
                mayorMonto = numeros[0];
                console.log('💰 Usando el número más grande como respaldo:', mayorMonto);
            }
        }
        
        await worker.terminate();

        if (mayorMonto > 0) {
            montoInput.value = mayorMonto.toFixed(2);
            updateStatus(`✅ Total detectado: L. ${mayorMonto.toFixed(2)}`);
            statusEl.style.color = 'var(--green)';
            
            // ========== BASE DE DATOS LOCAL DE COMERCIOS (DETECCIÓN AVANZADA) ==========
            const textLower = text.toLowerCase();
            let categoriaAsignada = '';
            let subcatAsignada = '';
            let tipoAsignado = 'fijo'; // Por defecto es fijo
            
            // Función auxiliar para verificar si una frase está presente
            const contiene = (frase) => textLower.includes(frase);

            // SUPERMERCADOS
            if (contiene('pricesmart')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'PriceSmart'; }
            else if (contiene('los andes')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'Los Andes'; }
            else if (contiene('la colonia')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'La Colonia'; }
            else if (contiene('colonial')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'Colonial'; }
            else if (contiene('maxi despensa')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'Maxi Despensa'; }
            else if (contiene('el faro')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'El Faro'; }
            else if (contiene('walmart')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'Walmart'; }
            else if (contiene('paiz')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'Paiz'; }
            else if (contiene('despensa familiar')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'Despensa Familiar'; }
            else if (contiene('supermercado')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'Supermercado'; }

            // RESTAURANTES Y COMIDA RÁPIDA
            else if (contiene('little caesars') || contiene('little') && contiene('caesars') || contiene('intur')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'Little Caesars'; tipoAsignado = 'extra'; }
            else if (contiene('pizza hut')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'Pizza Hut'; tipoAsignado = 'extra'; }
            else if (contiene('domino\'s pizza') || contiene('dominos')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'Domino\'s Pizza'; tipoAsignado = 'extra'; }
            else if (contiene('mcdonald\'s') || contiene('mcdonalds')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'McDonald\'s'; tipoAsignado = 'extra'; }
            else if (contiene('burger king')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'Burger King'; tipoAsignado = 'extra'; }
            else if (contiene('wendy\'s') || contiene('wendys')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'Wendy\'s'; tipoAsignado = 'extra'; }
            else if (contiene('kfc')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'KFC'; tipoAsignado = 'extra'; }
            else if (contiene('popeyes')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'Popeyes'; tipoAsignado = 'extra'; }
            else if (contiene('church\'s chicken') || contiene('churchs')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'Church\'s Chicken'; tipoAsignado = 'extra'; }
            else if (contiene('dunkin')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'Dunkin\''; tipoAsignado = 'extra'; }
            else if (contiene('starbucks')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'Starbucks'; tipoAsignado = 'extra'; }
            else if (contiene('espresso americano')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'Espresso Americano'; tipoAsignado = 'extra'; }
            else if (contiene('restaurante') || contiene('comida')) { categoriaAsignada = 'Alimentación'; subcatAsignada = 'Restaurante'; tipoAsignado = 'extra'; }

            // GASOLINERAS
            else if (contiene('shell')) { categoriaAsignada = 'Transporte'; subcatAsignada = 'Shell'; }
            else if (contiene('texaco')) { categoriaAsignada = 'Transporte'; subcatAsignada = 'Texaco'; }
            else if (contiene('puma')) { categoriaAsignada = 'Transporte'; subcatAsignada = 'Puma'; }
            else if (contiene('uno')) { categoriaAsignada = 'Transporte'; subcatAsignada = 'Uno'; }
            else if (contiene('gasolinera')) { categoriaAsignada = 'Transporte'; subcatAsignada = 'Combustible'; }

            // FARMACIAS
            else if (contiene('farmacia')) { categoriaAsignada = 'Salud'; subcatAsignada = 'Farmacia'; }
            else if (contiene('siman')) { categoriaAsignada = 'Salud'; subcatAsignada = 'Farmacia Simán'; }
            else if (contiene('cruz verde')) { categoriaAsignada = 'Salud'; subcatAsignada = 'Farmacia Cruz Verde'; }
            else if (contiene('farmavalue')) { categoriaAsignada = 'Salud'; subcatAsignada = 'Farmavalue'; }
            else if (contiene('ahorro farmacia')) { categoriaAsignada = 'Salud'; subcatAsignada = 'Farmacia El Ahorro'; }

            // TIENDAS DE CONVENIENCIA
            else if (contiene('circle k')) { categoriaAsignada = 'Ocio'; subcatAsignada = 'Circle K'; tipoAsignado = 'extra'; }
            else if (contiene('pronto')) { categoriaAsignada = 'Ocio'; subcatAsignada = 'Pronto'; tipoAsignado = 'extra'; }

            // MANTENIMIENTO Y REPUESTOS
            else if (contiene('nechos') || contiene('lubricantes')) { categoriaAsignada = 'Mantenimiento'; subcatAsignada = 'NECHOS LUBRICANTES'; }
            else if (contiene('repuestos') || contiene('auto')) { categoriaAsignada = 'Mantenimiento'; subcatAsignada = 'Repuestos'; }

            // TIENDAS POR DEPARTAMENTO / ROPA
            else if (contiene('lady lee')) { categoriaAsignada = 'Ropa'; subcatAsignada = 'Lady Lee'; tipoAsignado = 'extra'; }
            else if (contiene('carrion')) { categoriaAsignada = 'Ropa'; subcatAsignada = 'Carrión'; tipoAsignado = 'extra'; }
            else if (contiene('liverpool')) { categoriaAsignada = 'Ropa'; subcatAsignada = 'Liverpool'; tipoAsignado = 'extra'; }
            else if (contiene('zara')) { categoriaAsignada = 'Ropa'; subcatAsignada = 'Zara'; tipoAsignado = 'extra'; }

            // TECNOLOGÍA
            else if (contiene('radio shack')) { categoriaAsignada = 'Tecnología'; subcatAsignada = 'RadioShack'; tipoAsignado = 'extra'; }
            else if (contiene('la curacao')) { categoriaAsignada = 'Tecnología'; subcatAsignada = 'La Curacao'; tipoAsignado = 'extra'; }
            else if (contiene('elektra')) { categoriaAsignada = 'Tecnología'; subcatAsignada = 'Elektra'; tipoAsignado = 'extra'; }
            else if (contiene('jetstereo')) { categoriaAsignada = 'Tecnología'; subcatAsignada = 'Jetstereo'; tipoAsignado = 'extra'; }

            // OTROS
            else if (contiene('cinemark') || contiene('cine')) { categoriaAsignada = 'Ocio'; subcatAsignada = 'Cinemark'; tipoAsignado = 'extra'; }
            else if (contiene('gimnasio') || contiene('gym')) { categoriaAsignada = 'Salud'; subcatAsignada = 'Gimnasio'; tipoAsignado = 'extra'; }

            // Asignar los valores si se detectó algo
            if (categoriaAsignada) {
                document.getElementById('gasto-cat').value = categoriaAsignada;
                document.getElementById('gasto-subcat').value = subcatAsignada;
                document.getElementById('gasto-tipo').value = tipoAsignado;
                updateStatus('✅ Monto detectado: L. ' + mayorMonto.toFixed(2) + ' · ' + subcatAsignada, 'success');
            } else {
                updateStatus('✅ Monto detectado: L. ' + mayorMonto.toFixed(2) + ' · Comercio no reconocido (llena manualmente)', 'success');
            }
            
            window.tempFacturaImagen = true;
            // Mostrar preview de la factura escaneada en el modal
            let previewEl = document.getElementById('ocr-preview');
            if (!previewEl) {
                previewEl = document.createElement('div');
                previewEl.id = 'ocr-preview';
                previewEl.style.cssText = 'margin-top:10px;border-radius:8px;overflow:hidden;max-height:140px;border:2px solid var(--green);position:relative';
                previewEl.innerHTML = '<img id="ocr-preview-img" src="" style="width:100%;max-height:140px;object-fit:cover;display:block">' +
                  '<div style="position:absolute;bottom:0;left:0;right:0;background:rgba(0,0,0,0.6);color:var(--green);font-size:10px;padding:4px 8px;font-weight:700">🧾 Factura adjunta — se guardará con el gasto</div>';
                document.getElementById('ocr-status').after(previewEl);
            }
            document.getElementById('ocr-preview-img').src = window._tempFacturaDataURL || '';
            previewEl.style.display = 'block';
            setTimeout(() => {
              // Colapsar el status a solo la primera línea para no ocupar tanto espacio
              statusEl.innerHTML = '<span style="color:var(--green);font-weight:700">✅ Factura leída · L. ' + mayorMonto.toFixed(2) + '</span>';
            }, 5000);
            
        } else {
            // Estado claro de fallo: no se encontró monto
            updateStatus('⚠️ No pude leer el monto de esta imagen. Ingresalo manualmente arriba.', 'error');
            // Agregar botón de reintentar
            const retryBtn = document.createElement('button');
            retryBtn.textContent = '📸 Intentar con otra foto';
            retryBtn.style.cssText = 'margin-top:6px;background:var(--bg2);border:1px solid var(--border);color:var(--text);padding:6px 12px;border-radius:6px;font-size:11px;cursor:pointer;width:100%';
            retryBtn.onclick = () => document.getElementById('ocr-input').click();
            statusEl.appendChild(retryBtn);
        }
    } catch (error) {
        console.error('❌ Error OCR:', error);
        updateStatus('❌ No se pudo procesar la imagen. ' + (error.message || 'Intenta de nuevo.'), 'error');
        // Sugerir ingreso manual
        statusEl.innerHTML += '<br><span style="color:var(--text2);font-size:11px;margin-top:4px;display:block">💡 Podés ingresar el monto manualmente en el campo de arriba.</span>';
    } finally {
        event.target.value = '';
    }
}
// ========== FUNCIONES DE DIAGNÓSTICO OCR ==========
async function testOCR() {
    const resultEl = document.getElementById('ocr-test-result');
    if (!resultEl) return;
    resultEl.innerHTML = '🔄 Probando OCR...';
    resultEl.style.color = 'var(--amber)';
    try {
        if (typeof Tesseract === 'undefined') throw new Error('Tesseract no esta cargado');
        resultEl.innerHTML = '✅ Tesseract cargado<br>📦 Version: ' + (Tesseract.version || 'OK') + '<br>✅ OCR listo para usar';
        resultEl.style.color = 'var(--green)';
    } catch (error) {
        resultEl.innerHTML = '❌ Error: ' + error.message + '<br>💡 Recarga la pagina';
        resultEl.style.color = 'var(--red)';
    }
}
function clearOCRCache() {
    try {
        const keys = Object.keys(localStorage);
        let removed = 0;
        keys.forEach(key => {
            if (key.includes('tesseract') || key.includes('ocr') || key.includes('temp_factura')) {
                localStorage.removeItem(key);
                removed++;
            }
        });
        if ('caches' in window) {
            caches.keys().then(names => {
                names.forEach(name => {
                    if (name.includes('tesseract') || name.includes('ocr')) caches.delete(name);
                });
            });
        }
        const resultEl = document.getElementById('ocr-test-result');
        if (resultEl) {
            resultEl.innerHTML = '✅ Cache OCR limpiado (' + removed + ' elementos)<br>💡 Recarga la pagina';
            resultEl.style.color = 'var(--green)';
        } else {
            alert('✅ Cache OCR limpiado: ' + removed + ' elementos');
        }
    } catch (error) {
        alert('❌ Error: ' + error.message);
    }
}
  
// ========== FUNCIONES DE SUPERVIVENCIA Y GRÁFICO ==========
function updateSurvivalIndex(balance) {
    const fijosMensual = state.transactions.filter(t => t.type === 'expense' && t.tipo === 'fijo' && !t.deletedAt).reduce((a, b) => a + b.amount, 0) || 1;
    const gastoDiario = fijosMensual / 30;
    const dias = Math.max(0, Math.floor(balance / (gastoDiario || 1)));

    const el  = document.getElementById('survival-val');
    const box = document.querySelector('.survival-box');
    const statusEl = document.getElementById('survival-status');

    // Umbrales: < 30 rojo | 30–90 amarillo | > 90 verde
    let state_class, statusClass, statusText, numColor;
    if (dias < 30) {
        state_class = 'state-danger';  statusClass = 'danger';
        statusText  = '🔴 Riesgo alto — menos de 30 días';
        numColor    = 'var(--red)';
    } else if (dias <= 90) {
        state_class = 'state-warning'; statusClass = 'warning';
        statusText  = '🟡 Precaución — entre 30 y 90 días';
        numColor    = 'var(--amber)';
    } else {
        state_class = 'state-safe';    statusClass = 'safe';
        statusText  = '🟢 Seguro — más de 90 días';
        numColor    = 'var(--green)';
    }

    if (el) { el.textContent = dias; el.style.color = numColor; }
    if (box) { box.classList.remove('state-danger','state-warning','state-safe'); box.classList.add(state_class); }
    if (statusEl) { statusEl.className = `survival-status ${statusClass}`; statusEl.textContent = statusText; }
}

function renderDoughnutChart() {
    const canvas = document.getElementById('mainChart');
    if(!canvas) return;
    
    // FIX: Proteger contra "Chart is not defined" si Chart.js no carga
    if (typeof Chart === 'undefined') {
        console.warn('⚠️ Chart.js no cargado - omitiendo gráfico (la app sigue funcionando)');
        // Mostrar mensaje amigable en lugar del gráfico
        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#C09090';
            ctx.font = '12px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('📊 Gráfico no disponible', canvas.width/2, canvas.height/2 - 8);
            ctx.fillText('(verifica conexión)', canvas.width/2, canvas.height/2 + 12);
        }
        return;
    }
    
    const ctx = canvas.getContext('2d');
    // P0-2: excluir transferencias internas, conciliaciones y soft-deleted del gráfico de gastos
    const realExpenses = state.transactions.filter(t => t.type === 'expense' && !t.deletedAt && !t.esTransferencia && !t.esConciliacion);
    const fijos = realExpenses.filter(t => t.tipo === 'fijo').reduce((a, b) => a + b.amount, 0);
    const extras = realExpenses.filter(t => t.tipo === 'extra').reduce((a, b) => a + b.amount, 0);

    const hasData = fijos > 0 || extras > 0;

    if(mainChart) mainChart.destroy();
    
    try {
        mainChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: hasData ? ['Vital/Fijo', 'Ocio/Extra'] : ['Sin datos'],
                datasets: [{ 
                    data: hasData ? [fijos, extras] : [1], 
                    backgroundColor: hasData ? ['#F5C800', '#FF4444', '#4285F4', '#FF7043', '#4CAF50'] : ['#3A1418'], 
                    borderWidth: 0 
                }]
            },
            options: { cutout: '70%', plugins: { legend: { position: 'bottom', labels: {color: '#9b9eb5'} }, tooltip: { enabled: hasData } } }
        });
    } catch (e) {
        console.error('❌ Error creando gráfico:', e);
    }
}

function setGastoPreset(cat, sub, tipo) {
    document.getElementById('gasto-cat').value = cat;
    document.getElementById('gasto-subcat').value = sub;
    document.getElementById('gasto-tipo').value = tipo;
}

// ========== LÓGICA DE NAVEGACIÓN Y UI ==========
function toggleHamburger_legacy(){/* reemplazada por la v2 */}
function saveBudgetRules(){const gastos=parseInt(document.getElementById('rule-gastos').value)||0;const ahorro=parseInt(document.getElementById('rule-ahorro').value)||0;const extra=parseInt(document.getElementById('rule-extra').value)||0;if(gastos+ahorro+extra!==100){document.getElementById('budget-total-warning').style.display='block';return}state.budgetRules={gastos,ahorro,extra};save();closeModal('modal-budget-rules');renderBudgetRules();alert(`✅ Reglas actualizadas`)}
function renderBudgetRules(){const rules=state.budgetRules||{gastos:65,ahorro:20,extra:15};document.getElementById('budget-gastos-val').textContent=rules.gastos+'%';document.getElementById('budget-ahorro-val').textContent=rules.ahorro+'%';document.getElementById('budget-extra-val').textContent=rules.extra+'%';document.getElementById('rule-gastos').value=rules.gastos;document.getElementById('rule-ahorro').value=rules.ahorro;document.getElementById('rule-extra').value=rules.extra}

let deferredPrompt=null,pwaDismissed=localStorage.getItem('pwa_banner_dismissed')==='true',isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
function isAppInstalled(){return window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true}
function cerrarIOSBar(){const b=document.getElementById('ios-bar');if(b)b.classList.remove('visible');localStorage.setItem('pwa_banner_dismissed','true');pwaDismissed=true}
function showPwaBanner(){
  if(isAppInstalled()||pwaDismissed)return;
  if(isIOS){
    // Mostrar el banner inferior de iOS inmediatamente (2 segundos)
    setTimeout(()=>{
      if(!isAppInstalled()&&!pwaDismissed){
        const b=document.getElementById('ios-bar');
        if(b)b.classList.add('visible');
      }
    },2000);
    return;
  }
  if(deferredPrompt)document.getElementById('pwa-banner').classList.remove('hidden');
}
window.addEventListener('beforeinstallprompt',(e)=>{e.preventDefault();deferredPrompt=e;setTimeout(showPwaBanner,5000)});
document.getElementById('install-btn')?.addEventListener('click',async()=>{if(!deferredPrompt)return;document.getElementById('pwa-banner').classList.add('hidden');deferredPrompt.prompt();const{outcome}=await deferredPrompt.userChoice;deferredPrompt=null});
function dismissPwaBanner(){document.getElementById('pwa-banner').classList.add('hidden');localStorage.setItem('pwa_banner_dismissed','true');pwaDismissed=true}

// ── P0-1: PBKDF2 helpers ─────────────────────────────────────
async function _derivarHashPIN(pin, salt) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(pin), { name: 'PBKDF2' }, false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2,'0')).join('');
}

async function configurarPIN() {
  const esPrimerPIN = !localStorage.getItem('finanzas_pin_hash');
  const esActualizacion = !esPrimerPIN && _sessionDEK; // Tiene PIN + DEK en sesión
  
  const nuevoPIN = prompt('Crea un PIN de 4 dígitos:\n(Deja en blanco para eliminar)');
  if (nuevoPIN === null) return;
  
  if (nuevoPIN === '') {
    // ⚠️ Eliminar PIN cuando hay datos cifrados es DESTRUCTIVO
    if (!esPrimerPIN && _isStateEncrypted()) {
      const confirma = confirm(
        '⚠️ ADVERTENCIA: Si eliminas el PIN, perderás acceso a todos tus datos cifrados.\n\n' +
        'Solo podrás recuperarlos con un respaldo cifrado.\n\n' +
        '¿Estás SEGURO de eliminar el PIN?'
      );
      if (!confirma) return;
    }
    
    localStorage.removeItem('finanzas_pin_hash');
    localStorage.removeItem('finanzas_pin_salt');
    localStorage.removeItem('finanzas_dek_encrypted');
    localStorage.removeItem('finanzas_dek_iv');
    localStorage.removeItem('finanzas_pin'); // legacy
    appPIN = '';
    _sessionDEK = null;
    _sessionPIN = null;
    alert('🔓 PIN eliminado. Tus datos ya no están cifrados.');
    return;
  }
  
  if (!/^\d{4}$/.test(nuevoPIN)) { alert('❌ Debe tener 4 números'); return; }
  
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await _derivarHashPIN(nuevoPIN, salt);
  
  // ────────────────────────────────────────────────────────────
  // CASO 1: Primer PIN (creación inicial)
  // ────────────────────────────────────────────────────────────
  if (esPrimerPIN) {
    // Generar DEK nueva
    const dek = _generateDEK();
    _sessionDEK = dek;
    _sessionPIN = nuevoPIN;
    
    // Cifrar DEK con KEK derivada del PIN
    const kek = await _deriveKEKFromPIN(nuevoPIN, salt);
    const { encrypted, iv } = await _encryptDEK(dek, kek);
    
    // Guardar PIN hash + salt + DEK cifrada
    localStorage.setItem('finanzas_pin_hash', hash);
    localStorage.setItem('finanzas_pin_salt', btoa(String.fromCharCode(...salt)));
    _saveDEKToStorage(encrypted, iv);
    
    appPIN = hash;
    
    // Si ya hay state (ej. terminó onboarding), cifrarlo ahora
    if (state.setup) {
      const encryptedState = await _encryptState(state, dek);
      localStorage.setItem(LS_KEY, encryptedState);
      console.log('🔒 State inicial cifrado');
    }
    
    alert('✅ PIN configurado. Tus datos están protegidos con cifrado AES-256.');
    return;
  }
  
  // ────────────────────────────────────────────────────────────
  // CASO 2: Cambiar PIN existente (re-cifrar DEK)
  // ────────────────────────────────────────────────────────────
  if (esActualizacion) {
    // La DEK ya está en memoria, solo re-cifrarla con el nuevo PIN
    const newKEK = await _deriveKEKFromPIN(nuevoPIN, salt);
    const { encrypted, iv } = await _encryptDEK(_sessionDEK, newKEK);
    
    // Actualizar PIN hash + salt + DEK cifrada
    localStorage.setItem('finanzas_pin_hash', hash);
    localStorage.setItem('finanzas_pin_salt', btoa(String.fromCharCode(...salt)));
    _saveDEKToStorage(encrypted, iv);
    
    appPIN = hash;
    _sessionPIN = nuevoPIN;
    
    alert('✅ PIN actualizado. Tu DEK se re-cifró con el nuevo PIN.');
    return;
  }
  
  // ────────────────────────────────────────────────────────────
  // CASO 3: Cambiar PIN pero sin DEK en sesión (ej. cambió sin verificar)
  // ────────────────────────────────────────────────────────────
  alert('⚠️ Para cambiar tu PIN, primero debes verificar el PIN actual e ingresar a la app.');
}
// P1-7: ELIMINADA verificarPIN síncrona obsoleta (comparaba intento crudo === appPIN
// donde appPIN ahora es el HASH PBKDF2; nunca matchearía). La versión async correcta
// se asigna más abajo en el archivo (sección "MEJORAS CRÍTICAS v1.1").
// Stub temprano por si algo invoca verificarPIN antes de que se sobrescriba:
var verificarPIN = function(){ /* será sobrescrita por la versión async */ };

// olvidePIN: si el usuario olvidó su PIN, la ÚNICA opción real es borrar
// todo y volver al onboarding (los datos están cifrados con AES-256 y no
// hay puerta trasera). Antes era un alert estéril; ahora ejecuta el reset
// completo con doble confirmación (mismo flujo que resetApp).
function olvidePIN(){
  const c1 = confirm(
    '🚨 BORRAR TODO Y EMPEZAR DE CERO\n\n' +
    'Tus datos están cifrados con AES-256 y NO se pueden recuperar sin tu PIN.\n\n' +
    'Si continúas, se BORRARÁ:\n' +
    '• Todas tus transacciones (ingresos y gastos)\n' +
    '• Préstamos, tarjetas y deudas\n' +
    '• Metas de ahorro\n' +
    '• Tu PIN, datos personales y configuración\n\n' +
    '¿Quieres continuar?'
  );
  if (!c1) return;
  
  const c2 = confirm(
    '⚠️ ÚLTIMA ADVERTENCIA\n\n' +
    'Esta acción NO se puede deshacer.\n' +
    'Volverás al tutorial inicial como una instalación nueva.\n\n' +
    '¿Confirmar borrado total?'
  );
  if (!c2) return;
  
  // Limpiar localStorage
  try { localStorage.clear(); } catch(e) {}
  
  // Limpiar sessionStorage
  try { sessionStorage.clear(); } catch(e) {}
  
  // Limpiar IndexedDB (importante: incluye la copia plana del state)
  try {
    if (window.indexedDB) {
      indexedDB.databases().then(dbs => {
        dbs.forEach(db => {
          try { indexedDB.deleteDatabase(db.name); } catch(e) {}
        });
      }).catch(()=>{});
    }
  } catch(e) {}
  
  // Limpiar caches del Service Worker
  try {
    if ('caches' in window) {
      caches.keys().then(keys => {
        keys.forEach(k => caches.delete(k));
      }).catch(()=>{});
    }
  } catch(e) {}
  
  // Desregistrar Service Workers
  try {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(regs => {
        regs.forEach(reg => reg.unregister());
      }).catch(()=>{});
    }
  } catch(e) {}
  
  alert('✅ Todo borrado. La app se reiniciará al tutorial.');
  setTimeout(() => location.reload(), 500);
}
function toggleRecordarPIN(){recordarPIN=document.getElementById('recordar-pin').checked;localStorage.setItem('finanzas_recordar',recordarPIN);}

// ═══════════════════════════════════════════════════════════════════════
// ONBOARDING WIZARD — 4 pasos
// ═══════════════════════════════════════════════════════════════════════