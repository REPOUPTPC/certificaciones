/**
 * ==============================================================================
 * SISTEMA DE GESTIÓN DE CERTIFICACIONES UPTPC - MÓDULO DE OFERTAS Y PAGOS (js/modules/ofertas.js)
 * Adaptado para Node.js, Base de Datos Turso LibSQL y Almacenamiento Cloudflare R2
 * ==============================================================================
 */

(function() {
  let tasaDolarActual = 36.5;
  let cursoEditandoId = null;
  let pagoEditandoId = null;

  let cachedPagos = [];
  let cachedUsuarios = [];
  let cachedOfertas = [];
  let cachedBancos = [];
  let cachedCursos = [];
  let cachedCertificados = [];
  let pagosMasivosParsed = [];
  let pagosSeleccionadosIds = new Set();
  let pagosFiltradosActuales = [];
  let pagosAprobadosSeleccionadosIds = new Set();
  let pagosAprobadosFiltradosActuales = [];
  let idsConfigurandoFechaModal = [];
  let idsAprobandoLoteModal = [];

  function normalizeCursoOfertadoId(val) {
    if (val === undefined || val === null) return null;
    const str = String(val).trim();
    if (!str) return null;
    if (/^\d+(\.0+)?$/.test(str)) {
      return String(parseInt(str, 10));
    }
    return str;
  }

  function normalizarTextoComparacion(str) {
    return String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }

  function isNombreGenericoParticipante(nombre) {
    const n = String(nombre || '').trim();
    if (!n) return true;
    return /^PARTICIPANTE(\s|$)/i.test(n);
  }

  function normalizarFechaIso(val) {
    if (val === undefined || val === null) return '';
    const str = String(val).trim();
    if (!str) return '';

    const buildIso = (y, m, d) => {
      let year = parseInt(y, 10);
      let month = parseInt(m, 10);
      let day = parseInt(d, 10);
      if (isNaN(year) || isNaN(month) || isNaN(day)) return '';
      if (year < 100) year += 2000;
      if (month > 12 && day <= 12) {
        const tmp = month;
        month = day;
        day = tmp;
      }
      if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return '';
      return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    };

    // Formato ISO: YYYY-MM-DD o YYYY/MM/DD (con o sin marca de hora)
    const mIso = str.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?:\D|$)/);
    if (mIso) {
      return buildIso(mIso[1], mIso[2], mIso[3]);
    }

    // Formato Latino / Excel (4 o 2 dígitos de año, con o sin hora): DD/MM/YYYY, DD-MM-YY, etc.
    const mLat = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})(?:\D|$)/);
    if (mLat) {
      return buildIso(mLat[3], mLat[2], mLat[1]);
    }

    // Formato con mes en texto en español: "30-oct-2026", "30 de octubre de 2026"
    const mesesMap = {
      ene: 1, enero: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, abr: 4, abril: 4,
      may: 5, mayo: 5, jun: 6, junio: 6, jul: 7, julio: 7, ago: 8, agosto: 8,
      sep: 9, sept: 9, septiembre: 9, setiembre: 9, oct: 10, octubre: 10,
      nov: 11, noviembre: 11, dic: 12, diciembre: 12
    };
    const mTxt = str
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .match(/^(\d{1,2})[\s\/\-.]+(?:de\s+)?([a-z]+)[\s\/\-.]+(?:de\s+|del\s+)?(\d{2}|\d{4})\b/);
    if (mTxt && mesesMap[mTxt[2]]) {
      return buildIso(mTxt[3], mesesMap[mTxt[2]], mTxt[1]);
    }

    return '';
  }

  function generarTextoLugar(fechaStr) {
    const meses = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
    const norm = normalizarFechaIso(fechaStr);
    let d;
    if (norm) {
      const partes = norm.split('-');
      d = new Date(parseInt(partes[0], 10), parseInt(partes[1], 10) - 1, parseInt(partes[2], 10));
    } else {
      d = new Date();
    }
    if (isNaN(d.getTime())) d = new Date();
    return `PUERTO CABELLO ${String(d.getDate()).padStart(2, '0')} DE ${meses[d.getMonth()]} DE ${d.getFullYear()}`;
  }

  function resolverOferta(cursoId) {
    if (!cursoId && cursoId !== 0) return null;
    const rawStr = String(cursoId).trim();
    if (!rawStr) return null;
    const exact = cachedOfertas.find(o => String(o.id).trim() === rawStr);
    if (exact) return exact;
    if (/^\d+(\.0+)?$/.test(rawStr)) {
      const intId = parseInt(rawStr, 10);
      return cachedOfertas.find(o => {
        const oid = String(o.id || '').trim();
        return /^\d+(\.0+)?$/.test(oid) && parseInt(oid, 10) === intId;
      }) || null;
    }
    return null;
  }

  function resolverCursoAcademicoDeOferta(oferta) {
    if (!oferta) return null;
    if (oferta.curso_id) {
      const cid = String(oferta.curso_id).trim();
      const porId = cachedCursos.find(c => String(c.id).trim() === cid);
      if (porId) return porId;
    }
    if (oferta.taller) {
      const normTaller = normalizarTextoComparacion(oferta.taller);
      if (normTaller) {
        return cachedCursos.find(c => normalizarTextoComparacion(c.nombre) === normTaller) || null;
      }
    }
    return null;
  }

  async function poblarSelectCursosAcademicosOferta(cursoSeleccionadoId = '') {
    const sel = document.getElementById('inputOfertaCursoId');
    if (!sel) return;
    if (!Array.isArray(cachedCursos) || cachedCursos.length === 0) {
      try {
        const resC = await window.api.getAll('cursos');
        if (resC && resC.status === 'success' && Array.isArray(resC.data)) {
          cachedCursos = resC.data;
        }
      } catch (e) {
        console.warn('Error cargando cursos académicos para vincular oferta:', e);
      }
    }
    let opts = '<option value="">-- Vincular automáticamente por nombre exacto (o vincular luego en #cursos) --</option>';
    cachedCursos.forEach(c => {
      const hrs = c.horas ? ` (${c.horas} hrs)` : '';
      const cod = c.codigo_relacionado ? `[${c.codigo_relacionado}] ` : '';
      opts += `<option value="${window.utils.escapeHtml(c.id)}">${window.utils.escapeHtml(cod + (c.nombre || 'Curso') + hrs)}</option>`;
    });
    sel.innerHTML = opts;
    if (cursoSeleccionadoId) {
      sel.value = String(cursoSeleccionadoId);
    } else {
      sel.value = '';
    }
  }

  function isPagoVerificado(status) {
    if (status === true || status === 1) return true;
    const s = String(status || '').trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'aprobado' || s === 'confirmado';
  }

  function poblarSelectBancos(selectElement, bancoSeleccionado = '') {
    if (!selectElement) return;

    let options = '<option value="">-- Seleccionar Banco --</option>';
    
    const listaBancos = (Array.isArray(cachedBancos) && cachedBancos.length > 0)
      ? cachedBancos.map(b => b.banco)
      : [
          'Banco de Venezuela',
          'Banesco',
          'Mercantil',
          'Banco Provincial',
          'Banco Nacional de Crédito (BNC)',
          'Bancamiga',
          'Banco Bicentenario',
          'Banco del Tesoro',
          'Banco Exterior',
          'Banco Caroní',
          'Banco Activo',
          'Banco Plaza',
          '100% Banco',
          'Banplus',
          'Del Sur Banco Universal',
          'Pago Móvil / Otras Entidades',
          'Efectivo / Taquilla'
        ];

    listaBancos.forEach(b => {
      options += `<option value="${window.utils.escapeHtml(b)}">${window.utils.escapeHtml(b)}</option>`;
    });

    selectElement.innerHTML = options;

    if (bancoSeleccionado) {
      seleccionarBancoEnSelect(selectElement, bancoSeleccionado);
    }
  }

  function seleccionarBancoEnSelect(selectElement, bancoValor) {
    if (!selectElement || !bancoValor) return;
    const valTrim = String(bancoValor).trim();
    const valLower = valTrim.toLowerCase();

    // 1. Coincidencia exacta
    for (let i = 0; i < selectElement.options.length; i++) {
      if (selectElement.options[i].value === valTrim) {
        selectElement.selectedIndex = i;
        return;
      }
    }

    // 2. Coincidencia sin distinción de mayúsculas/minúsculas
    for (let i = 0; i < selectElement.options.length; i++) {
      if (selectElement.options[i].value.toLowerCase() === valLower) {
        selectElement.selectedIndex = i;
        return;
      }
    }

    // 3. Coincidencia parcial (ej: "Bancamiga" coincide con "Bancamiga (0172)")
    for (let i = 0; i < selectElement.options.length; i++) {
      const optVal = selectElement.options[i].value.toLowerCase();
      const optText = selectElement.options[i].textContent.toLowerCase();
      if ((optVal && (optVal.includes(valLower) || valLower.includes(optVal))) ||
          (optText && (optText.includes(valLower) || valLower.includes(optText)))) {
        selectElement.selectedIndex = i;
        return;
      }
    }

    // 4. Si no existía en el select, agregarlo dinámicamente para nunca perder el dato declarado
    const newOpt = document.createElement('option');
    newOpt.value = valTrim;
    newOpt.textContent = valTrim;
    newOpt.selected = true;
    selectElement.appendChild(newOpt);
    selectElement.value = valTrim;
  }

  function actualizarBoxInfoParticipante(userId) {
    const box = document.getElementById('boxInfoParticipanteModal');
    if (!box) return;

    if (!userId) {
      box.style.display = 'none';
      return;
    }

    const u = cachedUsuarios.find(x => String(x.id) === String(userId));
    if (!u) {
      box.style.display = 'none';
      return;
    }

    const elNom = document.getElementById('lblInfoModalNombre');
    const elCed = document.getElementById('lblInfoModalCedula');
    const elCor = document.getElementById('lblInfoModalCorreo');
    const elTel = document.getElementById('lblInfoModalTelefono');
    const boxGen = document.getElementById('boxCorregirNombreGenericoManual');
    const inpGen = document.getElementById('inputPagoNombreRealManual');

    if (elNom) elNom.textContent = u.nombre_completo || 'N/A';
    if (elCed) elCed.textContent = u.cedula || 'N/A';
    if (elCor) elCor.textContent = u.correo || 'No registrado';
    if (elTel) {
      if (u.telefono) {
        const cleanTel = u.telefono.replace(/[^0-9]/g, '');
        elTel.innerHTML = `<a href="https://wa.me/${cleanTel}" target="_blank" class="text-success text-decoration-none fw-bold" title="Abrir chat en WhatsApp"><i class="fa-brands fa-whatsapp me-1"></i>${window.utils.escapeHtml(u.telefono)}</a>`;
      } else {
        elTel.innerHTML = '<span class="text-warning small"><i class="fa-solid fa-phone-slash me-1"></i>Sin teléfono</span>';
      }
    }

    if (boxGen && inpGen) {
      if (isNombreGenericoParticipante(u.nombre_completo)) {
        boxGen.style.display = 'block';
        inpGen.value = '';
      } else {
        boxGen.style.display = 'none';
        inpGen.value = '';
      }
    }

    box.style.display = 'block';
  }

  function actualizarBoxInfoTaller(cursoId) {
    const box = document.getElementById('boxInfoTallerModal');
    if (!box) return;

    if (!cursoId) {
      box.style.display = 'none';
      return;
    }

    const ofr = resolverOferta(cursoId);
    if (!ofr) {
      box.style.display = 'none';
      return;
    }

    const elNom = document.getElementById('lblInfoModalTallerNombre');
    const elEst = document.getElementById('lblInfoModalCostoEst');
    const elFor = document.getElementById('lblInfoModalCostoFor');
    const elVinc = document.getElementById('lblInfoModalCursoVinculado');

    const valEstUsd = parseFloat(ofr.valor_estudiante || 0);
    const valForUsd = parseFloat(ofr.valor_foraneo || 0);
    const valEstBs = (valEstUsd * tasaDolarActual).toLocaleString('es-VE', { minimumFractionDigits: 2 });
    const valForBs = (valForUsd * tasaDolarActual).toLocaleString('es-VE', { minimumFractionDigits: 2 });

    if (elNom) elNom.textContent = ofr.taller;
    if (elEst) elEst.textContent = `$${valEstUsd.toFixed(2)} USD (${valEstBs} Bs.)`;
    if (elFor) elFor.textContent = `$${valForUsd.toFixed(2)} USD (${valForBs} Bs.)`;

    const cursoAcad = resolverCursoAcademicoDeOferta(ofr);
    if (elVinc) {
      if (cursoAcad) {
        elVinc.innerHTML = `<span class="text-success fw-semibold"><i class="fa-solid fa-certificate me-1"></i>Vinculado a: ${window.utils.escapeHtml(cursoAcad.nombre)}</span>`;
      } else {
        elVinc.innerHTML = `<span class="text-warning fw-semibold"><i class="fa-solid fa-triangle-exclamation me-1"></i>Sin curso académico vinculado aún en #cursos</span>`;
      }
    }

    const inpFechaCurso = document.getElementById('inputPagoFechaCurso');
    if (inpFechaCurso && !inpFechaCurso.value && cursoAcad && cursoAcad.fecha_curso) {
      const fNorm = normalizarFechaIso(cursoAcad.fecha_curso);
      if (fNorm) inpFechaCurso.value = fNorm;
    }

    box.style.display = 'block';
  }

  async function init() {
    try {
      tasaDolarActual = await window.api.fetchTasaDolar();
    } catch (e) {
      console.warn('Error obteniendo tasa dólar:', e);
    }
    
    const lblTasa = document.getElementById('lblTasaDolarOfertas');
    if (lblTasa) {
      lblTasa.textContent = `Tasa Oficial BCV: ${tasaDolarActual.toFixed(2)} Bs./$`;
    }

    initEventListeners();
    await Promise.all([cargarTablaOfertas(), cargarTablaPagos()]);

    // Si el usuario autenticado es ADMINISTRADORA o ADMINISTRACION, enfocar automáticamente la verificación de pagos
    if (window.authAdmin && window.authAdmin.isAdministradora && window.authAdmin.isAdministradora()) {
      const tabTalleresLi = document.getElementById('tab-talleres-tab')?.closest('.nav-item');
      const btnNuevaOferta = document.getElementById('btnNuevaOfertaCurso');
      if (tabTalleresLi) tabTalleresLi.style.display = 'none';
      if (btnNuevaOferta) btnNuevaOferta.style.display = 'none';

      const tabPagosBtn = document.getElementById('tab-pagos-tab');
      if (tabPagosBtn && typeof bootstrap !== 'undefined') {
        bootstrap.Tab.getOrCreateInstance(tabPagosBtn).show();
      }
    }
  }

  // ═════════════════════════════════════════════════════════════════
  // SECCIÓN 1: TALLERES Y CURSOS OFERTADOS (TIENDA)
  // ═════════════════════════════════════════════════════════════════

  async function cargarTablaOfertas() {
    const tbody = document.getElementById('tbodyOfertasCursos');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-3"><i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando ofertas de cursos...</td></tr>';

    try {
      const [res, resCursos] = await Promise.all([
        window.api.getAll('curso_ofertado'),
        window.api.getAll('cursos')
      ]);
      const ofertas = (res && res.status === 'success' && Array.isArray(res.data)) ? res.data : [];
      if (resCursos && resCursos.status === 'success' && Array.isArray(resCursos.data)) {
        cachedCursos = resCursos.data;
      }
      cachedOfertas = ofertas;

      if (ofertas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4"><i class="fa-solid fa-folder-open fa-2x mb-2 d-block"></i>No hay talleres ni cursos ofertados registrados en el sistema.</td></tr>';
        return;
      }

      const esAuditor = window.authAdmin && window.authAdmin.isAuditor();

      let html = '';
      ofertas.forEach(o => {
        const valEstBs = (parseFloat(o.valor_estudiante || 0) * tasaDolarActual).toFixed(2);
        const valForBs = (parseFloat(o.valor_foraneo || 0) * tasaDolarActual).toFixed(2);

        const imgTag = o.flayer 
          ? `<img src="${window.utils.escapeHtml(o.flayer)}" class="img-thumbnail cursor-pointer" style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px;" onclick="window.ofertasModule.verFlayerFull('${window.utils.escapeHtml(o.flayer)}', '${window.utils.escapeHtml(o.taller)}')">`
          : '<span class="badge bg-secondary">Sin Portada</span>';

        const cursoAcad = resolverCursoAcademicoDeOferta(o);
        const badgeCursoAcad = cursoAcad
          ? `<div class="mt-1"><span class="badge bg-success-subtle text-success border border-success-subtle fw-normal"><i class="fa-solid fa-graduation-cap me-1"></i>Certifica: ${window.utils.escapeHtml(cursoAcad.nombre)}</span></div>`
          : `<div class="mt-1"><span class="badge bg-warning-subtle text-dark border border-warning-subtle fw-normal"><i class="fa-solid fa-link-slash me-1"></i>Sin curso vinculado en #cursos</span></div>`;

        const accionesHtml = esAuditor 
          ? '<span class="badge bg-light text-muted border"><i class="fa-solid fa-lock me-1"></i>Lectura</span>'
          : `
            <div class="btn-group btn-group-sm">
              <button class="btn btn-outline-primary" onclick="window.ofertasModule.editarOferta('${o.id}')" title="Editar taller">
                <i class="fa-solid fa-pen"></i>
              </button>
              <button class="btn btn-outline-danger" onclick="window.ofertasModule.eliminarOferta('${o.id}', '${window.utils.escapeHtml(o.taller)}')" title="Eliminar taller">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          `;

        html += `
          <tr>
            <td class="text-center align-middle">${imgTag}</td>
            <td class="align-middle"><span class="fw-bold text-primary">${window.utils.escapeHtml(o.taller || '')}</span>${badgeCursoAcad}</td>
            <td class="align-middle small text-muted text-wrap" style="max-width: 250px;">${window.utils.escapeHtml(o.descripcion || 'Sin descripción')}</td>
            <td class="align-middle text-center">
              <span class="badge bg-success py-2 px-3 fs-6">$${parseFloat(o.valor_estudiante || 0).toFixed(2)}</span>
              <br><small class="text-muted fw-semibold">${valEstBs} Bs.</small>
            </td>
            <td class="align-middle text-center">
              <span class="badge bg-info text-dark py-2 px-3 fs-6">$${parseFloat(o.valor_foraneo || 0).toFixed(2)}</span>
              <br><small class="text-muted fw-semibold">${valForBs} Bs.</small>
            </td>
            <td class="align-middle text-center small text-muted">${window.utils.formatDate(o.created_at)}</td>
            <td class="align-middle text-center">${accionesHtml}</td>
          </tr>
        `;
      });

      tbody.innerHTML = html;
    } catch (err) {
      console.error('Error cargando tabla ofertas:', err);
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger py-3"><i class="fa-solid fa-circle-exclamation me-2"></i>Error al cargar las ofertas de cursos.</td></tr>';
    }
  }

  // ═════════════════════════════════════════════════════════════════
  // SECCIÓN 2: VERIFICACIÓN Y CRUD DE PAGOS (ADMINISTRACIÓN)
  // ═════════════════════════════════════════════════════════════════

  async function cargarTablaPagos() {
    const tbody = document.getElementById('tbodyPagosAdministracion');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="11" class="text-center py-3"><i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando declaraciones de pagos...</td></tr>';

    try {
      const [resPagos, resUsuarios, resOfertas, resBancos, resCursos, resCertificados] = await Promise.all([
        window.api.getAll('pagos'),
        window.api.getAll('usuarios').catch(() => ({ status: 'error', data: [] })),
        window.api.getAll('curso_ofertado').catch(() => ({ status: 'error', data: [] })),
        window.api.getAll('banco').catch(() => ({ status: 'error', data: [] })),
        window.api.getAll('cursos').catch(() => ({ status: 'error', data: [] })),
        window.api.getAll('certificados').catch(() => ({ status: 'error', data: [] }))
      ]);

      cachedPagos = (resPagos && resPagos.status === 'success' && Array.isArray(resPagos.data)) ? resPagos.data : [];
      cachedUsuarios = (resUsuarios && resUsuarios.status === 'success' && Array.isArray(resUsuarios.data)) ? resUsuarios.data : [];
      cachedOfertas = (resOfertas && resOfertas.status === 'success' && Array.isArray(resOfertas.data)) ? resOfertas.data : [];
      cachedBancos = (resBancos && resBancos.status === 'success' && Array.isArray(resBancos.data)) ? resBancos.data : [];
      cachedCursos = (resCursos && resCursos.status === 'success' && Array.isArray(resCursos.data)) ? resCursos.data : [];
      cachedCertificados = (resCertificados && resCertificados.status === 'success' && Array.isArray(resCertificados.data)) ? resCertificados.data : [];

      // Depurar selección contra IDs vigentes
      const validIds = new Set(cachedPagos.map(p => String(p.id)));
      pagosSeleccionadosIds.forEach(selId => {
        if (!validIds.has(String(selId))) {
          pagosSeleccionadosIds.delete(selId);
        }
      });
      pagosAprobadosSeleccionadosIds.forEach(selId => {
        if (!validIds.has(String(selId))) {
          pagosAprobadosSeleccionadosIds.delete(selId);
        }
      });

      actualizarOpcionesFiltroCursoPago();
      actualizarOpcionesFiltroCursoPagoAprobado();
      actualizarMetricasPagos();
      renderTablaPagosFiltrada();
      renderTablaPagosAprobadosFiltrada();
    } catch (err) {
      console.error('Error cargando tabla de pagos:', err);
      tbody.innerHTML = '<tr><td colspan="11" class="text-center text-danger py-3"><i class="fa-solid fa-circle-exclamation me-2"></i>Error al cargar los pagos registrados.</td></tr>';
      const tbodyAprob = document.getElementById('tbodyPagosAprobados');
      if (tbodyAprob) {
        tbodyAprob.innerHTML = '<tr><td colspan="11" class="text-center text-danger py-3"><i class="fa-solid fa-circle-exclamation me-2"></i>Error al cargar los pagos aprobados.</td></tr>';
      }
    }
  }

  function obtenerNombreCursoDePago(p) {
    if (!p) return 'Taller No Especificado';
    const ofr = resolverOferta(p.id_curso_ofertado);
    const nombre = (ofr && ofr.taller) ? ofr.taller : (p.taller || p.curso_ofertado || '');
    return String(nombre || '').trim() || 'Taller No Especificado';
  }

  function obtenerClaveCursoDePago(p) {
    return normalizarTextoComparacion(obtenerNombreCursoDePago(p)) || 'SIN_CURSO';
  }

  function obtenerInfoFechaEmisionPago(p) {
    if (!p) return { fecha: '', origen: 'ninguna', labelOrigen: 'Sin fecha asignada' };
    const ofr = resolverOferta(p.id_curso_ofertado);
    const cursoAcad = resolverCursoAcademicoDeOferta(ofr);
    const isVerificado = isPagoVerificado(p.status);
    const certEmitido = (isVerificado && cursoAcad && p.id_usuario)
      ? cachedCertificados.find(c => String(c.usuario_id) === String(p.id_usuario) && String(c.curso_id) === String(cursoAcad.id))
      : null;

    if (certEmitido && normalizarFechaIso(certEmitido.fecha_curso)) {
      return {
        fecha: normalizarFechaIso(certEmitido.fecha_curso),
        origen: 'certificado',
        labelOrigen: 'Certificado emitido'
      };
    }
    if (normalizarFechaIso(p.fecha_curso)) {
      return {
        fecha: normalizarFechaIso(p.fecha_curso),
        origen: 'pago',
        labelOrigen: isVerificado ? 'Registrada en pago' : 'Configurada para emisión'
      };
    }
    if (cursoAcad && normalizarFechaIso(cursoAcad.fecha_curso)) {
      return {
        fecha: normalizarFechaIso(cursoAcad.fecha_curso),
        origen: 'curso',
        labelOrigen: 'Curso (#cursos)'
      };
    }
    return {
      fecha: '',
      origen: 'ninguna',
      labelOrigen: 'Sin fecha asignada'
    };
  }

  function actualizarOpcionesFiltroCursoPago() {
    const sel = document.getElementById('selectFiltroCursoPago');
    if (!sel) return;

    const prevVal = sel.value || 'todos';
    const conteoCursos = new Map();
    let sinFechaCount = 0;

    const pendientes = cachedPagos.filter(p => !isPagoVerificado(p.status));

    pendientes.forEach(p => {
      const clave = obtenerClaveCursoDePago(p);
      const nombre = obtenerNombreCursoDePago(p);
      if (!conteoCursos.has(clave)) {
        conteoCursos.set(clave, { clave, nombre, total: 0 });
      }
      conteoCursos.get(clave).total++;

      const infoFecha = obtenerInfoFechaEmisionPago(p);
      if (!infoFecha.fecha) {
        sinFechaCount++;
      }
    });

    const listaCursos = Array.from(conteoCursos.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

    let html = `<option value="todos">Todos los Cursos / Talleres (${pendientes.length})</option>`;
    if (sinFechaCount > 0) {
      html += `<option value="__SIN_FECHA__">Sin Fecha de Emisión configurada (${sinFechaCount})</option>`;
    }
    listaCursos.forEach(item => {
      const val = `CURSO:${item.clave}`;
      html += `<option value="${window.utils.escapeHtml(val)}">${window.utils.escapeHtml(item.nombre)} (${item.total})</option>`;
    });

    sel.innerHTML = html;
    const existePrev = Array.from(sel.options).some(opt => opt.value === prevVal);
    sel.value = existePrev ? prevVal : 'todos';
  }

  function actualizarOpcionesFiltroCursoPagoAprobado() {
    const sel = document.getElementById('selectFiltroCursoPagoAprobado');
    if (!sel) return;

    const prevVal = sel.value || 'todos';
    const conteoCursos = new Map();

    const aprobados = cachedPagos.filter(p => isPagoVerificado(p.status));

    aprobados.forEach(p => {
      const clave = obtenerClaveCursoDePago(p);
      const nombre = obtenerNombreCursoDePago(p);
      if (!conteoCursos.has(clave)) {
        conteoCursos.set(clave, { clave, nombre, total: 0 });
      }
      conteoCursos.get(clave).total++;
    });

    const listaCursos = Array.from(conteoCursos.values()).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

    let html = `<option value="todos">Todos los Cursos / Talleres (${aprobados.length})</option>`;
    listaCursos.forEach(item => {
      const val = `CURSO:${item.clave}`;
      html += `<option value="${window.utils.escapeHtml(val)}">${window.utils.escapeHtml(item.nombre)} (${item.total})</option>`;
    });

    sel.innerHTML = html;
    const existePrev = Array.from(sel.options).some(opt => opt.value === prevVal);
    sel.value = existePrev ? prevVal : 'todos';
  }

  function actualizarMetricasPagos() {
    const totalPagos = cachedPagos.length;
    let pendientes = 0;
    let aprobados = 0;
    let montoTotalAprobadoBs = 0;
    let certificadosEmitidosCount = 0;

    cachedPagos.forEach(p => {
      const isOk = isPagoVerificado(p.status);
      if (isOk) {
        aprobados++;
        montoTotalAprobadoBs += parseFloat(p.monto || 0);

        const ofr = resolverOferta(p.id_curso_ofertado);
        const cursoAcad = resolverCursoAcademicoDeOferta(ofr);
        if (cursoAcad && p.id_usuario) {
          const tieneCert = cachedCertificados.some(c =>
            String(c.usuario_id) === String(p.id_usuario) && String(c.curso_id) === String(cursoAcad.id)
          );
          if (tieneCert) certificadosEmitidosCount++;
        }
      } else {
        pendientes++;
      }
    });

    // Tarjetas métricas en pestaña de Verificación de Pagos (Pendientes)
    const elTotal = document.getElementById('cardTotalPagos');
    const elPend = document.getElementById('cardPagosPendientes');
    const elAprob = document.getElementById('cardPagosAprobados');
    const elMontoBs = document.getElementById('cardMontoRecaudado');
    const elMontoUsd = document.getElementById('cardMontoDolares');

    if (elTotal) elTotal.textContent = totalPagos;
    if (elPend) elPend.textContent = pendientes;
    if (elAprob) elAprob.textContent = aprobados;
    if (elMontoBs) elMontoBs.textContent = `${montoTotalAprobadoBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs.`;
    if (elMontoUsd) {
      const dolares = tasaDolarActual > 0 ? (montoTotalAprobadoBs / tasaDolarActual) : 0;
      elMontoUsd.textContent = `($${dolares.toFixed(2)} USD)`;
    }

    // Tarjetas métricas en pestaña de Pagos Aprobados
    const elAprobCount = document.getElementById('cardAprobadosCount');
    const elAprobCert = document.getElementById('cardAprobadosCertificadosCount');
    const elAprobMontoBs = document.getElementById('cardAprobadosMontoRecaudado');
    const elAprobMontoUsd = document.getElementById('cardAprobadosMontoDolares');

    if (elAprobCount) elAprobCount.textContent = aprobados;
    if (elAprobCert) elAprobCert.textContent = certificadosEmitidosCount;
    if (elAprobMontoBs) elAprobMontoBs.textContent = `${montoTotalAprobadoBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs.`;
    if (elAprobMontoUsd) {
      const dolares = tasaDolarActual > 0 ? (montoTotalAprobadoBs / tasaDolarActual) : 0;
      elAprobMontoUsd.textContent = `($${dolares.toFixed(2)} USD)`;
    }

    // Badges en las pestañas
    const badgePend = document.getElementById('badgeCountTabPagosPendientes');
    if (badgePend) badgePend.textContent = pendientes;

    const badgeAprob = document.getElementById('badgeCountTabPagosAprobados');
    if (badgeAprob) badgeAprob.textContent = aprobados;
  }

  function renderTablaPagosFiltrada() {
    const tbody = document.getElementById('tbodyPagosAdministracion');
    if (!tbody) return;

    const inputBuscar = document.getElementById('inputBuscarPago');
    const selectFiltro = document.getElementById('selectFiltroEstatusPago');
    const selectCurso = document.getElementById('selectFiltroCursoPago');
    const searchVal = inputBuscar ? inputBuscar.value.trim().toUpperCase() : '';
    const filtroVal = selectFiltro ? selectFiltro.value : 'todos';
    const filtroCursoVal = selectCurso ? selectCurso.value : 'todos';

    const usuariosMap = Object.fromEntries(cachedUsuarios.map(u => [String(u.id), u]));

    let filtrados = cachedPagos.filter(p => {
      const isVerificado = isPagoVerificado(p.status);
      
      // REGLA CRÍTICA: En esta pestaña de Verificación sólo se muestran los pagos pendientes por validar
      if (isVerificado) return false;

      if (filtroVal === 'sin_fecha') {
        if (obtenerInfoFechaEmisionPago(p).fecha) return false;
      } else if (filtroVal === 'con_fecha') {
        if (!obtenerInfoFechaEmisionPago(p).fecha) return false;
      }

      if (filtroCursoVal === '__SIN_FECHA__') {
        if (obtenerInfoFechaEmisionPago(p).fecha) return false;
      } else if (filtroCursoVal && filtroCursoVal !== 'todos' && filtroCursoVal.startsWith('CURSO:')) {
        const claveBuscada = filtroCursoVal.slice(6);
        if (obtenerClaveCursoDePago(p) !== claveBuscada) return false;
      }

      if (!searchVal) return true;

      const usr = usuariosMap[String(p.id_usuario)] || {};
      const nombreTaller = obtenerNombreCursoDePago(p);
      const infoFecha = obtenerInfoFechaEmisionPago(p);

      const matchUsuario = String(usr.nombre_completo || '').toUpperCase().includes(searchVal);
      const matchCedula = String(usr.cedula || '').toUpperCase().includes(searchVal);
      const matchRef = String(p.numero_transferencia || '').toUpperCase().includes(searchVal);
      const matchBanco = String(p.banco_origen || '').toUpperCase().includes(searchVal);
      const matchTaller = String(nombreTaller).toUpperCase().includes(searchVal);
      const matchFechaPago = String(p.fecha_pago || '').toUpperCase().includes(searchVal);
      const matchFechaEmision = String(infoFecha.fecha || '').toUpperCase().includes(searchVal);

      return matchUsuario || matchCedula || matchRef || matchBanco || matchTaller || matchFechaPago || matchFechaEmision;
    });

    filtrados.sort((a, b) => new Date(b.created_at || b.fecha_pago || 0) - new Date(a.created_at || a.fecha_pago || 0));
    pagosFiltradosActuales = filtrados;

    if (filtrados.length === 0) {
      tbody.innerHTML = '<tr><td colspan="11" class="text-center text-muted py-4"><i class="fa-solid fa-clock-rotate-left fa-2x mb-2 text-warning d-block"></i>No se encontraron pagos pendientes por validar con los criterios seleccionados.</td></tr>';
      actualizarEstadoSeleccionPagosUI();
      return;
    }

    const esAuditor = window.authAdmin && window.authAdmin.isAuditor();

    let html = '';
    filtrados.forEach(p => {
      const pagoIdStr = String(p.id);
      const estaSeleccionado = pagosSeleccionadosIds.has(pagoIdStr);
      const usr = usuariosMap[String(p.id_usuario)] || {};
      const nombreTaller = obtenerNombreCursoDePago(p);

      const statusBadge = '<span class="badge bg-warning text-dark py-2 px-3 fw-bold"><i class="fa-solid fa-clock me-1"></i>PENDIENTE</span>';

      const captureTag = p.capture 
        ? `<button class="btn btn-sm btn-outline-info" onclick="window.ofertasModule.verCaptureFull('${window.utils.escapeHtml(p.capture)}', '${window.utils.escapeHtml(usr.nombre_completo || 'Pago')}')" title="Ver Comprobante"><i class="fa-solid fa-image me-1"></i>Capture</button>`
        : '<span class="text-muted small">Sin Capture</span>';

      let botonAprobacion = '';
      if (!esAuditor) {
        botonAprobacion = `
          <button class="btn btn-sm btn-success fw-bold" onclick="window.ofertasModule.aprobarPago('${window.utils.escapeHtml(pagoIdStr)}')" title="Aprobar Pago y Liberar Certificado">
            <i class="fa-solid fa-check-double me-1"></i>Aprobar
          </button>
        `;
      }

      const accionesHtml = esAuditor 
        ? '<span class="badge bg-light text-muted border"><i class="fa-solid fa-lock me-1"></i>Solo Lectura</span>'
        : `
          <div class="d-flex align-items-center justify-content-center gap-1">
            ${botonAprobacion}
            <button class="btn btn-sm btn-outline-primary" onclick="window.ofertasModule.abrirModalPago('${window.utils.escapeHtml(pagoIdStr)}')" title="Editar Pago">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="window.ofertasModule.eliminarPago('${window.utils.escapeHtml(pagoIdStr)}')" title="Eliminar Pago">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        `;

      const esNombreGen = isNombreGenericoParticipante(usr.nombre_completo);
      const badgeNombreGen = esNombreGen
        ? `<span class="badge bg-danger-subtle text-danger border ms-1" style="font-size: 0.68rem;" title="Nombre genérico pendiente de corregir antes de certificar"><i class="fa-solid fa-triangle-exclamation me-1"></i>Genérico</span>`
        : '';

      const infoFecha = obtenerInfoFechaEmisionPago(p);
      let fechaEmisionColHtml = '';
      if (infoFecha.fecha) {
        const claseBadgeFecha = infoFecha.origen === 'certificado'
          ? 'bg-success-subtle text-success border-success-subtle'
          : (infoFecha.origen === 'pago' ? 'bg-primary-subtle text-primary border-primary-subtle' : 'bg-info-subtle text-dark border-info-subtle');
        const btnEditarFechaFila = !esAuditor
          ? `<button type="button" class="btn btn-link btn-sm p-0 ms-1 text-secondary" onclick="window.ofertasModule.abrirModalConfigurarFechaEmision(['${window.utils.escapeHtml(pagoIdStr)}'])" title="Modificar fecha de emisión de este participante"><i class="fa-solid fa-pen-to-square" style="font-size: 0.78rem;"></i></button>`
          : '';
        fechaEmisionColHtml = `
          <div class="d-inline-flex align-items-center justify-content-center">
            <span class="badge ${claseBadgeFecha} border px-2 py-1 font-monospace">
              <i class="fa-solid fa-calendar-check me-1"></i>${window.utils.escapeHtml(infoFecha.fecha)}
            </span>${btnEditarFechaFila}
          </div>
          <div class="text-muted" style="font-size: 0.68rem;">${window.utils.escapeHtml(infoFecha.labelOrigen)}</div>
        `;
      } else {
        fechaEmisionColHtml = esAuditor
          ? '<span class="badge bg-light text-muted border">Sin asignar</span>'
          : `<button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2" style="font-size: 0.75rem;" onclick="window.ofertasModule.abrirModalConfigurarFechaEmision(['${window.utils.escapeHtml(pagoIdStr)}'])" title="Configurar la fecha de emisión que tendrá este certificado"><i class="fa-solid fa-calendar-plus text-warning me-1"></i>Asignar fecha</button>`;
      }

      const checkboxColHtml = esAuditor
        ? '<input type="checkbox" class="form-check-input" disabled>'
        : `<input type="checkbox" class="form-check-input cursor-pointer check-pago-seleccion" data-pago-id="${window.utils.escapeHtml(pagoIdStr)}" ${estaSeleccionado ? 'checked' : ''} title="Seleccionar este pago">`;

      html += `
        <tr class="${estaSeleccionado ? 'table-primary' : ''}">
          <td class="align-middle text-center">${checkboxColHtml}</td>
          <td class="align-middle fw-bold text-dark small font-monospace">${window.utils.escapeHtml(p.fecha_pago || window.utils.formatDate(p.created_at))}</td>
          <td class="align-middle">
            <strong class="${esNombreGen ? 'text-danger' : 'text-primary'}">${window.utils.escapeHtml(usr.nombre_completo || 'Participante Desconocido')}</strong>${badgeNombreGen}
            <br><small class="text-muted"><i class="fa-solid fa-id-card me-1"></i>${window.utils.escapeHtml(usr.cedula || 'N/A')}</small>
            ${usr.telefono ? `<br><small><a href="https://wa.me/${usr.telefono.replace(/[^0-9]/g, '')}" target="_blank" class="text-success text-decoration-none fw-semibold" title="Contactar vía WhatsApp"><i class="fa-brands fa-whatsapp me-1"></i>${window.utils.escapeHtml(usr.telefono)}</a></small>` : '<br><small class="text-warning"><i class="fa-solid fa-phone-slash me-1"></i>Sin registrar</small>'}
          </td>
          <td class="align-middle font-weight-bold text-wrap small" style="max-width: 200px;">${window.utils.escapeHtml(nombreTaller)}</td>
          <td class="align-middle text-center">${fechaEmisionColHtml}</td>
          <td class="align-middle small">${window.utils.escapeHtml(p.banco_origen || 'N/A')}</td>
          <td class="align-middle text-center font-weight-bold text-success">${parseFloat(p.monto || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.</td>
          <td class="align-middle text-center"><code>${window.utils.escapeHtml(p.numero_transferencia || 'S/R')}</code></td>
          <td class="align-middle text-center">${captureTag}</td>
          <td class="align-middle text-center">${statusBadge}</td>
          <td class="align-middle text-center">${accionesHtml}</td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
    actualizarEstadoSeleccionPagosUI();
  }

  // ═════════════════════════════════════════════════════════════════
  // SELECCIÓN MÚLTIPLE Y CONFIGURACIÓN EN LOTE DE FECHA DE EMISIÓN
  // ═════════════════════════════════════════════════════════════════

  function actualizarEstadoSeleccionPagosUI() {
    const totalSel = pagosSeleccionadosIds.size;
    const filtradosCount = pagosFiltradosActuales.length;
    const filtradosSeleccionadosCount = pagosFiltradosActuales.filter(p => pagosSeleccionadosIds.has(String(p.id))).length;
    const esAuditor = Boolean(window.authAdmin && window.authAdmin.isAuditor());

    const pagosSelObjs = cachedPagos.filter(p => pagosSeleccionadosIds.has(String(p.id)));
    let pendientesSelCount = 0;
    let aprobadosSelCount = 0;
    let elegiblesAprobarCount = 0;

    pagosSelObjs.forEach(p => {
      const ok = isPagoVerificado(p.status);
      if (ok) {
        aprobadosSelCount++;
        const ofr = resolverOferta(p.id_curso_ofertado);
        const cur = resolverCursoAcademicoDeOferta(ofr);
        if (cur && p.id_usuario) {
          const tieneCert = cachedCertificados.some(c =>
            String(c.usuario_id) === String(p.id_usuario) && String(c.curso_id) === String(cur.id)
          );
          if (!tieneCert) elegiblesAprobarCount++;
        }
      } else {
        pendientesSelCount++;
        elegiblesAprobarCount++;
      }
    });

    const chkHeader = document.getElementById('checkSeleccionarTodosPagos');
    if (chkHeader) {
      chkHeader.disabled = esAuditor || filtradosCount === 0;
      chkHeader.checked = filtradosCount > 0 && filtradosSeleccionadosCount === filtradosCount;
      chkHeader.indeterminate = filtradosSeleccionadosCount > 0 && filtradosSeleccionadosCount < filtradosCount;
    }

    const badgeToolbar = document.getElementById('badgeCountSeleccionadosToolbar');
    if (badgeToolbar) badgeToolbar.textContent = String(totalSel);

    const btnToolbar = document.getElementById('btnAbrirConfigurarFechaLote');
    if (btnToolbar) {
      btnToolbar.disabled = esAuditor || totalSel === 0;
    }

    const badgeAprobToolbar = document.getElementById('badgeCountAprobarToolbar');
    if (badgeAprobToolbar) badgeAprobToolbar.textContent = String(elegiblesAprobarCount);

    const btnAprobToolbar = document.getElementById('btnAprobarSeleccionadosToolbar');
    if (btnAprobToolbar) {
      btnAprobToolbar.disabled = esAuditor || elegiblesAprobarCount === 0;
    }

    const barra = document.getElementById('barraSeleccionPagosLote');
    if (!barra) return;

    if (totalSel === 0) {
      barra.style.display = 'none';
      return;
    }

    barra.style.display = 'flex';
    const lblCount = document.getElementById('lblCountPagosSeleccionadosBarra');
    if (lblCount) lblCount.textContent = String(totalSel);

    const lblCountAprobarBarra = document.getElementById('lblCountAprobarBarra');
    if (lblCountAprobarBarra) lblCountAprobarBarra.textContent = String(elegiblesAprobarCount);

    const lblCountRevertirBarra = document.getElementById('lblCountRevertirBarra');
    if (lblCountRevertirBarra) lblCountRevertirBarra.textContent = String(aprobadosSelCount);

    const lblCountEliminarBarra = document.getElementById('lblCountEliminarBarra');
    if (lblCountEliminarBarra) lblCountEliminarBarra.textContent = String(totalSel);

    const btnAprobBarra = document.getElementById('btnAprobarSeleccionadosBarra');
    if (btnAprobBarra) btnAprobBarra.disabled = esAuditor || elegiblesAprobarCount === 0;

    const btnRevBarra = document.getElementById('btnRevertirSeleccionadosBarra');
    if (btnRevBarra) btnRevBarra.disabled = esAuditor || aprobadosSelCount === 0;

    const btnElimBarra = document.getElementById('btnEliminarSeleccionadosBarra');
    if (btnElimBarra) btnElimBarra.disabled = esAuditor || totalSel === 0;

    const talleresUnicos = Array.from(new Set(pagosSelObjs.map(p => obtenerNombreCursoDePago(p))));
    const resumenTaller = talleresUnicos.length === 1
      ? ` — ${talleresUnicos[0]}`
      : (talleresUnicos.length > 1 ? ` — ${talleresUnicos.length} talleres seleccionados` : '');

    const detalleEstados = [];
    if (pendientesSelCount > 0) detalleEstados.push(`${pendientesSelCount} pend.`);
    if (aprobadosSelCount > 0) detalleEstados.push(`${aprobadosSelCount} aprob.`);
    const txtEstados = detalleEstados.length > 0 ? ` (${detalleEstados.join(', ')})` : '';

    const lblResumen = document.getElementById('lblResumenSeleccionPagos');
    if (lblResumen) {
      lblResumen.textContent = `${totalSel === 1 ? 'pago seleccionado' : 'pagos seleccionados'}${txtEstados}${resumenTaller}`;
    }

    const btnSelTodosFiltrados = document.getElementById('btnSeleccionarTodosFiltradosPagos');
    if (btnSelTodosFiltrados) {
      if (filtradosCount > 0 && filtradosSeleccionadosCount < filtradosCount) {
        btnSelTodosFiltrados.style.display = 'inline-block';
        btnSelTodosFiltrados.innerHTML = `<i class="fa-solid fa-list-check me-1"></i> Seleccionar los ${filtradosCount} filtrados`;
      } else {
        btnSelTodosFiltrados.style.display = 'none';
      }
    }
  }

  function toggleSeleccionPago(pagoId, checked) {
    const idStr = String(pagoId || '').trim();
    if (!idStr) return;
    if (checked) {
      pagosSeleccionadosIds.add(idStr);
    } else {
      pagosSeleccionadosIds.delete(idStr);
    }
    actualizarEstadoSeleccionPagosUI();
  }

  function toggleSeleccionarTodosFiltrados(checked) {
    pagosFiltradosActuales.forEach(p => {
      const idStr = String(p.id);
      if (checked) {
        pagosSeleccionadosIds.add(idStr);
      } else {
        pagosSeleccionadosIds.delete(idStr);
      }
    });
    renderTablaPagosFiltrada();
  }

  function seleccionarTodosFiltradosPagos() {
    toggleSeleccionarTodosFiltrados(true);
  }

  function limpiarSeleccionPagos() {
    pagosSeleccionadosIds.clear();
    renderTablaPagosFiltrada();
  }

  // ═════════════════════════════════════════════════════════════════
  // SECCIÓN 2.1: TABLA Y GESTIÓN DE PAGOS APROBADOS
  // ═════════════════════════════════════════════════════════════════

  function renderTablaPagosAprobadosFiltrada() {
    const tbody = document.getElementById('tbodyPagosAprobados');
    if (!tbody) return;

    const inputBuscar = document.getElementById('inputBuscarPagoAprobado');
    const selectCurso = document.getElementById('selectFiltroCursoPagoAprobado');
    const searchVal = inputBuscar ? inputBuscar.value.trim().toUpperCase() : '';
    const filtroCursoVal = selectCurso ? selectCurso.value : 'todos';

    const usuariosMap = Object.fromEntries(cachedUsuarios.map(u => [String(u.id), u]));

    let filtrados = cachedPagos.filter(p => {
      const isVerificado = isPagoVerificado(p.status);
      
      // REGLA FUNDAMENTAL: En esta pestaña sólo se muestran los pagos que fueron APROBADOS
      if (!isVerificado) return false;

      if (filtroCursoVal && filtroCursoVal !== 'todos' && filtroCursoVal.startsWith('CURSO:')) {
        const claveBuscada = filtroCursoVal.slice(6);
        if (obtenerClaveCursoDePago(p) !== claveBuscada) return false;
      }

      if (!searchVal) return true;

      const usr = usuariosMap[String(p.id_usuario)] || {};
      const ofr = resolverOferta(p.id_curso_ofertado) || {};
      const cursoAcad = resolverCursoAcademicoDeOferta(ofr);
      const certEmitido = (cursoAcad && p.id_usuario)
        ? cachedCertificados.find(c => String(c.usuario_id) === String(p.id_usuario) && String(c.curso_id) === String(cursoAcad.id))
        : null;
      const nombreTaller = obtenerNombreCursoDePago(p);
      const infoFecha = obtenerInfoFechaEmisionPago(p);

      const matchUsuario = String(usr.nombre_completo || '').toUpperCase().includes(searchVal);
      const matchCedula = String(usr.cedula || '').toUpperCase().includes(searchVal);
      const matchRef = String(p.numero_transferencia || '').toUpperCase().includes(searchVal);
      const matchBanco = String(p.banco_origen || '').toUpperCase().includes(searchVal);
      const matchTaller = String(nombreTaller).toUpperCase().includes(searchVal);
      const matchFechaPago = String(p.fecha_pago || '').toUpperCase().includes(searchVal);
      const matchFechaEmision = String(infoFecha.fecha || '').toUpperCase().includes(searchVal);
      const matchCertCodigo = certEmitido ? String(certEmitido.codigo || '').toUpperCase().includes(searchVal) : false;

      return matchUsuario || matchCedula || matchRef || matchBanco || matchTaller || matchFechaPago || matchFechaEmision || matchCertCodigo;
    });

    filtrados.sort((a, b) => new Date(b.created_at || b.fecha_pago || 0) - new Date(a.created_at || a.fecha_pago || 0));
    pagosAprobadosFiltradosActuales = filtrados;

    if (filtrados.length === 0) {
      tbody.innerHTML = '<tr><td colspan="11" class="text-center text-muted py-4"><i class="fa-solid fa-circle-check fa-2x mb-2 text-success d-block"></i>No se encontraron pagos aprobados con los criterios seleccionados.</td></tr>';
      actualizarEstadoSeleccionPagosAprobadosUI();
      return;
    }

    const esAuditor = window.authAdmin && window.authAdmin.isAuditor();

    let html = '';
    filtrados.forEach(p => {
      const pagoIdStr = String(p.id);
      const estaSeleccionado = pagosAprobadosSeleccionadosIds.has(pagoIdStr);
      const usr = usuariosMap[String(p.id_usuario)] || {};
      const ofr = resolverOferta(p.id_curso_ofertado) || {};
      const cursoAcad = resolverCursoAcademicoDeOferta(ofr);
      const nombreTaller = obtenerNombreCursoDePago(p);

      const certEmitido = (cursoAcad && p.id_usuario)
        ? cachedCertificados.find(c => String(c.usuario_id) === String(p.id_usuario) && String(c.curso_id) === String(cursoAcad.id))
        : null;

      let extraCertBadge = '';
      if (certEmitido) {
        extraCertBadge = `<div class="mt-1"><button type="button" class="btn btn-sm btn-outline-primary py-0 px-2 font-monospace" style="font-size: 0.75rem;" onclick="window.ofertasModule.verCertificadoEmitido('${window.utils.escapeHtml(certEmitido.id)}')" title="Ver Certificado Liberado"><i class="fa-solid fa-graduation-cap me-1"></i>${window.utils.escapeHtml(certEmitido.codigo)}</button></div>`;
      } else if (!cursoAcad) {
        extraCertBadge = `<div class="mt-1"><span class="badge bg-warning-subtle text-dark border border-warning-subtle" style="font-size: 0.7rem;" title="Vincule este taller con su curso en #cursos para liberar el certificado"><i class="fa-solid fa-link-slash me-1"></i>Falta vincular curso</span></div>`;
      }

      const statusBadge = `<span class="badge bg-success py-2 px-3 fw-bold"><i class="fa-solid fa-circle-check me-1"></i>APROBADO</span>${extraCertBadge}`;

      const captureTag = p.capture 
        ? `<button class="btn btn-sm btn-outline-info" onclick="window.ofertasModule.verCaptureFull('${window.utils.escapeHtml(p.capture)}', '${window.utils.escapeHtml(usr.nombre_completo || 'Pago')}')" title="Ver Comprobante"><i class="fa-solid fa-image me-1"></i>Capture</button>`
        : '<span class="text-muted small">Sin Capture</span>';

      const accionesHtml = esAuditor 
        ? '<span class="badge bg-light text-muted border"><i class="fa-solid fa-lock me-1"></i>Solo Lectura</span>'
        : `
          <div class="d-flex align-items-center justify-content-center gap-1">
            <button class="btn btn-sm btn-outline-warning" onclick="window.ofertasModule.revertirPago('${window.utils.escapeHtml(pagoIdStr)}')" title="Revertir a Pendiente y Anular Certificado">
              <i class="fa-solid fa-rotate-left me-1"></i>Revertir
            </button>
            <button class="btn btn-sm btn-outline-primary" onclick="window.ofertasModule.abrirModalPago('${window.utils.escapeHtml(pagoIdStr)}')" title="Editar Pago">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="window.ofertasModule.eliminarPago('${window.utils.escapeHtml(pagoIdStr)}')" title="Eliminar Pago">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        `;

      const infoFecha = obtenerInfoFechaEmisionPago(p);
      let fechaEmisionColHtml = '';
      if (infoFecha.fecha) {
        const claseBadgeFecha = infoFecha.origen === 'certificado'
          ? 'bg-success-subtle text-success border-success-subtle'
          : (infoFecha.origen === 'pago' ? 'bg-primary-subtle text-primary border-primary-subtle' : 'bg-info-subtle text-dark border-info-subtle');
        const btnEditarFechaFila = !esAuditor
          ? `<button type="button" class="btn btn-link btn-sm p-0 ms-1 text-secondary" onclick="window.ofertasModule.abrirModalConfigurarFechaEmision(['${window.utils.escapeHtml(pagoIdStr)}'])" title="Modificar fecha de emisión de este participante"><i class="fa-solid fa-pen-to-square" style="font-size: 0.78rem;"></i></button>`
          : '';
        fechaEmisionColHtml = `
          <div class="d-inline-flex align-items-center justify-content-center">
            <span class="badge ${claseBadgeFecha} border px-2 py-1 font-monospace">
              <i class="fa-solid fa-calendar-check me-1"></i>${window.utils.escapeHtml(infoFecha.fecha)}
            </span>${btnEditarFechaFila}
          </div>
          <div class="text-muted" style="font-size: 0.68rem;">${window.utils.escapeHtml(infoFecha.labelOrigen)}</div>
        `;
      } else {
        fechaEmisionColHtml = esAuditor
          ? '<span class="badge bg-light text-muted border">Sin asignar</span>'
          : `<button type="button" class="btn btn-sm btn-outline-secondary py-0 px-2" style="font-size: 0.75rem;" onclick="window.ofertasModule.abrirModalConfigurarFechaEmision(['${window.utils.escapeHtml(pagoIdStr)}'])" title="Configurar la fecha de emisión que tendrá este certificado"><i class="fa-solid fa-calendar-plus text-warning me-1"></i>Asignar fecha</button>`;
      }

      const checkboxColHtml = esAuditor
        ? '<input type="checkbox" class="form-check-input" disabled>'
        : `<input type="checkbox" class="form-check-input cursor-pointer check-pago-aprobado-seleccion" data-pago-id="${window.utils.escapeHtml(pagoIdStr)}" ${estaSeleccionado ? 'checked' : ''} title="Seleccionar este pago aprobado">`;

      html += `
        <tr class="${estaSeleccionado ? 'table-success' : ''}">
          <td class="align-middle text-center">${checkboxColHtml}</td>
          <td class="align-middle fw-bold text-dark small font-monospace">${window.utils.escapeHtml(p.fecha_pago || window.utils.formatDate(p.created_at))}</td>
          <td class="align-middle">
            <strong class="text-success">${window.utils.escapeHtml(usr.nombre_completo || 'Participante Desconocido')}</strong>
            <br><small class="text-muted"><i class="fa-solid fa-id-card me-1"></i>${window.utils.escapeHtml(usr.cedula || 'N/A')}</small>
            ${usr.telefono ? `<br><small><a href="https://wa.me/${usr.telefono.replace(/[^0-9]/g, '')}" target="_blank" class="text-success text-decoration-none fw-semibold" title="Contactar vía WhatsApp"><i class="fa-brands fa-whatsapp me-1"></i>${window.utils.escapeHtml(usr.telefono)}</a></small>` : '<br><small class="text-muted"><i class="fa-solid fa-phone-slash me-1"></i>Sin registrar</small>'}
          </td>
          <td class="align-middle font-weight-bold text-wrap small" style="max-width: 200px;">${window.utils.escapeHtml(nombreTaller)}</td>
          <td class="align-middle text-center">${fechaEmisionColHtml}</td>
          <td class="align-middle small">${window.utils.escapeHtml(p.banco_origen || 'N/A')}</td>
          <td class="align-middle text-center font-weight-bold text-success">${parseFloat(p.monto || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.</td>
          <td class="align-middle text-center"><code>${window.utils.escapeHtml(p.numero_transferencia || 'S/R')}</code></td>
          <td class="align-middle text-center">${captureTag}</td>
          <td class="align-middle text-center">${statusBadge}</td>
          <td class="align-middle text-center">${accionesHtml}</td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
    actualizarEstadoSeleccionPagosAprobadosUI();
  }

  function actualizarEstadoSeleccionPagosAprobadosUI() {
    const totalSel = pagosAprobadosSeleccionadosIds.size;
    const filtradosCount = pagosAprobadosFiltradosActuales.length;
    const filtradosSeleccionadosCount = pagosAprobadosFiltradosActuales.filter(p => pagosAprobadosSeleccionadosIds.has(String(p.id))).length;
    const esAuditor = Boolean(window.authAdmin && window.authAdmin.isAuditor());

    const pagosSelObjs = cachedPagos.filter(p => pagosAprobadosSeleccionadosIds.has(String(p.id)));

    const chkHeader = document.getElementById('checkSeleccionarTodosPagosAprobados');
    if (chkHeader) {
      chkHeader.disabled = esAuditor || filtradosCount === 0;
      chkHeader.checked = filtradosCount > 0 && filtradosSeleccionadosCount === filtradosCount;
      chkHeader.indeterminate = filtradosSeleccionadosCount > 0 && filtradosSeleccionadosCount < filtradosCount;
    }

    const badgeToolbarFecha = document.getElementById('badgeCountSeleccionadosToolbarAprobados');
    if (badgeToolbarFecha) badgeToolbarFecha.textContent = String(totalSel);

    const btnToolbarFecha = document.getElementById('btnAbrirConfigurarFechaLoteAprobados');
    if (btnToolbarFecha) {
      btnToolbarFecha.disabled = esAuditor || totalSel === 0;
    }

    const badgeRevToolbar = document.getElementById('badgeCountRevertirToolbarAprobados');
    if (badgeRevToolbar) badgeRevToolbar.textContent = String(totalSel);

    const btnRevToolbar = document.getElementById('btnRevertirSeleccionadosToolbarAprobados');
    if (btnRevToolbar) {
      btnRevToolbar.disabled = esAuditor || totalSel === 0;
    }

    const barra = document.getElementById('barraSeleccionPagosAprobadosLote');
    if (!barra) return;

    if (totalSel === 0) {
      barra.style.display = 'none';
      return;
    }

    barra.style.display = 'flex';
    const lblCount = document.getElementById('lblCountPagosAprobadosSeleccionadosBarra');
    if (lblCount) lblCount.textContent = String(totalSel);

    const lblCountRev = document.getElementById('lblCountRevertirBarraAprobados');
    if (lblCountRev) lblCountRev.textContent = String(totalSel);

    const lblCountElim = document.getElementById('lblCountEliminarBarraAprobados');
    if (lblCountElim) lblCountEliminarBarraAprobados.textContent = String(totalSel);

    const btnRevBarra = document.getElementById('btnRevertirSeleccionadosBarraAprobados');
    if (btnRevBarra) btnRevBarra.disabled = esAuditor || totalSel === 0;

    const btnElimBarra = document.getElementById('btnEliminarSeleccionadosBarraAprobados');
    if (btnElimBarra) btnElimBarra.disabled = esAuditor || totalSel === 0;

    const btnFechaBarra = document.getElementById('btnConfigurarFechaDesdeBarraAprobados');
    if (btnFechaBarra) btnFechaBarra.disabled = esAuditor || totalSel === 0;

    const talleresUnicos = Array.from(new Set(pagosSelObjs.map(p => obtenerNombreCursoDePago(p))));
    const resumenTaller = talleresUnicos.length === 1
      ? ` — ${talleresUnicos[0]}`
      : (talleresUnicos.length > 1 ? ` — ${talleresUnicos.length} talleres seleccionados` : '');

    const lblResumen = document.getElementById('lblResumenSeleccionPagosAprobados');
    if (lblResumen) {
      lblResumen.textContent = `${totalSel === 1 ? 'pago aprobado seleccionado' : 'pagos aprobados seleccionados'}${resumenTaller}`;
    }

    const btnSelTodosFiltrados = document.getElementById('btnSeleccionarTodosFiltradosPagosAprobados');
    if (btnSelTodosFiltrados) {
      if (filtradosCount > 0 && filtradosSeleccionadosCount < filtradosCount) {
        btnSelTodosFiltrados.style.display = 'inline-block';
        btnSelTodosFiltrados.innerHTML = `<i class="fa-solid fa-list-check me-1"></i> Seleccionar los ${filtradosCount} filtrados`;
      } else {
        btnSelTodosFiltrados.style.display = 'none';
      }
    }
  }

  function toggleSeleccionPagoAprobado(pagoId, checked) {
    const idStr = String(pagoId || '').trim();
    if (!idStr) return;
    if (checked) {
      pagosAprobadosSeleccionadosIds.add(idStr);
    } else {
      pagosAprobadosSeleccionadosIds.delete(idStr);
    }
    actualizarEstadoSeleccionPagosAprobadosUI();
  }

  function toggleSeleccionarTodosAprobadosFiltrados(checked) {
    pagosAprobadosFiltradosActuales.forEach(p => {
      const idStr = String(p.id);
      if (checked) {
        pagosAprobadosSeleccionadosIds.add(idStr);
      } else {
        pagosAprobadosSeleccionadosIds.delete(idStr);
      }
    });
    renderTablaPagosAprobadosFiltrada();
  }

  function seleccionarTodosFiltradosPagosAprobados() {
    toggleSeleccionarTodosAprobadosFiltrados(true);
  }

  function limpiarSeleccionPagosAprobados() {
    pagosAprobadosSeleccionadosIds.clear();
    renderTablaPagosAprobadosFiltrada();
  }

  async function exportarPagosAprobadosCsv() {
    try {
      if (!cachedPagos.length) {
        await cargarTablaPagos();
      }

      const usuariosMap = Object.fromEntries(cachedUsuarios.map(u => [String(u.id), u]));
      const aprobados = cachedPagos
        .filter(p => isPagoVerificado(p.status))
        .sort((a, b) => new Date(b.created_at || b.fecha_pago || 0) - new Date(a.created_at || a.fecha_pago || 0));

      if (aprobados.length === 0) {
        window.utils.showToast('No hay declaraciones de pagos aprobados para exportar', 'info');
        return;
      }

      const escaparCsv = (valor) => {
        const s = String(valor ?? '');
        return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };

      const resolverUrlCapture = (capture) => {
        if (!capture) return '';
        const c = String(capture);
        if (/^(https?:|data:)/i.test(c)) return c;
        try { return new URL(c, window.location.origin).href; } catch (e) { return c; }
      };

      const encabezados = ['cedula', 'nombre_completo', 'curso_ofertado', 'referencia', 'monto', 'banco_origen', 'capture', 'fecha_pago', 'fecha_emision', 'codigo_certificado'];
      const filas = aprobados.map(p => {
        const usr = usuariosMap[String(p.id_usuario)] || {};
        const ofr = resolverOferta(p.id_curso_ofertado) || {};
        const cursoAcad = resolverCursoAcademicoDeOferta(ofr);
        const certEmitido = (cursoAcad && p.id_usuario)
          ? cachedCertificados.find(c => String(c.usuario_id) === String(p.id_usuario) && String(c.curso_id) === String(cursoAcad.id))
          : null;
        const nombreTaller = (ofr && ofr.taller) ? ofr.taller : (p.taller || p.curso_ofertado || '');
        const infoFecha = obtenerInfoFechaEmisionPago(p);

        return [
          escaparCsv(usr.cedula || ''),
          escaparCsv(usr.nombre_completo || ''),
          escaparCsv(nombreTaller),
          escaparCsv(p.numero_transferencia || ''),
          escaparCsv(p.monto ?? ''),
          escaparCsv(p.banco_origen || ''),
          escaparCsv(resolverUrlCapture(p.capture)),
          escaparCsv(p.fecha_pago || ''),
          escaparCsv(infoFecha.fecha || ''),
          escaparCsv(certEmitido ? certEmitido.codigo : '')
        ].join(',');
      });

      const csvContent = '\uFEFF' + [encabezados.join(','), ...filas].join('\r\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const stamp = new Date().toISOString().slice(0, 10);
      link.download = `pagos_aprobados_uptpc_${stamp}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      window.utils.showToast(`CSV descargado con ${aprobados.length} pagos aprobados`, 'success');
    } catch (err) {
      console.error('Error al exportar pagos aprobados a CSV:', err);
      window.utils.showToast('No se pudo generar el archivo CSV de pagos aprobados', 'danger');
    }
  }

  function abrirModalConfigurarFechaEmision(idsEspecificos = null) {
    if (window.authAdmin && window.authAdmin.isAuditor()) {
      window.utils.showToast('Acceso restringido: Perfil AUDITOR es de solo lectura.', 'warning');
      return;
    }

    const idsObjetivo = Array.isArray(idsEspecificos) && idsEspecificos.length > 0
      ? idsEspecificos.map(id => String(id).trim()).filter(Boolean)
      : Array.from(pagosSeleccionadosIds);

    if (idsObjetivo.length === 0) {
      window.utils.showToast('Seleccione al menos 1 pago para configurar la Fecha de Emisión del certificado.', 'info');
      return;
    }

    const modalEl = document.getElementById('modalConfigurarFechaEmisionPagos');
    if (!modalEl) return;

    idsConfigurandoFechaModal = idsObjetivo;
    const idSet = new Set(idsObjetivo);
    const pagosObjetivo = cachedPagos.filter(p => idSet.has(String(p.id)));

    const lblCantidad = document.getElementById('lblConfigFechaCantidadPagos');
    if (lblCantidad) {
      lblCantidad.textContent = `${pagosObjetivo.length} ${pagosObjetivo.length === 1 ? 'pago seleccionado' : 'pagos seleccionados'}`;
    }

    const talleresMap = new Map();
    const fechasConfiguradas = new Set();
    let countCertsYaEmitidos = 0;

    pagosObjetivo.forEach(p => {
      const nomTaller = obtenerNombreCursoDePago(p);
      talleresMap.set(nomTaller, (talleresMap.get(nomTaller) || 0) + 1);

      // Solo considerar fecha_curso o cursoAcad.fecha_curso (NUNCA fecha_pago)
      const ofr = resolverOferta(p.id_curso_ofertado);
      const cursoAcad = resolverCursoAcademicoDeOferta(ofr);
      const fCurso = normalizarFechaIso(p.fecha_curso) || normalizarFechaIso(cursoAcad?.fecha_curso);
      if (fCurso) fechasConfiguradas.add(fCurso);

      if (isPagoVerificado(p.status) && cursoAcad && p.id_usuario) {
        const cert = cachedCertificados.find(c => String(c.usuario_id) === String(p.id_usuario) && String(c.curso_id) === String(cursoAcad.id));
        if (cert) countCertsYaEmitidos++;
      }
    });

    const lblTalleres = document.getElementById('lblConfigFechaTalleresResumen');
    if (lblTalleres) {
      const resumenArr = Array.from(talleresMap.entries()).map(([nom, cnt]) => `${nom} (${cnt})`);
      lblTalleres.textContent = resumenArr.join(' • ') || '-';
    }

    const inpFecha = document.getElementById('inputConfigLoteFechaEmision');
    const inpLugar = document.getElementById('inputConfigLoteLugarPreview');
    const fechaUnica = fechasConfiguradas.size === 1 ? Array.from(fechasConfiguradas)[0] : '';

    if (inpFecha) inpFecha.value = fechaUnica;
    if (inpLugar) inpLugar.value = fechaUnica ? generarTextoLugar(fechaUnica) : '';

    const boxEmitidos = document.getElementById('boxConfigLoteActualizarEmitidos');
    const chkEmitidos = document.getElementById('checkConfigLoteActualizarEmitidos');
    const lblCountEmitidos = document.getElementById('lblCountYaEmitidosLote');
    if (boxEmitidos) {
      boxEmitidos.style.display = countCertsYaEmitidos > 0 ? 'block' : 'none';
    }
    if (chkEmitidos) chkEmitidos.checked = true;
    if (lblCountEmitidos) lblCountEmitidos.textContent = String(countCertsYaEmitidos);

    bootstrap.Modal.getOrCreateInstance(modalEl).show();
    setTimeout(() => {
      if (inpFecha) inpFecha.focus();
    }, 200);
  }

  async function guardarConfiguracionFechaEmisionLote(e) {
    e.preventDefault();
    if (window.authAdmin && window.authAdmin.isAuditor()) {
      window.utils.showToast('Acceso restringido: Perfil AUDITOR es de solo lectura.', 'warning');
      return;
    }

    const inpFecha = document.getElementById('inputConfigLoteFechaEmision');
    const inpLugar = document.getElementById('inputConfigLoteLugarPreview');
    const chkEmitidos = document.getElementById('checkConfigLoteActualizarEmitidos');

    const fechaNorm = normalizarFechaIso(inpFecha?.value || '');
    if (!fechaNorm) {
      window.utils.showToast('Por favor seleccione una Fecha de Emisión válida.', 'warning');
      if (inpFecha) inpFecha.focus();
      return;
    }

    if (!Array.isArray(idsConfigurandoFechaModal) || idsConfigurandoFechaModal.length === 0) {
      window.utils.showToast('No hay pagos seleccionados para configurar.', 'warning');
      return;
    }

    const lugar = (inpLugar?.value || '').trim() || generarTextoLugar(fechaNorm);
    const actualizarCertificadosEmitidos = chkEmitidos ? chkEmitidos.checked : true;

    const btn = document.getElementById('btnGuardarConfigFechaEmisionLote');
    const oldHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-2"></i>Guardando fecha...';
    }

    try {
      if (window.utils && window.utils.showLoading) {
        window.utils.showLoading(40, 'Configurando Fecha de Emisión...', `Actualizando ${idsConfigurandoFechaModal.length} registro(s) en Turso`);
      }

      const res = await window.api.configurarFechaEmisionPagos(idsConfigurandoFechaModal, fechaNorm, {
        lugar,
        actualizarCertificadosEmitidos
      });

      if (res && res.status === 'success') {
        const modalEl = document.getElementById('modalConfigurarFechaEmisionPagos');
        if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).hide();

        window.utils.showToast(res.message || `Fecha de emisión (${fechaNorm}) configurada en ${idsConfigurandoFechaModal.length} pago(s).`, 'success');
        pagosSeleccionadosIds.clear();
        pagosAprobadosSeleccionadosIds.clear();
        await cargarTablaPagos();
        if (res.certificadosActualizados && res.certificadosActualizados.length > 0) {
          sincronizarModulosRelacionados();
        }
      } else {
        window.utils.showToast(res?.message || 'No se pudo guardar la fecha de emisión.', 'danger');
      }
    } catch (err) {
      console.error('Error configurando fecha de emisión en lote:', err);
      window.utils.showToast('Error al guardar la fecha de emisión: ' + err.message, 'danger');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = oldHtml;
      }
      if (window.utils && window.utils.hideLoading) window.utils.hideLoading();
    }
  }

  // ═════════════════════════════════════════════════════════════════
  // APROBACIÓN MASIVA, ANULACIÓN DE VERIFICACIÓN Y ELIMINACIÓN EN LOTE
  // ═════════════════════════════════════════════════════════════════

  async function abrirModalAprobarPagosLote(idsEspecificos = null) {
    if (window.authAdmin && window.authAdmin.isAuditor()) {
      window.utils.showToast('Acceso restringido: Perfil AUDITOR es de solo lectura.', 'warning');
      return;
    }

    const idsCandidatos = Array.isArray(idsEspecificos) && idsEspecificos.length > 0
      ? idsEspecificos.map(id => String(id).trim()).filter(Boolean)
      : Array.from(pagosSeleccionadosIds);

    if (idsCandidatos.length === 0) {
      window.utils.showToast('Seleccione al menos 1 pago para aprobar y liberar su certificado.', 'info');
      return;
    }

    if (!Array.isArray(cachedCursos) || cachedCursos.length === 0 || !Array.isArray(cachedCertificados)) {
      try {
        const [resCur, resCert] = await Promise.all([
          window.api.getAll('cursos').catch(() => ({ status: 'error', data: [] })),
          window.api.getAll('certificados').catch(() => ({ status: 'error', data: [] }))
        ]);
        if (resCur && resCur.status === 'success' && Array.isArray(resCur.data)) cachedCursos = resCur.data;
        if (resCert && resCert.status === 'success' && Array.isArray(resCert.data)) cachedCertificados = resCert.data;
      } catch (e) {}
    }

    const idSet = new Set(idsCandidatos);
    const pagosEnSeleccion = cachedPagos.filter(p => idSet.has(String(p.id)));

    // Filtrar los pagos pendientes o aprobados que aún no tienen certificado emitido en su curso vinculado
    const pagosElegibles = pagosEnSeleccion.filter(p => {
      if (!isPagoVerificado(p.status)) return true;
      const ofr = resolverOferta(p.id_curso_ofertado);
      const cur = resolverCursoAcademicoDeOferta(ofr);
      if (cur && p.id_usuario) {
        const yaTiene = cachedCertificados.some(c =>
          String(c.usuario_id) === String(p.id_usuario) && String(c.curso_id) === String(cur.id)
        );
        return !yaTiene;
      }
      return false;
    });

    if (pagosElegibles.length === 0) {
      window.utils.showToast('Todos los pagos seleccionados ya están aprobados y cuentan con su certificado emitido.', 'info');
      return;
    }

    const modalEl = document.getElementById('modalAprobarPagosLote');
    if (!modalEl) return;

    idsAprobandoLoteModal = pagosElegibles.map(p => String(p.id));
    const usuariosMap = new Map(cachedUsuarios.map(u => [String(u.id), u]));

    let pendientesCount = 0;
    let aprobadosSinCertCount = 0;
    let certsNuevosCount = 0;
    let certsYaExistentesCount = 0;
    let sinCursoCount = 0;
    const paresCertVistos = new Set();
    const talleresMap = new Map();
    const talleresSinVincularSet = new Set();
    const usuariosGenericosMap = new Map();
    const fechasDetectadasPorFila = [];

    pagosElegibles.forEach(p => {
      const usr = usuariosMap.get(String(p.id_usuario)) || {};
      const ofr = resolverOferta(p.id_curso_ofertado);
      const cursoAcad = resolverCursoAcademicoDeOferta(ofr);
      const nomTaller = obtenerNombreCursoDePago(p);

      talleresMap.set(nomTaller, (talleresMap.get(nomTaller) || 0) + 1);

      if (isPagoVerificado(p.status)) {
        aprobadosSinCertCount++;
      } else {
        pendientesCount++;
      }

      if (p.id_usuario && isNombreGenericoParticipante(usr.nombre_completo)) {
        if (!usuariosGenericosMap.has(String(p.id_usuario))) {
          usuariosGenericosMap.set(String(p.id_usuario), {
            id: String(p.id_usuario),
            cedula: usr.cedula || 'S/C',
            nombre_actual: usr.nombre_completo || 'PARTICIPANTE SIN NOMBRE'
          });
        }
      }

      if (!cursoAcad) {
        sinCursoCount++;
        talleresSinVincularSet.add(nomTaller);
      } else if (p.id_usuario) {
        const keyPar = `${String(p.id_usuario)}|${String(cursoAcad.id)}`;
        const existeEnDb = cachedCertificados.some(c =>
          String(c.usuario_id) === String(p.id_usuario) && String(c.curso_id) === String(cursoAcad.id)
        );
        if (existeEnDb || paresCertVistos.has(keyPar)) {
          certsYaExistentesCount++;
        } else {
          paresCertVistos.add(keyPar);
          certsNuevosCount++;
        }
      }

      // Nunca usar fecha_pago como fecha de emisión
      const fCurso = normalizarFechaIso(p.fecha_curso) || normalizarFechaIso(cursoAcad?.fecha_curso) || '';
      fechasDetectadasPorFila.push(fCurso);
    });

    const lblTotalPagos = document.getElementById('lblAprobarLoteTotalPagos');
    const lblSubPagos = document.getElementById('lblAprobarLoteSubPagos');
    const lblTotalCerts = document.getElementById('lblAprobarLoteTotalCerts');
    const lblSubCerts = document.getElementById('lblAprobarLoteSubCerts');
    const lblTalleres = document.getElementById('lblAprobarLoteTalleres');
    const btnSubmit = document.getElementById('btnSubmitAprobarPagosLote');

    if (lblTotalPagos) {
      lblTotalPagos.textContent = `${pagosElegibles.length} ${pagosElegibles.length === 1 ? 'pago' : 'pagos'}`;
    }
    if (lblSubPagos) {
      const partesSubP = [];
      if (pendientesCount > 0) partesSubP.push(`${pendientesCount} pendiente(s)`);
      if (aprobadosSinCertCount > 0) partesSubP.push(`${aprobadosSinCertCount} por certificar`);
      lblSubPagos.textContent = partesSubP.join(' • ') || '-';
    }
    if (lblTotalCerts) {
      lblTotalCerts.textContent = `${certsNuevosCount} ${certsNuevosCount === 1 ? 'certificado' : 'certificados'}`;
    }
    if (lblSubCerts) {
      const partesSubC = [];
      if (certsYaExistentesCount > 0) partesSubC.push(`${certsYaExistentesCount} ya emitido(s)`);
      if (sinCursoCount > 0) partesSubC.push(`${sinCursoCount} sin curso vinculado`);
      lblSubCerts.textContent = partesSubC.length > 0 ? partesSubC.join(' • ') : 'Liberación automática activa';
    }
    if (lblTalleres) {
      lblTalleres.textContent = Array.from(talleresMap.entries())
        .map(([nom, cnt]) => `${nom} (${cnt})`)
        .join(' • ') || '-';
    }
    if (btnSubmit) {
      btnSubmit.innerHTML = `<i class="fa-solid fa-certificate me-2"></i> Aprobar ${pagosElegibles.length} Pago(s) y Liberar Certificado(s)`;
    }

    // Candado de nombres genéricos en lote
    const boxGenLote = document.getElementById('boxNombresGenericosLote');
    const listaInputsGen = document.getElementById('listaInputsNombresGenericosLote');
    if (boxGenLote && listaInputsGen) {
      if (usuariosGenericosMap.size > 0) {
        boxGenLote.style.display = 'block';
        let genHtml = '';
        usuariosGenericosMap.forEach(ug => {
          genHtml += `
            <div class="input-group input-group-sm">
              <span class="input-group-text bg-white fw-bold font-monospace" style="min-width: 120px;">${window.utils.escapeHtml(ug.cedula)}</span>
              <input type="text" class="form-control text-uppercase fw-semibold input-nombre-generico-lote"
                data-usuario-id="${window.utils.escapeHtml(ug.id)}"
                placeholder="Ingrese Nombre Completo Real (reemplaza ${window.utils.escapeHtml(ug.nombre_actual)})"
                required>
            </div>
          `;
        });
        listaInputsGen.innerHTML = genHtml;
      } else {
        boxGenLote.style.display = 'none';
        listaInputsGen.innerHTML = '';
      }
    }

    // Aviso de talleres sin vincular (Opción 1a)
    const boxSinCurso = document.getElementById('boxAvisoSinCursoLote');
    if (boxSinCurso) {
      if (sinCursoCount > 0) {
        boxSinCurso.style.display = 'block';
        boxSinCurso.innerHTML = `
          <i class="fa-solid fa-triangle-exclamation me-1"></i>
          <strong>Aviso de Vinculación:</strong> ${sinCursoCount} pago(s) pertenecen a taller(es) aún no vinculados a <code>#cursos</code> (<strong>${window.utils.escapeHtml(Array.from(talleresSinVincularSet).join(', '))}</strong>). Se aprobarán normalmente guardando su fecha de emisión y quedará el recordatorio para vincular el curso.
        `;
      } else {
        boxSinCurso.style.display = 'none';
        boxSinCurso.innerHTML = '';
      }
    }

    // Configurar campos de Fecha de Emisión (jamás fecha_pago)
    const todasTienenFecha = fechasDetectadasPorFila.every(Boolean);
    const fechasUnicas = Array.from(new Set(fechasDetectadasPorFila.filter(Boolean)));

    const boxMultiFechas = document.getElementById('boxModoFechasMultiplesLote');
    const chkMultiFechas = document.getElementById('checkRespetarFechasIndividualesLote');
    const lblMultiFechas = document.getElementById('lblRespetarFechasIndividualesLote');
    const rowFechaUnica = document.getElementById('rowInputsFechaUnicaLote');
    const inpFechaLote = document.getElementById('inputAprobarLoteFechaEmision');
    const inpLugarLote = document.getElementById('inputAprobarLoteLugarEmision');
    const badgeOrigenLote = document.getElementById('badgeOrigenFechaAprobarLote');

    if (todasTienenFecha && fechasUnicas.length > 1) {
      if (boxMultiFechas) boxMultiFechas.style.display = 'block';
      if (chkMultiFechas) chkMultiFechas.checked = true;
      if (lblMultiFechas) {
        lblMultiFechas.textContent = `Respetar la fecha de emisión ya configurada en cada pago (${fechasUnicas.length} fechas: ${fechasUnicas.join(', ')})`;
      }
      if (rowFechaUnica) rowFechaUnica.style.display = 'none';
      if (inpFechaLote) {
        inpFechaLote.value = fechasUnicas[0];
        inpFechaLote.required = false;
      }
      if (inpLugarLote) inpLugarLote.value = generarTextoLugar(fechasUnicas[0]);
      if (badgeOrigenLote) {
        badgeOrigenLote.className = 'badge bg-success-subtle text-success border border-success-subtle';
        badgeOrigenLote.textContent = 'Fechas individuales precargadas por pago';
      }
    } else {
      if (boxMultiFechas) boxMultiFechas.style.display = 'none';
      if (chkMultiFechas) chkMultiFechas.checked = false;
      if (rowFechaUnica) rowFechaUnica.style.display = 'flex';

      const fechaPre = fechasUnicas.length === 1 ? fechasUnicas[0] : '';
      if (inpFechaLote) {
        inpFechaLote.value = fechaPre;
        inpFechaLote.required = true;
      }
      if (inpLugarLote) {
        inpLugarLote.value = fechaPre ? generarTextoLugar(fechaPre) : '';
      }
      if (badgeOrigenLote) {
        if (todasTienenFecha && fechaPre) {
          badgeOrigenLote.className = 'badge bg-success-subtle text-success border border-success-subtle';
          badgeOrigenLote.textContent = 'Precargada desde CSV / Configuración del Taller';
        } else if (fechaPre) {
          badgeOrigenLote.className = 'badge bg-primary-subtle text-primary border border-primary-subtle';
          badgeOrigenLote.textContent = 'Tomada del grupo — Se aplicará a todos los seleccionados';
        } else {
          badgeOrigenLote.className = 'badge bg-warning-subtle text-dark border border-warning-subtle';
          badgeOrigenLote.textContent = 'Sin fecha configurada — Seleccione la fecha de emisión del taller';
        }
      }
    }

    // Reiniciar Tomo y Folio opcionales
    const chkTF = document.getElementById('checkAprobarLoteTomoFolio');
    const contTF = document.getElementById('containerAprobarLoteTomoFolio');
    const lblStateTF = document.getElementById('lblStateTomoFolioLote');
    const inpTomo = document.getElementById('inputAprobarLoteTomo');
    const inpFolio = document.getElementById('inputAprobarLoteFolio');
    const inpLimFolio = document.getElementById('inputAprobarLoteLimiteFolio');
    if (chkTF) chkTF.checked = false;
    if (contTF) contTF.style.display = 'none';
    if (lblStateTF) lblStateTF.textContent = 'Desactivado';
    if (inpTomo) inpTomo.value = '';
    if (inpFolio) inpFolio.value = '';
    if (inpLimFolio) inpLimFolio.value = '15';

    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }

  async function confirmarAprobacionPagosLote(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (window.authAdmin && window.authAdmin.isAuditor()) {
      window.utils.showToast('Acceso restringido: Perfil AUDITOR es de solo lectura.', 'warning');
      return;
    }

    if (!Array.isArray(idsAprobandoLoteModal) || idsAprobandoLoteModal.length === 0) {
      window.utils.showToast('No hay pagos seleccionados para aprobar.', 'warning');
      return;
    }

    const respetarFechasIndividuales = Boolean(
      document.getElementById('boxModoFechasMultiplesLote')?.style.display !== 'none' &&
      document.getElementById('checkRespetarFechasIndividualesLote')?.checked
    );
    const inpFecha = document.getElementById('inputAprobarLoteFechaEmision');
    const fechaGlobal = normalizarFechaIso(inpFecha?.value || '');

    if (!respetarFechasIndividuales && !fechaGlobal) {
      window.utils.showToast('Por favor seleccione la Fecha de Emisión del certificado.', 'warning');
      if (inpFecha) inpFecha.focus();
      return;
    }

    const lugar = (document.getElementById('inputAprobarLoteLugarEmision')?.value || '').trim() ||
      (fechaGlobal ? generarTextoLugar(fechaGlobal) : '');

    const usarTF = Boolean(document.getElementById('checkAprobarLoteTomoFolio')?.checked);
    const tomo = usarTF ? (document.getElementById('inputAprobarLoteTomo')?.value || '').trim() : '';
    const folio = usarTF ? (document.getElementById('inputAprobarLoteFolio')?.value || '').trim() : '';
    const limite_por_folio = usarTF ? (parseInt(document.getElementById('inputAprobarLoteLimiteFolio')?.value, 10) || 15) : 15;

    // Recoger correcciones de nombres genéricos si aplica
    const nombresCorregidos = {};
    const listaInputsGen = document.getElementById('listaInputsNombresGenericosLote');
    if (listaInputsGen && typeof listaInputsGen.querySelectorAll === 'function') {
      const inputs = listaInputsGen.querySelectorAll('.input-nombre-generico-lote');
      for (const inp of inputs) {
        const uid = inp.dataset.usuarioId;
        const val = String(inp.value || '').replace(/\s+/g, ' ').trim().toUpperCase();
        if (!val || isNombreGenericoParticipante(val)) {
          window.utils.showToast('Complete el nombre real de todos los participantes con nombre genérico antes de aprobar.', 'danger');
          if (inp.focus) inp.focus();
          return;
        }
        if (uid) nombresCorregidos[uid] = val;
      }
    }

    const btn = document.getElementById('btnSubmitAprobarPagosLote');
    const oldHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-2"></i>Aprobando pagos y emitiendo certificados...';
    }

    try {
      if (window.utils && window.utils.showLoading) {
        window.utils.showLoading(45, 'Aprobando pagos en lote...', `Procesando ${idsAprobandoLoteModal.length} registro(s) y liberando certificados en Turso`);
      }

      const res = await window.api.bulkAprobarPagos(idsAprobandoLoteModal, {
        fecha_curso: fechaGlobal,
        respetarFechasIndividuales,
        lugar,
        tomo,
        folio,
        limite_por_folio,
        nombresCorregidos
      });

      if (res && res.status === 'success') {
        const modalEl = document.getElementById('modalAprobarPagosLote');
        if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).hide();

        pagosSeleccionadosIds.clear();
        pagosAprobadosSeleccionadosIds.clear();

        if (res.sinCursoVinculadoCount > 0) {
          window.utils.showToast(res.warning || res.message, 'warning');
        } else {
          window.utils.showToast(res.message || 'Pagos aprobados y certificados liberados exitosamente.', 'success');
        }

        await cargarTablaPagos();
        sincronizarModulosRelacionados();
      } else {
        window.utils.showToast(res?.message || 'No se pudo completar la aprobación masiva.', 'danger');
      }
    } catch (err) {
      console.error('Error en aprobación masiva de pagos:', err);
      window.utils.showToast('Error de conexión al aprobar pagos en lote: ' + err.message, 'danger');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = oldHtml;
      }
      if (window.utils && window.utils.hideLoading) window.utils.hideLoading();
    }
  }

  function revertirPagosSeleccionados(idsEspecificos = null) {
    if (window.authAdmin && window.authAdmin.isAuditor()) {
      window.utils.showToast('Acceso restringido: Perfil AUDITOR es de solo lectura.', 'warning');
      return;
    }

    const idsCandidatos = Array.isArray(idsEspecificos) && idsEspecificos.length > 0
      ? idsEspecificos.map(id => String(id).trim()).filter(Boolean)
      : Array.from(pagosSeleccionadosIds);

    if (idsCandidatos.length === 0) {
      window.utils.showToast('Seleccione al menos 1 pago para anular su verificación.', 'info');
      return;
    }

    const idSet = new Set(idsCandidatos);
    const pagosAprobados = cachedPagos.filter(p => idSet.has(String(p.id)) && isPagoVerificado(p.status));

    if (pagosAprobados.length === 0) {
      window.utils.showToast('Ninguno de los pagos seleccionados está APROBADO. Seleccione pagos verificados para anular su aprobación.', 'warning');
      return;
    }

    const certsVistos = new Set();
    pagosAprobados.forEach(p => {
      const ofr = resolverOferta(p.id_curso_ofertado);
      const cur = resolverCursoAcademicoDeOferta(ofr);
      if (cur && p.id_usuario) {
        const cert = cachedCertificados.find(c =>
          String(c.usuario_id) === String(p.id_usuario) && String(c.curso_id) === String(cur.id)
        );
        if (cert) certsVistos.add(String(cert.id));
      }
    });

    const idsRevertir = pagosAprobados.map(p => String(p.id));
    const subtexto = certsVistos.size > 0
      ? `Atención: Los ${idsRevertir.length} pago(s) volverán a estado PENDIENTE y se anularán automáticamente ${certsVistos.size} certificado(s) emitido(s), dejando constancia auditable en certificados_eliminados.`
      : `Los ${idsRevertir.length} pago(s) volverán a estado PENDIENTE (y cualquier certificado asociado será anulado en certificados_eliminados).`;

    window.utils.showConfirm({
      title: 'Anular Verificación de Pagos Seleccionados',
      message: `¿Está seguro de anular la aprobación de ${idsRevertir.length} pago(s) seleccionado(s) y regresarlos a PENDIENTE?`,
      subtext: subtexto,
      confirmText: `Sí, Revertir ${idsRevertir.length} Pago(s) y Anular Certificado(s)`,
      confirmClass: 'btn-warning',
      onConfirm: async () => {
        try {
          if (window.utils && window.utils.showLoading) {
            window.utils.showLoading(45, 'Anulando verificación de pagos...', `Revirtiendo ${idsRevertir.length} pago(s) y auditando certificados`);
          }
          const res = await window.api.bulkRevertirPagos(idsRevertir, { eliminarPago: false });
          if (res && res.status === 'success') {
            pagosSeleccionadosIds.clear();
        pagosAprobadosSeleccionadosIds.clear();
            window.utils.showToast(res.message || 'Verificación anulada exitosamente.', 'info');
            await cargarTablaPagos();
            sincronizarModulosRelacionados();
          } else {
            window.utils.showToast(res?.message || 'Error al anular verificación de pagos.', 'danger');
          }
        } catch (err) {
          console.error('Error en reversión masiva de pagos:', err);
          window.utils.showToast('Error al revertir pagos seleccionados: ' + err.message, 'danger');
        } finally {
          if (window.utils && window.utils.hideLoading) window.utils.hideLoading();
        }
      }
    });
  }

  function eliminarPagosSeleccionados(idsEspecificos = null) {
    if (window.authAdmin && window.authAdmin.isAuditor()) {
      window.utils.showToast('Acceso restringido: Perfil AUDITOR es de solo lectura.', 'warning');
      return;
    }

    const idsCandidatos = Array.isArray(idsEspecificos) && idsEspecificos.length > 0
      ? idsEspecificos.map(id => String(id).trim()).filter(Boolean)
      : Array.from(pagosSeleccionadosIds);

    if (idsCandidatos.length === 0) {
      window.utils.showToast('Seleccione al menos 1 pago para eliminar.', 'info');
      return;
    }

    const idSet = new Set(idsCandidatos);
    const pagosObjetivo = cachedPagos.filter(p => idSet.has(String(p.id)));
    if (pagosObjetivo.length === 0) return;

    let aprobadosCount = 0;
    let pendientesCount = 0;
    const certsVistos = new Set();

    pagosObjetivo.forEach(p => {
      if (isPagoVerificado(p.status)) {
        aprobadosCount++;
        const ofr = resolverOferta(p.id_curso_ofertado);
        const cur = resolverCursoAcademicoDeOferta(ofr);
        if (cur && p.id_usuario) {
          const cert = cachedCertificados.find(c =>
            String(c.usuario_id) === String(p.id_usuario) && String(c.curso_id) === String(cur.id)
          );
          if (cert) certsVistos.add(String(cert.id));
        }
      } else {
        pendientesCount++;
      }
    });

    const idsEliminar = pagosObjetivo.map(p => String(p.id));
    const subtexto = aprobadosCount > 0
      ? `Atención: La selección contiene ${aprobadosCount} pago(s) APROBADO(S)${pendientesCount > 0 ? ` y ${pendientesCount} PENDIENTE(S)` : ''}. Al eliminarlos también se anularán automáticamente ${certsVistos.size > 0 ? `${certsVistos.size} certificado(s) emitido(s)` : 'sus certificados emitidos'}, dejando constancia en certificados_eliminados. Esta acción no se puede deshacer.`
      : `Se eliminarán permanentemente ${pendientesCount} declaración(es) de pago en estado PENDIENTE. Esta acción no se puede deshacer.`;

    window.utils.showConfirm({
      title: aprobadosCount > 0 ? 'Eliminar Pagos Seleccionados y Anular Certificados' : 'Eliminar Pagos Seleccionados',
      message: `¿Está seguro de que desea eliminar permanentemente ${idsEliminar.length} registro(s) de pago seleccionado(s)?`,
      subtext: subtexto,
      confirmText: aprobadosCount > 0
        ? `Sí, Eliminar ${idsEliminar.length} Pago(s) y Anular Certificado(s)`
        : `Sí, Eliminar ${idsEliminar.length} Pago(s)`,
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        try {
          if (window.utils && window.utils.showLoading) {
            window.utils.showLoading(45, 'Eliminando pagos seleccionados...', `Procesando ${idsEliminar.length} registro(s) en Turso`);
          }
          const res = await window.api.bulkRevertirPagos(idsEliminar, {
            eliminarPago: true,
            motivo: 'Eliminación masiva de pagos seleccionados desde administración'
          });
          if (res && res.status === 'success') {
            pagosSeleccionadosIds.clear();
        pagosAprobadosSeleccionadosIds.clear();
            window.utils.showToast(res.message || 'Pagos seleccionados eliminados correctamente.', 'success');
            await cargarTablaPagos();
            if (aprobadosCount > 0 || (res.certificadosAnuladosCount && res.certificadosAnuladosCount > 0)) {
              sincronizarModulosRelacionados();
            }
          } else {
            window.utils.showToast(res?.message || 'Error al eliminar pagos seleccionados.', 'danger');
          }
        } catch (err) {
          console.error('Error en eliminación masiva de pagos:', err);
          window.utils.showToast('Error al eliminar pagos seleccionados: ' + err.message, 'danger');
        } finally {
          if (window.utils && window.utils.hideLoading) window.utils.hideLoading();
        }
      }
    });
  }

  function sincronizarModulosRelacionados() {
    try {
      if (window.certificadosModule && typeof window.certificadosModule.cargarCertificados === 'function') {
        window.certificadosModule.cargarCertificados().catch(() => {});
      }
      if (window.cursosModule && typeof window.cursosModule.cargarCursos === 'function') {
        window.cursosModule.cargarCursos().catch(() => {});
      }
      if (window.usuariosModule && typeof window.usuariosModule.cargarUsuarios === 'function') {
        window.usuariosModule.cargarUsuarios().catch(() => {});
      }
    } catch (e) {}
  }

  function verCertificadoEmitido(certId) {
    if (!certId) return;
    if (window.certificadosModule && typeof window.certificadosModule.verCertificado === 'function') {
      window.certificadosModule.verCertificado(certId);
    } else {
      window.utils.showToast('Módulo visor de certificados no disponible en esta vista.', 'info');
    }
  }

  // ═════════════════════════════════════════════════════════════════
  // APROBACIÓN 1 A 1 DE PAGOS CON LIBERACIÓN AUTOMÁTICA DE CERTIFICADO
  // ═════════════════════════════════════════════════════════════════

  async function aprobarPago(pagoId) {
    if (window.authAdmin && window.authAdmin.isAuditor()) {
      window.utils.showToast('Acceso restringido: Perfil AUDITOR es de solo lectura.', 'warning');
      return;
    }

    const pago = cachedPagos.find(p => String(p.id) === String(pagoId));
    if (!pago) {
      window.utils.showToast('No se encontró el registro de pago seleccionado.', 'danger');
      return;
    }

    if (!Array.isArray(cachedCursos) || cachedCursos.length === 0 || !Array.isArray(cachedCertificados)) {
      try {
        const [resCur, resCert] = await Promise.all([
          window.api.getAll('cursos'),
          window.api.getAll('certificados')
        ]);
        if (resCur && resCur.status === 'success' && Array.isArray(resCur.data)) cachedCursos = resCur.data;
        if (resCert && resCert.status === 'success' && Array.isArray(resCert.data)) cachedCertificados = resCert.data;
      } catch (e) {}
    }

    const modalEl = document.getElementById('modalAprobarPagoCertificado');
    if (!modalEl) return;

    const usr = cachedUsuarios.find(u => String(u.id) === String(pago.id_usuario)) || {};
    const ofr = resolverOferta(pago.id_curso_ofertado);
    const cursoAcad = resolverCursoAcademicoDeOferta(ofr);
    const nombreTaller = ofr ? ofr.taller : (pago.taller || 'Taller sin vincular');
    const montoStr = `${parseFloat(pago.monto || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.`;

    document.getElementById('inputAprobarPagoId').value = pago.id;
    document.getElementById('lblAprobarPagoCedula').textContent = usr.cedula || 'S/C';
    document.getElementById('lblAprobarPagoNombreActual').textContent = usr.nombre_completo || 'PARTICIPANTE SIN NOMBRE';
    document.getElementById('lblAprobarPagoMontoRef').textContent = `${montoStr} (Ref: ${pago.numero_transferencia || 'S/R'})`;
    document.getElementById('lblAprobarPagoTaller').textContent = nombreTaller;

    // Candado de seguridad para nombres genéricos PARTICIPANTE V-...
    const esGenerico = isNombreGenericoParticipante(usr.nombre_completo);
    const boxNombre = document.getElementById('boxCorregirNombreAprobar');
    const alertaGen = document.getElementById('alertaNombreGenericoAprobar');
    const inpNombreReal = document.getElementById('inputAprobarPagoNombreReal');
    const btnToggleNom = document.getElementById('btnToggleCorregirNombreAprobar');

    if (esGenerico) {
      if (boxNombre) boxNombre.style.display = 'block';
      if (alertaGen) alertaGen.style.display = 'block';
      if (inpNombreReal) {
        inpNombreReal.value = '';
        inpNombreReal.required = true;
      }
      if (btnToggleNom) btnToggleNom.style.display = 'none';
    } else {
      if (boxNombre) boxNombre.style.display = 'none';
      if (alertaGen) alertaGen.style.display = 'none';
      if (inpNombreReal) {
        inpNombreReal.value = usr.nombre_completo || '';
        inpNombreReal.required = false;
      }
      if (btnToggleNom) btnToggleNom.style.display = 'inline-block';
    }

    // Estado del curso académico vinculado (#cursos)
    const boxCurso = document.getElementById('boxEstadoCursoVinculadoAprobar');
    const btnSubmit = document.getElementById('btnSubmitAprobarPagoCertificado');
    const certPrevio = (cursoAcad && pago.id_usuario)
      ? cachedCertificados.find(c => String(c.usuario_id) === String(pago.id_usuario) && String(c.curso_id) === String(cursoAcad.id))
      : null;

    if (boxCurso) {
      if (!cursoAcad) {
        boxCurso.innerHTML = `
          <div class="alert alert-warning py-2 px-3 small mb-0">
            <i class="fa-solid fa-triangle-exclamation me-2"></i>
            <strong>Aviso de Vinculación Académica:</strong> El taller <strong>"${window.utils.escapeHtml(nombreTaller)}"</strong> aún no está vinculado a un Curso en <code>#cursos</code>.
            Al confirmar se <strong>aprobará el pago normalmente</strong> guardando la fecha de emisión, y mostrará un recordatorio para vincular el curso y emitir el certificado.
          </div>
        `;
        if (btnSubmit) {
          btnSubmit.innerHTML = '<i class="fa-solid fa-check-double me-2"></i> Aprobar Pago (Falta Vincular Curso)';
        }
      } else if (certPrevio) {
        boxCurso.innerHTML = `
          <div class="alert alert-info py-2 px-3 small mb-0">
            <i class="fa-solid fa-circle-info me-2"></i>
            <strong>Certificado Previamente Emitido:</strong> Este participante ya cuenta con el certificado <code>${window.utils.escapeHtml(certPrevio.codigo)}</code> en el curso <strong>"${window.utils.escapeHtml(cursoAcad.nombre)}"</strong>. Al confirmar se validará el pago sin duplicar su certificado.
          </div>
        `;
        if (btnSubmit) {
          btnSubmit.innerHTML = '<i class="fa-solid fa-check-double me-2"></i> Aprobar Pago Confirmado';
        }
      } else {
        boxCurso.innerHTML = `
          <div class="alert alert-success py-2 px-3 small mb-0">
            <i class="fa-solid fa-graduation-cap me-2"></i>
            <strong>Liberación Automática Activa:</strong> Al confirmar se aprobará el pago y se emitirá automáticamente el certificado oficial (<code>AAA1234AAA</code>) del curso <strong>"${window.utils.escapeHtml(cursoAcad.nombre)}"</strong> (${window.utils.escapeHtml(String(cursoAcad.horas || 0))} horas académicas).
          </div>
        `;
        if (btnSubmit) {
          btnSubmit.innerHTML = '<i class="fa-solid fa-certificate me-2"></i> Aprobar Pago y Liberar Certificado';
        }
      }
    }

    // Precarga exclusiva de Fecha de Emisión del Curso (CSV / Configuración del Pago -> Curso Académico).
    // NUNCA se sugiere fecha_pago porque cada estudiante transfiere en fechas distintas.
    const inpFechaEmision = document.getElementById('inputAprobarPagoFechaEmision');
    const inpLugarEmision = document.getElementById('inputAprobarPagoLugarEmision');
    const badgeOrigenFecha = document.getElementById('badgeOrigenFechaAprobarPago');

    let fechaPrecargada = '';
    let textoOrigen = '';
    let claseBadge = 'bg-info-subtle text-dark border';

    if (normalizarFechaIso(pago.fecha_curso)) {
      fechaPrecargada = normalizarFechaIso(pago.fecha_curso);
      textoOrigen = 'Precargada desde CSV / Configuración del Pago';
      claseBadge = 'bg-success-subtle text-success border border-success-subtle';
    } else if (cursoAcad && normalizarFechaIso(cursoAcad.fecha_curso)) {
      fechaPrecargada = normalizarFechaIso(cursoAcad.fecha_curso);
      textoOrigen = 'Tomada del Curso Académico (#cursos)';
      claseBadge = 'bg-primary-subtle text-primary border border-primary-subtle';
    } else {
      fechaPrecargada = '';
      textoOrigen = 'Sin fecha de emisión configurada — Seleccione la fecha del taller';
      claseBadge = 'bg-warning-subtle text-dark border border-warning-subtle';
    }

    if (inpFechaEmision) inpFechaEmision.value = fechaPrecargada;
    if (inpLugarEmision) {
      inpLugarEmision.value = fechaPrecargada ? generarTextoLugar(fechaPrecargada) : '';
      inpLugarEmision.placeholder = 'Se generará automáticamente al elegir la fecha del curso...';
    }
    if (badgeOrigenFecha) {
      badgeOrigenFecha.className = `badge ${claseBadge}`;
      badgeOrigenFecha.textContent = textoOrigen;
    }

    // Reiniciar Tomo y Folio opcionales
    const chkTomoFolio = document.getElementById('checkAprobarPagoTomoFolio');
    const contTomoFolio = document.getElementById('containerAprobarPagoTomoFolio');
    const lblStateTF = document.getElementById('lblStateTomoFolioAprobar');
    const inpTomo = document.getElementById('inputAprobarPagoTomo');
    const inpFolio = document.getElementById('inputAprobarPagoFolio');
    if (chkTomoFolio) chkTomoFolio.checked = false;
    if (contTomoFolio) contTomoFolio.style.display = 'none';
    if (lblStateTF) lblStateTF.textContent = 'Desactivado';
    if (inpTomo) inpTomo.value = '';
    if (inpFolio) inpFolio.value = '';

    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }

  async function confirmarAprobacionPagoModal(e) {
    e.preventDefault();
    if (window.authAdmin && window.authAdmin.isAuditor()) {
      window.utils.showToast('Acceso restringido: Perfil AUDITOR es de solo lectura.', 'warning');
      return;
    }

    const pagoId = document.getElementById('inputAprobarPagoId')?.value;
    const fechaEmision = document.getElementById('inputAprobarPagoFechaEmision')?.value;
    const lugarEmision = document.getElementById('inputAprobarPagoLugarEmision')?.value?.trim() || generarTextoLugar(fechaEmision);
    const usarTomoFolio = document.getElementById('checkAprobarPagoTomoFolio')?.checked;
    const tomo = usarTomoFolio ? (document.getElementById('inputAprobarPagoTomo')?.value?.trim() || '') : '';
    const folio = usarTomoFolio ? (document.getElementById('inputAprobarPagoFolio')?.value?.trim() || '') : '';

    const boxNombre = document.getElementById('boxCorregirNombreAprobar');
    const inpNombreReal = document.getElementById('inputAprobarPagoNombreReal');
    const pago = cachedPagos.find(p => String(p.id) === String(pagoId));
    const usr = pago ? cachedUsuarios.find(u => String(u.id) === String(pago.id_usuario)) : null;

    if (!pagoId || !fechaEmision) {
      window.utils.showToast('Por favor indique la Fecha de Emisión del certificado.', 'warning');
      return;
    }

    let nombreEnviar = '';
    const nombreVisible = boxNombre && boxNombre.style.display !== 'none';
    if (nombreVisible || (usr && isNombreGenericoParticipante(usr.nombre_completo))) {
      const valNom = (inpNombreReal?.value || '').replace(/\s+/g, ' ').trim().toUpperCase();
      if (!valNom || isNombreGenericoParticipante(valNom)) {
        window.utils.showToast('Debe ingresar el nombre completo real del participante (no puede ser "PARTICIPANTE ...").', 'danger');
        if (boxNombre) boxNombre.style.display = 'block';
        if (inpNombreReal) inpNombreReal.focus();
        return;
      }
      nombreEnviar = valNom;
    }

    const btn = document.getElementById('btnSubmitAprobarPagoCertificado');
    const oldHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-2"></i>Procesando aprobación y certificado...';
    }

    try {
      if (window.utils && window.utils.showLoading) {
        window.utils.showLoading(45, 'Aprobando pago y liberando certificado...', 'Actualizando base de datos Turso');
      }

      const opciones = {
        fecha_curso: fechaEmision,
        lugar: lugarEmision,
        tomo,
        folio
      };
      if (nombreEnviar) {
        opciones.nombre_completo = nombreEnviar;
      }

      const res = await window.api.aprobarPago(pagoId, opciones);
      if (res && res.status === 'success') {
        const modalEl = document.getElementById('modalAprobarPagoCertificado');
        if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).hide();

        if (res.sinCursoVinculado) {
          window.utils.showToast(res.warning || res.message, 'warning');
        } else if (res.certificadoEmitido && res.certificado) {
          window.utils.showToast(`Pago aprobado y certificado ${res.certificado.codigo} liberado automáticamente para ${res.usuarioNombre}.`, 'success');
        } else {
          window.utils.showToast(res.message || 'Pago aprobado exitosamente.', 'info');
        }

        await cargarTablaPagos();
        sincronizarModulosRelacionados();
      } else if (res && res.code === 'NOMBRE_GENERICO') {
        if (boxNombre) boxNombre.style.display = 'block';
        const alertaGen = document.getElementById('alertaNombreGenericoAprobar');
        if (alertaGen) alertaGen.style.display = 'block';
        if (inpNombreReal) inpNombreReal.focus();
        window.utils.showToast(res.message || 'Debe ingresar el nombre completo real del participante.', 'danger');
      } else {
        window.utils.showToast('Error al aprobar el pago: ' + (res?.message || 'Error desconocido'), 'danger');
      }
    } catch (err) {
      console.error('Error aprobando pago con certificado:', err);
      window.utils.showToast('Error de conexión al aprobar el pago: ' + err.message, 'danger');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = oldHtml;
      }
      if (window.utils && window.utils.hideLoading) window.utils.hideLoading();
    }
  }
  async function revertirPago(pagoId) {
    if (window.authAdmin && window.authAdmin.isAuditor()) {
      window.utils.showToast('Acceso restringido: Perfil AUDITOR es de solo lectura.', 'warning');
      return;
    }

    const pago = cachedPagos.find(p => String(p.id) === String(pagoId));
    const usr = pago ? (cachedUsuarios.find(u => String(u.id) === String(pago.id_usuario)) || {}) : {};
    const ofr = pago ? resolverOferta(pago.id_curso_ofertado) : null;
    const cursoAcad = resolverCursoAcademicoDeOferta(ofr);
    const certEmitido = (cursoAcad && pago)
      ? cachedCertificados.find(c => String(c.usuario_id) === String(pago.id_usuario) && String(c.curso_id) === String(cursoAcad.id))
      : null;

    const detalleSubtexto = certEmitido
      ? `Atención: Se anulará automáticamente el certificado emitido (${certEmitido.codigo}) de ${usr.nombre_completo || 'este participante'} y quedará constancia en la bitácora de certificados_eliminados.`
      : 'El pago volverá a estado PENDIENTE y si posee un certificado asociado a este pago será anulado en certificados_eliminados.';

    window.utils.showConfirm({
      title: 'Revertir Pago Aprobado a Pendiente',
      message: `¿Está seguro de revertir el pago de ${usr.nombre_completo || 'este participante'} a estado PENDIENTE?`,
      subtext: detalleSubtexto,
      confirmText: 'Sí, Revertir Pago y Anular Certificado',
      confirmClass: 'btn-warning',
      onConfirm: async () => {
        try {
          if (window.utils && window.utils.showLoading) {
            window.utils.showLoading(40, 'Revirtiendo pago...', 'Actualizando estado y auditando certificado');
          }

          const res = await window.api.revertirPago(pagoId, { eliminarPago: false });
          if (res && res.status === 'success') {
            window.utils.showToast(res.message || 'Pago revertido a PENDIENTE.', 'info');
            await cargarTablaPagos();
            sincronizarModulosRelacionados();
          } else {
            window.utils.showToast('Error al revertir pago: ' + (res?.message || 'Error desconocido'), 'danger');
          }
        } catch (e) {
          console.error('Error al revertir pago:', e);
          window.utils.showToast('Error al actualizar estatus del pago', 'danger');
        } finally {
          if (window.utils && window.utils.hideLoading) window.utils.hideLoading();
        }
      }
    });
  }

  // ═════════════════════════════════════════════════════════════════
  // MODAL CREAR / EDITAR PAGO MANUAL (CRUD) Y BUSCADOR DE USUARIOS
  // ═════════════════════════════════════════════════════════════════

  function normalizarTextoBusquedaUsuario(str) {
    return String(str || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .trim();
  }

  function obtenerUsuariosFiltradosPago(termino = '') {
    const queryNorm = normalizarTextoBusquedaUsuario(termino);
    if (!queryNorm) return cachedUsuarios;

    const tokens = queryNorm.split(/\s+/).filter(Boolean);
    return cachedUsuarios.filter(u => {
      const cedulaNorm = normalizarTextoBusquedaUsuario(u.cedula);
      const cedulaSinGuion = cedulaNorm.replace(/[^A-Z0-9]/g, '');
      const soloDigitos = cedulaNorm.replace(/\D/g, '');
      const nombreNorm = normalizarTextoBusquedaUsuario(u.nombre_completo);
      const textoIndexado = `${cedulaNorm} ${cedulaSinGuion} ${soloDigitos} ${nombreNorm}`;

      return tokens.every(token => {
        const tokenLimpio = token.replace(/[.-]/g, '');
        return textoIndexado.includes(token) || (tokenLimpio && textoIndexado.includes(tokenLimpio));
      });
    });
  }

  function filtrarUsuariosPagoManual(termino = '', mostrarDropdown = false) {
    const selUsuario = document.getElementById('inputPagoUsuarioId');
    const dropdown = document.getElementById('dropdownSugerenciasUsuarioPago');
    const btnLimpiar = document.getElementById('btnLimpiarBusquedaUsuarioPago');
    const lblContador = document.getElementById('lblContadorUsuariosPago');

    const queryTrim = String(termino || '').trim();
    if (btnLimpiar) {
      btnLimpiar.style.display = queryTrim.length > 0 ? 'inline-block' : 'none';
    }

    const filtrados = obtenerUsuariosFiltradosPago(queryTrim);
    const valorPrevio = selUsuario ? selUsuario.value : '';

    if (selUsuario) {
      if (filtrados.length === 0) {
        selUsuario.innerHTML = `<option value="">-- Sin coincidencias para "${window.utils.escapeHtml(queryTrim)}" --</option>`;
      } else {
        const placeholderText = queryTrim.length > 0
          ? `-- Resultados encontrados (${filtrados.length}) --`
          : `-- Seleccionar Participante (${filtrados.length}) --`;

        selUsuario.innerHTML = `<option value="">${placeholderText}</option>` +
          filtrados.map(u => `<option value="${u.id}">${window.utils.escapeHtml(u.cedula)} - ${window.utils.escapeHtml(u.nombre_completo)}</option>`).join('');

        if (filtrados.length === 1 && queryTrim.length > 0) {
          selUsuario.value = String(filtrados[0].id);
        } else if (valorPrevio && filtrados.some(u => String(u.id) === String(valorPrevio))) {
          selUsuario.value = String(valorPrevio);
        }
      }
    }

    if (lblContador) {
      if (queryTrim.length > 0) {
        lblContador.innerHTML = `${filtrados.length} de ${cachedUsuarios.length} encontrados`;
      } else {
        lblContador.innerHTML = `${cachedUsuarios.length} participantes`;
      }
    }

    if (dropdown) {
      if (mostrarDropdown && queryTrim.length > 0) {
        if (filtrados.length === 0) {
          dropdown.innerHTML = `
            <div class="list-group-item text-muted small text-center py-3">
              <i class="fa-solid fa-magnifying-glass me-1"></i>No se encontraron participantes con "<strong>${window.utils.escapeHtml(queryTrim)}</strong>"
            </div>
          `;
        } else {
          dropdown.innerHTML = filtrados.slice(0, 40).map(u => `
            <button type="button" class="list-group-item list-group-item-action py-2 px-3 d-flex justify-content-between align-items-center item-sugerencia-usuario-pago" data-user-id="${window.utils.escapeHtml(u.id)}">
              <div class="text-truncate me-2">
                <i class="fa-solid fa-user-check text-success me-2 small"></i>
                <span class="fw-semibold text-dark small">${window.utils.escapeHtml(u.nombre_completo)}</span>
              </div>
              <span class="badge bg-light text-dark border font-monospace">${window.utils.escapeHtml(u.cedula)}</span>
            </button>
          `).join('');
        }
        dropdown.style.display = 'block';
      } else {
        dropdown.style.display = 'none';
      }
    }
  }

  async function seleccionarUsuarioPagoManual(userId) {
    if (!userId) {
      actualizarBoxInfoParticipante(null);
      return;
    }

    let u = cachedUsuarios.find(x => String(x.id) === String(userId));
    if (!u) {
      try {
        const resU = await window.api.getById('usuarios', userId);
        if (resU && resU.status === 'success' && resU.data) {
          u = resU.data;
          if (!cachedUsuarios.some(x => String(x.id) === String(u.id))) {
            cachedUsuarios.push(u);
          }
        }
      } catch (e) {
        console.warn('Error resolviendo usuario por ID:', e);
      }
    }

    if (!u) {
      actualizarBoxInfoParticipante(null);
      return;
    }

    const selUsuario = document.getElementById('inputPagoUsuarioId');
    const inputBuscar = document.getElementById('inputBuscarUsuarioPagoManual');
    const dropdown = document.getElementById('dropdownSugerenciasUsuarioPago');
    const btnLimpiar = document.getElementById('btnLimpiarBusquedaUsuarioPago');
    const lblContador = document.getElementById('lblContadorUsuariosPago');

    // Poblar lista completa garantizando que el usuario quede seleccionado en el desplegable
    if (selUsuario) {
      let opt = Array.from(selUsuario.options).find(o => String(o.value) === String(u.id));
      if (!opt) {
        selUsuario.innerHTML = `<option value="">-- Seleccionar Participante (${cachedUsuarios.length}) --</option>` +
          cachedUsuarios.map(usr => `<option value="${usr.id}">${window.utils.escapeHtml(usr.cedula)} - ${window.utils.escapeHtml(usr.nombre_completo)}</option>`).join('');
      }
      selUsuario.value = String(u.id);
    }

    if (inputBuscar) {
      inputBuscar.value = `${u.cedula} - ${u.nombre_completo}`;
    }
    if (btnLimpiar) {
      btnLimpiar.style.display = 'inline-block';
    }
    if (dropdown) {
      dropdown.style.display = 'none';
    }
    if (lblContador) {
      lblContador.innerHTML = '<i class="fa-solid fa-circle-check me-1"></i>Participante seleccionado';
    }

    actualizarBoxInfoParticipante(u.id);
  }

  async function abrirModalPago(pagoId = null) {
    if (window.authAdmin && window.authAdmin.isAuditor()) {
      window.utils.showToast('Acceso restringido: Perfil AUDITOR es de solo lectura.', 'warning');
      return;
    }

    pagoEditandoId = pagoId;
    const modalEl = document.getElementById('modalPagoManual');
    const form = document.getElementById('formPagoManual');
    if (!modalEl || !form) return;

    form.reset();

    // Ocultar paneles de información al reiniciar
    actualizarBoxInfoParticipante(null);
    actualizarBoxInfoTaller(null);

    // Asegurar que las listas maestras estén cargadas
    if (!Array.isArray(cachedUsuarios) || cachedUsuarios.length === 0) {
      try {
        const resU = await window.api.getAll('usuarios');
        if (resU && resU.status === 'success' && Array.isArray(resU.data)) {
          cachedUsuarios = resU.data;
        }
      } catch (e) {
        console.warn('Error cargando usuarios para modal de pago:', e);
      }
    }

    if (!Array.isArray(cachedOfertas) || cachedOfertas.length === 0) {
      try {
        const resO = await window.api.getAll('curso_ofertado');
        if (resO && resO.status === 'success' && Array.isArray(resO.data)) {
          cachedOfertas = resO.data;
        }
      } catch (e) {
        console.warn('Error cargando ofertas para modal de pago:', e);
      }
    }

    if (!Array.isArray(cachedCursos) || cachedCursos.length === 0) {
      try {
        const resC = await window.api.getAll('cursos');
        if (resC && resC.status === 'success' && Array.isArray(resC.data)) {
          cachedCursos = resC.data;
        }
      } catch (e) {
        console.warn('Error cargando cursos académicos para modal de pago:', e);
      }
    }

    if (!Array.isArray(cachedBancos) || cachedBancos.length === 0) {
      try {
        const resB = await window.api.getAll('banco');
        if (resB && resB.status === 'success' && Array.isArray(resB.data)) {
          cachedBancos = resB.data;
        }
      } catch (e) {
        console.warn('Error cargando bancos para modal de pago:', e);
      }
    }

    // Reiniciar buscador y poblar usuarios
    const inputBuscarUsuario = document.getElementById('inputBuscarUsuarioPagoManual');
    if (inputBuscarUsuario) inputBuscarUsuario.value = '';
    filtrarUsuariosPagoManual('', false);

    const selUsuario = document.getElementById('inputPagoUsuarioId');
    const selCurso = document.getElementById('inputPagoCursoOfertadoId');
    const selBanco = document.getElementById('inputPagoBancoOrigen');
    const inpFechaCurso = document.getElementById('inputPagoFechaCurso');
    const inpNombreRealManual = document.getElementById('inputPagoNombreRealManual');
    if (inpFechaCurso) inpFechaCurso.value = '';
    if (inpNombreRealManual) inpNombreRealManual.value = '';

    // Poblar cursos ofertados
    if (selCurso) {
      selCurso.innerHTML = '<option value="">-- Seleccionar Taller --</option>' +
        cachedOfertas.map(o => `<option value="${o.id}">${window.utils.escapeHtml(o.taller)} ($${parseFloat(o.valor_estudiante || 0).toFixed(2)})</option>`).join('');
    }

    // Poblar bancos dinámicamente desde la base de datos
    poblarSelectBancos(selBanco);

    const containerPreview = document.getElementById('containerPreviewCapture');
    const imgPreview = document.getElementById('imgPagoCapturePreview');
    if (containerPreview) containerPreview.style.display = 'none';
    if (imgPreview) imgPreview.src = '';

    const titleEl = document.getElementById('lblModalPagoTitulo');

    if (pagoId) {
      const p = cachedPagos.find(x => String(x.id) === String(pagoId));
      if (!p) {
        window.utils.showToast('No se encontró el registro del pago', 'danger');
        return;
      }

      if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-pen-to-square me-2"></i>Editar Declaración de Pago';
      document.getElementById('inputPagoId').value = p.id;
      document.getElementById('inputPagoCaptureUrl').value = p.capture || '';

      // Precargar fecha_curso del pago antes de actualizarBoxInfoTaller
      if (inpFechaCurso) {
        inpFechaCurso.value = normalizarFechaIso(p.fecha_curso);
      }

      // 1. Cargar y seleccionar el participante
      if (p.id_usuario) {
        await seleccionarUsuarioPagoManual(p.id_usuario);
      } else if (selUsuario) {
        selUsuario.value = '';
        actualizarBoxInfoParticipante(null);
      }

      // 2. Cargar y seleccionar el taller ofertado
      const ofr = resolverOferta(p.id_curso_ofertado);
      if (selCurso) {
        if (ofr) {
          selCurso.value = String(ofr.id);
        } else if (p.id_curso_ofertado) {
          const rawCursoId = normalizeCursoOfertadoId(p.id_curso_ofertado);
          let matchOpt = Array.from(selCurso.options).find(o => String(o.value) === rawCursoId);
          if (matchOpt) {
            selCurso.value = rawCursoId;
          } else if (rawCursoId) {
            const newOpt = document.createElement('option');
            newOpt.value = rawCursoId;
            newOpt.textContent = `Taller ID ${rawCursoId}`;
            newOpt.selected = true;
            selCurso.appendChild(newOpt);
            selCurso.value = rawCursoId;
          }
        }
        actualizarBoxInfoTaller(selCurso.value);
      }

      // 3. Cargar y seleccionar el banco de origen declarado por el usuario
      if (selBanco && p.banco_origen) {
        seleccionarBancoEnSelect(selBanco, p.banco_origen);
      }

      // 4. Cargar monto, referencia y fecha
      document.getElementById('inputPagoMonto').value = p.monto || '';
      document.getElementById('inputPagoReferencia').value = p.numero_transferencia || '';
      document.getElementById('inputPagoFecha').value = p.fecha_pago ? p.fecha_pago.split('T')[0] : '';

      // 5. Estatus
      const isAprobado = isPagoVerificado(p.status);
      document.getElementById('inputPagoStatus').value = isAprobado ? 'true' : 'false';

      // 6. Capture de comprobante
      if (p.capture && imgPreview && containerPreview) {
        imgPreview.src = p.capture;
        containerPreview.style.display = 'block';
      }
    } else {
      if (titleEl) titleEl.innerHTML = '<i class="fa-solid fa-plus-circle me-2"></i>Registrar Pago Manual';
      document.getElementById('inputPagoId').value = '';
      document.getElementById('inputPagoCaptureUrl').value = '';
      document.getElementById('inputPagoFecha').value = new Date().toISOString().split('T')[0];
      if (inpFechaCurso) inpFechaCurso.value = '';
      document.getElementById('inputPagoStatus').value = 'true'; // Por defecto los pagos manuales en administración se registran como confirmados
      actualizarBoxInfoParticipante(null);
      actualizarBoxInfoTaller(null);
    }

    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }

  async function guardarPagoManual(e) {
    e.preventDefault();

    if (window.authAdmin && window.authAdmin.isAuditor()) {
      window.utils.showToast('Acceso restringido: Perfil AUDITOR es de solo lectura.', 'warning');
      return;
    }

    const id = document.getElementById('inputPagoId').value;
    const id_usuario = document.getElementById('inputPagoUsuarioId').value;
    const id_curso_ofertado = document.getElementById('inputPagoCursoOfertadoId').value;
    const banco_origen = document.getElementById('inputPagoBancoOrigen').value;
    const monto = parseFloat(document.getElementById('inputPagoMonto').value) || 0;
    const numero_transferencia = document.getElementById('inputPagoReferencia').value.trim();
    const fecha_pago = document.getElementById('inputPagoFecha').value || new Date().toISOString().split('T')[0];
    const fecha_curso = normalizarFechaIso(document.getElementById('inputPagoFechaCurso')?.value || '');
    const nombreRealManual = String(document.getElementById('inputPagoNombreRealManual')?.value || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
    const statusVal = document.getElementById('inputPagoStatus').value === 'true';
    let captureUrl = document.getElementById('inputPagoCaptureUrl').value.trim();

    if (!id_usuario || !id_curso_ofertado || monto <= 0 || !numero_transferencia) {
      window.utils.showToast('Por favor complete todos los campos obligatorios del pago', 'warning');
      return;
    }

    const usrSeleccionado = cachedUsuarios.find(u => String(u.id) === String(id_usuario));
    if (statusVal && usrSeleccionado && isNombreGenericoParticipante(usrSeleccionado.nombre_completo)) {
      if (!nombreRealManual || isNombreGenericoParticipante(nombreRealManual)) {
        window.utils.showToast('El participante tiene nombre genérico (PARTICIPANTE ...). Ingrese su nombre completo real para aprobar y emitir el certificado.', 'danger');
        const boxGen = document.getElementById('boxCorregirNombreGenericoManual');
        const inpGen = document.getElementById('inputPagoNombreRealManual');
        if (boxGen) boxGen.style.display = 'block';
        if (inpGen) inpGen.focus();
        return;
      }
    }

    const ofrManual = resolverOferta(id_curso_ofertado);
    const cursoAcadManual = resolverCursoAcademicoDeOferta(ofrManual);
    const prevPagoRef = id ? cachedPagos.find(x => String(x.id) === String(id)) : null;
    const fechaCursoEfectiva = fecha_curso ||
      normalizarFechaIso(prevPagoRef?.fecha_curso) ||
      normalizarFechaIso(cursoAcadManual?.fecha_curso) ||
      '';

    if (statusVal && !fechaCursoEfectiva) {
      window.utils.showToast('Indique la Fecha del Curso / Emisión del Certificado para guardar como Aprobado (no se usa la fecha de transferencia).', 'warning');
      const inpFC = document.getElementById('inputPagoFechaCurso');
      if (inpFC) inpFC.focus();
      return;
    }

    const fileInput = document.getElementById('inputPagoCaptureFile');
    const file = fileInput ? fileInput.files[0] : null;

    if (window.utils && window.utils.showLoading) {
      window.utils.showLoading(20, 'Guardando pago...', 'Procesando información');
    }

    try {
      if (file) {
        if (window.utils && window.utils.showLoading) {
          window.utils.showLoading(50, 'Subiendo comprobante a Cloudflare R2...', 'Guardando en directorio /img/pagos');
        }

        const compressedBase64 = await window.utils.compressImage(file, 900, 900, 0.8);
        const filename = `capture_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9\._-]/g, '')}`;

        // Subida organizada a Cloudflare R2 en el directorio /img/pagos
        const uploadRes = await window.api.uploadImage(compressedBase64, filename, 'pagos');
        if (uploadRes && uploadRes.status === 'success' && uploadRes.url) {
          captureUrl = uploadRes.url;
        } else {
          console.warn('Advertencia en subida de capture:', uploadRes);
        }
      }

      const cursoIdNormalizado = normalizeCursoOfertadoId(id_curso_ofertado);

      // Si el pago queda PENDIENTE pero se suministró corrección de nombre genérico, reparar ficha del usuario
      if (!statusVal && nombreRealManual && !isNombreGenericoParticipante(nombreRealManual) && usrSeleccionado && isNombreGenericoParticipante(usrSeleccionado.nombre_completo)) {
        await window.api.update('usuarios', id_usuario, { nombre_completo: nombreRealManual });
      }

      if (id) {
        const prevPago = cachedPagos.find(x => String(x.id) === String(id));
        const wasAprobado = prevPago ? isPagoVerificado(prevPago.status) : false;

        const basePayload = {
          id_usuario,
          id_curso_ofertado: cursoIdNormalizado,
          banco_origen,
          monto,
          numero_transferencia,
          fecha_pago,
          fecha_curso,
          capture: captureUrl,
          status: wasAprobado ? 'APROBADO' : 'PENDIENTE'
        };

        await window.api.update('pagos', id, basePayload);

        if (statusVal) {
          const opcionesAprob = {
            fecha_curso: fechaCursoEfectiva,
            lugar: generarTextoLugar(fechaCursoEfectiva)
          };
          if (nombreRealManual && !isNombreGenericoParticipante(nombreRealManual)) {
            opcionesAprob.nombre_completo = nombreRealManual;
          }
          const resAprob = await window.api.aprobarPago(id, opcionesAprob);
          if (!resAprob || resAprob.status !== 'success') {
            window.utils.showToast('Error al aprobar el pago: ' + (resAprob?.message || 'Verifique los datos del participante'), 'danger');
            return;
          }
          window.utils.showToast(
            resAprob.sinCursoVinculado ? (resAprob.warning || resAprob.message) : (resAprob.message || 'Declaración de pago actualizada y aprobada exitosamente'),
            resAprob.sinCursoVinculado ? 'warning' : 'success'
          );
        } else if (wasAprobado && !statusVal) {
          const resRev = await window.api.revertirPago(id, {
            eliminarPago: false,
            motivo: 'Cambio de estatus a PENDIENTE en edición manual de pago'
          });
          window.utils.showToast(resRev?.message || 'Pago cambiado a PENDIENTE y certificado anulado.', 'info');
        } else {
          window.utils.showToast('Declaración de pago actualizada exitosamente', 'success');
        }
      } else {
        const nuevoId = window.utils.generateUUID();
        const payload = {
          id: nuevoId,
          id_usuario,
          id_curso_ofertado: cursoIdNormalizado,
          banco_origen,
          monto,
          numero_transferencia,
          fecha_pago,
          fecha_curso,
          capture: captureUrl,
          status: 'PENDIENTE',
          created_at: new Date().toISOString()
        };

        await window.api.create('pagos', payload);

        if (statusVal) {
          const opcionesAprob = {
            fecha_curso: fechaCursoEfectiva,
            lugar: generarTextoLugar(fechaCursoEfectiva)
          };
          if (nombreRealManual && !isNombreGenericoParticipante(nombreRealManual)) {
            opcionesAprob.nombre_completo = nombreRealManual;
          }
          const resAprob = await window.api.aprobarPago(nuevoId, opcionesAprob);
          if (!resAprob || resAprob.status !== 'success') {
            window.utils.showToast('Pago guardado como PENDIENTE, pero no se pudo aprobar: ' + (resAprob?.message || 'Error'), 'warning');
          } else {
            window.utils.showToast(
              resAprob.sinCursoVinculado ? (resAprob.warning || resAprob.message) : (resAprob.message || 'Pago registrado, aprobado y certificado liberado exitosamente'),
              resAprob.sinCursoVinculado ? 'warning' : 'success'
            );
          }
        } else {
          window.utils.showToast('Pago registrado en estado PENDIENTE exitosamente', 'success');
        }
      }

      const modalEl = document.getElementById('modalPagoManual');
      const inst = bootstrap.Modal.getInstance(modalEl);
      if (inst) inst.hide();

      await cargarTablaPagos();
      sincronizarModulosRelacionados();
    } catch (err) {
      console.error('Error guardando pago manual:', err);
      window.utils.showToast('Error al guardar el pago: ' + err.message, 'danger');
    } finally {
      if (window.utils && window.utils.hideLoading) window.utils.hideLoading();
    }
  }

  function eliminarPago(id) {
    if (window.authAdmin && window.authAdmin.isAuditor()) {
      window.utils.showToast('Acceso restringido: Perfil AUDITOR es de solo lectura.', 'warning');
      return;
    }

    const pago = cachedPagos.find(p => String(p.id) === String(id));
    const esAprobado = pago ? isPagoVerificado(pago.status) : false;
    const usr = pago ? (cachedUsuarios.find(u => String(u.id) === String(pago.id_usuario)) || {}) : {};
    const ofr = pago ? resolverOferta(pago.id_curso_ofertado) : null;
    const cursoAcad = resolverCursoAcademicoDeOferta(ofr);
    const certEmitido = (esAprobado && cursoAcad && pago)
      ? cachedCertificados.find(c => String(c.usuario_id) === String(pago.id_usuario) && String(c.curso_id) === String(cursoAcad.id))
      : null;

    const subtextoConfirm = esAprobado
      ? (certEmitido
          ? `Atención: Este pago está APROBADO. Al eliminarlo se anulará automáticamente el certificado emitido (${certEmitido.codigo}) de ${usr.nombre_completo || 'este participante'}, dejando constancia en certificados_eliminados.`
          : 'Atención: Este pago está APROBADO. Si generó un certificado asociado a este curso, será anulado automáticamente dejando constancia en certificados_eliminados.')
      : 'Esta acción eliminará únicamente la declaración de pago pendiente y no se puede deshacer.';

    window.utils.showConfirm({
      title: esAprobado ? 'Eliminar Pago Aprobado y Anular Certificado' : 'Eliminar Declaración de Pago',
      message: '¿Está seguro de que desea eliminar permanentemente este registro de pago?',
      subtext: subtextoConfirm,
      confirmText: esAprobado ? 'Sí, Eliminar Pago y Anular Certificado' : 'Sí, Eliminar',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        try {
          if (window.utils && window.utils.showLoading) {
            window.utils.showLoading(30, 'Eliminando pago...', 'Espere un momento');
          }
          if (esAprobado) {
            const res = await window.api.revertirPago(id, {
              eliminarPago: true,
              motivo: 'Eliminación de registro de pago aprobado desde administración'
            });
            window.utils.showToast(res?.message || 'Pago aprobado eliminado y certificado anulado', 'success');
            await cargarTablaPagos();
            sincronizarModulosRelacionados();
          } else {
            await window.api.delete('pagos', id);
            window.utils.showToast('Declaración de pago eliminada', 'success');
            await cargarTablaPagos();
          }
        } catch (e) {
          window.utils.showToast('Error al eliminar pago: ' + e.message, 'danger');
        } finally {
          if (window.utils && window.utils.hideLoading) window.utils.hideLoading();
        }
      }
    });
  }

  // ═════════════════════════════════════════════════════════════════
  // FUNCIONES DE EVENTOS Y VISTA PREVIA
  // ═════════════════════════════════════════════════════════════════

  function initEventListeners() {
    const btnNuevoOferta = document.getElementById('btnNuevaOfertaCurso');
    if (btnNuevoOferta && !btnNuevoOferta.dataset.bound) {
      btnNuevoOferta.dataset.bound = 'true';
      btnNuevoOferta.addEventListener('click', abrirModalNuevaOferta);
    }

    const formOferta = document.getElementById('formOfertaCurso');
    if (formOferta && !formOferta.dataset.bound) {
      formOferta.dataset.bound = 'true';
      formOferta.addEventListener('submit', guardarOfertaCurso);
    }

    const fileInputFlayer = document.getElementById('inputOfertaFlayerFile');
    if (fileInputFlayer && !fileInputFlayer.dataset.bound) {
      fileInputFlayer.dataset.bound = 'true';
      fileInputFlayer.addEventListener('change', previewFlayerFile);
    }

    // Eventos de Pagos
    const btnNuevoPago = document.getElementById('btnNuevoPagoManual');
    if (btnNuevoPago && !btnNuevoPago.dataset.bound) {
      btnNuevoPago.dataset.bound = 'true';
      btnNuevoPago.addEventListener('click', () => abrirModalPago());
    }

    const btnCargaMasiva = document.getElementById('btnCargaMasivaPagos');
    if (btnCargaMasiva && !btnCargaMasiva.dataset.bound) {
      btnCargaMasiva.dataset.bound = 'true';
      btnCargaMasiva.addEventListener('click', () => abrirModalCargaMasivaPagos());
    }

    const fileCsvPagos = document.getElementById('fileCsvPagos');
    if (fileCsvPagos && !fileCsvPagos.dataset.bound) {
      fileCsvPagos.dataset.bound = 'true';
      fileCsvPagos.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
          const txtArea = document.getElementById('textareaCargaMasivaPagos');
          if (txtArea) txtArea.value = evt.target.result;
          procesarTextoPagosMasivos();
        };
        reader.readAsText(file);
      });
    }

    const txtCargaMasiva = document.getElementById('textareaCargaMasivaPagos');
    if (txtCargaMasiva && !txtCargaMasiva.dataset.bound) {
      txtCargaMasiva.dataset.bound = 'true';
      txtCargaMasiva.addEventListener('input', () => procesarTextoPagosMasivos());
    }

    const selCursoDefaultMasivo = document.getElementById('selectCursoDefaultPagosMasivos');
    if (selCursoDefaultMasivo && !selCursoDefaultMasivo.dataset.bound) {
      selCursoDefaultMasivo.dataset.bound = 'true';
      selCursoDefaultMasivo.addEventListener('change', () => procesarTextoPagosMasivos());
    }

    const inpFechaDefaultMasivo = document.getElementById('inputFechaCursoDefaultPagosMasivos');
    if (inpFechaDefaultMasivo && !inpFechaDefaultMasivo.dataset.bound) {
      inpFechaDefaultMasivo.dataset.bound = 'true';
      inpFechaDefaultMasivo.addEventListener('change', () => procesarTextoPagosMasivos());
      inpFechaDefaultMasivo.addEventListener('input', () => procesarTextoPagosMasivos());
    }

    const formAprobarCert = document.getElementById('formAprobarPagoCertificado');
    if (formAprobarCert && !formAprobarCert.dataset.bound) {
      formAprobarCert.dataset.bound = 'true';
      formAprobarCert.addEventListener('submit', confirmarAprobacionPagoModal);
    }

    const inpAprobarFechaEmision = document.getElementById('inputAprobarPagoFechaEmision');
    if (inpAprobarFechaEmision && !inpAprobarFechaEmision.dataset.bound) {
      inpAprobarFechaEmision.dataset.bound = 'true';
      inpAprobarFechaEmision.addEventListener('change', (e) => {
        const inpLugar = document.getElementById('inputAprobarPagoLugarEmision');
        if (inpLugar) {
          inpLugar.value = generarTextoLugar(e.target.value);
        }
      });
    }

    const chkTomoFolioAprobar = document.getElementById('checkAprobarPagoTomoFolio');
    if (chkTomoFolioAprobar && !chkTomoFolioAprobar.dataset.bound) {
      chkTomoFolioAprobar.dataset.bound = 'true';
      chkTomoFolioAprobar.addEventListener('change', (e) => {
        const cont = document.getElementById('containerAprobarPagoTomoFolio');
        const lblState = document.getElementById('lblStateTomoFolioAprobar');
        if (cont) cont.style.display = e.target.checked ? 'flex' : 'none';
        if (lblState) lblState.textContent = e.target.checked ? 'Activado' : 'Desactivado';
        if (!e.target.checked) {
          const inpTomo = document.getElementById('inputAprobarPagoTomo');
          const inpFolio = document.getElementById('inputAprobarPagoFolio');
          if (inpTomo) inpTomo.value = '';
          if (inpFolio) inpFolio.value = '';
        }
      });
    }

    const btnToggleNombreAprobar = document.getElementById('btnToggleCorregirNombreAprobar');
    if (btnToggleNombreAprobar && !btnToggleNombreAprobar.dataset.bound) {
      btnToggleNombreAprobar.dataset.bound = 'true';
      btnToggleNombreAprobar.addEventListener('click', () => {
        const boxNombre = document.getElementById('boxCorregirNombreAprobar');
        const inpNombreReal = document.getElementById('inputAprobarPagoNombreReal');
        if (!boxNombre) return;
        const mostrar = boxNombre.style.display === 'none';
        boxNombre.style.display = mostrar ? 'block' : 'none';
        if (mostrar && inpNombreReal) {
          inpNombreReal.focus();
          inpNombreReal.select();
        }
      });
    }

    const btnPlantillaCsv = document.getElementById('btnDescargarPlantillaCsvPagos');
    if (btnPlantillaCsv && !btnPlantillaCsv.dataset.bound) {
      btnPlantillaCsv.dataset.bound = 'true';
      btnPlantillaCsv.addEventListener('click', () => descargarPlantillaCsvPagos());
    }

    const btnConfirmarMasivo = document.getElementById('btnConfirmarCargaMasivaPagos');
    if (btnConfirmarMasivo && !btnConfirmarMasivo.dataset.bound) {
      btnConfirmarMasivo.dataset.bound = 'true';
      btnConfirmarMasivo.addEventListener('click', () => ejecutarCargaMasivaPagos());
    }

    const btnExportarPendientes = document.getElementById('btnExportarPagosPendientesCsv');
    if (btnExportarPendientes && !btnExportarPendientes.dataset.bound) {
      btnExportarPendientes.dataset.bound = 'true';
      btnExportarPendientes.addEventListener('click', () => exportarPagosPendientesCsv());
    }

    const btnRefrescar = document.getElementById('btnRefrescarPagos');
    if (btnRefrescar && !btnRefrescar.dataset.bound) {
      btnRefrescar.dataset.bound = 'true';
      btnRefrescar.addEventListener('click', async () => {
        if (window.api && typeof window.api.refreshData === 'function') {
          try { await window.api.refreshData(); } catch (e) {}
        }
        await cargarTablaPagos();
      });
    }

    const inputBuscar = document.getElementById('inputBuscarPago');
    if (inputBuscar && !inputBuscar.dataset.bound) {
      inputBuscar.dataset.bound = 'true';
      inputBuscar.addEventListener('input', () => renderTablaPagosFiltrada());
    }

    const selectFiltro = document.getElementById('selectFiltroEstatusPago');
    if (selectFiltro && !selectFiltro.dataset.bound) {
      selectFiltro.dataset.bound = 'true';
      selectFiltro.addEventListener('change', () => renderTablaPagosFiltrada());
    }

    const selectFiltroCurso = document.getElementById('selectFiltroCursoPago');
    if (selectFiltroCurso && !selectFiltroCurso.dataset.bound) {
      selectFiltroCurso.dataset.bound = 'true';
      selectFiltroCurso.addEventListener('change', () => renderTablaPagosFiltrada());
    }

    const chkTodosPagos = document.getElementById('checkSeleccionarTodosPagos');
    if (chkTodosPagos && !chkTodosPagos.dataset.bound) {
      chkTodosPagos.dataset.bound = 'true';
      chkTodosPagos.addEventListener('change', (e) => {
        toggleSeleccionarTodosFiltrados(Boolean(e.target.checked));
      });
    }

    const tbodyPagosEl = document.getElementById('tbodyPagosAdministracion');
    if (tbodyPagosEl && !tbodyPagosEl.dataset.boundSelection) {
      tbodyPagosEl.dataset.boundSelection = 'true';
      tbodyPagosEl.addEventListener('change', (e) => {
        const chk = e.target.closest('.check-pago-seleccion');
        if (!chk) return;
        const pagoId = chk.dataset.pagoId;
        const tr = chk.closest('tr');
        if (tr) tr.classList.toggle('table-primary', Boolean(chk.checked));
        toggleSeleccionPago(pagoId, Boolean(chk.checked));
      });
    }

    const btnAbrirConfigLote = document.getElementById('btnAbrirConfigurarFechaLote');
    if (btnAbrirConfigLote && !btnAbrirConfigLote.dataset.bound) {
      btnAbrirConfigLote.dataset.bound = 'true';
      btnAbrirConfigLote.addEventListener('click', () => abrirModalConfigurarFechaEmision());
    }

    const btnConfigDesdeBarra = document.getElementById('btnConfigurarFechaDesdeBarra');
    if (btnConfigDesdeBarra && !btnConfigDesdeBarra.dataset.bound) {
      btnConfigDesdeBarra.dataset.bound = 'true';
      btnConfigDesdeBarra.addEventListener('click', () => abrirModalConfigurarFechaEmision());
    }

    const btnSelFiltrados = document.getElementById('btnSeleccionarTodosFiltradosPagos');
    if (btnSelFiltrados && !btnSelFiltrados.dataset.bound) {
      btnSelFiltrados.dataset.bound = 'true';
      btnSelFiltrados.addEventListener('click', () => seleccionarTodosFiltradosPagos());
    }

    const btnLimpiarSel = document.getElementById('btnLimpiarSeleccionPagos');
    if (btnLimpiarSel && !btnLimpiarSel.dataset.bound) {
      btnLimpiarSel.dataset.bound = 'true';
      btnLimpiarSel.addEventListener('click', () => limpiarSeleccionPagos());
    }

    const formConfigLote = document.getElementById('formConfigurarFechaEmisionPagos');
    if (formConfigLote && !formConfigLote.dataset.bound) {
      formConfigLote.dataset.bound = 'true';
      formConfigLote.addEventListener('submit', guardarConfiguracionFechaEmisionLote);
    }

    const inpConfigLoteFecha = document.getElementById('inputConfigLoteFechaEmision');
    if (inpConfigLoteFecha && !inpConfigLoteFecha.dataset.bound) {
      inpConfigLoteFecha.dataset.bound = 'true';
      const syncPreviewLugar = (e) => {
        const inpLugar = document.getElementById('inputConfigLoteLugarPreview');
        if (inpLugar && e.target.value) {
          inpLugar.value = generarTextoLugar(e.target.value);
        }
      };
      inpConfigLoteFecha.addEventListener('change', syncPreviewLugar);
      inpConfigLoteFecha.addEventListener('input', syncPreviewLugar);
    }

    const btnAprobarToolbar = document.getElementById('btnAprobarSeleccionadosToolbar');
    if (btnAprobarToolbar && !btnAprobarToolbar.dataset.bound) {
      btnAprobarToolbar.dataset.bound = 'true';
      btnAprobarToolbar.addEventListener('click', () => abrirModalAprobarPagosLote());
    }

    const btnAprobarBarra = document.getElementById('btnAprobarSeleccionadosBarra');
    if (btnAprobarBarra && !btnAprobarBarra.dataset.bound) {
      btnAprobarBarra.dataset.bound = 'true';
      btnAprobarBarra.addEventListener('click', () => abrirModalAprobarPagosLote());
    }

    const btnRevertirBarra = document.getElementById('btnRevertirSeleccionadosBarra');
    if (btnRevertirBarra && !btnRevertirBarra.dataset.bound) {
      btnRevertirBarra.dataset.bound = 'true';
      btnRevertirBarra.addEventListener('click', () => revertirPagosSeleccionados());
    }

    const btnEliminarBarra = document.getElementById('btnEliminarSeleccionadosBarra');
    if (btnEliminarBarra && !btnEliminarBarra.dataset.bound) {
      btnEliminarBarra.dataset.bound = 'true';
      btnEliminarBarra.addEventListener('click', () => eliminarPagosSeleccionados());
    }

    // Eventos específicos para la pestaña de Pagos Aprobados
    const btnRefrescarAprob = document.getElementById('btnRefrescarPagosAprobados');
    if (btnRefrescarAprob && !btnRefrescarAprob.dataset.bound) {
      btnRefrescarAprob.dataset.bound = 'true';
      btnRefrescarAprob.addEventListener('click', async () => {
        if (window.api && typeof window.api.refreshData === 'function') {
          try { await window.api.refreshData(); } catch (e) {}
        }
        await cargarTablaPagos();
      });
    }

    const inputBuscarAprob = document.getElementById('inputBuscarPagoAprobado');
    if (inputBuscarAprob && !inputBuscarAprob.dataset.bound) {
      inputBuscarAprob.dataset.bound = 'true';
      inputBuscarAprob.addEventListener('input', () => renderTablaPagosAprobadosFiltrada());
    }

    const selectFiltroCursoAprob = document.getElementById('selectFiltroCursoPagoAprobado');
    if (selectFiltroCursoAprob && !selectFiltroCursoAprob.dataset.bound) {
      selectFiltroCursoAprob.dataset.bound = 'true';
      selectFiltroCursoAprob.addEventListener('change', () => renderTablaPagosAprobadosFiltrada());
    }

    const btnExportarAprob = document.getElementById('btnExportarPagosAprobadosCsv');
    if (btnExportarAprob && !btnExportarAprob.dataset.bound) {
      btnExportarAprob.dataset.bound = 'true';
      btnExportarAprob.addEventListener('click', () => exportarPagosAprobadosCsv());
    }

    const chkTodosPagosAprob = document.getElementById('checkSeleccionarTodosPagosAprobados');
    if (chkTodosPagosAprob && !chkTodosPagosAprob.dataset.bound) {
      chkTodosPagosAprob.dataset.bound = 'true';
      chkTodosPagosAprob.addEventListener('change', (e) => {
        toggleSeleccionarTodosAprobadosFiltrados(Boolean(e.target.checked));
      });
    }

    const tbodyPagosAprobEl = document.getElementById('tbodyPagosAprobados');
    if (tbodyPagosAprobEl && !tbodyPagosAprobEl.dataset.boundSelection) {
      tbodyPagosAprobEl.dataset.boundSelection = 'true';
      tbodyPagosAprobEl.addEventListener('change', (e) => {
        const chk = e.target.closest('.check-pago-aprobado-seleccion');
        if (!chk) return;
        const pagoId = chk.dataset.pagoId;
        const tr = chk.closest('tr');
        if (tr) tr.classList.toggle('table-success', Boolean(chk.checked));
        toggleSeleccionPagoAprobado(pagoId, Boolean(chk.checked));
      });
    }

    const btnRevToolbarAprob = document.getElementById('btnRevertirSeleccionadosToolbarAprobados');
    if (btnRevToolbarAprob && !btnRevToolbarAprob.dataset.bound) {
      btnRevToolbarAprob.dataset.bound = 'true';
      btnRevToolbarAprob.addEventListener('click', () => revertirPagosSeleccionados(Array.from(pagosAprobadosSeleccionadosIds)));
    }

    const btnConfigToolbarAprob = document.getElementById('btnAbrirConfigurarFechaLoteAprobados');
    if (btnConfigToolbarAprob && !btnConfigToolbarAprob.dataset.bound) {
      btnConfigToolbarAprob.dataset.bound = 'true';
      btnConfigToolbarAprob.addEventListener('click', () => abrirModalConfigurarFechaEmision(Array.from(pagosAprobadosSeleccionadosIds)));
    }

    const btnSelFiltradosAprob = document.getElementById('btnSeleccionarTodosFiltradosPagosAprobados');
    if (btnSelFiltradosAprob && !btnSelFiltradosAprob.dataset.bound) {
      btnSelFiltradosAprob.dataset.bound = 'true';
      btnSelFiltradosAprob.addEventListener('click', () => seleccionarTodosFiltradosPagosAprobados());
    }

    const btnLimpiarSelAprob = document.getElementById('btnLimpiarSeleccionPagosAprobados');
    if (btnLimpiarSelAprob && !btnLimpiarSelAprob.dataset.bound) {
      btnLimpiarSelAprob.dataset.bound = 'true';
      btnLimpiarSelAprob.addEventListener('click', () => limpiarSeleccionPagosAprobados());
    }

    const btnRevBarraAprob = document.getElementById('btnRevertirSeleccionadosBarraAprobados');
    if (btnRevBarraAprob && !btnRevBarraAprob.dataset.bound) {
      btnRevBarraAprob.dataset.bound = 'true';
      btnRevBarraAprob.addEventListener('click', () => revertirPagosSeleccionados(Array.from(pagosAprobadosSeleccionadosIds)));
    }

    const btnConfigDesdeBarraAprob = document.getElementById('btnConfigurarFechaDesdeBarraAprobados');
    if (btnConfigDesdeBarraAprob && !btnConfigDesdeBarraAprob.dataset.bound) {
      btnConfigDesdeBarraAprob.dataset.bound = 'true';
      btnConfigDesdeBarraAprob.addEventListener('click', () => abrirModalConfigurarFechaEmision(Array.from(pagosAprobadosSeleccionadosIds)));
    }

    const btnElimBarraAprob = document.getElementById('btnEliminarSeleccionadosBarraAprobados');
    if (btnElimBarraAprob && !btnElimBarraAprob.dataset.bound) {
      btnElimBarraAprob.dataset.bound = 'true';
      btnElimBarraAprob.addEventListener('click', () => eliminarPagosSeleccionados(Array.from(pagosAprobadosSeleccionadosIds)));
    }

    const tabAprobBtn = document.getElementById('tab-pagos-aprobados-tab');
    if (tabAprobBtn && !tabAprobBtn.dataset.boundTab) {
      tabAprobBtn.dataset.boundTab = 'true';
      tabAprobBtn.addEventListener('shown.bs.tab', () => {
        renderTablaPagosAprobadosFiltrada();
      });
    }

    const tabPendBtn = document.getElementById('tab-pagos-tab');
    if (tabPendBtn && !tabPendBtn.dataset.boundTab) {
      tabPendBtn.dataset.boundTab = 'true';
      tabPendBtn.addEventListener('shown.bs.tab', () => {
        renderTablaPagosFiltrada();
      });
    }

    const formAprobarLote = document.getElementById('formAprobarPagosLote');
    if (formAprobarLote && !formAprobarLote.dataset.bound) {
      formAprobarLote.dataset.bound = 'true';
      formAprobarLote.addEventListener('submit', confirmarAprobacionPagosLote);
    }

    const inpAprobarLoteFecha = document.getElementById('inputAprobarLoteFechaEmision');
    if (inpAprobarLoteFecha && !inpAprobarLoteFecha.dataset.bound) {
      inpAprobarLoteFecha.dataset.bound = 'true';
      const syncLugarAprobarLote = (e) => {
        const inpLugar = document.getElementById('inputAprobarLoteLugarEmision');
        if (inpLugar && e.target.value) {
          inpLugar.value = generarTextoLugar(e.target.value);
        }
      };
      inpAprobarLoteFecha.addEventListener('change', syncLugarAprobarLote);
      inpAprobarLoteFecha.addEventListener('input', syncLugarAprobarLote);
    }

    const chkMultiFechasLote = document.getElementById('checkRespetarFechasIndividualesLote');
    if (chkMultiFechasLote && !chkMultiFechasLote.dataset.bound) {
      chkMultiFechasLote.dataset.bound = 'true';
      chkMultiFechasLote.addEventListener('change', (e) => {
        const rowFechaUnica = document.getElementById('rowInputsFechaUnicaLote');
        const inpFechaLote = document.getElementById('inputAprobarLoteFechaEmision');
        if (rowFechaUnica) rowFechaUnica.style.display = e.target.checked ? 'none' : 'flex';
        if (inpFechaLote) inpFechaLote.required = !e.target.checked;
      });
    }

    const chkTFLote = document.getElementById('checkAprobarLoteTomoFolio');
    if (chkTFLote && !chkTFLote.dataset.bound) {
      chkTFLote.dataset.bound = 'true';
      chkTFLote.addEventListener('change', (e) => {
        const cont = document.getElementById('containerAprobarLoteTomoFolio');
        const lblState = document.getElementById('lblStateTomoFolioLote');
        if (cont) cont.style.display = e.target.checked ? 'flex' : 'none';
        if (lblState) lblState.textContent = e.target.checked ? 'Activado' : 'Desactivado';
        if (!e.target.checked) {
          const inpTomo = document.getElementById('inputAprobarLoteTomo');
          const inpFolio = document.getElementById('inputAprobarLoteFolio');
          if (inpTomo) inpTomo.value = '';
          if (inpFolio) inpFolio.value = '';
        }
      });
    }

    const formPago = document.getElementById('formPagoManual');
    if (formPago && !formPago.dataset.bound) {
      formPago.dataset.bound = 'true';
      formPago.addEventListener('submit', guardarPagoManual);
    }

    // Buscador interactivo de Usuario / Participante en Modal Pago Manual
    const inputBuscarUsuarioPago = document.getElementById('inputBuscarUsuarioPagoManual');
    if (inputBuscarUsuarioPago && !inputBuscarUsuarioPago.dataset.bound) {
      inputBuscarUsuarioPago.dataset.bound = 'true';
      inputBuscarUsuarioPago.addEventListener('input', (e) => {
        filtrarUsuariosPagoManual(e.target.value, true);
      });
      inputBuscarUsuarioPago.addEventListener('focus', (e) => {
        if (e.target.value.trim().length > 0) {
          filtrarUsuariosPagoManual(e.target.value, true);
        }
      });
      inputBuscarUsuarioPago.addEventListener('keydown', (e) => {
        const dropdown = document.getElementById('dropdownSugerenciasUsuarioPago');
        if (e.key === 'Escape' && dropdown) {
          dropdown.style.display = 'none';
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const filtrados = obtenerUsuariosFiltradosPago(e.target.value);
          if (filtrados.length > 0) {
            seleccionarUsuarioPagoManual(filtrados[0].id);
          }
        }
      });
    }

    const btnLimpiarUsuarioPago = document.getElementById('btnLimpiarBusquedaUsuarioPago');
    if (btnLimpiarUsuarioPago && !btnLimpiarUsuarioPago.dataset.bound) {
      btnLimpiarUsuarioPago.dataset.bound = 'true';
      btnLimpiarUsuarioPago.addEventListener('click', () => {
        const inp = document.getElementById('inputBuscarUsuarioPagoManual');
        if (inp) {
          inp.value = '';
          inp.focus();
        }
        filtrarUsuariosPagoManual('', false);
        const sel = document.getElementById('inputPagoUsuarioId');
        if (sel) sel.value = '';
        actualizarBoxInfoParticipante(null);
      });
    }

    const dropdownSugerenciasPago = document.getElementById('dropdownSugerenciasUsuarioPago');
    if (dropdownSugerenciasPago && !dropdownSugerenciasPago.dataset.bound) {
      dropdownSugerenciasPago.dataset.bound = 'true';
      dropdownSugerenciasPago.addEventListener('click', (e) => {
        const btnItem = e.target.closest('.item-sugerencia-usuario-pago');
        if (btnItem && btnItem.dataset.userId) {
          seleccionarUsuarioPagoManual(btnItem.dataset.userId);
        }
      });
    }

    const selUsuarioPago = document.getElementById('inputPagoUsuarioId');
    if (selUsuarioPago && !selUsuarioPago.dataset.bound) {
      selUsuarioPago.dataset.bound = 'true';
      selUsuarioPago.addEventListener('change', (e) => {
        const dropdown = document.getElementById('dropdownSugerenciasUsuarioPago');
        if (dropdown) dropdown.style.display = 'none';
        const lblContador = document.getElementById('lblContadorUsuariosPago');
        if (e.target.value) {
          const usr = cachedUsuarios.find(x => String(x.id) === String(e.target.value));
          const inp = document.getElementById('inputBuscarUsuarioPagoManual');
          const btnLimpiar = document.getElementById('btnLimpiarBusquedaUsuarioPago');
          if (usr && inp) inp.value = `${usr.cedula} - ${usr.nombre_completo}`;
          if (btnLimpiar) btnLimpiar.style.display = 'inline-block';
          if (lblContador) lblContador.innerHTML = '<i class="fa-solid fa-circle-check me-1"></i>Participante seleccionado';
        }
        actualizarBoxInfoParticipante(e.target.value);
      });
    }

    const selCursoPago = document.getElementById('inputPagoCursoOfertadoId');
    if (selCursoPago && !selCursoPago.dataset.bound) {
      selCursoPago.dataset.bound = 'true';
      selCursoPago.addEventListener('change', (e) => {
        actualizarBoxInfoTaller(e.target.value);
      });
    }

    // Cerrar lista flotante de sugerencias al hacer clic fuera
    if (!document.body.dataset.boundCerrarSugerenciasPago) {
      document.body.dataset.boundCerrarSugerenciasPago = 'true';
      document.addEventListener('click', (e) => {
        const wrapper = document.getElementById('wrapperBuscadorUsuarioPago');
        const dropdown = document.getElementById('dropdownSugerenciasUsuarioPago');
        if (dropdown && wrapper && !wrapper.contains(e.target)) {
          dropdown.style.display = 'none';
        }
      });
    }

    const fileInputCapture = document.getElementById('inputPagoCaptureFile');
    if (fileInputCapture && !fileInputCapture.dataset.bound) {
      fileInputCapture.dataset.bound = 'true';
      fileInputCapture.addEventListener('change', (e) => {
        const file = e.target.files[0];
        const container = document.getElementById('containerPreviewCapture');
        const img = document.getElementById('imgPagoCapturePreview');
        if (!file) {
          if (container) container.style.display = 'none';
          return;
        }
        const reader = new FileReader();
        reader.onload = (evt) => {
          if (img) img.src = evt.target.result;
          if (container) container.style.display = 'block';
        };
        reader.readAsDataURL(file);
      });
    }
  }

  async function abrirModalNuevaOferta() {
    if (window.authAdmin && window.authAdmin.isAuditor()) {
      window.utils.showToast('Acceso restringido: Perfil AUDITOR es de solo lectura.', 'warning');
      return;
    }

    cursoEditandoId = null;
    const modalEl = document.getElementById('modalOfertaCurso');
    const form = document.getElementById('formOfertaCurso');
    if (form) form.reset();

    document.getElementById('lblModalOfertaTitulo').innerHTML = '<i class="fa-solid fa-plus-circle me-2"></i>Nuevo Taller / Curso Ofertado';
    document.getElementById('inputOfertaId').value = '';
    document.getElementById('inputOfertaFlayerUrl').value = '';
    await poblarSelectCursosAcademicosOferta('');

    const imgPreview = document.getElementById('imgOfertaFlayerPreview');
    if (imgPreview) {
      imgPreview.src = '';
      imgPreview.style.display = 'none';
    }

    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }

  async function editarOferta(id) {
    if (window.authAdmin && window.authAdmin.isAuditor()) {
      window.utils.showToast('Acceso restringido: Perfil AUDITOR es de solo lectura.', 'warning');
      return;
    }

    try {
      const res = await window.api.getById('curso_ofertado', id);
      if (!res || res.status !== 'success' || !res.data) {
        window.utils.showToast('No se encontró el curso seleccionado', 'danger');
        return;
      }

      const o = res.data;
      cursoEditandoId = id;

      document.getElementById('lblModalOfertaTitulo').innerHTML = '<i class="fa-solid fa-pen-to-square me-2"></i>Editar Taller Ofertado';
      document.getElementById('inputOfertaId').value = o.id || '';
      document.getElementById('inputOfertaTaller').value = o.taller || '';
      document.getElementById('inputOfertaDescripcion').value = o.descripcion || '';
      document.getElementById('inputOfertaValorEstudiante').value = o.valor_estudiante || 0;
      document.getElementById('inputOfertaValorForaneo').value = o.valor_foraneo || 0;
      document.getElementById('inputOfertaFlayerUrl').value = o.flayer || '';
      await poblarSelectCursosAcademicosOferta(o.curso_id || '');

      const imgPreview = document.getElementById('imgOfertaFlayerPreview');
      if (imgPreview) {
        if (o.flayer) {
          imgPreview.src = o.flayer;
          imgPreview.style.display = 'block';
        } else {
          imgPreview.src = '';
          imgPreview.style.display = 'none';
        }
      }

      const modalEl = document.getElementById('modalOfertaCurso');
      bootstrap.Modal.getOrCreateInstance(modalEl).show();
    } catch (e) {
      console.error('Error editando oferta:', e);
      window.utils.showToast('Error al abrir modal de edición', 'danger');
    }
  }

  function previewFlayerFile(e) {
    const file = e.target.files[0];
    const imgPreview = document.getElementById('imgOfertaFlayerPreview');
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      if (imgPreview) {
        imgPreview.src = evt.target.result;
        imgPreview.style.display = 'block';
      }
    };
    reader.readAsDataURL(file);
  }

  async function guardarOfertaCurso(e) {
    e.preventDefault();

    if (window.authAdmin && window.authAdmin.isAuditor()) {
      window.utils.showToast('Acceso restringido: Perfil AUDITOR es de solo lectura.', 'warning');
      return;
    }

    const taller = document.getElementById('inputOfertaTaller').value.trim();
    const curso_id = document.getElementById('inputOfertaCursoId')?.value?.trim() || '';
    const descripcion = document.getElementById('inputOfertaDescripcion').value.trim();
    const valor_estudiante = parseFloat(document.getElementById('inputOfertaValorEstudiante').value) || 0;
    const valor_foraneo = parseFloat(document.getElementById('inputOfertaValorForaneo').value) || 0;
    let flayerUrl = document.getElementById('inputOfertaFlayerUrl').value.trim();

    if (!taller) {
      window.utils.showToast('Ingrese el nombre del taller ofertado', 'warning');
      return;
    }

    const fileInput = document.getElementById('inputOfertaFlayerFile');
    const file = fileInput ? fileInput.files[0] : null;

    if (window.utils && window.utils.showLoading) {
      window.utils.showLoading(20, 'Guardando curso ofertado...', 'Procesando imagen de portada');
    }

    try {
      if (file) {
        if (window.utils && window.utils.showLoading) {
          window.utils.showLoading(50, 'Subiendo flyer a Cloudflare R2...', 'Guardando en /img/flyers');
        }
        const compressedBase64 = await window.utils.compressImage(file, 800, 800, 0.8);
        const filename = `flayer_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9\._-]/g, '')}`;

        const uploadRes = await window.api.uploadImage(compressedBase64, filename, 'flyers');
        if (uploadRes && uploadRes.status === 'success' && uploadRes.url) {
          flayerUrl = uploadRes.url;
        } else {
          console.warn('Advertencia en subida de flayer:', uploadRes);
        }
      }

      const payload = {
        taller,
        curso_id,
        descripcion,
        valor_estudiante,
        valor_foraneo,
        flayer: flayerUrl
      };

      if (cursoEditandoId) {
        await window.api.update('curso_ofertado', cursoEditandoId, payload);
        window.utils.showToast('Taller ofertado actualizado exitosamente', 'success');
      } else {
        payload.id = window.utils.generateUUID();
        payload.created_at = new Date().toISOString();
        await window.api.create('curso_ofertado', payload);
        window.utils.showToast('Taller ofertado creado exitosamente', 'success');
      }

      const modalEl = document.getElementById('modalOfertaCurso');
      const inst = bootstrap.Modal.getInstance(modalEl);
      if (inst) inst.hide();

      await cargarTablaOfertas();
      await cargarTablaPagos();
    } catch (err) {
      console.error('Error guardando taller ofertado:', err);
      window.utils.showToast('Error al guardar el taller ofertado: ' + err.message, 'danger');
    } finally {
      if (window.utils && window.utils.hideLoading) window.utils.hideLoading();
    }
  }

  function eliminarOferta(id, tallerNombre) {
    if (window.authAdmin && window.authAdmin.isAuditor()) {
      window.utils.showToast('Acceso restringido: Perfil AUDITOR es de solo lectura.', 'warning');
      return;
    }

    window.utils.showConfirm({
      title: 'Eliminar Taller Ofertado',
      message: `¿Está seguro de que desea eliminar el taller "${tallerNombre}"?`,
      subtext: 'Esta acción no se puede deshacer.',
      confirmText: 'Sí, Eliminar',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        try {
          if (window.utils && window.utils.showLoading) {
            window.utils.showLoading(30, 'Eliminando oferta...', 'Por favor espere');
          }
          await window.api.delete('curso_ofertado', id);
          window.utils.showToast('Taller ofertado eliminado correctamente', 'success');
          await cargarTablaOfertas();
        } catch (e) {
          window.utils.showToast('Error al eliminar oferta: ' + e.message, 'danger');
        } finally {
          if (window.utils && window.utils.hideLoading) window.utils.hideLoading();
        }
      }
    });
  }

  function verFlayerFull(url, titulo) {
    const modalEl = document.getElementById('modalVerImagenFull');
    if (!modalEl) return;

    document.getElementById('lblModalImagenFullTitulo').textContent = titulo || 'Portada / Flayer';
    document.getElementById('imgModalFullPreview').src = url;
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }

  function verCaptureFull(url, usuario) {
    const modalEl = document.getElementById('modalVerImagenFull');
    if (!modalEl) return;

    document.getElementById('lblModalImagenFullTitulo').textContent = 'Capture de Pago - ' + (usuario || '');
    document.getElementById('imgModalFullPreview').src = url;
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }

  // ═════════════════════════════════════════════════════════════════
  // SECCIÓN 3: CARGA MASIVA DE PAGOS DECLARADOS (CSV / TEXTO COPIADO)
  // ═════════════════════════════════════════════════════════════════

  async function abrirModalCargaMasivaPagos() {
    if (window.authAdmin && window.authAdmin.isAuditor()) {
      window.utils.showToast('Acceso restringido: Perfil AUDITOR es de solo lectura.', 'warning');
      return;
    }

    pagosMasivosParsed = [];
    const modalEl = document.getElementById('modalCargaMasivaPagos');
    if (!modalEl) return;

    // Asegurar que catálogos estén sincronizados para previsualización exacta
    if (!Array.isArray(cachedOfertas) || cachedOfertas.length === 0) {
      try {
        const resO = await window.api.getAll('curso_ofertado');
        if (resO && resO.status === 'success' && Array.isArray(resO.data)) cachedOfertas = resO.data;
      } catch (e) {}
    }
    if (!Array.isArray(cachedCursos) || cachedCursos.length === 0) {
      try {
        const resC = await window.api.getAll('cursos');
        if (resC && resC.status === 'success' && Array.isArray(resC.data)) cachedCursos = resC.data;
      } catch (e) {}
    }
    if (!Array.isArray(cachedUsuarios) || cachedUsuarios.length === 0) {
      try {
        const resU = await window.api.getAll('usuarios');
        if (resU && resU.status === 'success' && Array.isArray(resU.data)) cachedUsuarios = resU.data;
      } catch (e) {}
    }

    const fileInput = document.getElementById('fileCsvPagos');
    if (fileInput) fileInput.value = '';

    const txtArea = document.getElementById('textareaCargaMasivaPagos');
    if (txtArea) txtArea.value = '';

    const inpFechaDefault = document.getElementById('inputFechaCursoDefaultPagosMasivos');
    if (inpFechaDefault) inpFechaDefault.value = '';

    const selCurso = document.getElementById('selectCursoDefaultPagosMasivos');
    if (selCurso) {
      selCurso.innerHTML = '<option value="">-- Asignar automáticamente --</option>' +
        cachedOfertas.map(o => `<option value="${o.id}">${window.utils.escapeHtml(o.taller)} ($${parseFloat(o.valor_estudiante || 0).toFixed(2)})</option>`).join('');
    }

    const container = document.getElementById('previewCargaMasivaPagosContainer');
    if (container) {
      container.innerHTML = `
        <div class="text-center py-4 text-muted">
          <i class="fa-solid fa-table-list fa-2x mb-2 text-secondary d-block"></i>
          Suba un archivo CSV o pegue datos arriba para previsualizar los pagos antes de cargarlos al sistema.
        </div>
      `;
    }

    const btnConfirmar = document.getElementById('btnConfirmarCargaMasivaPagos');
    if (btnConfirmar) {
      btnConfirmar.disabled = true;
      btnConfirmar.innerHTML = '<i class="fa-solid fa-cloud-arrow-up me-2"></i>Subir Pagos al Sistema (Quedan Pendientes)';
    }

    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }

  function normalizarHeaderCsv(h) {
    return String(h || '')
      .replace(/^\uFEFF/, '')
      .replace(/[º°]/g, 'o')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function detectarDelimitadorCsv(lines) {
    const sampleLines = lines.map(l => l.trim()).filter(Boolean).slice(0, 3);
    if (sampleLines.length === 0) return ',';
    const candidates = ['\t', ';', '|', ','];
    let bestDelim = null;
    let bestCount = 0;

    candidates.forEach(delim => {
      let count = 0;
      sampleLines.forEach(line => {
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') {
              i++;
            } else {
              inQuotes = !inQuotes;
            }
          } else if (!inQuotes && ch === delim) {
            count++;
          }
        }
      });
      if (count > bestCount) {
        bestCount = count;
        bestDelim = delim;
      }
    });

    return bestDelim;
  }

  function dividirLineaCsv(line, delimiter) {
    if (!delimiter) {
      return [line.trim()];
    }
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (!inQuotes && ch === delimiter) {
        result.push(current.trim().replace(/^'(.*)'$/, '$1').trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim().replace(/^'(.*)'$/, '$1').trim());
    return result;
  }

  function parsearMontoFlexible(rawMonto) {
    if (rawMonto === undefined || rawMonto === null) return 0;
    let s = String(rawMonto).replace(/[^0-9.,-]/g, '').trim();
    if (!s) return 0;
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma !== -1 && lastDot !== -1) {
      if (lastComma > lastDot) {
        // Formato europeo/venezolano: 1.250,50 -> 1250.50
        s = s.replace(/\./g, '').replace(',', '.');
      } else {
        // Formato anglosajón: 1,250.50 -> 1250.50
        s = s.replace(/,/g, '');
      }
    } else if (lastComma !== -1) {
      // Ej: 350,50 -> 350.50
      s = s.replace(',', '.');
    }
    return parseFloat(s) || 0;
  }

  function parsearTextoCsvPagos(text, defaultCursoId, defaultFechaCurso = '') {
    if (!text || !text.trim()) return [];
    const cleanText = String(text).replace(/^\uFEFF/, '');
    const lines = cleanText.split(/\r?\n/);
    const delimiter = detectarDelimitadorCsv(lines);
    const parsed = [];

    const cursoMap = new Map();
    cachedOfertas.forEach(o => {
      cursoMap.set(String(o.id).trim(), o);
      cursoMap.set(normalizarTextoComparacion(o.taller), o);
    });

    const esCursoConocido = (val) => {
      if (!val) return false;
      const trimVal = String(val).trim();
      const normVal = normalizarTextoComparacion(trimVal);
      if (!normVal) return false;
      if (cursoMap.has(trimVal) || cursoMap.has(normVal)) return true;
      return cachedOfertas.some(o => {
        const nt = normalizarTextoComparacion(o.taller);
        return nt && normVal.length >= 4 && nt.includes(normVal);
      });
    };

    const pareceTituloCurso = (val) => {
      if (!val) return false;
      if (esCursoConocido(val)) return true;
      return /^(taller|curso|diplomado|seminario|jornada|congreso|capacitacion|capacitación|formacion|formación|programa)\b/i.test(String(val).trim());
    };

    let headerIndices = null;
    let primeraLineaProcesada = false;

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      let parts = dividirLineaCsv(trimmed, delimiter);
      if (parts.length === 1) {
        const match = trimmed.match(/^([VEJG]?-?\d[\d.-]*)\s+(.+)$/i);
        if (match) parts = [match[1], match[2]];
      }

      if (!primeraLineaProcesada) {
        primeraLineaProcesada = true;
        const normHeaders = parts.map(normalizarHeaderCsv);
        const primerTokenPareceCedula = /^[vejg]?-?\d{5,12}$/i.test(String(parts[0] || '').replace(/[.\s]/g, ''));
        const tieneKeywordHeader = normHeaders.some(p =>
          /(^|_)(cedula|ci|c_i|dni|documento|nombre|nombres|apellido|apellidos|participante|estudiante|curso|taller|referencia|ref|transferencia|monto|banco|fecha|capture|comprobante|emision)($|_)/.test(p)
        );

        if (!primerTokenPareceCedula && tieneKeywordHeader) {
          let fechaCursoIdx = normHeaders.findIndex(p =>
            p === 'emision' ||
            p === 'fecha_curso' ||
            p === 'fec_curso' ||
            (/(^|_)(fecha|fec)($|_)/.test(p) && /(curso|taller|emision|certificado|certificacion|actividad|diplomado|realizacion|culminacion|dictado|evento|inicio|fin)/.test(p))
          );

          // Si el CSV tiene explícitamente fecha_pago y además otra columna "fecha", tomar la segunda como fecha_curso
          if (fechaCursoIdx === -1) {
            const explicitPagoIdx = normHeaders.findIndex(p =>
              /(^|_)(fecha_pago|fec_pago|fecha_transferencia|fecha_operacion|fecha_deposito)($|_)/.test(p)
            );
            if (explicitPagoIdx !== -1) {
              const otraFechaIdx = normHeaders.findIndex((p, idx) =>
                idx !== explicitPagoIdx && /(^|_)(fecha|fec)($|_)/.test(p)
              );
              if (otraFechaIdx !== -1) {
                fechaCursoIdx = otraFechaIdx;
              }
            }
          }

          const apellidosIdx = normHeaders.findIndex(p =>
            /(^|_)(apellido|apellidos)($|_)/.test(p) && !/(nombre|nombres)/.test(p)
          );
          const nombresIdx = apellidosIdx !== -1
            ? normHeaders.findIndex(p => /(^|_)(nombre|nombres)($|_)/.test(p) && !/(curso|taller|banco|unidad)/.test(p))
            : -1;

          const nombreIdx = (nombresIdx !== -1 && apellidosIdx !== -1)
            ? -1
            : normHeaders.findIndex(p =>
                !/(curso|taller|banco|unidad)/.test(p) &&
                /(^|_)(nombre_completo|nombre_del_participante|nombre_participante|nombres_y_apellidos|apellidos_y_nombres|nombre|nombres|participante|estudiante|alumno|usuario|beneficiario)($|_)/.test(p)
              );

          headerIndices = {
            headerCount: normHeaders.length,
            cedula: normHeaders.findIndex(p => /(^|_)(cedula|ci|c_i|dni|documento|identificacion|pasaporte)($|_)/.test(p)),
            nombre: nombreIdx,
            nombres: nombresIdx,
            apellidos: apellidosIdx,
            curso: normHeaders.findIndex((p, idx) =>
              idx !== fechaCursoIdx &&
              !/(^|_)(fecha|fec)($|_)/.test(p) &&
              /(^|_)(curso_ofertado|id_curso_ofertado|id_curso|taller|curso|diplomado|programa|capacitacion|actividad)($|_)/.test(p)
            ),
            referencia: normHeaders.findIndex(p =>
              /(^|_)(referencia|ref|numero_transferencia|nro_transferencia|no_transferencia|transferencia|comprobante_nro|operacion|recibo)($|_)/.test(p)
            ),
            monto: normHeaders.findIndex(p =>
              /(^|_)(monto|valor|precio|importe|pago_bs|bolivares|bs|total)($|_)/.test(p)
            ),
            banco: normHeaders.findIndex(p =>
              /(^|_)(banco|banco_origen|entidad|origen)($|_)/.test(p)
            ),
            capture: normHeaders.findIndex(p =>
              /(^|_)(capture|comprobante|capture_url|soporte|imagen|voucher|recibo_url)($|_)/.test(p)
            ),
            fecha: normHeaders.findIndex((p, idx) =>
              idx !== fechaCursoIdx &&
              /(^|_)(fecha|fecha_pago|fec_pago|fecha_transferencia|fecha_operacion|fecha_deposito)($|_)/.test(p)
            ),
            fecha_curso: fechaCursoIdx
          };
          return;
        }
      }

      let rawCedula = '';
      let rawNombre = '';
      let rawCurso = '';
      let rawRef = '';
      let rawMonto = '';
      let rawBanco = '';
      let rawCapture = '';
      let rawFecha = '';
      let rawFechaCurso = '';

      if (headerIndices) {
        rawCedula = headerIndices.cedula !== -1 && parts[headerIndices.cedula] ? parts[headerIndices.cedula] : '';
        if (headerIndices.nombre !== -1 && parts[headerIndices.nombre]) {
          rawNombre = parts[headerIndices.nombre];
        } else if (headerIndices.nombres !== -1 || headerIndices.apellidos !== -1) {
          const pNom = headerIndices.nombres !== -1 ? (parts[headerIndices.nombres] || '') : '';
          const pApe = headerIndices.apellidos !== -1 ? (parts[headerIndices.apellidos] || '') : '';
          rawNombre = `${pNom} ${pApe}`.trim();
        }
        rawCurso = headerIndices.curso !== -1 && parts[headerIndices.curso] ? parts[headerIndices.curso] : '';
        rawRef = headerIndices.referencia !== -1 && parts[headerIndices.referencia] ? parts[headerIndices.referencia] : '';
        rawMonto = headerIndices.monto !== -1 && parts[headerIndices.monto] ? parts[headerIndices.monto] : '';
        rawBanco = headerIndices.banco !== -1 && parts[headerIndices.banco] ? parts[headerIndices.banco] : '';
        rawCapture = headerIndices.capture !== -1 && parts[headerIndices.capture] ? parts[headerIndices.capture] : '';
        rawFecha = headerIndices.fecha !== -1 && parts[headerIndices.fecha] ? parts[headerIndices.fecha] : '';
        rawFechaCurso = headerIndices.fecha_curso !== -1 && parts[headerIndices.fecha_curso] ? parts[headerIndices.fecha_curso] : '';
        // Si la fila trae una columna adicional al final con fecha (ej: agregaron fecha_curso sin encabezado)
        if (!rawFechaCurso && headerIndices.fecha_curso === -1 && parts.length > headerIndices.headerCount) {
          const extraCol = parts[parts.length - 1];
          if (normalizarFechaIso(extraCol)) {
            rawFechaCurso = extraCol;
          }
        }
      } else {
        // Formato posicional oficial:
        // cedula, nombre_completo, curso_ofertado, referencia, monto, banco_origen, capture, fecha_pago, fecha_curso
        rawCedula = parts[0] || '';
        if (parts.length >= 9) {
          rawNombre = parts[1];
          rawCurso = parts[2];
          rawRef = parts[3];
          rawMonto = parts[4];
          rawBanco = parts[5];
          rawCapture = parts[6];
          rawFecha = parts[7];
          rawFechaCurso = parts[8];
        } else if (parts.length === 8) {
          rawNombre = parts[1];
          rawCurso = parts[2];
          rawRef = parts[3];
          rawMonto = parts[4];
          rawBanco = parts[5];
          if (normalizarFechaIso(parts[6]) && normalizarFechaIso(parts[7])) {
            rawFecha = parts[6];
            rawFechaCurso = parts[7];
          } else {
            rawCapture = parts[6];
            rawFecha = parts[7];
          }
        } else if (parts.length === 7) {
          if (pareceTituloCurso(parts[1])) {
            rawCurso = parts[1];
            rawRef = parts[2];
            rawMonto = parts[3];
            rawBanco = parts[4];
            rawCapture = parts[5];
            rawFecha = parts[6];
          } else {
            rawNombre = parts[1];
            rawCurso = parts[2];
            rawRef = parts[3];
            rawMonto = parts[4];
            rawBanco = parts[5];
            if (normalizarFechaIso(parts[6])) {
              rawFecha = parts[6];
            } else {
              rawCapture = parts[6];
            }
          }
        } else if (parts.length === 6) {
          if (pareceTituloCurso(parts[1])) {
            rawCurso = parts[1];
            rawRef = parts[2];
            rawMonto = parts[3];
            rawBanco = parts[4];
            rawFecha = parts[5];
          } else {
            rawNombre = parts[1];
            rawCurso = parts[2];
            rawRef = parts[3];
            rawMonto = parts[4];
            if (normalizarFechaIso(parts[5])) {
              rawFecha = parts[5];
            } else {
              rawBanco = parts[5];
            }
          }
        } else if (parts.length === 5) {
          if (pareceTituloCurso(parts[1])) {
            rawCurso = parts[1];
            rawRef = parts[2];
            rawMonto = parts[3];
            rawBanco = parts[4];
          } else {
            rawNombre = parts[1];
            rawCurso = parts[2];
            rawRef = parts[3];
            rawMonto = parts[4];
          }
        } else if (parts.length === 4) {
          if (pareceTituloCurso(parts[1])) {
            rawCurso = parts[1];
            rawRef = parts[2];
            rawMonto = parts[3];
          } else if (pareceTituloCurso(parts[2])) {
            rawNombre = parts[1];
            rawCurso = parts[2];
            rawMonto = parts[3];
          } else {
            rawNombre = parts[1];
            rawRef = parts[2];
            rawMonto = parts[3];
          }
        } else if (parts.length === 3) {
          if (/^[\d.,-]+$/.test(parts[1]) && /^[\d.,]+$/.test(parts[2])) {
            rawRef = parts[1];
            rawMonto = parts[2];
          } else if (!pareceTituloCurso(parts[1]) && /^[\d.,]+$/.test(parts[2])) {
            rawNombre = parts[1];
            rawMonto = parts[2];
          } else {
            rawNombre = parts[1];
            rawCurso = parts[2];
          }
        } else if (parts.length === 2) {
          if (/^[\d.,]+$/.test(parts[1])) {
            rawMonto = parts[1];
          } else if (pareceTituloCurso(parts[1])) {
            rawCurso = parts[1];
          } else {
            rawNombre = parts[1];
          }
        }
      }

      if (!rawCedula || !/\d/.test(rawCedula)) return;

      const normCedula = window.utils.normalizeCedula(rawCedula);
      if (!normCedula) return;

      let cursoObj = null;
      if (rawCurso) {
        const trimCurso = String(rawCurso).trim();
        const normCurso = normalizarTextoComparacion(trimCurso);
        cursoObj = cursoMap.get(trimCurso) || cursoMap.get(normCurso);
        if (!cursoObj) {
          cursoObj = cachedOfertas.find(o => normalizarTextoComparacion(o.taller).includes(normCurso));
        }
      }
      if (!cursoObj && defaultCursoId) {
        cursoObj = cachedOfertas.find(o => String(o.id) === String(defaultCursoId));
      }
      if (!cursoObj && cachedOfertas.length > 0) {
        cursoObj = cachedOfertas[0];
      }

      let montoNum = parsearMontoFlexible(rawMonto);
      if (montoNum === 0 && cursoObj) {
        montoNum = parseFloat((parseFloat(cursoObj.valor_estudiante || 0) * (tasaDolarActual || 36.5)).toFixed(2));
      }

      const refFinal = rawRef ? String(rawRef).trim() : `CSV-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`;
      const bancoFinal = rawBanco ? String(rawBanco).trim() : 'Pago Móvil / Transferencia';

      const fechaFinal = normalizarFechaIso(rawFecha) || new Date().toISOString().split('T')[0];

      // Resolver fecha_curso (CSV -> Fecha Fallback Modal -> Curso Académico vinculado -> '')
      let fechaCursoFinal = normalizarFechaIso(rawFechaCurso) || normalizarFechaIso(defaultFechaCurso);
      if (!fechaCursoFinal && cursoObj) {
        const cursoAcad = resolverCursoAcademicoDeOferta(cursoObj);
        if (cursoAcad && cursoAcad.fecha_curso) {
          fechaCursoFinal = normalizarFechaIso(cursoAcad.fecha_curso);
        }
      }

      let nombreLimpio = rawNombre ? String(rawNombre).replace(/\s+/g, ' ').trim().toUpperCase() : '';
      if (isNombreGenericoParticipante(nombreLimpio)) {
        nombreLimpio = '';
      }

      parsed.push({
        cedula: normCedula,
        nombre_csv: nombreLimpio,
        nombre_completo: nombreLimpio,
        id_curso_ofertado: cursoObj ? cursoObj.id : null,
        curso_ofertado: rawCurso ? String(rawCurso).trim() : (cursoObj ? cursoObj.taller : ''),
        nombre_curso: cursoObj ? cursoObj.taller : (rawCurso ? String(rawCurso).trim() : 'Taller no asignado'),
        numero_transferencia: refFinal,
        monto: montoNum,
        banco_origen: bancoFinal,
        capture: rawCapture ? String(rawCapture).trim() : '',
        fecha_pago: fechaFinal,
        fecha_curso: fechaCursoFinal || '',
        status: 'PENDIENTE'
      });
    });

    return parsed;
  }

  function procesarTextoPagosMasivos() {
    const text = document.getElementById('textareaCargaMasivaPagos')?.value || '';
    const defaultCursoId = document.getElementById('selectCursoDefaultPagosMasivos')?.value || '';
    const defaultFechaCurso = document.getElementById('inputFechaCursoDefaultPagosMasivos')?.value || '';
    pagosMasivosParsed = parsearTextoCsvPagos(text, defaultCursoId, defaultFechaCurso);
    renderizarPrevisualizacionPagos();
  }

  function renderizarPrevisualizacionPagos() {
    const container = document.getElementById('previewCargaMasivaPagosContainer');
    const btnConfirmar = document.getElementById('btnConfirmarCargaMasivaPagos');
    if (!container) return;

    if (pagosMasivosParsed.length === 0) {
      container.innerHTML = `
        <div class="alert alert-warning py-3 text-center mb-0">
          <i class="fa-solid fa-triangle-exclamation fa-lg me-2"></i>
          No se detectaron pagos válidos. Asegúrese de que cada línea contenga al menos la <strong>Cédula</strong> y el <strong>Nombre del Participante</strong> (ej: <code>V-12345678, PEDRO PÉREZ, Taller, 00123456, 350.50, Banesco, , 2026-10-25, 2026-10-30</code>).
        </div>
      `;
      if (btnConfirmar) {
        btnConfirmar.disabled = true;
        btnConfirmar.innerHTML = '<i class="fa-solid fa-cloud-arrow-up me-2"></i>Subir Pagos al Sistema (Quedan Pendientes)';
      }
      return;
    }

    const usuariosMap = new Map();
    cachedUsuarios.forEach(u => {
      const clean = String(u.cedula || '').replace(/[\s.-]/g, '').toUpperCase();
      if (clean) usuariosMap.set(clean, u);
    });

    let validadosCount = 0;
    let montoTotal = 0;
    let usuariosNuevosCount = 0;
    let usuariosExistentesCount = 0;
    let usuariosReparadosCount = 0;
    let pagosExistentesNoDuplicarCount = 0;
    let sinNombreRealCount = 0;

    let rowsHtml = '';
    pagosMasivosParsed.forEach((p, idx) => {
      validadosCount++;
      montoTotal += parseFloat(p.monto || 0);

      const cleanCed = String(p.cedula).replace(/[\s.-]/g, '').toUpperCase();
      const existingUser = usuariosMap.get(cleanCed);
      const nombreCsv = p.nombre_csv || (!isNombreGenericoParticipante(p.nombre_completo) ? p.nombre_completo : '');

      let usuarioBadge = '';
      if (existingUser) {
        usuariosExistentesCount++;
        p.id_usuario = existingUser.id;
        const dbEsGenerico = isNombreGenericoParticipante(existingUser.nombre_completo);
        if (dbEsGenerico && nombreCsv) {
          usuariosReparadosCount++;
          p.nombre_completo = nombreCsv;
          usuarioBadge = `<strong class="text-success">${window.utils.escapeHtml(nombreCsv)}</strong><br><small class="text-success fw-semibold"><i class="fa-solid fa-wand-magic-sparkles me-1"></i>Reparará "${window.utils.escapeHtml(existingUser.nombre_completo)}" en BD</small>`;
        } else if (dbEsGenerico && !nombreCsv) {
          sinNombreRealCount++;
          p.nombre_completo = '';
          usuarioBadge = `<strong class="text-danger">${window.utils.escapeHtml(existingUser.nombre_completo)}</strong><br><small class="text-danger"><i class="fa-solid fa-triangle-exclamation me-1"></i>En BD con nombre genérico (agregue nombre en CSV)</small>`;
        } else {
          p.nombre_completo = existingUser.nombre_completo;
          usuarioBadge = `<strong class="text-primary">${window.utils.escapeHtml(existingUser.nombre_completo)}</strong><br><small class="text-success"><i class="fa-solid fa-user-check me-1"></i>Registrado en BD</small>`;
        }
      } else {
        usuariosNuevosCount++;
        if (nombreCsv) {
          p.nombre_completo = nombreCsv;
          usuarioBadge = `<strong class="text-dark">${window.utils.escapeHtml(nombreCsv)}</strong><br><small class="text-info"><i class="fa-solid fa-user-plus me-1"></i>Nuevo (Se creará en BD)</small>`;
        } else {
          sinNombreRealCount++;
          p.nombre_completo = '';
          usuarioBadge = `<strong class="text-danger">SIN NOMBRE EN CSV (${window.utils.escapeHtml(p.cedula)})</strong><br><small class="text-danger"><i class="fa-solid fa-triangle-exclamation me-1"></i>Falta nombre del participante</small>`;
        }
      }

      const normRefCmp = (r) => {
        const s = String(r || '').trim().toUpperCase();
        if (!s || s.startsWith('CSV-')) return '';
        return /^\d+$/.test(s) ? (s.replace(/^0+/, '') || '0') : s;
      };
      const pagoYaRegistrado = existingUser && cachedPagos.some(pg => {
        if (String(pg.id_usuario) !== String(existingUser.id)) return false;
        const mismoCurso = String(normalizeCursoOfertadoId(pg.id_curso_ofertado) || '') === String(normalizeCursoOfertadoId(p.id_curso_ofertado) || '');
        if (!mismoCurso) return false;
        const refPg = normRefCmp(pg.numero_transferencia);
        const refNew = normRefCmp(p.numero_transferencia);
        if (refPg && refNew) {
          return refPg === refNew;
        }
        return false;
      });
      if (pagoYaRegistrado) pagosExistentesNoDuplicarCount++;

      const nomParaCapture = p.nombre_completo || (existingUser ? existingUser.nombre_completo : p.cedula);
      const captureCol = p.capture
        ? `<button type="button" class="btn btn-sm btn-outline-info py-0 px-2" onclick="window.ofertasModule.verCaptureFull('${window.utils.escapeHtml(p.capture)}', '${window.utils.escapeHtml(nomParaCapture)}')"><i class="fa-solid fa-image me-1"></i>Ver</button>`
        : '<span class="text-muted small">Sin Capture</span>';

      const fechaCursoCol = p.fecha_curso
        ? `<span class="badge bg-info-subtle text-dark border font-monospace">${window.utils.escapeHtml(p.fecha_curso)}</span>`
        : '<span class="text-muted small">Sin fecha</span>';

      const estatusBadge = pagoYaRegistrado
        ? `<span class="badge bg-info text-dark py-2 px-2 fw-bold" title="No se duplicará el pago; solo actualizará nombre/fecha_curso"><i class="fa-solid fa-arrows-rotate me-1"></i>YA REGISTRADO</span>`
        : `<span class="badge bg-warning text-dark py-2 px-2 fw-bold"><i class="fa-solid fa-clock me-1"></i>PENDIENTE</span>`;

      rowsHtml += `
        <tr>
          <td class="text-center font-monospace">${idx + 1}</td>
          <td><span class="badge bg-dark font-monospace">${window.utils.escapeHtml(p.cedula)}</span></td>
          <td>${usuarioBadge}</td>
          <td class="small fw-semibold text-wrap" style="max-width: 170px;">${window.utils.escapeHtml(p.nombre_curso)}</td>
          <td class="text-center font-monospace small"><code>${window.utils.escapeHtml(p.numero_transferencia)}</code></td>
          <td class="text-end fw-bold text-success">${parseFloat(p.monto || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.</td>
          <td class="small text-muted">${window.utils.escapeHtml(p.banco_origen)}</td>
          <td class="text-center small">${captureCol}</td>
          <td class="small text-center">${window.utils.escapeHtml(p.fecha_pago)}</td>
          <td class="text-center">${fechaCursoCol}</td>
          <td class="text-center">${estatusBadge}</td>
        </tr>
      `;
    });

    const alertaSinNombre = sinNombreRealCount > 0
      ? `<div class="alert alert-warning py-2 px-3 small mb-2">
          <i class="fa-solid fa-triangle-exclamation me-1"></i>
          <strong>Atención:</strong> Se detectaron <strong>${sinNombreRealCount}</strong> fila(s) sin nombre real en el CSV. Verifique que su archivo incluya la columna <code>nombre_completo</code> o <code>NOMBRE DEL PARTICIPANTE</code> para evitar registros genéricos.
        </div>`
      : '';

    const resumenReparacion = (usuariosReparadosCount > 0 || pagosExistentesNoDuplicarCount > 0)
      ? `<div class="alert alert-info py-2 px-3 small mb-2">
          <i class="fa-solid fa-wand-magic-sparkles me-1"></i>
          <strong>Modo Reparación Inteligente Activo:</strong>
          ${usuariosReparadosCount > 0 ? `Se reparará el nombre completo de <strong>${usuariosReparadosCount}</strong> participante(s) que tenían <code>PARTICIPANTE ...</code> en BD. ` : ''}
          ${pagosExistentesNoDuplicarCount > 0 ? `<strong>${pagosExistentesNoDuplicarCount}</strong> pago(s) ya existen y actualizarán su fecha de curso sin duplicarse.` : ''}
        </div>`
      : '';

    container.innerHTML = `
      ${alertaSinNombre}
      ${resumenReparacion}
      <div class="row g-2 mb-3">
        <div class="col-md-3">
          <div class="bg-white p-2 rounded border text-center shadow-sm">
            <small class="text-muted d-block fw-semibold">Filas Detectadas</small>
            <strong class="fs-5 text-primary">${validadosCount}</strong>
          </div>
        </div>
        <div class="col-md-3">
          <div class="bg-white p-2 rounded border text-center shadow-sm">
            <small class="text-muted d-block fw-semibold">Monto Acumulado (Bs.)</small>
            <strong class="fs-5 text-success">${montoTotal.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs.</strong>
          </div>
        </div>
        <div class="col-md-3">
          <div class="bg-white p-2 rounded border text-center shadow-sm">
            <small class="text-muted d-block fw-semibold">Participantes</small>
            <small class="d-block pt-1"><strong>${usuariosExistentesCount}</strong> en BD${usuariosReparadosCount > 0 ? ` (<span class="text-success fw-bold">${usuariosReparadosCount} a reparar</span>)` : ''} | <span class="text-info fw-bold">${usuariosNuevosCount} nuevos</span></small>
          </div>
        </div>
        <div class="col-md-3">
          <div class="bg-white p-2 rounded border text-center shadow-sm">
            <small class="text-muted d-block fw-semibold">Estatus al Subir</small>
            <span class="badge bg-warning text-dark mt-1"><i class="fa-solid fa-clock me-1"></i>PENDIENTE</span>
          </div>
        </div>
      </div>

      <div class="table-responsive border rounded bg-white" style="max-height: 280px;">
        <table class="table table-sm table-hover align-middle mb-0">
          <thead class="table-light sticky-top">
            <tr>
              <th class="text-center" style="width: 40px;">#</th>
              <th>Cédula</th>
              <th>Nombre Completo</th>
              <th>Curso Ofertado</th>
              <th class="text-center">Referencia</th>
              <th class="text-end">Monto</th>
              <th>Banco Origen</th>
              <th class="text-center">Capture</th>
              <th class="text-center">Fecha Pago</th>
              <th class="text-center">Fecha Curso</th>
              <th class="text-center">Estatus Inicial</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;

    if (btnConfirmar) {
      btnConfirmar.disabled = (validadosCount === 0);
      btnConfirmar.innerHTML = `<i class="fa-solid fa-cloud-arrow-up me-2"></i>Procesar ${validadosCount} Registro(s) en el Sistema`;
    }
  }

  async function ejecutarCargaMasivaPagos() {
    if (window.authAdmin && window.authAdmin.isAuditor()) {
      window.utils.showToast('Acceso restringido: Perfil AUDITOR es de solo lectura.', 'warning');
      return;
    }

    if (pagosMasivosParsed.length === 0) {
      window.utils.showToast('No hay registros válidos para subir.', 'info');
      return;
    }

    const btn = document.getElementById('btnConfirmarCargaMasivaPagos');
    const oldHtml = btn ? btn.innerHTML : '';
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-2"></i>Subiendo pagos a la base de datos...';
    }

    try {
      if (window.utils && window.utils.showLoading) {
        window.utils.showLoading(50, 'Subiendo pagos masivos a Turso...', 'Registrando pagos y reparando nombres si aplica');
      }

      const switchCrear = document.getElementById('checkCrearUsuariosInexistentesPagos');
      const crearUsuariosNuevos = switchCrear ? switchCrear.checked : true;
      const res = await window.api.bulkCreatePagos(pagosMasivosParsed, { crearUsuariosNuevos });
      if (res && res.status === 'success') {
        window.utils.showToast(res.message || 'Pagos subidos exitosamente en espera de verificación.', 'success');

        const modalEl = document.getElementById('modalCargaMasivaPagos');
        if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).hide();

        if (window.api && window.api.preloadAllData) {
          try { await window.api.preloadAllData(true); } catch (e) {}
        }
        await cargarTablaPagos();
        sincronizarModulosRelacionados();

        // Cambiar filtro para mostrar pendientes de inmediato si se insertaron nuevos pendientes
        const selFiltro = document.getElementById('selectFiltroEstatusPago');
        if (selFiltro && (res.insertados > 0 || cachedPagos.some(p => !isPagoVerificado(p.status)))) {
          selFiltro.value = 'pendientes';
          renderTablaPagosFiltrada();
        }
      } else {
        window.utils.showToast('Error en la carga masiva: ' + (res?.message || 'Error desconocido'), 'danger');
      }
    } catch (err) {
      console.error('Error al ejecutar carga masiva de pagos:', err);
      window.utils.showToast('Error de conexión al subir pagos masivos', 'danger');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = oldHtml;
      }
      if (window.utils && window.utils.hideLoading) window.utils.hideLoading();
    }
  }
  /**
   * Exporta a CSV las declaraciones de pago PENDIENTES por verificación.
   * Columnas: cedula, nombre_completo, curso_ofertado, referencia, monto, banco_origen, capture, fecha_pago, fecha_curso
   */
  async function exportarPagosPendientesCsv() {
    try {
      if (!cachedPagos.length) {
        await cargarTablaPagos();
      }

      const usuariosMap = Object.fromEntries(cachedUsuarios.map(u => [String(u.id), u]));
      const pendientes = cachedPagos
        .filter(p => !isPagoVerificado(p.status))
        .sort((a, b) => new Date(b.created_at || b.fecha_pago || 0) - new Date(a.created_at || a.fecha_pago || 0));

      if (pendientes.length === 0) {
        window.utils.showToast('No hay declaraciones de pago pendientes por verificar', 'info');
        return;
      }

      const escaparCsv = (valor) => {
        const s = String(valor ?? '');
        return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };

      const resolverUrlCapture = (capture) => {
        if (!capture) return '';
        const c = String(capture);
        if (/^(https?:|data:)/i.test(c)) return c;
        try { return new URL(c, window.location.origin).href; } catch (e) { return c; }
      };

      const encabezados = ['cedula', 'nombre_completo', 'curso_ofertado', 'referencia', 'monto', 'banco_origen', 'capture', 'fecha_pago', 'fecha_curso'];
      const filas = pendientes.map(p => {
        const usr = usuariosMap[String(p.id_usuario)] || {};
        const ofr = resolverOferta(p.id_curso_ofertado) || {};
        const cursoAcad = resolverCursoAcademicoDeOferta(ofr);
        const fechaPago = normalizarFechaIso(p.fecha_pago) || (p.created_at ? String(p.created_at).slice(0, 10) : '');
        const fechaCurso = normalizarFechaIso(p.fecha_curso) || normalizarFechaIso(cursoAcad?.fecha_curso) || '';
        return [
          usr.cedula || '',
          usr.nombre_completo || '',
          ofr.taller || p.taller || '',
          p.numero_transferencia || '',
          (parseFloat(p.monto || 0) || 0).toFixed(2),
          p.banco_origen || '',
          resolverUrlCapture(p.capture),
          fechaPago,
          fechaCurso
        ].map(escaparCsv).join(',');
      });

      const csvContent = [encabezados.join(','), ...filas].join('\r\n');
      const hoy = new Date().toISOString().slice(0, 10);
      window.utils.downloadCsvTemplate(`pagos_pendientes_verificacion_${hoy}.csv`, csvContent);
      window.utils.showToast(`CSV descargado: ${pendientes.length} pago(s) pendiente(s)`, 'success');
    } catch (err) {
      console.error('Error exportando pagos pendientes a CSV:', err);
      window.utils.showToast('Error al generar el CSV de pagos pendientes', 'danger');
    }
  }

  function descargarPlantillaCsvPagos() {
    const csvContent = "\uFEFFcedula,nombre_completo,curso_ofertado,referencia,monto,banco_origen,capture,fecha_pago,fecha_curso\r\n" +
      "V-12345678,PEDRO PÉREZ,Taller de Inteligencia Artificial,00984572,350.50,Banco de Venezuela (0102),https://certificados.uptpc.edu.ve/img/comprobante1.jpg,2026-10-25,2026-10-30\r\n" +
      "V-87654321,MARÍA GÓMEZ,Desarrollo Web Fullstack,00451278,500.00,Pago Móvil Interbancario,,2026-10-25,2026-10-30\r\n" +
      "V-19876543,CARLOS LÓPEZ,Ciberseguridad y Redes,00781290,420.00,Banesco (0134),,2026-10-25,2026-10-30";

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plantilla_carga_masiva_pagos_uptpc.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    window.utils.showToast('Plantilla CSV descargada con fecha_curso incluida', 'info');
  }

  window.ofertasModule = {
    init,
    cargarTablaOfertas,
    cargarTablaPagos,
    renderTablaPagosFiltrada,
    renderTablaPagosAprobadosFiltrada,
    aprobarPago,
    revertirPago,
    abrirModalAprobarPagosLote,
    confirmarAprobacionPagosLote,
    revertirPagosSeleccionados,
    eliminarPagosSeleccionados,
    verCertificadoEmitido,
    abrirModalConfigurarFechaEmision,
    toggleSeleccionPago,
    toggleSeleccionarTodosFiltrados,
    limpiarSeleccionPagos,
    toggleSeleccionPagoAprobado,
    toggleSeleccionarTodosAprobadosFiltrados,
    seleccionarTodosFiltradosPagosAprobados,
    limpiarSeleccionPagosAprobados,
    exportarPagosAprobadosCsv,
    abrirModalPago,
    guardarPagoManual,
    eliminarPago,
    editarOferta,
    eliminarOferta,
    verFlayerFull,
    verCaptureFull,
    abrirModalCargaMasivaPagos,
    parsearTextoCsvPagos,
    ejecutarCargaMasivaPagos,
    descargarPlantillaCsvPagos
  };
})();
