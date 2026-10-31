# Reglas del Proyecto y Contexto de Desarrollo (UPTPC Certificaciones)

## Arquitectura Tecnológica Actual
- **Plataforma de Despliegue**: Vercel Serverless Functions (`/api/index.js`, `vercel.json`).
- **Base de Datos**: Turso (libSQL / SQLite distribuido) configurado en `/server/db.js` y `/server/services.js`.
- **Almacenamiento de Archivos**: Cloudflare R2 / S3 API (`/server/storage.js`).
- **Frontend**: HTML5, Vanilla JavaScript (ES6+ modular en `/js/`), CSS3 y Bootstrap (`consulta.html`, `cursos.html`, `gestion.html`, `index.html`).
- **Directorio de salida para Vercel**: `public/` (sincronizado automáticamente mediante `npm run build` o `node scripts/prepare-build.js`).

## REGLA CRÍTICA: EXCLUSIÓN DE ARCHIVOS GOOGLE APPS SCRIPT (*.gs) - AHORRO DE TOKENS
- **PROHIBICIÓN ESTRICTA**: NO leer, analizar, indexar, buscar ni cargar en el contexto ningún archivo con extensión `.gs` (como `google_sheet.gs` o cualquier archivo en `legacy/`).
- **Motivo**: El backend original basado en Google Apps Script fue completamente reemplazado y migrado a Node.js + Vercel + Turso DB. Los archivos `.gs` son obsoletos y gastan tokens innecesariamente.
- Todo desarrollo, mantenimiento o corrección de endpoints y lógica de datos se debe realizar exclusivamente en:
  - `api/index.js`
  - `server/db.js`
  - `server/services.js`
  - `server/storage.js`
