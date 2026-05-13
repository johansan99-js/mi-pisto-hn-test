# 📖 Guía de Instalación - Mi Pisto HN

**Última actualización:** 13 de mayo de 2026

---

## 🚀 Instalación para Usuarios

### 📱 iPhone/iPad (iOS)

1. Abre en Safari: https://johansan99-js.github.io/mi-pisto-hn/
2. Toca el botón **Compartir** (↑ en la parte inferior)
3. Busca la opción **"Agregar a pantalla de inicio"**
4. Toca **"Agregar"**
5. ¡Listo! Aparecerá en tu home screen

**Notas iOS:**
- ⚠️ Background Sync solo funciona con la app abierta
- 💡 Toca "Subir datos" antes de cerrar la app para sincronizar cambios

### 📱 Android (Chrome/Firefox)

1. Abre en Chrome: https://johansan99-js.github.io/mi-pisto-hn/
2. Toca el menú (⋮ - tres puntos)
3. Busca **"Instalar app"** o **"Instalar en pantalla de inicio"**
4. Toca **"Instalar"**
5. ¡Listo! Aparecerá en tu app drawer

**Notas Android:**
- ✅ Background Sync completo soportado
- ✅ Sincronización automática en background

### 💻 Desktop (Navegador)

1. Abre: https://johansan99-js.github.io/mi-pisto-hn/
2. **Opcional - Instalar como PWA:**
   - **Chrome/Edge:** Click en el icono de instalar (esquina superior derecha)
   - **Firefox:** No soportado (pero funciona en navegador)
   - **Safari:** No soportado (pero funciona en navegador)

---

## ⚙️ Setup para Desarrolladores

### Requisitos

- **Node.js:** 18+ (verificar: `node --version`)
- **npm:** 8+ (verificar: `npm --version`)
- **Git:** Cualquier versión reciente
- **Navegador moderno:** Chrome 37+, Firefox 34+, Safari 11+, Edge 79+

### Instalación Local

```bash
# 1. Clonar repositorio
git clone https://github.com/johansan99-js/mi-pisto-hn.git
cd mi-pisto-hn

# 2. Instalar dependencias
npm install

# 3. Iniciar servidor de desarrollo
npm run dev
# Accede a: http://localhost:5173

# 4. En otra terminal, executar tests
npm run test:crypto
# Output esperado: ✅ 6/6 tests pasaron
```

### Estructura del Proyecto

```
mi-pisto-hn/
├── .github/
│   └── workflows/              # GitHub Actions (CI/CD)
├── css/
│   └── style.css              # Estilos principales
├── js/
│   ├── app.js                 # Lógica principal
│   ├── ios-detection.js       # Aviso para iOS
│   └── sync-ui.js             # UI de sincronización
├── lib/
│   ├── crypto.js              # ⭐ Encriptación AES-256-GCM
│   ├── sync-manager.js        # Gestor de sincronización
│   └── supabase-client.js     # Cliente de Supabase
├── tests/
│   ├── crypto.test.js         # Tests de encriptación
│   └── sync-manager.test.js   # Tests de sincronización
├── docs/
│   ├── INSTALLATION_GUIDE.md  # Esta guía
│   ├── QUICK_START.md         # Inicio rápido
│   └── ACTION_PLAN.md         # Plan de acción
├── index.html                  # Aplicación principal
├── offline.html                # Fallback offline
├── manifest.json               # PWA manifest
├── tasas.json                  # Tasas de cambio
├── sw.js                        # Service Worker
├── update-rates.js             # Script actualizar tasas
├── package.json                # Dependencias
├── README.md                   # Documentación principal
└── .gitignore                  # Archivos ignorados en Git
```

### Scripts Disponibles

```bash
# Desarrollo
npm run dev              # Inicia servidor local con hot-reload

# Producción
npm run build            # Compila para producción
npm run preview          # Previsualiza build

# Testing
npm run test             # Ejecuta todos los tests
npm run test:watch       # Tests en modo watch
npm run test:coverage    # Cobertura de tests
npm run test:crypto      # Tests específicos de crypto
npm run test:ui          # UI para visualizar tests

# Código
npm run lint             # Revisa estilo de código
npm run format           # Formatea código automáticamente

# Datos
npm run update-rates     # Actualiza tasas de cambio

# Opcional
npm run generate-icons   # Genera iconos (requiere sharp)
```

---

## 🔒 Configuración de Seguridad

### Archivos Sensibles

**NO COMMITEAR:**
- `.env.local` — Variables de entorno locales
- `.env.*.local` — Cualquier env local
- `node_modules/` — Dependencias (ignorado automáticamente)

**Verificar:**
```bash
# Verificar que .env.local está protegido
grep ".env.local" .gitignore
# Output: .env.local

# Verificar que no está commiteado
git status | grep ".env"
# Output: (vacío, sin .env.local)
```

### Variables de Entorno (Para Sprint 2)

Crear archivo `.env.local` LOCAL (nunca commitear):

```bash
# .env.local (LOCAL ONLY)
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...
VITE_API_URL=https://api.ejemplo.com
```

**⚠️ IMPORTANTE:**
- Nunca pushear `.env.local` a GitHub
- Incluir `.env.local.example` con valores vacíos
- Regenerar keys si accidentalmente se filtran

---

## 🧪 Testing

### Tests Unitarios

```bash
# Ejecutar todos los tests
npm run test

# Modo watch (re-ejecuta al cambiar archivos)
npm run test:watch

# Con UI interactiva
npm run test:ui

# Cobertura de código
npm run test:coverage
```

### Tests Crypto Específicos

```bash
# Ejecutar solo tests de crypto
npm run test:crypto

# Output esperado:
# ✅ Test 1: Validación de inputs
# ✅ Test 2: Round-trip encripción/descifración
# ✅ Test 3: PIN incorrecto rechazado
# ✅ Test 4: Detección de modificación
# ✅ Test 5: IVs aleatorios
# ✅ Test 6: Performance
# 
# ✅ Pasados: 6
# ❌ Fallidos: 0
```

### Testing Manual en Navegador

```javascript
// En console (F12) después de cargar:

// 1. Ejecutar tests crypto
window.appDebug.runTests()

// 2. Ver estado de la app
console.log(window.appDebug.state)

// 3. Ver configuración
console.log(window.appDebug.config)

// 4. Probar crypto manualmente
import('lib/crypto.js').then(m => {
  m.encryptPayload({ test: 'data' }, 'pin1234')
    .then(encrypted => console.log('Encrypted:', encrypted))
})

// 5. Simular offline (DevTools > Network > Offline)
// Debe mostrar: indicador offline + redirigir a offline.html
```

---

## 🐛 Troubleshooting

### Error: "Service Worker not found"

```
Solución:
1. Verificar que sw.js existe en la raíz
2. Verificar que la ruta en index.html es correcta: './sw.js'
3. Recargar página (Ctrl+Shift+R en navegador)
```

### Error: "crypto is undefined"

```
Solución:
1. Esperar a que el módulo cargue
2. Verificar que lib/crypto.js existe
3. Revisar console por errores de import
4. Verificar navegador soporta Web Crypto API
```

### Error: "IndexedDB error"

```
Solución:
1. Verificar que IndexedDB no está bloqueado en navegador
2. Limpiar datos de sitio (DevTools > Storage > Clear)
3. Recargar página
```

### PIN no funciona

```
Solución:
1. Verificar PIN tiene 4-6 dígitos
2. PIN es sensible (no debe tener espacios)
3. Verificar que IndexedDB tiene datos
4. Intentar crear nuevo PIN (borrar BD)
```

---

## 📤 Despliegue a GitHub Pages

### Primer Deploy

```bash
# 1. Crear repositorio en GitHub
# (si no existe)

# 2. Agregar origen
git remote add origin https://github.com/tu-usuario/mi-pisto-hn.git
git branch -M main

# 3. Compilar para producción
npm run build

# 4. Hacer push
git add .
git commit -m "Initial commit: Mi Pisto HN v1.0.0"
git push -u origin main
```

### Actualizar Deploy Existente

```bash
# 1. Hacer cambios y tests locales
npm run test

# 2. Compilar
npm run build

# 3. Commit y push
git add .
git commit -m "feat: descripción del cambio"
git push origin main

# 4. Verificar en: https://github.com/tu-usuario/mi-pisto-hn
# GitHub Pages se actualiza automáticamente en 1-2 minutos
```

### Verificar Deploy

```bash
# URL debe ser accesible (reemplazar tu-usuario):
https://tu-usuario.github.io/mi-pisto-hn/

# Verificar que:
1. ✅ PWA manifest válido
2. ✅ Service Worker registrado
3. ✅ Sin errores 404 en Network tab
4. ✅ Puedes crear PIN
5. ✅ Dashboard carga
6. ✅ Offline funciona
```

---

## 🔄 Workflow de Desarrollo

### Flujo Recomendado

```bash
# 1. Crear rama para feature
git checkout -b feature/mi-feature

# 2. Hacer cambios
# (editar archivos)

# 3. Tests antes de commit
npm run test
npm run lint

# 4. Commit
git add .
git commit -m "feat: descripción clara"

# 5. Push a rama
git push origin feature/mi-feature

# 6. Crear Pull Request en GitHub
# (GitHub mostrará opción "Compare & pull request")

# 7. Revisar cambios
# (esperar revisión si tienes equipo)

# 8. Mergear a main
# (click "Merge pull request" en GitHub)

# 9. Eliminar rama
git branch -d feature/mi-feature
git push origin --delete feature/mi-feature
```

---

## 📚 Recursos Adicionales

### Documentación
- [README.md](../README.md) — Overview del proyecto
- [QUICK_START.md](./QUICK_START.md) — Inicio rápido (5 min)
- [ACTION_PLAN.md](./ACTION_PLAN.md) — Plan detallado

### Librerías Usadas
- [Supabase.js](https://supabase.com/docs/reference/javascript) — Backend (opcional)
- [Vitest](https://vitest.dev/) — Testing
- [Vite](https://vitejs.dev/) — Build tool

### Web APIs
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API) — Encriptación
- [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) — BD Local
- [Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API) — Offline

---

## 💬 Soporte

- **Bugs:** [GitHub Issues](https://github.com/johansan99-js/mi-pisto-hn/issues)
- **Preguntas:** [GitHub Discussions](https://github.com/johansan99-js/mi-pisto-hn/discussions)
- **Email:** contacto@ejemplo.com

---

**¡Listo! Si tienes dudas, consulta los troubleshooting o abre un issue en GitHub. 🚀**
