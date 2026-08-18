# 🎓 Sistema de Gestión y Validador de Certificaciones UPTPC

> **Universidad Politécnica Territorial de Puerto Cabello (UPTPC)**  
> **Unidad de Ciencia y Tecnología (CYT)**  
> 🌐 Website Oficial: [https://www.uptpc.edu.ve](https://www.uptpc.edu.ve)

Plataforma web integral para la creación, diseño interactivo en Canvas, emisión masiva y verificación en línea de certificados académicos y talleres institucionales.

---

## 🌟 Características Principales

### 🎨 Diseñador Interactivo de Certificados (Canvas Editor)
- **Editor Visual Drag & Drop**: Posicionamiento y escalado libre de elementos de texto, imágenes, firmas y sellos institucionales.
- **Variables Dinámicas Automáticas**: Soporte para tokens como `[nombre_completo]`, `[cedula]`, `[codigo]`, `[nombre_curso]`, `[horas]`, `[fecha_curso]`, `[tomo]`, `[folio]`, `[matricula]`, `[firma1_url]`, `[sello1_url]`, etc.
- **Tipografía Abierta (GNU / Google Fonts)**: Selección de 8 fuentes de uso libre (`Montserrat`, `Roboto`, `Playfair Display`, `Cinzel`, `Merriweather`, `Lora`, `Great Vibes`, `Alex Brush`) con variabilidad de estilo (Normal, Negrita, Cursiva, Negrita Cursiva).
- **Omitición Condicional Inteligente**: Si un certificado no posee datos de Tomo, Folio o Matrícula, estos elementos se ocultan automáticamente sin dejar espacios en blanco ni textos por defecto.

### ⚡ Emisión Masiva y Carga Rápida por CSV / Lista
- **Generación de Códigos Únicos**: Formato seguro de 9 caracteres `AAA123AAA` (3 letras, 3 números, 3 letras).
- **Verificación de Duplicados en Tiempo Real**: Evita la doble emisión al mismo participante en un mismo taller con insignias de advertencia.
- **Carga Rápida de Participantes (CSV / Pegar Lista)**: Herramienta de procesamiento de lotes (100, 200, 300+ estudiantes) mediante texto pegado (`V-12345678, JOSE PEREZ`) o archivos `.csv` / `.txt`.
  - **Auto-registro**: Registra automáticamente a usuarios nuevos en la base de datos.
  - **Auto-selección**: Preselecciona de inmediato a todos los participantes elegibles en un solo clic.
- **Registro Opcional de Tomo y Folio**: Switch conmutable para activar o desactivar la foliación según los requerimientos del curso.

### 🔍 Validador Público de Certificados (`consulta.html`)
- Portal de verificación accesible para estudiantes, instituciones y empleadores.
- Búsqueda por **Código de Certificado** o por **Cédula de Identidad**.
- Presentación de credencial digital con vista previa del diseño SVG, datos del titular y autoridades firmantes.

### 📚 Gestión de Cursos, Talleres y Diplomados
- Control de catálogo de actividades formativas (Cursos, Talleres, Diplomados, Seminarios).
- Asignación de hasta 3 autoridades firmantes por curso vinculadas a la tabla centralizada de firmas y sellos.
- Contador dinámico de certificados emitidos por taller con acceso directo a la lista de participantes certificados.

---

## 🛠️ Arquitectura Tecnológica

- **Frontend**: HTML5 Semántico, Vanilla CSS3 (Sistema de diseño moderno con Glassmorphic UI), JavaScript ES6+ (Arquitectura modular).
- **Backend / API**: Google Apps Script (`google_sheet.gs` Versión **V008**).
- **Base de Datos**: Google Sheets API.
- **Almacenamiento de Archivos**: Google Drive API (Carpeta `GESTION_CERTIFICADOS`).

---

## 🚀 Estructura del Proyecto

```text
.
├── index.html           # Página de inicio / Redirección principal
├── gestion.html         # Panel de Administración y Diseñador Canvas
├── consulta.html        # Portal Público de Validación de Certificados
├── google_sheet.gs      # Script Backend de Google Apps Script (Versión V008)
├── appsscript.json      # Configuración de manifiesto y permisos de Apps Script
├── css/
│   ├── main.css         # Estilos globales y sistema de tokens CSS
│   ├── disenador.css    # Estilos del Diseñador Canvas Interactivo
│   └── consulta.css     # Estilos del portal público de consulta
├── js/
│   ├── app.js           # Orquestador principal de la aplicación
│   ├── api.js           # Cliente API HTTP y fallback local Mock DB
│   ├── cert-renderer.js # Motor de renderizado dinámico SVG de certificados
│   ├── utils.js         # Funciones auxiliares y utilidades de interfaz
│   └── modules/         # Módulos JS independientes
│       ├── dashboard.js
│       ├── usuarios.js
│       ├── unidades.js
│       ├── firmas.js
│       ├── cursos.js
│       ├── certificados.js
│       ├── disenador.js
│       └── consultas.js
└── README.md            # Documentación del proyecto
```

---

## 📋 Configuración e Instalación

1. **Google Sheets & Apps Script**:
   - Cree un nuevo documento en Google Sheets.
   - Abra el editor de código (**Extensiones > Apps Script**).
   - Copie el contenido de [`google_sheet.gs`](file:///home/herrera/Documents/antigravity/blissful-curie/google_sheet.gs) (Versión V008) en el archivo principal.
   - Asegúrese de ajustar el archivo [`appsscript.json`](file:///home/herrera/Documents/antigravity/blissful-curie/appsscript.json) con los permisos de OAuth necesarios.
   - Despliegue como **Aplicación Web** (`Ejecutar como: Yo`, `Acceso: Cualquier persona`).

2. **Frontend**:
   - Abra `gestion.html` en cualquier navegador web moderno o servidor local.
   - Ingrese el URL de la Aplicación Web desplegada en la configuración del panel de administración.

---

## ✍️ Firma y Autoría

Desarrollado y mantenido por:

**Jose Herrera**  
Unidad de Ciencia y Tecnología  
**Universidad Politécnica Territorial de Puerto Cabello (UPTPC)**  
🌐 [https://www.uptpc.edu.ve](https://www.uptpc.edu.ve)  

---
*© 2026 UPTPC - Todos los derechos reservados.*
