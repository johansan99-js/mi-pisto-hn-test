# 💰 Mi Pisto HN — Tu dinero, tu control

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PWA](https://img.shields.io/badge/PWA-Ready-green)](https://web.dev/progressive-web-apps/)
[![Offline First](https://img.shields.io/badge/Offline-First-blue)](https://offlinefirst.org/)
[![Encryption](https://img.shields.io/badge/Security-AES--256--GCM-red)](#%EF%B8%8F-seguridad)

**Gestión financiera personal 100% privada, 100% offline para Honduras.**

[🌐 Abre la app](https://johansan99-js.github.io/mi-pisto-hn/) | [📖 Documentación](./docs/) | [🐛 Reportar bugs](https://github.com/johansan99-js/mi-pisto-hn/issues)

---

## ✨ Características

### 📱 Accesible Desde Cualquier Dispositivo
- **Smartphone**: Instala como app nativa (iOS/Android)
- **Laptop**: Usa en el navegador
- **Sincronización**: Multi-dispositivo con cifrado E2E (opcional)

### 🔒 100% Privada
- Datos almacenados **SOLO en tu dispositivo** (IndexedDB)
- Cifrado **AES-256-GCM** en reposo
- **Sin servidores** escaneando tus finanzas
- Si usas cloud: datos cifrados (ni siquiera nosotros los vemos)

### ⚡ 100% Offline
- Funciona sin internet
- Cargas ultra-rápidas
- Service Worker para caché inteligente

### 💡 Características Financieras
- **Transacciones**: Gastos e ingresos categorizados
- **Cuentas**: Efectivo, ahorro, tarjetas de crédito
- **Presupuestos**: Reglas de distribución (65/20/15)
- **Metas**: Seguimiento de ahorros
- **Deudas**: Préstamos bancarios y personales
- **Reportes**: Análisis de gastos por período
- **Conversión**: Soporte multi-moneda (USD, EUR, GTQ, NIO, MXN, CRC, PAB)

---

## 🚀 Inicio Rápido

### Instalación (Usuarios)

#### iPhone/iPad (Safari)
1. Abre https://johansan99-js.github.io/mi-pisto-hn/
2. Toca el icono "Compartir" (flecha hacia arriba)
3. Busca "Agregar a inicio"
4. Toca "Agregar"

#### Android (Chrome)
1. Abre https://johansan99-js.github.io/mi-pisto-hn/
2. Toca el menú (⋮)
3. Toca "Instalar app"
4. Confirma

#### Desktop
- Abre en Chrome/Firefox/Safari
- Usa directamente en el navegador
- Opcional: instala como PWA (Chrome/Edge: menú > "Instalar")

### Uso Básico

1. **Crea tu PIN**: Primera vez que ingresas (4-6 dígitos)
2. **Registra gastos**: Click + → "Nuevo gasto"
3. **Visualiza balance**: Dashboard principal
4. **Exporta datos**: Settings → Exportar (Excel/CSV/Backup)

---

## 🛠️ Desarrollo

### Requisitos
- Node.js 18+
- npm o yarn
- Git

### Setup Local

```bash
# Clonar
git clone https://github.com/johansan99-js/mi-pisto-hn.git
cd mi-pisto-hn

# Instalar dependencias
npm install

# Desarrollo (hot-reload)
npm run dev
# Abre http://localhost:5173

# Tests
npm run test
npm run test:watch

# Build producción
npm build
```

### Estructura de Carpetas

```
mi-pisto-hn/
├── js/              # Scripts principales
├── lib/             # Módulos (crypto, sync, BD local)
├── css/             # Estilos
├── tests/           # Tests unitarios
├── docs/            # Documentación
├── index.html       # Entrada principal
├── sw.js            # Service Worker
└── manifest.json    # PWA manifest
```

---

## 🔐 Seguridad

### Criptografía Local
- **Algoritmo**: AES-256-GCM
- **Derivación de clave**: PBKDF2 (100,000 iteraciones)
- **Autenticación**: Incluida en GCM (128-bit tag)
- **Generador**: Web Crypto API (crypto.getRandomValues)

### Sincronización (Opcional)
Si activas sync en la nube:
- Datos cifrados **ANTES** de salir de tu dispositivo
- Servidor solo ve blobs ilegibles
- Descifrado solo con tu PIN local
- Row-Level Security en base de datos

### Privacidad
- ✅ No recopilamos datos personales
- ✅ No hay publicidad
- ✅ No hay analytics
- ✅ No hay tracking
- ✅ Código abierto (auditáble)

---

## 📋 Requisitos del Sistema

### Navegadores Soportados
| Navegador | Versión | Estado |
|-----------|---------|--------|
| Chrome | 37+ | ✅ Fully supported |
| Firefox | 34+ | ✅ Fully supported |
| Safari | 11+ | ✅ Supported (sin Background Sync) |
| Edge | 79+ | ✅ Fully supported |
| Opera | 24+ | ✅ Supported |

### iOS Nota Especial
- ⚠️ Background Sync solo funciona con app abierta
- Usa "Subir datos" antes de cerrar la app

---

## 📊 Roadmap

### Sprint 1 (Activo)
- [x] Hotfixes críticos (JSON, SW, BCH)
- [x] Aviso iOS para Background Sync
- [ ] Testing en navegadores (en progreso)

### Sprint 2 (Planeado)
- [ ] Sincronización Supabase con E2E
- [ ] OCR mejorado para recibos
- [ ] Reportes avanzados (gráficos)

### Sprint 3 (Futuro)
- [ ] Categorías personalizadas
- [ ] Machine learning para clasificación
- [ ] Exportación a Wise/Wise
- [ ] API REST (uso avanzado)

---

## 🐛 Reportar Bugs

1. Ve a [Issues](https://github.com/johansan99-js/mi-pisto-hn/issues)
2. Click "New Issue"
3. Describe el problema:
   - Pasos para reproducir
   - Navegador y versión
   - Resultado esperado vs actual
4. Agrupa archivos de error si es posible

---

## 🤝 Contribuir

¡Las contribuciones son bienvenidas!

1. Fork el repo
2. Crea rama: `git checkout -b feature/tu-feature`
3. Commit cambios: `git commit -m "feat: descripción"`
4. Push: `git push origin feature/tu-feature`
5. Abre Pull Request

### Código
- Usa ES6+ modules
- Sigue el estilo existente
- Agrega tests para nuevas funciones
- Documenta funciones públicas

---

## 📄 Licencia

MIT License — Ver [LICENSE](LICENSE)

Esto significa:
- ✅ Uso personal y comercial
- ✅ Modificación permitida
- ✅ Distribución permitida
- ⚠️ Sin garantía de ningún tipo
- ⚠️ Menciona la licencia

---

## 🙋 Soporte

### Documentación
- **Instalación**: Ver [INSTALLATION_GUIDE.md](./docs/INSTALLATION_GUIDE.md)
- **Bugs conocidos**: [KNOWN_ISSUES.md](./docs/KNOWN_ISSUES.md)
- **FAQ**: [docs/FAQ.md](./docs/FAQ.md)

### Contacto
- 🐛 Bugs: [GitHub Issues](https://github.com/johansan99-js/mi-pisto-hn/issues)
- 💬 Discussiones: [GitHub Discussions](https://github.com/johansan99-js/mi-pisto-hn/discussions)
- 📧 Email: tu-email@ejemplo.com

---

## ⭐ Créditos

### Librerías
- [Chart.js](https://www.chartjs.org/) — Gráficos
- [Tesseract.js](https://tesseract.projectnaptha.com/) — OCR
- [SheetJS](https://sheetjs.com/) — Exporta Excel
- [Supabase](https://supabase.com/) — Backend (opcional)

### Iconos
- [Tabler Icons](https://tabler-icons.io/)
- [Material Design Icons](https://fonts.google.com/icons)

### Inspiración
- YNAB (You Need A Budget)
- GnuCash
- Wave Accounting

---

## 💝 Donaciones

Si Mi Pisto HN te ha sido útil:

- ⭐ Dale una estrella en GitHub
- 🔗 Comparte con amigos
- 📸 Etiquétanos en redes

No aceptamos donaciones en dinero — tu ayuda en código y feedback es lo más valioso.

---

**Hecho con ❤️ para Honduras**

Última actualización: 13 de mayo de 2026
