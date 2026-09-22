/**
 * ==============================================================================
 * SISTEMA DE GESTIÓN DE CERTIFICACIONES UPTPC - DISEÑADOR VISUAL (js/modules/disenador.js)
 * ==============================================================================
 */

(function() {
  let disenoActual = null;
  let elementoSeleccionado = null;
  let vistaCara = 'tiro'; // 'tiro' (frente) o 'retiro' (atrás)
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let elementStartX = 0;
  let elementStartY = 0;

  const DEFAULT_DISENO_SCHEMA = {
    id: '',
    nombre: 'Diseño Base UPTPC',
    descripcion: 'Diseño institucional estándar con logos, QR y firmas',
    ancho: 1123,
    alto: 794,
    activo: true,
    tiro_retiro: false,
    fondo: {
      color: '#FFFFFF',
      gradiente: {
        x1: '0%', y1: '0%', x2: '100%', y2: '100%',
        startColor: '#1565C0', startOpacity: 0.05,
        endColor: '#0D47A1', endOpacity: 0.08
      }
    },
    marco: {
      exterior: { x: 20, y: 20, ancho: 1083, alto: 754, rx: 8, stroke: '#0f3460', strokeWidth: 3 },
      interior: { x: 28, y: 28, ancho: 1067, alto: 738, rx: 6, stroke: '#0f3460', strokeWidth: 1, strokeDasharray: '5,5' },
      esquinas: [
        { path: 'M 30 120 L 30 30 L 120 30', stroke: '#0f3460', strokeWidth: 5, opacity: 0.6 },
        { path: 'M 1093 674 L 1093 764 L 1003 764', stroke: '#0f3460', strokeWidth: 5, opacity: 0.6 }
      ]
    },
    elementos: [
      { id: 'logo_univ', tipo: 'imagen', x: 60, y: 50, ancho: 100, alto: 100, binding: 'logo_universidad', texto_fijo: '', estilo: { preserveAspectRatio: 'xMidYMid meet' } },
      { id: 'logo_unid', tipo: 'imagen', x: 963, y: 50, ancho: 100, alto: 100, binding: 'logo_url', texto_fijo: '', estilo: { preserveAspectRatio: 'xMidYMid meet' } },
      { id: 'txt_rep', tipo: 'texto', x: 561, y: 60, ancho: 800, alto: 30, binding: null, texto_fijo: 'REPÚBLICA BOLIVARIANA DE VENEZUELA', estilo: { fontSize: 22, fontWeight: 'bold', fill: '#0f3460', textAnchor: 'middle', letterSpacing: 2 } },
      { id: 'txt_univ', tipo: 'texto', x: 561, y: 85, ancho: 800, alto: 25, binding: null, texto_fijo: 'UNIVERSIDAD POLITÉCNICA TERRITORIAL DE PUERTO CABELLO', estilo: { fontSize: 16, fontWeight: 'normal', fill: '#333333', textAnchor: 'middle' } },
      { id: 'txt_unid', tipo: 'texto', x: 561, y: 110, ancho: 800, alto: 22, binding: 'unidad_nombre', texto_fijo: '', estilo: { fontSize: 14, fontWeight: 'normal', fill: '#0D47A1', textAnchor: 'middle' } },
      { id: 'lin_dec', tipo: 'linea', x: 200, y: 130, ancho: 723, alto: 0, binding: null, texto_fijo: '', estilo: { stroke: '#0f3460', strokeWidth: 2, opacity: 0.5 } },
      { id: 'txt_cert', tipo: 'texto', x: 561, y: 170, ancho: 800, alto: 40, binding: null, texto_fijo: 'CERTIFICADO', estilo: { fontSize: 32, fontWeight: 'bold', fill: '#0f3460', textAnchor: 'middle', letterSpacing: 8 } },
      { id: 'txt_secert', tipo: 'texto', x: 561, y: 220, ancho: 800, alto: 22, binding: null, texto_fijo: 'Se certifica que:', estilo: { fontSize: 16, fontWeight: 'normal', fill: '#000000', textAnchor: 'middle' } },
      { id: 'txt_nom', tipo: 'texto', x: 561, y: 260, ancho: 800, alto: 35, binding: 'nombre_completo', texto_fijo: '', estilo: { fontSize: 26, fontWeight: 'bold', fill: '#0f3460', textAnchor: 'middle' } },
      { id: 'txt_ced', tipo: 'texto', x: 561, y: 290, ancho: 800, alto: 22, binding: 'cedula_label', texto_fijo: '', estilo: { fontSize: 15, fontWeight: 'normal', fill: '#000000', textAnchor: 'middle' } },
      { id: 'txt_mot', tipo: 'texto_multilinea', x: 561, y: 330, ancho: 580, alto: 80, binding: 'motivo', texto_fijo: '', estilo: { fontSize: 14, fontWeight: 'normal', fill: '#000000', textAnchor: 'middle' } },
      { id: 'txt_pon', tipo: 'texto_multilinea', x: 561, y: 420, ancho: 580, alto: 100, binding: 'ponencias', texto_fijo: '', estilo: { fontSize: 11, fontWeight: 'normal', fill: '#000000', textAnchor: 'middle' } },
      { id: 'txt_tip', tipo: 'texto', x: 561, y: 540, ancho: 800, alto: 18, binding: 'tipo_horas', texto_fijo: '', estilo: { fontSize: 13, fontWeight: 'normal', fill: '#555555', textAnchor: 'middle' } },
      { id: 'txt_tom', tipo: 'texto', x: 561, y: 570, ancho: 800, alto: 18, binding: 'tomo_folio', texto_fijo: '', estilo: { fontSize: 13, fontWeight: 'normal', fill: '#555555', textAnchor: 'middle' } },
      { id: 'txt_lug', tipo: 'texto', x: 561, y: 600, ancho: 800, alto: 20, binding: 'lugar', texto_fijo: '', estilo: { fontSize: 14, fontWeight: 'normal', fill: '#000000', textAnchor: 'middle' } },
      { id: 'txt_cod', tipo: 'texto', x: 561, y: 640, ancho: 800, alto: 16, binding: 'codigo_label', texto_fijo: '', estilo: { fontSize: 12, fontWeight: 'normal', fill: '#555555', textAnchor: 'middle' } },
      { id: 'qr_elem', tipo: 'qr', x: 930, y: 620, ancho: 128, alto: 128, binding: 'qr_url', texto_fijo: '', estilo: {} },
      { id: 'txt_ver', tipo: 'texto', x: 561, y: 680, ancho: 800, alto: 14, binding: 'url_verificacion', texto_fijo: '', estilo: { fontSize: 11, fontWeight: 'normal', fill: '#777777', textAnchor: 'middle' } },
      { id: 'lin_fir', tipo: 'linea', x: 420, y: 720, ancho: 280, alto: 0, binding: null, texto_fijo: '', estilo: { stroke: '#333333', strokeWidth: 1 } },
      { id: 'txt_fir', tipo: 'texto', x: 561, y: 740, ancho: 800, alto: 14, binding: null, texto_fijo: 'Rector de la UPTPC', estilo: { fontSize: 12, fontWeight: 'normal', fill: '#555555', textAnchor: 'middle' } }
    ]
  };

  const disenadorModule = {
    async init() {
      this.bindEvents();
      await this.cargarListaDiseños();
      await this.cargarDiseñoActivo();
    },

    getSideData() {
      if (!disenoActual) return { fondo: { color: '#FFFFFF' }, marco: {}, elementos: [] };
      if (!disenoActual[vistaCara]) {
        disenoActual[vistaCara] = {
          fondo: { color: '#FFFFFF' },
          marco: {},
          elementos: []
        };
      }
      if (!disenoActual[vistaCara].elementos) {
        disenoActual[vistaCara].elementos = [];
      }
      return disenoActual[vistaCara];
    },

    bindEvents() {
      document.getElementById('btnNuevoDiseño')?.addEventListener('click', () => this.nuevoDiseño());
      document.getElementById('btnGuardarDiseño')?.addEventListener('click', () => this.guardarDiseño());
      document.getElementById('btnActivarDiseño')?.addEventListener('click', () => this.activarDiseñoActual());
      document.getElementById('btnDesactivarDiseño')?.addEventListener('click', () => this.desactivarDiseñoActual());
      document.getElementById('btnEliminarDiseño')?.addEventListener('click', () => this.eliminarDiseñoActual());
      document.getElementById('btnPrevisualizarCert')?.addEventListener('click', () => this.previsualizarCertificado());

      // Switch Tiro/Retiro y pestañas de cara
      document.getElementById('switchTiroRetiro')?.addEventListener('change', (e) => this.toggleTiroRetiro(e.target.checked));
      document.getElementById('switchDisenoActivo')?.addEventListener('change', (e) => this.toggleDisenoActivoUI(e.target.checked));
      document.getElementById('btnVerTiro')?.addEventListener('click', () => this.cambiarCara('tiro'));
      document.getElementById('btnVerRetiro')?.addEventListener('click', () => this.cambiarCara('retiro'));

      // Agregar elementos
      document.getElementById('btnAgregarTexto')?.addEventListener('click', () => this.agregarElemento('texto'));
      document.getElementById('btnAgregarTextoMulti')?.addEventListener('click', () => this.agregarElemento('texto_multilinea'));
      document.getElementById('btnAgregarImagen')?.addEventListener('click', () => this.agregarElemento('imagen'));
      document.getElementById('btnAgregarLinea')?.addEventListener('click', () => this.agregarElemento('linea'));
      document.getElementById('btnAgregarRect')?.addEventListener('click', () => this.agregarElemento('rectangulo'));
      document.getElementById('btnAgregarQR')?.addEventListener('click', () => this.agregarElemento('qr'));

      // Eliminar y cambiar orden
      document.getElementById('btnEliminarElemento')?.addEventListener('click', () => this.eliminarElementoSeleccionado());

      // Cargar diseño seleccionado
      document.getElementById('selectDiseñoExistente')?.addEventListener('change', (e) => this.cargarDiseñoPorId(e.target.value));

      // Inspector de propiedades
      const propForm = document.getElementById('formPropiedadesElemento');
      if (propForm) {
        propForm.querySelectorAll('input, select').forEach(input => {
          input.addEventListener('input', () => this.actualizarElementoDesdePropiedades());
        });
      }

      // Variable binding selector especial para variables personalizadas
      document.getElementById('propElemBinding')?.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === '__custom__') {
          const customVar = prompt('Ingrese el nombre de la nueva variable personalizada (ej: carrera, nota, firma_url):');
          if (customVar && customVar.trim()) {
            const cleanVar = customVar.trim().toLowerCase().replace(/\s+/g, '_');
            const select = e.target;
            const opt = document.createElement('option');
            opt.value = cleanVar;
            opt.textContent = `Variable Custom: ${cleanVar}`;
            select.insertBefore(opt, select.lastElementChild);
            select.value = cleanVar;
          } else {
            e.target.value = '';
          }
        }
        this.actualizarElementoDesdePropiedades();
      });

      // File upload para imágenes de elementos
      document.getElementById('propElemImageFile')?.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file || !elementoSeleccionado) return;

        window.utils.showToast('Optimizando imagen...', 'info');

        try {
          let compressed = null;
          try {
            compressed = await window.utils.compressImage(file, 600, 600, 0.85);
          } catch (compErr) {
            console.warn('Compresión avanzada omitida, convirtiendo a base64:', compErr);
            compressed = await window.utils.fileToBase64(file);
          }

          if (!compressed) {
            window.utils.showToast('No se pudo procesar la imagen', 'danger');
            return;
          }

          window.utils.showToast('Subiendo imagen al servidor...', 'info');
          const res = await window.api.uploadImage(compressed, file.name || 'imagen.png');

          if (res.status === 'success' && res.url) {
            elementoSeleccionado.texto_fijo = res.url;
            if (document.getElementById('propElemTextoFijo')) {
              document.getElementById('propElemTextoFijo').value = res.url;
            }
            this.renderLienzo();
            window.utils.showToast('Imagen subida a Google Drive y asignada al elemento', 'success');
          } else {
            elementoSeleccionado.texto_fijo = compressed;
            if (document.getElementById('propElemTextoFijo')) {
              document.getElementById('propElemTextoFijo').value = compressed;
            }
            this.renderLienzo();
            window.utils.showToast('Imagen asignada localmente al lienzo', 'success');
          }
        } catch(err) {
          console.error('Error procesando imagen:', err);
          window.utils.showToast('Error procesando la imagen', 'danger');
        }
      });
    },

    toggleTiroRetiro(enabled) {
      if (!disenoActual) return;
      disenoActual.tiro_retiro = !!enabled;

      const grupo = document.getElementById('grupoPestañasCara');
      if (grupo) {
        grupo.style.display = enabled ? 'inline-flex' : 'none';
      }

      if (!enabled && vistaCara === 'retiro') {
        this.cambiarCara('tiro');
      } else {
        this.renderLienzo();
      }
    },

    cambiarCara(lado) {
      vistaCara = lado;
      this.deseleccionarElemento();

      const btnTiro = document.getElementById('btnVerTiro');
      const btnRetiro = document.getElementById('btnVerRetiro');

      if (lado === 'tiro') {
        if (btnTiro) btnTiro.className = 'btn btn-primary';
        if (btnRetiro) btnRetiro.className = 'btn btn-outline-primary';
      } else {
        if (btnTiro) btnTiro.className = 'btn btn-outline-primary';
        if (btnRetiro) btnRetiro.className = 'btn btn-primary';
      }

      this.renderLienzo();
      this.actualizarListaElementosUI();
    },

    async cargarListaDiseños() {
      try {
        const res = await window.api.getAll('disenos');
        const select = document.getElementById('selectDiseñoExistente');
        if (!select) return;

        select.innerHTML = '<option value="">-- Seleccionar o crear nuevo --</option>';
        if (res.status === 'success' && res.data) {
          res.data.forEach(d => {
            const isAct = (String(d.activo).toLowerCase() === 'true' || d.activo === true) ? ' ⭐ [ACTIVO]' : '';
            const isTR = (String(d.tiro_retiro).toLowerCase() === 'true' || d.tiro_retiro === true) ? ' (Tiro/Retiro)' : '';
            select.insertAdjacentHTML('beforeend', `<option value="${d.id}">${window.utils.escapeHtml(d.nombre)}${isTR}${isAct}</option>`);
          });
        }
      } catch (err) {
        console.error('Error cargando lista de diseños:', err);
      }
    },

    async cargarDiseñoActivo() {
      try {
        const res = await window.api.getDisenoActivo();
        if (res.status === 'success' && res.data) {
          this.cargarConfiguracionDiseño(res.data);
        } else {
          this.cargarConfiguracionDiseño(DEFAULT_DISENO_SCHEMA);
        }
      } catch (e) {
        this.cargarConfiguracionDiseño(DEFAULT_DISENO_SCHEMA);
      }
    },

    async cargarDiseñoPorId(id) {
      if (!id) {
        this.nuevoDiseño();
        return;
      }
      try {
        const res = await window.api.getById('disenos', id);
        if (res.status === 'success' && res.data) {
          this.cargarConfiguracionDiseño(res.data);
        }
      } catch (e) {
        window.utils.showToast('Error al cargar el diseño seleccionado', 'danger');
      }
    },

    cargarConfiguracionDiseño(disenoData) {
      vistaCara = 'tiro';
      let tiroData = null;
      let retiroData = null;

      if (disenoData) {
        if (disenoData.tiro || disenoData.diseno) {
          tiroData = disenoData.tiro || disenoData.diseno;
        } else if (disenoData.elementos) {
          tiroData = disenoData;
        }
        retiroData = disenoData.retiro;
      }

      if (typeof tiroData === 'string') { try { tiroData = JSON.parse(tiroData); } catch (e) {} }
      if (typeof retiroData === 'string') { try { retiroData = JSON.parse(retiroData); } catch (e) {} }

      const isTR = String(disenoData?.tiro_retiro).toLowerCase() === 'true' || disenoData?.tiro_retiro === true || !!(retiroData && retiroData.elementos && retiroData.elementos.length > 0);

      const schema = {
        id: disenoData?.id || '',
        nombre: disenoData?.nombre || 'Nuevo Diseño',
        descripcion: disenoData?.descripcion || '',
        ancho: disenoData?.ancho || 1123,
        alto: disenoData?.alto || 794,
        activo: String(disenoData?.activo).toLowerCase() === 'true' || disenoData?.activo === true,
        tiro_retiro: isTR,
        tiro: {
          fondo: tiroData?.fondo || DEFAULT_DISENO_SCHEMA.fondo,
          marco: tiroData?.marco || DEFAULT_DISENO_SCHEMA.marco,
          elementos: tiroData?.elementos || DEFAULT_DISENO_SCHEMA.elementos
        },
        retiro: {
          fondo: retiroData?.fondo || { color: '#FFFFFF' },
          marco: retiroData?.marco || {},
          elementos: retiroData?.elementos || []
        }
      };

      disenoActual = schema;
      elementoSeleccionado = null;

      document.getElementById('inputNombreDiseño').value = disenoActual.nombre;
      document.getElementById('inputDescDiseño').value = disenoActual.descripcion;

      const switchTR = document.getElementById('switchTiroRetiro');
      if (switchTR) switchTR.checked = disenoActual.tiro_retiro;

      const switchAct = document.getElementById('switchDisenoActivo');
      if (switchAct) switchAct.checked = disenoActual.activo;

      const grupo = document.getElementById('grupoPestañasCara');
      if (grupo) grupo.style.display = disenoActual.tiro_retiro ? 'inline-flex' : 'none';

      const badgeActivo = document.getElementById('badgeDiseñoStatus');
      if (badgeActivo) {
        if (disenoActual.activo) {
          badgeActivo.className = 'badge bg-success me-2';
          badgeActivo.innerHTML = '<i class="fa-solid fa-check-circle me-1"></i>ACTIVO';
        } else {
          badgeActivo.className = 'badge bg-secondary me-2';
          badgeActivo.innerHTML = '<i class="fa-solid fa-circle-minus me-1"></i>INACTIVO';
        }
      }

      const select = document.getElementById('selectDiseñoExistente');
      if (select && disenoActual.id) select.value = disenoActual.id;

      this.cambiarCara('tiro');
    },

    nuevoDiseño() {
      disenoActual = {
        id: '',
        nombre: 'Nuevo Diseño UPTPC ' + new Date().toLocaleDateString(),
        descripcion: 'Diseño personalizado',
        ancho: 1123,
        alto: 794,
        activo: false,
        tiro_retiro: false,
        tiro: {
          fondo: DEFAULT_DISENO_SCHEMA.fondo,
          marco: DEFAULT_DISENO_SCHEMA.marco,
          elementos: [...DEFAULT_DISENO_SCHEMA.elementos]
        },
        retiro: {
          fondo: { color: '#FFFFFF' },
          marco: {},
          elementos: []
        }
      };
      this.cargarConfiguracionDiseño(disenoActual);
      window.utils.showToast('Nuevo lienzo de diseño inicializado', 'info');
    },

    renderLienzo() {
      const contenedor = document.getElementById('canvasContainer');
      if (!contenedor || !disenoActual) return;

      const mockCert = {
        codigo: 'HGQ5573DTY',
        cedula: 'V-12345678',
        nombre_completo: 'NOMBRE COMPLETO DEL PARTICIPANTE',
        nombre_curso: 'INTRODUCCIÓN A LA INTELIGENCIA ARTIFICIAL',
        contenido: 'Conceptos fundamentales de IA y desarrollo web',
        horas: 16,
        tipo_curso: 'Taller',
        unidad_nombre: 'Unidad de Ciencia y Tecnología',
        unidad_codigo: 'CYT',
        logo_url: 'img/IMAGE.jpeg',
        fecha_curso: '2026-05-20',
        lugar: 'Puerto Cabello, Venezuela',
        tomo: '01',
        folio: '102',
        motivo: 'Por su valiosa participación en el taller de formación tecnológica.',
        ponencias: 'Módulo 1: Fundamentos | Módulo 2: Javascript',
        firma1_nombre: 'Dr. César Prieto',
        firma1_cargo: 'Rector de la UPTPC',
        firma1_url: 'img/IMAGE.png',
        sello1_url: 'img/IMAGE.png',
        firma2_nombre: 'Dra. Blanca Crespo',
        firma2_cargo: 'Secretaria General UPTPC',
        firma2_url: 'img/IMAGE.png',
        sello2_url: 'img/IMAGE.png',
        firma3_nombre: 'Nombre del Profesor',
        firma3_cargo: 'Cargo del Profesor',
        firma3_url: 'img/IMAGE.png',
        sello3_url: 'img/IMAGE.png'
      };

      const svgHtml = window.certRenderer.renderCertificateSVG(disenoActual, mockCert, true, vistaCara);
      contenedor.innerHTML = svgHtml;

      const svgEl = contenedor.querySelector('svg');
      if (svgEl) {
        svgEl.style.userSelect = 'none';

        // Dibujar resaltado de selección si hay elemento seleccionado
        if (elementoSeleccionado) {
          this.dibujarCajaSeleccion(svgEl, elementoSeleccionado);
        }

        this.hacerLienzoInteractivo(svgEl);
      }
    },

    dibujarCajaSeleccion(svgEl, el) {
      const pad = 4;
      const x = el.x - pad;
      const y = el.y - pad;
      const w = (el.ancho || 100) + pad * 2;
      const h = (el.alto || 30) + pad * 2;

      // Rectángulo de selección punteado
      const selRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      selRect.setAttribute('x', x);
      selRect.setAttribute('y', y);
      selRect.setAttribute('width', w);
      selRect.setAttribute('height', h);
      selRect.setAttribute('fill', 'none');
      selRect.setAttribute('stroke', '#0d6efd');
      selRect.setAttribute('stroke-width', '2');
      selRect.setAttribute('stroke-dasharray', '5,3');
      selRect.setAttribute('pointer-events', 'none');

      // Etiqueta de coordenadas
      const tagText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      tagText.setAttribute('x', x);
      tagText.setAttribute('y', Math.max(12, y - 6));
      tagText.setAttribute('font-size', '11px');
      tagText.setAttribute('font-weight', 'bold');
      tagText.setAttribute('fill', '#0d6efd');
      tagText.setAttribute('font-family', 'Arial');
      tagText.setAttribute('pointer-events', 'none');
      tagText.textContent = `📍 [${el.id}] (${el.x}, ${el.y}) ${el.ancho}×${el.alto}`;

      svgEl.appendChild(selRect);
      svgEl.appendChild(tagText);

      // ── Handles de redimensionamiento ──
      const handleSize = 8;
      const halfHandle = handleSize / 2;
      const handlePositions = [
        { cx: x, cy: y, cursor: 'nw-resize', dir: 'nw' },
        { cx: x + w / 2, cy: y, cursor: 'n-resize', dir: 'n' },
        { cx: x + w, cy: y, cursor: 'ne-resize', dir: 'ne' },
        { cx: x + w, cy: y + h / 2, cursor: 'e-resize', dir: 'e' },
        { cx: x + w, cy: y + h, cursor: 'se-resize', dir: 'se' },
        { cx: x + w / 2, cy: y + h, cursor: 's-resize', dir: 's' },
        { cx: x, cy: y + h, cursor: 'sw-resize', dir: 'sw' },
        { cx: x, cy: y + h / 2, cursor: 'w-resize', dir: 'w' }
      ];

      handlePositions.forEach(hp => {
        const handle = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        handle.setAttribute('x', hp.cx - halfHandle);
        handle.setAttribute('y', hp.cy - halfHandle);
        handle.setAttribute('width', handleSize);
        handle.setAttribute('height', handleSize);
        handle.setAttribute('fill', '#0d6efd');
        handle.setAttribute('stroke', '#ffffff');
        handle.setAttribute('stroke-width', '1.5');
        handle.setAttribute('rx', '2');
        handle.style.cursor = hp.cursor;
        handle.setAttribute('pointer-events', 'all');

        handle.addEventListener('mousedown', (evt) => {
          evt.stopPropagation();
          evt.preventDefault();
          this.iniciarRedimensionamiento(evt, svgEl, el, hp.dir);
        });

        svgEl.appendChild(handle);
      });
    },

    iniciarRedimensionamiento(evt, svgEl, el, dir) {
      const ctm = svgEl.getScreenCTM();
      const startPoint = svgEl.createSVGPoint();
      startPoint.x = evt.clientX;
      startPoint.y = evt.clientY;
      const startCoords = ctm ? startPoint.matrixTransform(ctm.inverse()) : { x: evt.clientX, y: evt.clientY };

      const origX = el.x;
      const origY = el.y;
      const origW = el.ancho || 100;
      const origH = el.alto || 30;

      const onMouseMove = (moveEvt) => {
        const p = svgEl.createSVGPoint();
        p.x = moveEvt.clientX;
        p.y = moveEvt.clientY;
        const ctmNow = svgEl.getScreenCTM();
        const coords = ctmNow ? p.matrixTransform(ctmNow.inverse()) : { x: moveEvt.clientX, y: moveEvt.clientY };

        const dx = coords.x - startCoords.x;
        const dy = coords.y - startCoords.y;
        const minSize = 20;

        switch (dir) {
          case 'se':
            el.ancho = Math.max(minSize, Math.round(origW + dx));
            el.alto = Math.max(minSize, Math.round(origH + dy));
            break;
          case 'e':
            el.ancho = Math.max(minSize, Math.round(origW + dx));
            break;
          case 's':
            el.alto = Math.max(minSize, Math.round(origH + dy));
            break;
          case 'nw':
            el.ancho = Math.max(minSize, Math.round(origW - dx));
            el.alto = Math.max(minSize, Math.round(origH - dy));
            el.x = Math.round(origX + (origW - el.ancho));
            el.y = Math.round(origY + (origH - el.alto));
            break;
          case 'n':
            el.alto = Math.max(minSize, Math.round(origH - dy));
            el.y = Math.round(origY + (origH - el.alto));
            break;
          case 'ne':
            el.ancho = Math.max(minSize, Math.round(origW + dx));
            el.alto = Math.max(minSize, Math.round(origH - dy));
            el.y = Math.round(origY + (origH - el.alto));
            break;
          case 'sw':
            el.ancho = Math.max(minSize, Math.round(origW - dx));
            el.alto = Math.max(minSize, Math.round(origH + dy));
            el.x = Math.round(origX + (origW - el.ancho));
            break;
          case 'w':
            el.ancho = Math.max(minSize, Math.round(origW - dx));
            el.x = Math.round(origX + (origW - el.ancho));
            break;
        }

        // Actualizar campos numéricos en panel de propiedades
        const propX = document.getElementById('propElemX');
        const propY = document.getElementById('propElemY');
        const propW = document.getElementById('propElemAncho');
        const propH = document.getElementById('propElemAlto');
        if (propX) propX.value = el.x;
        if (propY) propY.value = el.y;
        if (propW) propW.value = el.ancho;
        if (propH) propH.value = el.alto;

        this.renderLienzo();
      };

      const onMouseUp = () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },

    hacerLienzoInteractivo(svgEl) {
      const side = this.getSideData();
      const elementos = side.elementos || [];

      elementos.forEach((el, index) => {
        const groupNode = svgEl.querySelector(`g[data-elem-index="${index}"]`);
        const targetNodes = groupNode ? [groupNode] : svgEl.querySelectorAll(`[x="${el.x}"][y="${el.y}"]`);

        targetNodes.forEach(node => {
          node.style.cursor = 'move';

          node.addEventListener('click', (evt) => {
            evt.stopPropagation();
            this.seleccionarElemento(index);
          });

          node.addEventListener('mousedown', (evt) => {
            evt.stopPropagation();
            this.seleccionarElemento(index);
            isDragging = true;

            const ctm = svgEl.getScreenCTM();
            if (ctm) {
              const svgPoint = svgEl.createSVGPoint();
              svgPoint.x = evt.clientX;
              svgPoint.y = evt.clientY;
              const coords = svgPoint.matrixTransform(ctm.inverse());
              dragStartX = coords.x;
              dragStartY = coords.y;
            } else {
              dragStartX = evt.clientX;
              dragStartY = evt.clientY;
            }

            elementStartX = el.x;
            elementStartY = el.y;

            const onMouseMove = (moveEvt) => {
              if (!isDragging) return;

              let currentSvgX = moveEvt.clientX;
              let currentSvgY = moveEvt.clientY;

              const ctmMove = svgEl.getScreenCTM();
              if (ctmMove) {
                const p = svgEl.createSVGPoint();
                p.x = moveEvt.clientX;
                p.y = moveEvt.clientY;
                const coords = p.matrixTransform(ctmMove.inverse());
                currentSvgX = coords.x;
                currentSvgY = coords.y;
              }

              const dx = currentSvgX - dragStartX;
              const dy = currentSvgY - dragStartY;

              el.x = Math.round(elementStartX + dx);
              el.y = Math.round(elementStartY + dy);

              document.getElementById('propElemX').value = el.x;
              document.getElementById('propElemY').value = el.y;

              this.renderLienzo();
            };

            const onMouseUp = () => {
              isDragging = false;
              window.removeEventListener('mousemove', onMouseMove);
              window.removeEventListener('mouseup', onMouseUp);
            };

            window.addEventListener('mousemove', onMouseMove);
            window.addEventListener('mouseup', onMouseUp);
          });
        });
      });

      svgEl.addEventListener('click', (evt) => {
        if (evt.target === svgEl || evt.target.tagName.toLowerCase() === 'rect') {
          this.deseleccionarElemento();
        }
      });
    },

    seleccionarElemento(index) {
      const side = this.getSideData();
      if (!disenoActual || !side.elementos[index]) return;

      elementoSeleccionado = side.elementos[index];

      document.querySelectorAll('.item-elemento-canvas').forEach(item => item.classList.remove('active'));
      document.getElementById(`item-elem-${index}`)?.classList.add('active');

      document.getElementById('panelPropiedadesElemento').style.display = 'block';
      document.getElementById('propElemId').value = elementoSeleccionado.id || '';
      document.getElementById('propElemTipo').value = elementoSeleccionado.tipo || 'texto';
      document.getElementById('propElemX').value = elementoSeleccionado.x || 0;
      document.getElementById('propElemY').value = elementoSeleccionado.y || 0;
      document.getElementById('propElemAncho').value = elementoSeleccionado.ancho || 100;
      document.getElementById('propElemAlto').value = elementoSeleccionado.alto || 30;

      const selectBinding = document.getElementById('propElemBinding');
      if (selectBinding) {
        selectBinding.value = elementoSeleccionado.binding || '';
      }

      document.getElementById('propElemTextoFijo').value = elementoSeleccionado.texto_fijo || '';

      const estilo = elementoSeleccionado.estilo || {};
      document.getElementById('propElemFontSize').value = estilo.fontSize || 16;
      if (document.getElementById('propElemFontWeight')) {
        document.getElementById('propElemFontWeight').value = estilo.fontWeight || 'normal';
      }
      if (document.getElementById('propElemFontFamily')) {
        document.getElementById('propElemFontFamily').value = estilo.fontFamily || 'Arial, sans-serif';
      }
      if (document.getElementById('propElemStyleWeight')) {
        const curStyle = estilo.fontStyle || 'normal';
        const curWeight = estilo.fontWeight || 'normal';
        document.getElementById('propElemStyleWeight').value = `${curStyle}|${curWeight}`;
      }
      document.getElementById('propElemColor').value = estilo.fill || estilo.color || '#000000';
      document.getElementById('propElemTextAnchor').value = estilo.textAnchor || 'middle';

      // Efectos adicionales
      const opacityInput = document.getElementById('propElemOpacity');
      if (opacityInput) opacityInput.value = Math.round((elementoSeleccionado.estilo?.opacity ?? 1) * 100);
      const lsInput = document.getElementById('propElemLetterSpacing');
      if (lsInput) lsInput.value = elementoSeleccionado.estilo?.letterSpacing || 0;

      // Mostrar u ocultar controles específicos por tipo
      const imageContainer = document.getElementById('containerPropImagen');
      if (imageContainer) {
        imageContainer.style.display = (elementoSeleccionado.tipo === 'imagen') ? 'block' : 'none';
      }

      this.renderLienzo();
    },

    deseleccionarElemento() {
      elementoSeleccionado = null;
      document.querySelectorAll('.item-elemento-canvas').forEach(item => item.classList.remove('active'));
      document.getElementById('panelPropiedadesElemento').style.display = 'none';
      this.renderLienzo();
    },

    actualizarElementoDesdePropiedades() {
      if (!elementoSeleccionado) return;

      elementoSeleccionado.id = document.getElementById('propElemId').value;
      elementoSeleccionado.x = parseInt(document.getElementById('propElemX').value) || 0;
      elementoSeleccionado.y = parseInt(document.getElementById('propElemY').value) || 0;
      elementoSeleccionado.ancho = parseInt(document.getElementById('propElemAncho').value) || 100;
      elementoSeleccionado.alto = parseInt(document.getElementById('propElemAlto').value) || 30;

      const bVal = document.getElementById('propElemBinding').value;
      elementoSeleccionado.binding = (bVal && bVal !== '__custom__') ? bVal : null;
      elementoSeleccionado.texto_fijo = document.getElementById('propElemTextoFijo').value || '';

      if (!elementoSeleccionado.estilo) elementoSeleccionado.estilo = {};
      elementoSeleccionado.estilo.fontSize = parseInt(document.getElementById('propElemFontSize').value) || 16;
      
      if (document.getElementById('propElemFontFamily')) {
        elementoSeleccionado.estilo.fontFamily = document.getElementById('propElemFontFamily').value;
      }

      if (document.getElementById('propElemStyleWeight')) {
        const parts = document.getElementById('propElemStyleWeight').value.split('|');
        elementoSeleccionado.estilo.fontStyle = parts[0] || 'normal';
        elementoSeleccionado.estilo.fontWeight = parts[1] || 'normal';
      } else if (document.getElementById('propElemFontWeight')) {
        elementoSeleccionado.estilo.fontWeight = document.getElementById('propElemFontWeight').value;
      }

      elementoSeleccionado.estilo.fill = document.getElementById('propElemColor').value;
      elementoSeleccionado.estilo.textAnchor = document.getElementById('propElemTextAnchor').value;

      // Efectos adicionales
      const opacityInput = document.getElementById('propElemOpacity');
      if (opacityInput) {
        elementoSeleccionado.estilo.opacity = parseInt(opacityInput.value) / 100;
      }
      const lsInput = document.getElementById('propElemLetterSpacing');
      if (lsInput) {
        elementoSeleccionado.estilo.letterSpacing = parseInt(lsInput.value) || 0;
      }

      this.renderLienzo();
      this.actualizarListaElementosUI();
    },

    actualizarListaElementosUI() {
      const listaContainer = document.getElementById('listaElementosCanvas');
      if (!listaContainer || !disenoActual) return;

      const side = this.getSideData();
      listaContainer.innerHTML = '';
      (side.elementos || []).forEach((el, index) => {
        const bindingStr = el.binding ? `<span class="badge bg-info text-dark ms-1">${el.binding}</span>` : '';
        const isSel = elementoSeleccionado === el ? 'active' : '';

        listaContainer.insertAdjacentHTML('beforeend', `
          <div id="item-elem-${index}" class="list-group-item list-group-item-action d-flex justify-content-between align-items-center item-elemento-canvas ${isSel}" onclick="window.disenadorModule.seleccionarElemento(${index})">
            <div>
              <i class="fa-solid ${this.getIconoTipo(el.tipo)} me-2 text-primary"></i>
              <strong>${window.utils.escapeHtml(el.id)}</strong> (${el.tipo})
              ${bindingStr}
            </div>
            <div>
              <button class="btn btn-sm btn-outline-secondary py-0 px-1 me-1" onclick="event.stopPropagation(); window.disenadorModule.moverElemento(${index}, -1)" title="Subir Capa"><i class="fa-solid fa-arrow-up"></i></button>
              <button class="btn btn-sm btn-outline-secondary py-0 px-1" onclick="event.stopPropagation(); window.disenadorModule.moverElemento(${index}, 1)" title="Bajar Capa"><i class="fa-solid fa-arrow-down"></i></button>
            </div>
          </div>
        `);
      });
    },

    getIconoTipo(tipo) {
      switch (tipo) {
        case 'texto': return 'fa-font';
        case 'texto_multilinea': return 'fa-align-left';
        case 'imagen': return 'fa-image';
        case 'linea': return 'fa-minus';
        case 'rectangulo': return 'fa-square';
        case 'qr': return 'fa-qrcode';
        default: return 'fa-cubes';
      }
    },

    agregarElemento(tipo) {
      if (!disenoActual) return;

      const side = this.getSideData();
      const newId = `${tipo}_${Date.now().toString().slice(-4)}`;
      const nuevo = {
        id: newId,
        tipo: tipo,
        x: 561,
        y: 400,
        ancho: tipo === 'imagen' || tipo === 'qr' ? 120 : 400,
        alto: tipo === 'imagen' || tipo === 'qr' ? 120 : 30,
        binding: tipo === 'qr' ? 'qr_url' : (tipo === 'imagen' ? 'logo_url' : null),
        texto_fijo: tipo === 'texto' ? '' : '',
        estilo: {
          fontSize: 16,
          fontWeight: 'normal',
          fill: '#000000',
          textAnchor: 'middle'
        }
      };

      side.elementos.push(nuevo);
      this.renderLienzo();
      this.actualizarListaElementosUI();
      this.seleccionarElemento(side.elementos.length - 1);
      window.utils.showToast(`Nuevo elemento (${tipo}) agregado a ${vistaCara.toUpperCase()}`, 'success');
    },

    eliminarElementoSeleccionado() {
      if (!disenoActual || !elementoSeleccionado) return;

      const side = this.getSideData();
      const idx = side.elementos.indexOf(elementoSeleccionado);
      if (idx !== -1) {
        side.elementos.splice(idx, 1);
        this.deseleccionarElemento();
        this.renderLienzo();
        this.actualizarListaElementosUI();
        window.utils.showToast('Elemento eliminado del lienzo', 'warning');
      }
    },

    moverElemento(index, direccion) {
      const side = this.getSideData();
      if (!disenoActual || !side.elementos) return;
      const targetIdx = index + direccion;

      if (targetIdx >= 0 && targetIdx < side.elementos.length) {
        const temp = side.elementos[index];
        side.elementos[index] = side.elementos[targetIdx];
        side.elementos[targetIdx] = temp;

        this.renderLienzo();
        this.actualizarListaElementosUI();
      }
    },

    async guardarDiseño() {
      if (!disenoActual) return;

      const nombre = document.getElementById('inputNombreDiseño').value.trim();
      const descripcion = document.getElementById('inputDescDiseño').value.trim();

      if (!nombre) {
        window.utils.showToast('Ingrese un nombre para el diseño', 'warning');
        return;
      }

      disenoActual.nombre = nombre;
      disenoActual.descripcion = descripcion;
      disenoActual.tiro_retiro = !!document.getElementById('switchTiroRetiro')?.checked;
      const switchAct = document.getElementById('switchDisenoActivo');
      if (switchAct) disenoActual.activo = !!switchAct.checked;

      const btn = document.getElementById('btnGuardarDiseño');
      const oldText = btn.innerHTML;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-2"></i>Guardando...';
      btn.disabled = true;

      try {
        const payload = {
          id: disenoActual.id || undefined,
          nombre: disenoActual.nombre,
          descripcion: disenoActual.descripcion,
          activo: disenoActual.activo,
          tiro_retiro: disenoActual.tiro_retiro,
          ancho: disenoActual.ancho,
          alto: disenoActual.alto,
          tiro: disenoActual.tiro,
          retiro: disenoActual.retiro,
          diseno: disenoActual.tiro
        };

        const res = await window.api.saveDiseno(payload);

        if (res.status === 'success') {
          window.utils.showToast('Diseño guardado exitosamente en Google Sheets', 'success');
          await this.cargarListaDiseños();
          if (res.data && res.data.id) {
            disenoActual.id = res.data.id;
            document.getElementById('selectDiseñoExistente').value = res.data.id;
          }
        } else {
          window.utils.showToast('Error al guardar: ' + res.message, 'danger');
        }
      } catch (err) {
        window.utils.showToast('Error de comunicación con el servidor', 'danger');
      } finally {
        btn.innerHTML = oldText;
        btn.disabled = false;
      }
    },

    toggleDisenoActivoUI(checked) {
      if (!disenoActual) return;
      disenoActual.activo = !!checked;
      const badgeActivo = document.getElementById('badgeDiseñoStatus');
      if (badgeActivo) {
        if (disenoActual.activo) {
          badgeActivo.className = 'badge bg-success me-2';
          badgeActivo.innerHTML = '<i class="fa-solid fa-check-circle me-1"></i>ACTIVO';
        } else {
          badgeActivo.className = 'badge bg-secondary me-2';
          badgeActivo.innerHTML = '<i class="fa-solid fa-circle-minus me-1"></i>INACTIVO';
        }
      }
    },

    async activarDiseñoActual() {
      if (!disenoActual) return;
      disenoActual.activo = true;
      const switchAct = document.getElementById('switchDisenoActivo');
      if (switchAct) switchAct.checked = true;
      this.toggleDisenoActivoUI(true);

      if (disenoActual.id) {
        try {
          const res = await window.api.setDisenoActivo(disenoActual.id, true);
          if (res.status === 'success') {
            window.utils.showToast('Diseño activado correctamente. Ahora está disponible para ser asignado a Cursos y Talleres.', 'success');
            await this.cargarListaDiseños();
          } else {
            window.utils.showToast(res.message, 'danger');
          }
        } catch (e) {
          window.utils.showToast('Error al activar diseño', 'danger');
        }
      } else {
        window.utils.showToast('Diseño marcado como activo. Guarde los cambios para confirmarlo.', 'info');
      }
    },

    async desactivarDiseñoActual() {
      if (!disenoActual) return;
      disenoActual.activo = false;
      const switchAct = document.getElementById('switchDisenoActivo');
      if (switchAct) switchAct.checked = false;
      this.toggleDisenoActivoUI(false);

      if (disenoActual.id) {
        try {
          const res = await window.api.setDisenoActivo(disenoActual.id, false);
          if (res.status === 'success') {
            window.utils.showToast('Diseño desactivado. Ya no estará disponible para nuevos Cursos o Talleres.', 'warning');
            await this.cargarListaDiseños();
          } else {
            window.utils.showToast(res.message, 'danger');
          }
        } catch (e) {
          window.utils.showToast('Error al desactivar el diseño', 'danger');
        }
      } else {
        window.utils.showToast('Diseño marcado como inactivo.', 'info');
      }
    },

    async eliminarDiseñoActual() {
      if (!disenoActual || !disenoActual.id) {
        this.nuevoDiseño();
        return;
      }

      window.utils.showConfirm({
        title: 'Eliminar Diseño de Certificado',
        message: `¿Está seguro de que desea eliminar el diseño "${disenoActual.nombre}"?`,
        subtext: 'Esta acción eliminará la plantilla de diseño de certificado.',
        confirmText: 'Sí, Eliminar Diseño',
        onConfirm: async () => {
          try {
            const res = await window.api.delete('disenos', disenoActual.id);
            if (res.status === 'success') {
              window.utils.showToast('Diseño eliminado correctamente', 'success');
              await this.cargarListaDiseños();
              this.nuevoDiseño();
            } else {
              window.utils.showToast('Error al eliminar diseño: ' + res.message, 'danger');
            }
          } catch (e) {
            window.utils.showToast('Error al procesar eliminación', 'danger');
          }
        }
      });
    },

    previsualizarCertificado() {
      if (!disenoActual) return;
      const modalEl = document.getElementById('modalPrevisualizarCertificado');
      if (!modalEl) return;

      const mockCert = {
        codigo: 'HGQ5573DTY',
        cedula: 'V-12345678',
        nombre_completo: 'JUAN ALBERTO PÉREZ',
        nombre_curso: 'TALLER DE INTELIGENCIA ARTIFICIAL UPTPC',
        contenido: 'Conceptos fundamentales de IA y desarrollo web',
        horas: 16,
        tipo_curso: 'Taller',
        unidad_nombre: 'Unidad de Ciencia y Tecnología',
        unidad_codigo: 'CYT',
        logo_url: 'img/IMAGE.jpeg',
        fecha_curso: new Date().toISOString().split('T')[0],
        lugar: 'Puerto Cabello, Venezuela',
        tomo: '01',
        folio: '102',
        motivo: 'Por su valiosa participación en el taller de formación tecnológica.',
        ponencias: 'Módulo 1: Fundamentos de IA | Módulo 2: Javascript Moderno',
        firma1_nombre: 'Msc. Carlos Rodríguez',
        firma1_cargo: 'Rector de la UPTPC',
        firma1_url: '',
        sello1_url: '',
        firma2_nombre: 'Dra. Elena Mendoza',
        firma2_cargo: 'Directora de Ciencia y Tecnología',
        firma2_url: '',
        sello2_url: '',
        firma3_nombre: 'Lcdo. Roberto Gómez',
        firma3_cargo: 'Secretario General UPTPC',
        firma3_url: '',
        sello3_url: ''
      };

      const container = document.getElementById('previewCertContainer');
      if (window.certRenderer.hasRetiro(disenoActual)) {
        const tiroSVG = window.certRenderer.renderCertificateSVG(disenoActual, mockCert, false, 'tiro');
        const retiroSVG = window.certRenderer.renderCertificateSVG(disenoActual, mockCert, false, 'retiro');
        container.innerHTML = `
          <div class="row g-3">
            <div class="col-12 text-center">
              <span class="badge bg-primary mb-2 px-3 py-1 fs-6"><i class="fa-solid fa-file-lines me-1"></i> Parte de Adelante (Tiro)</span>
              <div class="border rounded p-2 bg-white shadow-sm">${tiroSVG}</div>
            </div>
            <div class="col-12 text-center">
              <span class="badge bg-secondary mb-2 px-3 py-1 fs-6"><i class="fa-solid fa-file-lines me-1"></i> Parte de Atrás (Retiro)</span>
              <div class="border rounded p-2 bg-white shadow-sm">${retiroSVG}</div>
            </div>
          </div>
        `;
      } else {
        container.innerHTML = window.certRenderer.renderCertificateSVG(disenoActual, mockCert, false, 'tiro');
      }

      const bsModal = new bootstrap.Modal(modalEl);
      bsModal.show();
    }
  };

  window.disenadorModule = disenadorModule;
})();
