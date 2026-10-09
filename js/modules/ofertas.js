/**
 * ==============================================================================
 * SISTEMA DE GESTIÓN DE CERTIFICACIONES UPTPC - MÓDULO DE OFERTAS Y PAGOS (js/modules/ofertas.js)
 * ==============================================================================
 */

(function() {
  const FLYER_FOLDER_ID = '110EX5edxA-UP1_Q3JpfLZ3qAN7Y92J9J';
  let tasaDolarActual = 36.5;
  let cursoEditandoId = null;

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

    await Promise.all([cargarTablaOfertas(), cargarTablaPagos()]);
    initEventListeners();
  }

  async function cargarTablaOfertas() {
    const tbody = document.getElementById('tbodyOfertasCursos');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-3"><i class="fa-solid fa-spinner fa-spin me-2"></i>Cargando ofertas de cursos...</td></tr>';

    try {
      const res = await window.api.getAll('curso_ofertado');
      const ofertas = (res && res.status === 'success' && Array.isArray(res.data)) ? res.data : [];

      if (ofertas.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-4"><i class="fa-solid fa-folder-open fa-2x mb-2 d-block"></i>No hay talleres ni cursos ofertados registrados en el sistema.</td></tr>';
        return;
      }

      let html = '';
      ofertas.forEach(o => {
        const valEstBs = (parseFloat(o.valor_estudiante || 0) * tasaDolarActual).toFixed(2);
        const valForBs = (parseFloat(o.valor_foraneo || 0) * tasaDolarActual).toFixed(2);

        const imgTag = o.flayer 
          ? `<img src="${window.utils.escapeHtml(o.flayer)}" class="img-thumbnail cursor-pointer" style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px;" onclick="window.ofertasModule.verFlayerFull('${window.utils.escapeHtml(o.flayer)}', '${window.utils.escapeHtml(o.taller)}')">`
          : '<span class="badge bg-secondary">Sin Portada</span>';

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
            <td class="align-middle text-center">
              <div class="btn-group btn-group-sm">
                <button class="btn btn-outline-primary" onclick="window.ofertasModule.editarOferta('${o.id}')" title="Editar taller">
                  <i class="fa-solid fa-pen"></i>
                </button>
                <button class="btn btn-outline-danger" onclick="window.ofertasModule.eliminarOferta('${o.id}', '${window.utils.escapeHtml(o.taller)}')" title="Eliminar taller">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      });

      tbody.innerHTML = html;
    } catch (err) {
      console.error('Error cargando tabla ofertas:', err);
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger py-3"><i class="fa-solid fa-circle-exclamation me-2"></i>Error al cargar las ofertas de cursos.</td></tr>';
    }
  }

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

      const pagos = (resPagos && resPagos.status === 'success' && Array.isArray(resPagos.data)) ? resPagos.data : [];
      const usuariosMap = Object.fromEntries(((resUsuarios && resUsuarios.data) || []).map(u => [String(u.id), u]));
      const ofertasMap = Object.fromEntries(((resOfertas && resOfertas.data) || []).map(o => [String(o.id), o]));

      if (pagos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted py-4"><i class="fa-solid fa-receipt fa-2x mb-2 d-block"></i>No hay declaraciones de pago registradas.</td></tr>';
        return;
      }

      pagos.sort((a, b) => new Date(b.created_at || b.fecha_pago || 0) - new Date(a.created_at || a.fecha_pago || 0));

      let html = '';
      pagos.forEach(p => {
        const usr = usuariosMap[String(p.id_usuario)] || {};
        const ofr = ofertasMap[String(p.id_curso_ofertado)] || {};

        const isVerificado = (p.status === true || String(p.status).toLowerCase() === 'true');
        const statusBadge = isVerificado 
          ? '<span class="badge bg-success py-2 px-3"><i class="fa-solid fa-circle-check me-1"></i>Verificado / Enviado a Admin</span>'
          : '<span class="badge bg-warning text-dark py-2 px-3"><i class="fa-solid fa-clock me-1"></i>En Proceso</span>';

        const captureTag = p.capture 
          ? `<button class="btn btn-sm btn-outline-info" onclick="window.ofertasModule.verCaptureFull('${window.utils.escapeHtml(p.capture)}', '${window.utils.escapeHtml(usr.nombre_completo || 'Pago')}')"><i class="fa-solid fa-image me-1"></i>Ver Capture</button>`
          : '<span class="text-muted small">Sin Capture</span>';

        html += `
          <tr>
            <td class="align-middle fw-bold text-dark">${window.utils.escapeHtml(p.fecha_pago || window.utils.formatDate(p.created_at))}</td>
            <td class="align-middle">
              <strong class="text-primary">${window.utils.escapeHtml(usr.nombre_completo || 'Usuario Desconocido')}</strong>
              <br><small class="text-muted"><i class="fa-solid fa-id-card me-1"></i>${window.utils.escapeHtml(usr.cedula || 'N/A')}</small>
              ${usr.telefono ? `<br><small class="text-muted"><i class="fa-solid fa-phone me-1"></i>${window.utils.escapeHtml(usr.telefono)}</small>` : ''}
            </td>
            <td class="align-middle font-weight-bold text-wrap" style="max-width: 200px;">${window.utils.escapeHtml(ofr.taller || 'Taller No Especificado')}</td>
            <td class="align-middle small">${window.utils.escapeHtml(p.banco_origen || 'N/A')}</td>
            <td class="align-middle text-center font-weight-bold text-success">${parseFloat(p.monto || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })} Bs.</td>
            <td class="align-middle text-center"><code>${window.utils.escapeHtml(p.numero_transferencia || 'S/R')}</code></td>
            <td class="align-middle text-center">${captureTag}</td>
            <td class="align-middle text-center">${statusBadge}</td>
            <td class="align-middle text-center">
              <div class="btn-group btn-group-sm">
                <button class="btn ${isVerificado ? 'btn-outline-warning' : 'btn-outline-success'}" onclick="window.ofertasModule.cambiarEstatusPago('${p.id}', ${!isVerificado})" title="${isVerificado ? 'Marcar En Proceso' : 'Marcar como Verificado'}">
                  <i class="fa-solid ${isVerificado ? 'fa-rotate-left' : 'fa-check'} me-1"></i>${isVerificado ? 'Desmarcar' : 'Verificar'}
                </button>
                <button class="btn btn-outline-danger" onclick="window.ofertasModule.eliminarPago('${p.id}')" title="Eliminar Pago">
                  <i class="fa-solid fa-trash"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      });

      tbody.innerHTML = html;
    } catch (err) {
      console.error('Error cargando tabla de pagos:', err);
      tbody.innerHTML = '<tr><td colspan="9" class="text-center text-danger py-3"><i class="fa-solid fa-circle-exclamation me-2"></i>Error al cargar los pagos registrados.</td></tr>';
    }
  }

  function initEventListeners() {
    const btnNuevo = document.getElementById('btnNuevaOfertaCurso');
    if (btnNuevo && !btnNuevo.dataset.bound) {
      btnNuevo.dataset.bound = 'true';
      btnNuevo.addEventListener('click', abrirModalNuevaOferta);
    }

    const form = document.getElementById('formOfertaCurso');
    if (form && !form.dataset.bound) {
      form.dataset.bound = 'true';
      form.addEventListener('submit', guardarOfertaCurso);
    }

    const fileInput = document.getElementById('inputOfertaFlayerFile');
    if (fileInput && !fileInput.dataset.bound) {
      fileInput.dataset.bound = 'true';
      fileInput.addEventListener('change', previewFlayerFile);
    }
  }

  function abrirModalNuevaOferta() {
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

    window.utils.showLoading(20, 'Guardando curso ofertado...', 'Procesando imagen de portada si aplica');

    try {
      if (file) {
        window.utils.showLoading(50, 'Subiendo flayer a Google Drive...', 'Guardando en carpeta oficial');
        const compressedBase64 = await window.utils.compressImage(file, 800, 800, 0.8);
        const filename = `flayer_${Date.now()}_${file.name.replace(/[^a-zA-Z0-9\._-]/g, '')}`;
        
        const uploadRes = await window.api.uploadImage(compressedBase64, filename, FLYER_FOLDER_ID);
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
      window.utils.hideLoading();
    }
  }

  function eliminarOferta(id, tallerNombre) {
    window.utils.showConfirm({
      title: 'Eliminar Taller Ofertado',
      message: `¿Está seguro de que desea eliminar el taller "${tallerNombre}"?`,
      subtext: 'Esta acción no se puede deshacer.',
      confirmText: 'Sí, Eliminar',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        try {
          window.utils.showLoading(30, 'Eliminando oferta...', 'Por favor espere');
          await window.api.delete('curso_ofertado', id);
          window.utils.showToast('Taller ofertado eliminado correctamente', 'success');
          await cargarTablaOfertas();
        } catch (e) {
          window.utils.showToast('Error al eliminar oferta: ' + e.message, 'danger');
        } finally {
          window.utils.hideLoading();
        }
      }
    });
  }

  async function cambiarEstatusPago(pagoId, nuevoEstado) {
    try {
      window.utils.showLoading(40, 'Actualizando estatus del pago...', 'Guardando cambios');
      const res = await window.api.update('pagos', pagoId, { status: Boolean(nuevoEstado) });
      if (res && res.status === 'success') {
        window.utils.showToast(`Pago ${nuevoEstado ? 'verificado' : 'puesto en proceso'} correctamente`, 'success');
        await cargarTablaPagos();
      } else {
        window.utils.showToast('Error al actualizar el pago', 'danger');
      }
    } catch (err) {
      console.error('Error al cambiar estatus pago:', err);
      window.utils.showToast('Error al actualizar estatus de pago', 'danger');
    } finally {
      window.utils.hideLoading();
    }
  }

  function eliminarPago(id) {
    window.utils.showConfirm({
      title: 'Eliminar Declaración de Pago',
      message: '¿Está seguro de que desea eliminar esta declaración de pago?',
      subtext: 'Esta acción es irreversible.',
      confirmText: 'Sí, Eliminar',
      confirmClass: 'btn-danger',
      onConfirm: async () => {
        try {
          window.utils.showLoading(30, 'Eliminando pago...', 'Espere un momento');
          await window.api.delete('pagos', id);
          window.utils.showToast('Declaración de pago eliminada', 'success');
          await cargarTablaPagos();
        } catch (e) {
          window.utils.showToast('Error al eliminar pago: ' + e.message, 'danger');
        } finally {
          window.utils.hideLoading();
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
    editarOferta,
    eliminarOferta,
    cambiarEstatusPago,
    eliminarPago,
    verFlayerFull,
    verCaptureFull
  };
})();
