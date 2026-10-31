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
  let pagosMasivosParsed = [];

  function resolverOferta(cursoId) {
    if (!cursoId && cursoId !== 0) return null;
    const rawStr = String(cursoId).trim();
    const intId = parseInt(rawStr, 10);
    return cachedOfertas.find(o => 
      String(o.id).trim() === rawStr || 
      (!isNaN(intId) && parseInt(o.id, 10) === intId)
    ) || null;
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

    const valEstUsd = parseFloat(ofr.valor_estudiante || 0);
    const valForUsd = parseFloat(ofr.valor_foraneo || 0);
    const valEstBs = (valEstUsd * tasaDolarActual).toLocaleString('es-VE', { minimumFractionDigits: 2 });
    const valForBs = (valForUsd * tasaDolarActual).toLocaleString('es-VE', { minimumFractionDigits: 2 });

    if (elNom) elNom.textContent = ofr.taller;
    if (elEst) elEst.textContent = `$${valEstUsd.toFixed(2)} USD (${valEstBs} Bs.)`;
    if (elFor) elFor.textContent = `$${valForUsd.toFixed(2)} USD (${valForBs} Bs.)`;

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
      const res = await window.api.getAll('curso_ofertado');
      const ofertas = (res && res.status === 'success' && Array.isArray(res.data)) ? res.data : [];
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
            <td class="align-middle fw-bold text-primary">${window.utils.escapeHtml(o.taller || '')}</td>
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

    tbody.innerHTML = '<tr><td colspan="9" class="text-center py-3"><i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando declaraciones de pagos...</td></tr>';

    try {
      const [resPagos, resUsuarios, resOfertas, resBancos] = await Promise.all([
        window.api.getAll('pagos'),
        window.api.getAll('usuarios'),
        window.api.getAll('curso_ofertado'),
        window.api.getAll('banco')
      ]);

      cachedPagos = (resPagos && resPagos.status === 'success' && Array.isArray(resPagos.data)) ? resPagos.data : [];
      cachedUsuarios = (resUsuarios && resUsuarios.status === 'success' && Array.isArray(resUsuarios.data)) ? resUsuarios.data : [];
      cachedOfertas = (resOfertas && resOfertas.status === 'success' && Array.isArray(resOfertas.data)) ? resOfertas.data : [];
      cachedBancos = (resBancos && resBancos.status === 'success' && Array.isArray(resBancos.data)) ? resBancos.data : [];

      actualizarMetricasPagos();
      renderTablaPagosFiltrada();
    } catch (err) {
      console.error('Error cargando tabla de pagos:', err);
      tbody.innerHTML = '<tr><td colspan="9" class="text-center text-danger py-3"><i class="fa-solid fa-circle-exclamation me-2"></i>Error al cargar los pagos registrados.</td></tr>';
    }
  }

  function actualizarMetricasPagos() {
    const totalPagos = cachedPagos.length;
    let pendientes = 0;
    let aprobados = 0;
    let montoTotalAprobadoBs = 0;

    cachedPagos.forEach(p => {
      const isOk = isPagoVerificado(p.status);
      if (isOk) {
        aprobados++;
        montoTotalAprobadoBs += parseFloat(p.monto || 0);
      } else {
        pendientes++;
      }
    });

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
  }

  function renderTablaPagosFiltrada() {
    const tbody = document.getElementById('tbodyPagosAdministracion');
    if (!tbody) return;

    const inputBuscar = document.getElementById('inputBuscarPago');
    const selectFiltro = document.getElementById('selectFiltroEstatusPago');
    const searchVal = inputBuscar ? inputBuscar.value.trim().toUpperCase() : '';
    const filtroVal = selectFiltro ? selectFiltro.value : 'todos';

    const usuariosMap = Object.fromEntries(cachedUsuarios.map(u => [String(u.id), u]));

    let filtrados = cachedPagos.filter(p => {
      const isVerificado = isPagoVerificado(p.status);
      
      if (filtroVal === 'pendientes' && isVerificado) return false;
      if (filtroVal === 'aprobados' && !isVerificado) return false;

      if (!searchVal) return true;

      const usr = usuariosMap[String(p.id_usuario)] || {};
      const ofr = resolverOferta(p.id_curso_ofertado) || {};
      const nombreTaller = ofr.taller || p.taller || 'Taller No Especificado';

      const matchUsuario = String(usr.nombre_completo || '').toUpperCase().includes(searchVal);
      const matchCedula = String(usr.cedula || '').toUpperCase().includes(searchVal);
      const matchRef = String(p.numero_transferencia || '').toUpperCase().includes(searchVal);
      const matchBanco = String(p.banco_origen || '').toUpperCase().includes(searchVal);
      const matchTaller = String(nombreTaller).toUpperCase().includes(searchVal);

      return matchUsuario || matchCedula || matchRef || matchBanco || matchTaller;
    });

    filtrados.sort((a, b) => new Date(b.created_at || b.fecha_pago || 0) - new Date(a.created_at || a.fecha_pago || 0));

    if (filtrados.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4"><i class="fa-solid fa-receipt fa-2x mb-2 d-block"></i>No se encontraron pagos con los criterios seleccionados.</td></tr>';
      return;
    }

    const esAuditor = window.authAdmin && window.authAdmin.isAuditor();

    let html = '';
    filtrados.forEach(p => {
      const usr = usuariosMap[String(p.id_usuario)] || {};
      const ofr = resolverOferta(p.id_curso_ofertado) || {};
      const nombreTaller = ofr.taller || p.taller || 'Taller No Especificado';

      const isVerificado = isPagoVerificado(p.status);
      const statusBadge = isVerificado 
        ? '<span class="badge bg-success py-2 px-3 fw-bold"><i class="fa-solid fa-circle-check me-1"></i>APROBADO</span>'
        : '<span class="badge bg-warning text-dark py-2 px-3 fw-bold"><i class="fa-solid fa-clock me-1"></i>PENDIENTE</span>';

      const captureTag = p.capture 
        ? `<button class="btn btn-sm btn-outline-info" onclick="window.ofertasModule.verCaptureFull('${window.utils.escapeHtml(p.capture)}', '${window.utils.escapeHtml(usr.nombre_completo || 'Pago')}')" title="Ver Comprobante"><i class="fa-solid fa-image me-1"></i>Capture</button>`
        : '<span class="text-muted small">Sin Capture</span>';

      let botonAprobacion = '';
      if (!esAuditor) {
        if (!isVerificado) {
          botonAprobacion = `
            <button class="btn btn-sm btn-success fw-bold" onclick="window.ofertasModule.aprobarPago('${p.id}')" title="Aprobar y Confirmar Pago 1 a 1">
              <i class="fa-solid fa-check-double me-1"></i>Aprobar
            </button>
          `;
        } else {
          botonAprobacion = `
            <button class="btn btn-sm btn-outline-warning" onclick="window.ofertasModule.revertirPago('${p.id}')" title="Revertir a Pendiente">
              <i class="fa-solid fa-rotate-left me-1"></i>Revertir
            </button>
          `;
        }
      }

      const accionesHtml = esAuditor 
        ? '<span class="badge bg-light text-muted border"><i class="fa-solid fa-lock me-1"></i>Solo Lectura</span>'
        : `
          <div class="d-flex align-items-center justify-content-center gap-1">
            ${botonAprobacion}
            <button class="btn btn-sm btn-outline-primary" onclick="window.ofertasModule.abrirModalPago('${p.id}')" title="Editar Pago">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn btn-sm btn-outline-danger" onclick="window.ofertasModule.eliminarPago('${p.id}')" title="Eliminar Pago">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        `;

      html += `
        <tr>
          <td class="align-middle fw-bold text-dark small">${window.utils.escapeHtml(p.fecha_pago || window.utils.formatDate(p.created_at))}</td>
          <td class="align-middle">
            <strong class="text-primary">${window.utils.escapeHtml(usr.nombre_completo || 'Participante Desconocido')}</strong>
            <br><small class="text-muted"><i class="fa-solid fa-id-card me-1"></i>${window.utils.escapeHtml(usr.cedula || 'N/A')}</small>
            ${usr.telefono ? `<br><small><a href="https://wa.me/${usr.telefono.replace(/[^0-9]/g, '')}" target="_blank" class="text-success text-decoration-none fw-semibold" title="Contactar vía WhatsApp"><i class="fa-brands fa-whatsapp me-1"></i>${window.utils.escapeHtml(usr.telefono)}</a></small>` : '<br><small class="text-warning"><i class="fa-solid fa-phone-slash me-1"></i>Sin registrar</small>'}
          </td>
          <td class="align-middle font-weight-bold text-wrap small" style="max-width: 200px;">${window.utils.escapeHtml(nombreTaller)}</td>
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
  }

  // ═════════════════════════════════════════════════════════════════
  // APROBACIÓN 1 A 1 DE PAGOS
  // ═════════════════════════════════════════════════════════════════

  async function aprobarPago(pagoId) {
    if (window.authAdmin && window.authAdmin.isAuditor()) {
      window.utils.showToast('Acceso restringido: Perfil AUDITOR es de solo lectura.', 'warning');
      return;
    }

    const pago = cachedPagos.find(p => String(p.id) === String(pagoId));
    const montoStr = pago ? `${parseFloat(pago.monto || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.` : '';

    window.utils.showConfirm({
      title: 'Aprobar y Confirmar Pago',
      message: `¿Desea aprobar y validar la declaración de pago por ${montoStr}?`,
      subtext: 'El estado del pago cambiará a APROBADO en la base de datos.',
      confirmText: 'Sí, Aprobar Pago',
      confirmClass: 'btn-success',
      onConfirm: async () => {
        try {
          if (window.utils && window.utils.showLoading) {
            window.utils.showLoading(40, 'Aprobando pago...', 'Actualizando base de datos Turso');
          }

          const res = await window.api.update('pagos', pagoId, { status: true });
          if (res && res.status === 'success') {
            window.utils.showToast('Pago aprobado y validado exitosamente.', 'success');
            
            // Actualizar en caché local inmediatamente
            const p = cachedPagos.find(x => String(x.id) === String(pagoId));
            if (p) p.status = true;

            actualizarMetricasPagos();
            renderTablaPagosFiltrada();
          } else {
            window.utils.showToast('Error al aprobar pago: ' + (res?.message || 'Error desconocido'), 'danger');
          }
        } catch (e) {
          console.error('Error aprobando pago:', e);
          window.utils.showToast('Error de conexión al aprobar el pago', 'danger');
        } finally {
          if (window.utils && window.utils.hideLoading) window.utils.hideLoading();
        }
      }
    });
  }

  async function revertirPago(pagoId) {
    if (window.authAdmin && window.authAdmin.isAuditor()) {
      window.utils.showToast('Acceso restringido: Perfil AUDITOR es de solo lectura.', 'warning');
      return;
    }

    try {
      if (window.utils && window.utils.showLoading) {
        window.utils.showLoading(40, 'Revisando estatus...', 'Guardando cambios en la base de datos');
      }

      const res = await window.api.update('pagos', pagoId, { status: false });
      if (res && res.status === 'success') {
        window.utils.showToast('El pago ha sido marcado como PENDIENTE de revisión.', 'info');
        
        const p = cachedPagos.find(x => String(x.id) === String(pagoId));
        if (p) p.status = false;

        actualizarMetricasPagos();
        renderTablaPagosFiltrada();
      } else {
        window.utils.showToast('Error al actualizar estatus', 'danger');
      }
    } catch (e) {
      console.error('Error al revertir pago:', e);
      window.utils.showToast('Error al actualizar estatus del pago', 'danger');
    } finally {
      if (window.utils && window.utils.hideLoading) window.utils.hideLoading();
    }
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
          const rawCursoId = String(parseInt(p.id_curso_ofertado, 10) || p.id_curso_ofertado);
          let matchOpt = Array.from(selCurso.options).find(o => String(o.value) === rawCursoId);
          if (matchOpt) {
            selCurso.value = rawCursoId;
          } else {
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
    const statusVal = document.getElementById('inputPagoStatus').value === 'true';
    let captureUrl = document.getElementById('inputPagoCaptureUrl').value.trim();

    if (!id_usuario || !id_curso_ofertado || monto <= 0 || !numero_transferencia) {
      window.utils.showToast('Por favor complete todos los campos obligatorios del pago', 'warning');
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

      const cursoIdNormalizado = String(parseInt(id_curso_ofertado, 10) || id_curso_ofertado);

      const payload = {
        id_usuario,
        id_curso_ofertado: cursoIdNormalizado,
        banco_origen,
        monto,
        numero_transferencia,
        fecha_pago,
        capture: captureUrl,
        status: statusVal ? 'APROBADO' : 'PENDIENTE'
      };

      if (id) {
        await window.api.update('pagos', id, payload);
        window.utils.showToast('Declaración de pago actualizada exitosamente', 'success');
      } else {
        payload.id = window.utils.generateUUID();
        payload.created_at = new Date().toISOString();
        await window.api.create('pagos', payload);
        window.utils.showToast('Pago registrado y validado exitosamente', 'success');
      }

      const modalEl = document.getElementById('modalPagoManual');
      const inst = bootstrap.Modal.getInstance(modalEl);
      if (inst) inst.hide();

      await cargarTablaPagos();
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

    window.utils.showConfirm({
      title: 'Eliminar Declaración de Pago',
      message: '¿Está seguro de que desea eliminar permanentemente este registro de pago?',
      subtext: 'Esta acción no se puede deshacer.',
      confirmText: 'Sí, Eliminar',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        try {
          if (window.utils && window.utils.showLoading) {
            window.utils.showLoading(30, 'Eliminando pago...', 'Espere un momento');
          }
          await window.api.delete('pagos', id);
          window.utils.showToast('Declaración de pago eliminada', 'success');
          await cargarTablaPagos();
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
      btnRefrescar.addEventListener('click', () => cargarTablaPagos());
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

  function abrirModalNuevaOferta() {
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

  function abrirModalCargaMasivaPagos() {
    if (window.authAdmin && window.authAdmin.isAuditor()) {
      window.utils.showToast('Acceso restringido: Perfil AUDITOR es de solo lectura.', 'warning');
      return;
    }

    pagosMasivosParsed = [];
    const modalEl = document.getElementById('modalCargaMasivaPagos');
    if (!modalEl) return;

    const fileInput = document.getElementById('fileCsvPagos');
    if (fileInput) fileInput.value = '';

    const txtArea = document.getElementById('textareaCargaMasivaPagos');
    if (txtArea) txtArea.value = '';

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

  function parsearTextoCsvPagos(text, defaultCursoId) {
    if (!text || !text.trim()) return [];
    const lines = text.split(/\r?\n/);
    const parsed = [];

    const cursoMap = new Map();
    cachedOfertas.forEach(o => {
      cursoMap.set(String(o.id), o);
      cursoMap.set(String(o.taller).toUpperCase().trim(), o);
    });

    let headerIndices = null;

    lines.forEach((line, lineIdx) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      let parts = trimmed.split(/[,;\t|]/).map(p => p.trim().replace(/^["']|["']$/g, ''));
      if (parts.length === 1) {
        const match = trimmed.match(/^([VE]?-?\d+)\s+(.+)$/i);
        if (match) parts = [match[1], match[2]];
      }

      if (lineIdx === 0 && !headerIndices) {
        const lowerFirst = parts.map(p => p.toLowerCase());
        const isHeader = lowerFirst.some(p => /^(cedula|cédula|ci|dni|documento|referencia|ref|monto|taller|curso|banco|fecha)$/.test(p));
        if (isHeader) {
          headerIndices = {
            cedula: lowerFirst.findIndex(p => /^(cedula|cédula|ci|dni|documento)$/.test(p)),
            curso: lowerFirst.findIndex(p => /^(taller|curso|curso_ofertado|id_curso|id_curso_ofertado)$/.test(p)),
            referencia: lowerFirst.findIndex(p => /^(referencia|ref|numero_transferencia|nro_transferencia|transferencia)$/.test(p)),
            monto: lowerFirst.findIndex(p => /^(monto|monto_bs|valor|precio)$/.test(p)),
            banco: lowerFirst.findIndex(p => /^(banco|banco_origen)$/.test(p)),
            fecha: lowerFirst.findIndex(p => /^(fecha|fecha_pago)$/.test(p)),
            nombre: lowerFirst.findIndex(p => /^(nombre|nombre_completo|participante|usuario)$/.test(p))
          };
          return;
        }
      }

      let rawCedula = '';
      let rawCurso = '';
      let rawRef = '';
      let rawMonto = '';
      let rawBanco = '';
      let rawFecha = '';
      let rawNombre = '';

      if (headerIndices) {
        rawCedula = headerIndices.cedula !== -1 && parts[headerIndices.cedula] ? parts[headerIndices.cedula] : '';
        rawCurso = headerIndices.curso !== -1 && parts[headerIndices.curso] ? parts[headerIndices.curso] : '';
        rawRef = headerIndices.referencia !== -1 && parts[headerIndices.referencia] ? parts[headerIndices.referencia] : '';
        rawMonto = headerIndices.monto !== -1 && parts[headerIndices.monto] ? parts[headerIndices.monto] : '';
        rawBanco = headerIndices.banco !== -1 && parts[headerIndices.banco] ? parts[headerIndices.banco] : '';
        rawFecha = headerIndices.fecha !== -1 && parts[headerIndices.fecha] ? parts[headerIndices.fecha] : '';
        rawNombre = headerIndices.nombre !== -1 && parts[headerIndices.nombre] ? parts[headerIndices.nombre] : '';
      } else {
        rawCedula = parts[0] || '';
        if (parts.length >= 6) {
          rawCurso = parts[1];
          rawRef = parts[2];
          rawMonto = parts[3];
          rawBanco = parts[4];
          rawFecha = parts[5];
        } else if (parts.length === 5) {
          rawCurso = parts[1];
          rawRef = parts[2];
          rawMonto = parts[3];
          rawBanco = parts[4];
        } else if (parts.length === 4) {
          rawCurso = parts[1];
          rawRef = parts[2];
          rawMonto = parts[3];
        } else if (parts.length === 3) {
          rawRef = parts[1];
          rawMonto = parts[2];
        } else if (parts.length === 2) {
          if (/^[\d.,]+$/.test(parts[1])) {
            rawMonto = parts[1];
          } else {
            rawCurso = parts[1];
          }
        }
      }

      if (!rawCedula || !/\d/.test(rawCedula)) return;

      const normCedula = window.utils.normalizeCedula(rawCedula);
      if (!normCedula) return;

      let cursoObj = null;
      if (rawCurso) {
        cursoObj = cursoMap.get(String(rawCurso).trim()) || cursoMap.get(String(rawCurso).trim().toUpperCase());
        if (!cursoObj) {
          const term = String(rawCurso).toUpperCase().trim();
          cursoObj = cachedOfertas.find(o => String(o.taller).toUpperCase().includes(term));
        }
      }
      if (!cursoObj && defaultCursoId) {
        cursoObj = cachedOfertas.find(o => String(o.id) === String(defaultCursoId));
      }
      if (!cursoObj && cachedOfertas.length > 0) {
        cursoObj = cachedOfertas[0];
      }

      let montoNum = 0;
      if (rawMonto) {
        const cleanedMonto = String(rawMonto).replace(/[^0-9.,]/g, '').replace(',', '.');
        montoNum = parseFloat(cleanedMonto) || 0;
      }
      if (montoNum === 0 && cursoObj) {
        montoNum = parseFloat((parseFloat(cursoObj.valor_estudiante || 0) * (tasaDolarActual || 36.5)).toFixed(2));
      }

      const refFinal = rawRef ? String(rawRef).trim() : `CSV-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`;
      const bancoFinal = rawBanco ? String(rawBanco).trim() : 'Pago Móvil / Transferencia';

      let fechaFinal = new Date().toISOString().split('T')[0];
      if (rawFecha) {
        const fTrim = rawFecha.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(fTrim)) {
          fechaFinal = fTrim;
        } else if (/^\d{2}[/-]\d{2}[/-]\d{4}$/.test(fTrim)) {
          const p = fTrim.split(/[/-]/);
          fechaFinal = `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
        }
      }

      parsed.push({
        cedula: normCedula,
        nombre_completo: rawNombre,
        id_curso_ofertado: cursoObj ? cursoObj.id : null,
        nombre_curso: cursoObj ? cursoObj.taller : 'Taller no asignado',
        numero_transferencia: refFinal,
        monto: montoNum,
        banco_origen: bancoFinal,
        fecha_pago: fechaFinal,
        status: 'PENDIENTE'
      });
    });

    return parsed;
  }

  function procesarTextoPagosMasivos() {
    const text = document.getElementById('textareaCargaMasivaPagos')?.value || '';
    const defaultCursoId = document.getElementById('selectCursoDefaultPagosMasivos')?.value || '';
    pagosMasivosParsed = parsearTextoCsvPagos(text, defaultCursoId);
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
          No se detectaron pagos válidos. Asegúrese de que cada línea contenga al menos la <strong>Cédula</strong> (ej: <code>V-12345678, Taller, 00123456, 350.50</code>).
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

    let rowsHtml = '';
    pagosMasivosParsed.forEach((p, idx) => {
      validadosCount++;
      montoTotal += parseFloat(p.monto || 0);

      const cleanCed = String(p.cedula).replace(/[\s.-]/g, '').toUpperCase();
      const existingUser = usuariosMap.get(cleanCed);

      let usuarioBadge = '';
      if (existingUser) {
        usuariosExistentesCount++;
        p.id_usuario = existingUser.id;
        p.nombre_completo = existingUser.nombre_completo;
        usuarioBadge = `<strong class="text-primary">${window.utils.escapeHtml(existingUser.nombre_completo)}</strong><br><small class="text-success"><i class="fa-solid fa-user-check me-1"></i>Registrado en BD</small>`;
      } else {
        usuariosNuevosCount++;
        const nomDisplay = p.nombre_completo || `PARTICIPANTE ${p.cedula}`;
        p.nombre_completo = nomDisplay;
        usuarioBadge = `<strong class="text-dark">${window.utils.escapeHtml(nomDisplay)}</strong><br><small class="text-info"><i class="fa-solid fa-user-plus me-1"></i>Nuevo (Se creará en BD)</small>`;
      }

      rowsHtml += `
        <tr>
          <td class="text-center font-monospace">${idx + 1}</td>
          <td><span class="badge bg-dark font-monospace">${window.utils.escapeHtml(p.cedula)}</span></td>
          <td>${usuarioBadge}</td>
          <td class="small fw-semibold text-wrap" style="max-width: 180px;">${window.utils.escapeHtml(p.nombre_curso)}</td>
          <td class="text-center font-monospace small"><code>${window.utils.escapeHtml(p.numero_transferencia)}</code></td>
          <td class="text-end fw-bold text-success">${parseFloat(p.monto || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.</td>
          <td class="small text-muted">${window.utils.escapeHtml(p.banco_origen)}</td>
          <td class="small text-center">${window.utils.escapeHtml(p.fecha_pago)}</td>
          <td class="text-center">
            <span class="badge bg-warning text-dark py-2 px-2 fw-bold">
              <i class="fa-solid fa-clock me-1"></i>PENDIENTE
            </span>
          </td>
        </tr>
      `;
    });

    container.innerHTML = `
      <div class="row g-2 mb-3">
        <div class="col-md-3">
          <div class="bg-white p-2 rounded border text-center shadow-sm">
            <small class="text-muted d-block fw-semibold">Pagos a Subir</small>
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
            <small class="d-block pt-1"><strong>${usuariosExistentesCount}</strong> en BD | <span class="text-info font-weight-bold"><strong>${usuariosNuevosCount}</strong> nuevos</span></small>
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
              <th>Participante</th>
              <th>Curso / Taller Ofertado</th>
              <th class="text-center">Referencia</th>
              <th class="text-end">Monto</th>
              <th>Banco</th>
              <th class="text-center">Fecha</th>
              <th class="text-center">Estatus Inicial</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `;

    if (btnConfirmar) {
      btnConfirmar.disabled = (validadosCount === 0);
      btnConfirmar.innerHTML = `<i class="fa-solid fa-cloud-arrow-up me-2"></i>Subir ${validadosCount} Pagos al Sistema (Quedan Pendientes)`;
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
        window.utils.showLoading(50, 'Subiendo pagos masivos a Turso...', 'Registrando pagos en estado PENDIENTE');
      }

      const res = await window.api.bulkCreatePagos(pagosMasivosParsed);
      if (res && res.status === 'success') {
        window.utils.showToast(res.message || 'Pagos subidos exitosamente en espera de verificación.', 'success');
        
        const modalEl = document.getElementById('modalCargaMasivaPagos');
        if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).hide();

        await cargarTablaPagos();

        // Cambiar filtro para mostrar pendientes de inmediato
        const selFiltro = document.getElementById('selectFiltroEstatusPago');
        if (selFiltro) {
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
   * Columnas: cedula, nombre_completo, curso_ofertado, referencia, monto, banco_origen, capture, fecha
   */
  async function exportarPagosPendientesCsv() {
    try {
      // Si aún no se han cargado los datos, cargarlos primero
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

      const encabezados = ['cedula', 'nombre_completo', 'curso_ofertado', 'referencia', 'monto', 'banco_origen', 'capture', 'fecha'];
      const filas = pendientes.map(p => {
        const usr = usuariosMap[String(p.id_usuario)] || {};
        const ofr = resolverOferta(p.id_curso_ofertado) || {};
        const fecha = p.fecha_pago || (p.created_at ? String(p.created_at).slice(0, 10) : '');
        return [
          usr.cedula || '',
          usr.nombre_completo || '',
          ofr.taller || p.taller || '',
          p.numero_transferencia || '',
          (parseFloat(p.monto || 0) || 0).toFixed(2),
          p.banco_origen || '',
          resolverUrlCapture(p.capture),
          fecha
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
    const csvContent = "cedula,curso_ofertado,referencia,monto,banco,fecha\n" +
      "V-12345678,Taller de Inteligencia Artificial,00984572,350.50,Banco de Venezuela (0102),2026-10-25\n" +
      "V-87654321,Desarrollo Web Fullstack,00451278,500.00,Pago Móvil Interbancario,2026-10-25\n" +
      "V-19876543,Ciberseguridad y Redes,00781290,420.00,Banesco (0134),2026-10-25";

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'plantilla_carga_masiva_pagos_uptpc.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    window.utils.showToast('Plantilla CSV descargada', 'info');
  }

  window.ofertasModule = {
    init,
    cargarTablaOfertas,
    cargarTablaPagos,
    aprobarPago,
    revertirPago,
    abrirModalPago,
    guardarPagoManual,
    eliminarPago,
    editarOferta,
    eliminarOferta,
    verFlayerFull,
    verCaptureFull,
    abrirModalCargaMasivaPagos,
    ejecutarCargaMasivaPagos,
    descargarPlantillaCsvPagos
  };
})();
