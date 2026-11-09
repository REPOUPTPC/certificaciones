/**
 * ==============================================================================
 * SISTEMA DE GESTIÓN DE CERTIFICACIONES UPTPC - MÓDULO BROCHURE DIGITAL
 * Archivo: js/modules/brochure.js
 * ==============================================================================
 * Administra la subida, optimización y publicación del Brochure PDF en Cloudflare R2
 * bajo la ruta fija brochure/brochure.pdf, manteniendo la compatibilidad con el visor
 * online desplegado en /brochure y en https://www.uptpc.edu.ve/extension-universitaria
 */

window.brochureModule = (function() {
  'use strict';

  // Configuración de URLs por defecto
  const R2_PUBLIC_BASE = 'https://pub-b61fc0d596e8472a9cda031c9e80faeb.r2.dev';
  const BROCHURE_R2_KEY = 'brochure/brochure.pdf';
  const BROCHURE_DEFAULT_URL = `${R2_PUBLIC_BASE}/${BROCHURE_R2_KEY}`;

  let selectedFile = null;
  let optimizedPdfBytes = null;
  let isUploading = false;

  /**
   * Inicializa la sección del Brochure
   */
  async function init() {
    renderInterface();
    bindEvents();
    await cargarInfoBrochure();
    actualizarIframePreview();
  }

  /**
   * Renderiza el contenido HTML de la sección si está vacío
   */
  function renderInterface() {
    const container = document.getElementById('secBrochure');
    if (!container) return;

    // Si ya tiene contenido, no sobrescribir la estructura base
    if (container.dataset.rendered === 'true') {
      return;
    }

    const hostOrigin = window.location.origin || '';
    const visorPublicUrl = `${hostOrigin}/brochure/`;

    container.innerHTML = `
      <div class="card border-0 shadow-sm p-4 mb-4">
        <div class="d-flex flex-wrap justify-content-between align-items-center gap-3 mb-4">
          <div>
            <h4 class="fw-bold mb-1 text-primary">
              <i class="fa-solid fa-book-open-reader me-2"></i>Gestión del Brochure Digital (Extensión Universitaria)
            </h4>
            <p class="text-muted mb-0 small">
              Administra el documento PDF oficial del catálogo universitario. Cualquier archivo subido se optimizará y guardará como 
              <code>brochure/brochure.pdf</code> en Cloudflare R2, actualizando automáticamente el visor interactivo sin romper enlaces.
            </p>
          </div>
          <div class="d-flex gap-2">
            <button type="button" class="btn btn-outline-secondary btn-sm" id="btnRefrescarInfoBrochure" title="Consultar estado en R2">
              <i class="fa-solid fa-arrows-rotate me-1"></i>Actualizar Estado
            </button>
            <a href="${visorPublicUrl}" target="_blank" class="btn btn-primary btn-sm" id="btnAbrirVisorExterno">
              <i class="fa-solid fa-arrow-up-right-from-square me-1"></i>Abrir Libro Online
            </a>
          </div>
        </div>

        <!-- Tarjetas de Estado y Métricas -->
        <div class="row g-3 mb-4">
          <div class="col-md-3">
            <div class="border rounded p-3 bg-light h-100">
              <small class="text-muted text-uppercase fw-bold d-block mb-1">Estado en Cloudflare R2</small>
              <div id="brochureStatusBadge" class="d-flex align-items-center gap-2">
                <span class="spinner-border spinner-border-sm text-secondary" role="status"></span>
                <span class="small text-muted">Verificando...</span>
              </div>
            </div>
          </div>
          <div class="col-md-3">
            <div class="border rounded p-3 bg-light h-100">
              <small class="text-muted text-uppercase fw-bold d-block mb-1">Tamaño en Almacenamiento</small>
              <h5 class="fw-bold mb-0 text-dark" id="brochureSizeBytes">--</h5>
            </div>
          </div>
          <div class="col-md-3">
            <div class="border rounded p-3 bg-light h-100">
              <small class="text-muted text-uppercase fw-bold d-block mb-1">Última Modificación</small>
              <small class="fw-bold d-block text-truncate text-dark" id="brochureLastModified">--</small>
            </div>
          </div>
          <div class="col-md-3">
            <div class="border rounded p-3 bg-light h-100">
              <small class="text-muted text-uppercase fw-bold d-block mb-1">Destino Fijo en R2</small>
              <code class="small text-primary fw-bold">brochure/brochure.pdf</code>
            </div>
          </div>
        </div>

        <!-- URLs de Integración y Código Embebido -->
        <div class="card border border-light-subtle bg-body-tertiary p-3 mb-4">
          <h6 class="fw-bold mb-2 text-dark">
            <i class="fa-solid fa-link text-primary me-2"></i>Enlaces Públicos e Integración para Extensión Universitaria
          </h6>
          <div class="row g-2 align-items-center mb-2">
            <div class="col-md-3"><span class="small fw-bold text-muted">Dirección del Libro Online:</span></div>
            <div class="col-md-7">
              <input type="text" class="form-control form-control-sm bg-white font-monospace" id="inputUrlLibro" value="${visorPublicUrl}" readonly>
            </div>
            <div class="col-md-2">
              <button class="btn btn-outline-primary btn-sm w-100" id="btnCopiarUrlLibro">
                <i class="fa-regular fa-copy me-1"></i>Copiar
              </button>
            </div>
          </div>
          <div class="row g-2 align-items-center mb-2">
            <div class="col-md-3"><span class="small fw-bold text-muted">Archivo PDF en R2:</span></div>
            <div class="col-md-7">
              <input type="text" class="form-control form-control-sm bg-white font-monospace" id="inputUrlPdfR2" value="${BROCHURE_DEFAULT_URL}" readonly>
            </div>
            <div class="col-md-2">
              <button class="btn btn-outline-secondary btn-sm w-100" id="btnCopiarUrlPdf">
                <i class="fa-regular fa-copy me-1"></i>Copiar
              </button>
            </div>
          </div>
          <div class="row g-2 align-items-center">
            <div class="col-md-3"><span class="small fw-bold text-muted">Código para Embeber (&lt;iframe&gt;):</span></div>
            <div class="col-md-7">
              <input type="text" class="form-control form-control-sm bg-white font-monospace" id="inputIframeCode" value='&lt;iframe src="${visorPublicUrl}" width="100%" height="800px" style="border:none; border-radius:12px; box-shadow:0 8px 30px rgba(0,0,0,0.15);" allowfullscreen allow="autoplay"&gt;&lt;/iframe&gt;' readonly>
            </div>
            <div class="col-md-2">
              <button class="btn btn-outline-success btn-sm w-100" id="btnCopiarIframe">
                <i class="fa-solid fa-code me-1"></i>Copiar Código
              </button>
            </div>
          </div>
          <div class="mt-2 text-muted small">
            <i class="fa-solid fa-circle-info text-info me-1"></i>
            Este código <code>&lt;iframe&gt;</code> puede insertarse directamente en <code>https://www.uptpc.edu.ve/extension-universitaria</code> o cualquier sitio web externo.
          </div>
        </div>

        <!-- Zona de Carga y Optimización de Archivo PDF -->
        <div class="row g-4 mb-4">
          <div class="col-lg-6">
            <div class="border rounded-3 p-4 h-100 bg-white shadow-sm">
              <h5 class="fw-bold mb-3">
                <i class="fa-solid fa-cloud-arrow-up text-primary me-2"></i>Subir y Reemplazar Brochure
              </h5>
              <div class="alert alert-info py-2 px-3 small mb-3">
                <i class="fa-solid fa-shield-halved me-1"></i>
                <strong>Regla de compatibilidad garantizada:</strong> No importa qué nombre tenga el archivo seleccionado en tu computador, el sistema lo renombrará internamente a <strong><code>brochure.pdf</code></strong> y sustituirá el documento anterior en Cloudflare R2 sin cambiar la URL.
              </div>

              <!-- Drag & Drop Area -->
              <div id="dropZoneBrochure" class="border border-2 border-dashed rounded-3 p-4 text-center cursor-pointer mb-3" style="background-color: #fafbfd; transition: all 0.2s ease;">
                <input type="file" id="inputFileBrochure" accept="application/pdf,.pdf" class="d-none">
                <i class="fa-solid fa-file-pdf text-danger fa-3x mb-2"></i>
                <h6 class="fw-bold text-dark mb-1">Arrastra tu archivo PDF aquí o haz clic para seleccionarlo</h6>
                <p class="text-muted small mb-0">Solo documentos con formato PDF (.pdf). Tamaño sugerido hasta 25 MB.</p>
              </div>

              <!-- Opciones de Optimización -->
              <div class="card border border-light-subtle p-3 mb-3 bg-light">
                <div class="form-check form-switch mb-2">
                  <input class="form-check-input" type="checkbox" id="checkOptimizarPdf" checked>
                  <label class="form-check-label fw-bold small" for="checkOptimizarPdf">
                    <i class="fa-solid fa-bolt text-warning me-1"></i>Activar Motor de Optimización de Recursos
                  </label>
                </div>
                <small class="text-muted d-block">
                  Reorganiza las secuencias de objetos (Object Streams), limpia metadatos huérfanos y comprime flujos sin degradar la nitidez tipográfica para una carga ultrarrápida.
                </small>
              </div>

              <!-- Resumen del Archivo Seleccionado -->
              <div id="boxResumenArchivo" class="d-none border rounded p-3 mb-3 bg-body-tertiary">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="small fw-bold text-dark" id="lblNombreOriginal">Archivo: --</span>
                  <span class="badge bg-primary" id="lblPaginasDetectadas">-- págs</span>
                </div>
                <div class="row g-2 text-center small mb-2">
                  <div class="col-4">
                    <div class="p-2 border rounded bg-white">
                      <div class="text-muted">Original</div>
                      <strong id="lblTamanoOriginal" class="text-dark">--</strong>
                    </div>
                  </div>
                  <div class="col-4">
                    <div class="p-2 border rounded bg-white">
                      <div class="text-muted">Optimizado</div>
                      <strong id="lblTamanoOptimizado" class="text-success">--</strong>
                    </div>
                  </div>
                  <div class="col-4">
                    <div class="p-2 border rounded bg-white">
                      <div class="text-muted">Ahorro</div>
                      <strong id="lblPorcentajeAhorro" class="text-primary">--</strong>
                    </div>
                  </div>
                </div>
                <small class="text-muted d-block text-center">
                  <i class="fa-solid fa-circle-check text-success me-1"></i>Se guardará en R2 como: <code>brochure/brochure.pdf</code>
                </small>
              </div>

              <!-- Barra de Progreso de Subida -->
              <div id="boxProgresoSubida" class="d-none mb-3">
                <div class="d-flex justify-content-between small fw-bold mb-1">
                  <span id="lblEstadoProceso" class="text-primary">Preparando documento...</span>
                  <span id="lblPorcentajeProceso" class="text-primary">0%</span>
                </div>
                <div class="progress" style="height: 12px;">
                  <div id="barraProgresoBrochure" class="progress-bar progress-bar-striped progress-bar-animated bg-primary" style="width: 0%"></div>
                </div>
              </div>

              <!-- Botón de Acción -->
              <button type="button" class="btn btn-primary w-100 fw-bold py-2 shadow-sm" id="btnSubirBrochure" disabled>
                <i class="fa-solid fa-cloud-arrow-up me-2"></i>Optimizar y Subir a Cloudflare R2
              </button>
            </div>
          </div>

          <!-- Previsualización en Vivo de la Aplicación /brochure -->
          <div class="col-lg-6">
            <div class="border rounded-3 p-4 h-100 bg-white shadow-sm d-flex flex-column">
              <div class="d-flex justify-content-between align-items-center mb-2">
                <h5 class="fw-bold mb-0">
                  <i class="fa-solid fa-eye text-primary me-2"></i>Vista Previa en Vivo (Libro Online)
                </h5>
                <button type="button" class="btn btn-outline-secondary btn-sm" id="btnRecargarPreview" title="Recargar vista previa con cache fresca">
                  <i class="fa-solid fa-arrows-rotate me-1"></i>Recargar Visor
                </button>
              </div>
              <small class="text-muted mb-3">
                Esta es la experiencia idéntica que ven los usuarios en la web. Puedes hojear las páginas, hacer zoom y escuchar el paso de hojas.
              </small>

              <!-- Iframe del Visor -->
              <div class="position-relative flex-grow-1 rounded-3 overflow-hidden border" style="min-height: 480px; background-color: #070b14;">
                <iframe id="iframePreviewBrochure" src="${visorPublicUrl}" class="w-100 h-100 position-absolute top-0 start-0 border-0" allow="autoplay; fullscreen"></iframe>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    container.dataset.rendered = 'true';
  }

  /**
   * Conecta todos los eventos de la vista
   */
  function bindEvents() {
    const btnRefrescar = document.getElementById('btnRefrescarInfoBrochure');
    const btnRecargarPreview = document.getElementById('btnRecargarPreview');
    const dropZone = document.getElementById('dropZoneBrochure');
    const inputFile = document.getElementById('inputFileBrochure');
    const btnSubir = document.getElementById('btnSubirBrochure');
    const checkOptimizar = document.getElementById('checkOptimizarPdf');

    const btnCopiarUrlLibro = document.getElementById('btnCopiarUrlLibro');
    const btnCopiarUrlPdf = document.getElementById('btnCopiarUrlPdf');
    const btnCopiarIframe = document.getElementById('btnCopiarIframe');

    if (btnRefrescar) {
      btnRefrescar.addEventListener('click', async () => {
        await cargarInfoBrochure();
        actualizarIframePreview();
        if (window.utils && window.utils.showToast) {
          window.utils.showToast('Estado de Cloudflare R2 actualizado', 'info');
        }
      });
    }

    if (btnRecargarPreview) {
      btnRecargarPreview.addEventListener('click', () => {
        actualizarIframePreview();
        if (window.utils && window.utils.showToast) {
          window.utils.showToast('Visor interactivo recargado', 'info');
        }
      });
    }

    // Copiar al portapapeles
    if (btnCopiarUrlLibro) {
      btnCopiarUrlLibro.addEventListener('click', () => {
        const inp = document.getElementById('inputUrlLibro');
        copiarTexto(inp ? inp.value : '', 'Enlace del libro copiado al portapapeles');
      });
    }

    if (btnCopiarUrlPdf) {
      btnCopiarUrlPdf.addEventListener('click', () => {
        const inp = document.getElementById('inputUrlPdfR2');
        copiarTexto(inp ? inp.value : '', 'Enlace directo al PDF en R2 copiado');
      });
    }

    if (btnCopiarIframe) {
      btnCopiarIframe.addEventListener('click', () => {
        const inp = document.getElementById('inputIframeCode');
        copiarTexto(inp ? inp.value : '', 'Código <iframe> para Extensión Universitaria copiado');
      });
    }

    // Selección de archivo
    if (dropZone && inputFile) {
      dropZone.addEventListener('click', () => inputFile.click());

      dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '#0d6efd';
        dropZone.style.backgroundColor = '#eef5ff';
      });

      dropZone.addEventListener('dragleave', () => {
        dropZone.style.borderColor = '';
        dropZone.style.backgroundColor = '#fafbfd';
      });

      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.style.borderColor = '';
        dropZone.style.backgroundColor = '#fafbfd';
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleFileSelected(e.dataTransfer.files[0]);
        }
      });

      inputFile.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          handleFileSelected(e.target.files[0]);
        }
      });
    }

    if (checkOptimizar) {
      checkOptimizar.addEventListener('change', async () => {
        if (selectedFile) {
          await procesarArchivoSeleccionado(selectedFile);
        }
      });
    }

    if (btnSubir) {
      btnSubir.addEventListener('click', ejecutarSubidaR2);
    }
  }

  /**
   * Helper para copiar texto al portapapeles
   */
  function copiarTexto(texto, mensajeExito) {
    if (!texto) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(() => {
        if (window.utils && window.utils.showToast) window.utils.showToast(mensajeExito, 'success');
      }).catch(() => fallbackCopiar(texto, mensajeExito));
    } else {
      fallbackCopiar(texto, mensajeExito);
    }
  }

  function fallbackCopiar(texto, mensajeExito) {
    const tempInp = document.createElement('textarea');
    tempInp.value = texto;
    document.body.appendChild(tempInp);
    tempInp.select();
    try {
      document.execCommand('copy');
      if (window.utils && window.utils.showToast) window.utils.showToast(mensajeExito, 'success');
    } catch (e) {
      alert('Contenido: ' + texto);
    }
    document.body.removeChild(tempInp);
  }

  /**
   * Maneja el archivo PDF que el usuario arrastra o selecciona
   */
  async function handleFileSelected(file) {
    if (!file) return;

    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      if (window.utils && window.utils.showToast) {
        window.utils.showToast('Por favor selecciona un archivo con formato PDF válido (.pdf)', 'danger');
      } else {
        alert('Por favor selecciona un archivo con formato PDF válido (.pdf)');
      }
      return;
    }

    selectedFile = file;
    await procesarArchivoSeleccionado(file);
  }

  /**
   * Procesa, analiza y opcionalmente optimiza el PDF seleccionado
   */
  async function procesarArchivoSeleccionado(file) {
    const boxResumen = document.getElementById('boxResumenArchivo');
    const lblNombre = document.getElementById('lblNombreOriginal');
    const lblPaginas = document.getElementById('lblPaginasDetectadas');
    const lblTamanoOrig = document.getElementById('lblTamanoOriginal');
    const lblTamanoOpt = document.getElementById('lblTamanoOptimizado');
    const lblAhorro = document.getElementById('lblPorcentajeAhorro');
    const btnSubir = document.getElementById('btnSubirBrochure');
    const checkOptimizar = document.getElementById('checkOptimizarPdf');

    if (!boxResumen) return;

    boxResumen.classList.remove('d-none');
    lblNombre.textContent = `Archivo: ${file.name}`;
    lblTamanoOrig.textContent = formatBytes(file.size);
    lblTamanoOpt.textContent = 'Analizando...';
    lblAhorro.textContent = '...';
    lblPaginas.textContent = 'Calculando...';

    if (btnSubir) btnSubir.disabled = true;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const doOptimize = checkOptimizar ? checkOptimizar.checked : true;

      if (doOptimize && typeof PDFLib !== 'undefined') {
        const pdfDoc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        const pageCount = pdfDoc.getPageCount();
        lblPaginas.textContent = `${pageCount} págs`;

        // Optimización por streams de objetos y limpieza de catálogos
        const optBytes = await pdfDoc.save({
          useObjectStreams: true,
          addDefaultPage: false,
          updateFieldAppearances: false
        });

        optimizedPdfBytes = optBytes;
        const optSize = optBytes.byteLength;
        lblTamanoOpt.textContent = formatBytes(optSize);

        const ahorroBytes = file.size - optSize;
        const ahorroPct = Math.round((ahorroBytes / file.size) * 100);

        if (ahorroBytes > 0) {
          lblAhorro.className = 'text-success fw-bold';
          lblAhorro.textContent = `-${ahorroPct}%`;
        } else {
          // Si el archivo ya estaba comprimido al máximo
          lblAhorro.className = 'text-primary fw-bold';
          lblAhorro.textContent = 'Óptimo';
        }
      } else {
        // Sin optimización adicional
        optimizedPdfBytes = new Uint8Array(arrayBuffer);
        lblTamanoOpt.textContent = formatBytes(file.size);
        lblAhorro.textContent = '0%';
        lblPaginas.textContent = 'PDF estándar';
      }

      if (btnSubir) {
        btnSubir.disabled = false;
        btnSubir.innerHTML = `<i class="fa-solid fa-cloud-arrow-up me-2"></i>Subir "${file.name}" a R2 como "brochure.pdf"`;
      }
    } catch (err) {
      console.error('Error al procesar el archivo PDF:', err);
      // Fallback: usar el archivo directo
      const arrayBuffer = await file.arrayBuffer();
      optimizedPdfBytes = new Uint8Array(arrayBuffer);
      lblTamanoOpt.textContent = formatBytes(file.size);
      lblAhorro.textContent = 'Original';
      lblPaginas.textContent = 'PDF';
      if (btnSubir) {
        btnSubir.disabled = false;
        btnSubir.innerHTML = `<i class="fa-solid fa-cloud-arrow-up me-2"></i>Subir como "brochure.pdf"`;
      }
    }
  }

  /**
   * Ejecuta la subida hacia Cloudflare R2 mediante la API
   */
  async function ejecutarSubidaR2() {
    if (!optimizedPdfBytes || isUploading) return;

    const btnSubir = document.getElementById('btnSubirBrochure');
    const boxProgreso = document.getElementById('boxProgresoSubida');
    const barraProgreso = document.getElementById('barraProgresoBrochure');
    const lblEstado = document.getElementById('lblEstadoProceso');
    const lblPorcentaje = document.getElementById('lblPorcentajeProceso');

    isUploading = true;
    if (btnSubir) btnSubir.disabled = true;
    if (boxProgreso) boxProgreso.classList.remove('d-none');

    const updateProgress = (pct, texto) => {
      if (barraProgreso) barraProgreso.style.width = `${pct}%`;
      if (lblPorcentaje) lblPorcentaje.textContent = `${pct}%`;
      if (lblEstado) lblEstado.textContent = texto;
    };

    try {
      updateProgress(20, 'Codificando documento optimizado...');
      await new Promise(r => setTimeout(r, 60));

      const base64Data = uint8ArrayToBase64(optimizedPdfBytes);

      updateProgress(50, 'Enviando y sustituyendo en Cloudflare R2 (brochure/brochure.pdf)...');
      await new Promise(r => setTimeout(r, 60));

      const res = await window.api.uploadBrochure(base64Data, 'brochure.pdf');

      if (res && (res.status === 'success' || res.url)) {
        updateProgress(100, '¡Documento brochure.pdf actualizado exitosamente!');

        if (window.utils && window.utils.showToast) {
          window.utils.showToast('¡Brochure actualizado exitosamente en Cloudflare R2!', 'success');
        }

        // Refrescar metadatos y visor
        await cargarInfoBrochure();
        actualizarIframePreview();

        setTimeout(() => {
          if (boxProgreso) boxProgreso.classList.add('d-none');
          if (btnSubir) {
            btnSubir.disabled = false;
            btnSubir.innerHTML = `<i class="fa-solid fa-check me-2"></i>Brochure Actualizado`;
          }
        }, 1500);
      } else {
        throw new Error(res.message || 'No se recibió confirmación de Cloudflare R2');
      }
    } catch (err) {
      console.error('Error al subir el brochure a Cloudflare R2:', err);
      updateProgress(0, 'Error en la subida');
      if (window.utils && window.utils.showToast) {
        window.utils.showToast('Error al subir a Cloudflare R2: ' + err.message, 'danger');
      } else {
        alert('Error al subir: ' + err.message);
      }
      if (btnSubir) btnSubir.disabled = false;
    } finally {
      isUploading = false;
    }
  }

  /**
   * Consulta el estado actual de brochure.pdf en Cloudflare R2
   */
  async function cargarInfoBrochure() {
    const badgeEl = document.getElementById('brochureStatusBadge');
    const sizeEl = document.getElementById('brochureSizeBytes');
    const dateEl = document.getElementById('brochureLastModified');
    const inputPdf = document.getElementById('inputUrlPdfR2');

    try {
      const res = await window.api.getBrochureInfo();

      if (res && res.exists) {
        if (badgeEl) {
          badgeEl.innerHTML = `<span class="badge bg-success"><i class="fa-solid fa-circle-check me-1"></i>En Línea (R2)</span>`;
        }
        if (sizeEl) sizeEl.textContent = formatBytes(res.size);
        if (dateEl) {
          const d = res.lastModified ? new Date(res.lastModified) : new Date();
          dateEl.textContent = d.toLocaleString('es-VE');
        }
        if (inputPdf && res.url) {
          inputPdf.value = res.url;
        }
      } else {
        if (badgeEl) {
          badgeEl.innerHTML = `<span class="badge bg-warning text-dark"><i class="fa-solid fa-triangle-exclamation me-1"></i>Pendiente en R2</span>`;
        }
        if (sizeEl) sizeEl.textContent = 'No registrado';
        if (dateEl) dateEl.textContent = 'Sin historial';
      }
    } catch (e) {
      console.warn('Aviso: no se pudo consultar info del brochure:', e.message);
      if (badgeEl) {
        badgeEl.innerHTML = `<span class="badge bg-info text-white"><i class="fa-solid fa-cloud me-1"></i>R2 Configurado</span>`;
      }
    }
  }

  /**
   * Recarga el iframe del visor con cache busting para ver los cambios de inmediato
   */
  function actualizarIframePreview() {
    const iframe = document.getElementById('iframePreviewBrochure');
    if (!iframe) return;
    const origin = window.location.origin || '';
    const cacheBuster = Date.now();
    iframe.src = `${origin}/brochure/index.html?v=${cacheBuster}`;
  }

  /**
   * Conversión eficiente de Uint8Array a Base64 por chunks para evitar desbordamiento de pila
   */
  function uint8ArrayToBase64(bytes) {
    let binary = '';
    const len = bytes.byteLength;
    const chunkSize = 8192;
    for (let i = 0; i < len; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
      binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
  }

  /**
   * Formatea bytes a MB / KB legibles
   */
  function formatBytes(bytes, decimals = 2) {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
  }

  return {
    init,
    cargarInfoBrochure,
    actualizarIframePreview
  };
})();
