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
      const [resPagos, resUsuarios, resOfertas] = await Promise.all([
        window.api.getAll('pagos'),
        window.api.getAll('usuarios'),
        window.api.getAll('curso_ofertado')
      ]);

      cachedPagos = (resPagos && resPagos.status === 'success' && Array.isArray(resPagos.data)) ? resPagos.data : [];
      cachedUsuarios = (resUsuarios && resUsuarios.status === 'success' && Array.isArray(resUsuarios.data)) ? resUsuarios.data : [];
      cachedOfertas = (resOfertas && resOfertas.status === 'success' && Array.isArray(resOfertas.data)) ? resOfertas.data : [];

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
      const isOk = (p.status === true || String(p.status).toLowerCase() === 'true' || String(p.status).toLowerCase() === 'aprobado');
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
    const ofertasMap = Object.fromEntries(cachedOfertas.map(o => [String(o.id), o]));

    let filtrados = cachedPagos.filter(p => {
      const isVerificado = (p.status === true || String(p.status).toLowerCase() === 'true' || String(p.status).toLowerCase() === 'aprobado');
      
      if (filtroVal === 'pendientes' && isVerificado) return false;
      if (filtroVal === 'aprobados' && !isVerificado) return false;

      if (!searchVal) return true;

      const usr = usuariosMap[String(p.id_usuario)] || {};
      const ofr = ofertasMap[String(p.id_curso_ofertado)] || {};
      const matchUsuario = String(usr.nombre_completo || '').toUpperCase().includes(searchVal);
      const matchCedula = String(usr.cedula || '').toUpperCase().includes(searchVal);
      const matchRef = String(p.numero_transferencia || '').toUpperCase().includes(searchVal);
      const matchBanco = String(p.banco_origen || '').toUpperCase().includes(searchVal);
      const matchTaller = String(ofr.taller || '').toUpperCase().includes(searchVal);

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
      const ofr = ofertasMap[String(p.id_curso_ofertado)] || {};

      const isVerificado = (p.status === true || String(p.status).toLowerCase() === 'true' || String(p.status).toLowerCase() === 'aprobado');
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
            ${usr.telefono ? `<br><small class="text-muted"><i class="fa-solid fa-phone me-1"></i>${window.utils.escapeHtml(usr.telefono)}</small>` : ''}
          </td>
          <td class="align-middle font-weight-bold text-wrap small" style="max-width: 200px;">${window.utils.escapeHtml(ofr.taller || 'Taller No Especificado')}</td>
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
  // MODAL CREAR / EDITAR PAGO MANUAL (CRUD)
  // ═════════════════════════════════════════════════════════════════

  function abrirModalPago(pagoId = null) {
    if (window.authAdmin && window.authAdmin.isAuditor()) {
      window.utils.showToast('Acceso restringido: Perfil AUDITOR es de solo lectura.', 'warning');
      return;
    }

    pagoEditandoId = pagoId;
    const modalEl = document.getElementById('modalPagoManual');
    const form = document.getElementById('formPagoManual');
    if (!modalEl || !form) return;

    form.reset();

    // Poblar usuarios
    const selUsuario = document.getElementById('inputPagoUsuarioId');
    if (selUsuario) {
      selUsuario.innerHTML = '<option value="">-- Seleccionar Participante --</option>' +
        cachedUsuarios.map(u => `<option value="${u.id}">${window.utils.escapeHtml(u.cedula)} - ${window.utils.escapeHtml(u.nombre_completo)}</option>`).join('');
    }

    // Poblar cursos ofertados
    const selCurso = document.getElementById('inputPagoCursoOfertadoId');
    if (selCurso) {
      selCurso.innerHTML = '<option value="">-- Seleccionar Taller --</option>' +
        cachedOfertas.map(o => `<option value="${o.id}">${window.utils.escapeHtml(o.taller)} ($${parseFloat(o.valor_estudiante || 0).toFixed(2)})</option>`).join('');
    }

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
      if (selUsuario) selUsuario.value = p.id_usuario || '';
      if (selCurso) selCurso.value = p.id_curso_ofertado || '';
      document.getElementById('inputPagoBancoOrigen').value = p.banco_origen || 'Banco de Venezuela (0102)';
      document.getElementById('inputPagoMonto').value = p.monto || '';
      document.getElementById('inputPagoReferencia').value = p.numero_transferencia || '';
      document.getElementById('inputPagoFecha').value = p.fecha_pago ? p.fecha_pago.split('T')[0] : '';
      
      const isAprobado = (p.status === true || String(p.status).toLowerCase() === 'true' || String(p.status).toLowerCase() === 'aprobado');
      document.getElementById('inputPagoStatus').value = isAprobado ? 'true' : 'false';

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

      const payload = {
        id_usuario,
        id_curso_ofertado,
        banco_origen,
        monto,
        numero_transferencia,
        fecha_pago,
        capture: captureUrl,
        status: statusVal
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
    verCaptureFull
  };
})();
