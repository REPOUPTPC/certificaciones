/**
 * ==============================================================================
 * SISTEMA DE GESTIÓN DE CERTIFICACIONES UPTPC - EMISIÓN Y CONSULTA DE CERTIFICADOS (js/modules/certificados.js)
 * ==============================================================================
 */

(function() {
  let certificadosVistaData = [];
  let usuariosDisponibles = [];
  let cursosDisponibles = [];
  let usuariosSeleccionadosEmision = [];

  const certificadosModule = {
    async init() {
      this.bindEvents();
      await this.cargarCertificados();
    },

    bindEvents() {
      if (this._eventsBound) return;
      this._eventsBound = true;

      document.getElementById('btnNuevoCertificado')?.addEventListener('click', () => this.abrirModalCertificar());
      document.getElementById('formEmitirCertificados')?.addEventListener('submit', (e) => this.ejecutarEmisionCertificados(e));
      document.getElementById('inputSearchCertificados')?.addEventListener('input', (e) => this.filtrarCertificados(e.target.value));
      document.getElementById('selectFiltroCursoCertificado')?.addEventListener('change', (e) => this.filtrarPorCurso(e.target.value));
      document.getElementById('inputSearchUsuariosEmision')?.addEventListener('input', (e) => this.filtrarUsuariosModalEmision(e.target.value));
      document.getElementById('checkSelectAllUsuariosEmision')?.addEventListener('change', (e) => this.toggleSeleccionarTodosUsuarios(e.target.checked));
      document.getElementById('emisionCursoId')?.addEventListener('change', () => this.onCambioCursoEmision());
      document.getElementById('emisionFecha')?.addEventListener('change', () => this.actualizarLugarConFecha());
      document.getElementById('checkHabilitarTomoFolio')?.addEventListener('change', (e) => this.toggleHabilitarTomoFolio(e.target.checked));

      // Eventos Carga Rápida (CSV / Lista de Texto)
      document.getElementById('btnAbrirCargaRapidaEmision')?.addEventListener('click', () => this.abrirModalCargaRapida());
      document.getElementById('textareaCargaRapidaTexto')?.addEventListener('input', () => this.analizarTextoCargaRapida());
      document.getElementById('fileCargaRapidaCsv')?.addEventListener('change', (e) => this.cargarArchivoCsvEnTextarea(e));
      document.getElementById('btnLimpiarCargaRapida')?.addEventListener('click', () => this.limpiarCargaRapida());
      document.getElementById('btnConfirmarCargaRapida')?.addEventListener('click', () => this.procesarConfirmacionCargaRapida());

      // Eventos Modal Editar Certificado
      document.getElementById('formEditarCertificado')?.addEventListener('submit', (e) => this.guardarEdicionCertificado(e));
      document.getElementById('btnCerrarModalEditarCertificado')?.addEventListener('click', () => this.cerrarModalEditarCertificado());
      document.getElementById('btnCancelarModalEditarCertificado')?.addEventListener('click', () => this.cerrarModalEditarCertificado());
      document.getElementById('btnImprimirReporteInclusion')?.addEventListener('click', () => this.imprimirReporteInclusion());
    },

    async cargarCertificados() {
      try {
        const [vistaRes, uRes, cRes] = await Promise.all([
          window.api.getVistaCertificados().catch(e => ({ status: 'error', data: [] })),
          window.api.getAll('usuarios').catch(e => ({ status: 'error', data: [] })),
          window.api.getAll('cursos').catch(e => ({ status: 'error', data: [] }))
        ]);

        certificadosVistaData = (vistaRes && vistaRes.status === 'success') ? (vistaRes.data || []) : [];
        usuariosDisponibles = (uRes && uRes.status === 'success') ? (uRes.data || []) : [];
        cursosDisponibles = (cRes && cRes.status === 'success') ? (cRes.data || []) : [];

        this.renderTablaCertificados(certificadosVistaData);
        this.populateFiltroCursos();
      } catch (e) {
        console.error('Error cargando la lista de certificados:', e);
      }
    },

    populateFiltroCursos() {
      const select = document.getElementById('selectFiltroCursoCertificado');
      if (!select) return;

      select.innerHTML = '<option value="">-- Todos los Cursos / Talleres --</option>' +
        cursosDisponibles.map(c => `<option value="${c.id}">${window.utils.escapeHtml(c.nombre)}</option>`).join('');
    },

    renderTablaCertificados(lista) {
      const tbody = document.getElementById('tbodyCertificados');
      if (!tbody) return;

      if (!lista || lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4"><i class="fa-solid fa-graduation-cap fa-2x mb-2"></i><br>No hay certificados emitidos.</td></tr>`;
        return;
      }

      let html = '';
      lista.forEach((c, i) => {
        html += `
          <tr>
            <td>${i + 1}</td>
            <td><span class="badge bg-dark font-monospace text-warning fw-bold fs-6">${window.utils.escapeHtml(c.codigo)}</span></td>
            <td class="fw-semibold">${window.utils.escapeHtml(c.nombre_completo)}<br><small class="text-muted">${window.utils.escapeHtml(c.cedula)}</small></td>
            <td class="small">${window.utils.escapeHtml(c.nombre_curso)}</td>
            <td><span class="badge bg-info text-dark">${window.utils.escapeHtml(c.unidad_codigo)}</span></td>
            <td class="small">${window.utils.formatDate(c.fecha_curso)}</td>
            <td>
              <button class="btn btn-sm btn-outline-success me-1" onclick="window.certificadosModule.verCertificado('${c.codigo}')" title="Ver / Imprimir Certificado"><i class="fa-solid fa-eye"></i></button>
              <button class="btn btn-sm btn-outline-warning me-1" onclick="window.certificadosModule.abrirModalEditarCertificado('${c.id}')" title="Editar Certificado (Tomo, Folio, etc.)"><i class="fa-solid fa-pen-to-square"></i></button>
              <button class="btn btn-sm btn-outline-danger" onclick="window.certificadosModule.eliminarCertificado('${c.id}')" title="Anular / Eliminar"><i class="fa-solid fa-trash"></i></button>
            </td>
          </tr>
        `;
      });

      tbody.innerHTML = html;
      const badge = document.getElementById('badgeTotalCertificadosEmitidos');
      if (badge) badge.textContent = `${lista.length} emitidos`;
    },

    filtrarCertificados(query) {
      if (!query) {
        this.renderTablaCertificados(certificadosVistaData);
        return;
      }
      const q = query.trim().toUpperCase();
      const filtrados = certificadosVistaData.filter(c =>
        String(c.codigo).toUpperCase().includes(q) ||
        String(c.cedula).toUpperCase().includes(q) ||
        String(c.nombre_completo).toUpperCase().includes(q) ||
        String(c.nombre_curso).toUpperCase().includes(q)
      );
      this.renderTablaCertificados(filtrados);
    },

    filtrarPorCurso(cursoId) {
      if (!cursoId) {
        this.renderTablaCertificados(certificadosVistaData);
        return;
      }
      const filtrados = certificadosVistaData.filter(c => String(c.curso_id) === String(cursoId));
      this.renderTablaCertificados(filtrados);
    },

    toggleHabilitarTomoFolio(enabled) {
      const container = document.getElementById('containerInputsTomoFolio');
      const stateLabel = document.getElementById('textTomoFolioState');
      const inputTomo = document.getElementById('emisionTomo');
      const inputFolio = document.getElementById('emisionFolioInicial');

      if (enabled) {
        if (container) container.style.display = 'flex';
        if (stateLabel) {
          stateLabel.textContent = 'Habilitado (Guardará Tomo/Folio)';
          stateLabel.className = 'text-success fw-bold';
        }
        if (inputTomo) inputTomo.value = inputTomo.value || '01';
        if (inputFolio) inputFolio.value = inputFolio.value || '101';
      } else {
        if (container) container.style.display = 'none';
        if (stateLabel) {
          stateLabel.textContent = 'Desactivado (Sin Tomo/Folio)';
          stateLabel.className = 'text-muted fw-bold';
        }
        if (inputTomo) inputTomo.value = '';
        if (inputFolio) inputFolio.value = '';
      }
    },

    /**
     * Genera el texto del lugar en el formato de la BD: "PUERTO CABELLO DD DE MES DE YYYY"
     */
    generarTextoLugar(fechaStr) {
      const meses = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
      let d;
      if (fechaStr) {
        // Interpretar como fecha local para evitar desfase de zona horaria
        const partes = fechaStr.split('-');
        if (partes.length === 3) {
          d = new Date(parseInt(partes[0]), parseInt(partes[1]) - 1, parseInt(partes[2]));
        } else {
          d = new Date(fechaStr);
        }
      } else {
        d = new Date();
      }
      if (isNaN(d.getTime())) d = new Date();
      const dia = String(d.getDate()).padStart(2, '0');
      const mes = meses[d.getMonth()];
      const anio = d.getFullYear();
      return `PUERTO CABELLO ${dia} DE ${mes} DE ${anio}`;
    },

    /**
     * Actualiza el campo lugar cuando cambia la fecha de emisión
     */
    actualizarLugarConFecha() {
      const emFecha = document.getElementById('emisionFecha');
      const emLugar = document.getElementById('emisionLugar');
      if (emFecha && emLugar) {
        emLugar.value = this.generarTextoLugar(emFecha.value);
      }
    },

    async abrirModalCertificar(cursoIdSeleccionado = null) {
      this.bindEvents(); // Garantiza la vinculación de eventos independientemente de la pestaña inicial

      const modalEl = document.getElementById('modalCertificar');
      if (!modalEl) return;

      // Siempre recargar datos frescos del servidor al abrir el modal
      await this.cargarCertificados();

      usuariosSeleccionadosEmision = [];

      // Reset Tomo/Folio Switch
      const chkSwitch = document.getElementById('checkHabilitarTomoFolio');
      if (chkSwitch) {
        chkSwitch.checked = false;
        this.toggleHabilitarTomoFolio(false);
      }

      const selCurso = document.getElementById('emisionCursoId');
      if (selCurso) {
        selCurso.innerHTML = '<option value="">-- Seleccionar Taller / Curso --</option>' +
          cursosDisponibles.map(c => `<option value="${c.id}">${window.utils.escapeHtml(c.nombre)}</option>`).join('');

        if (cursoIdSeleccionado) {
          selCurso.value = cursoIdSeleccionado;
        } else if (cursosDisponibles.length > 0) {
          selCurso.value = cursosDisponibles[0].id;
        }
      }

      const emFecha = document.getElementById('emisionFecha');
      if (emFecha) emFecha.value = new Date().toISOString().split('T')[0];

      // Generar lugar con el formato correcto: PUERTO CABELLO DD DE MES DE YYYY
      const emLugar = document.getElementById('emisionLugar');
      if (emLugar) emLugar.value = this.generarTextoLugar(emFecha ? emFecha.value : null);

      this.onCambioCursoEmision();

      bootstrap.Modal.getOrCreateInstance(modalEl).show();
    },

    onCambioCursoEmision() {
      usuariosSeleccionadosEmision = [];
      const searchInput = document.getElementById('inputSearchUsuariosEmision');
      if (searchInput) searchInput.value = '';

      const curso_id = document.getElementById('emisionCursoId')?.value;
      const certsEnTaller = certificadosVistaData.filter(c => String(c.curso_id || '').trim() === String(curso_id).trim());
      const yaCertificadosSet = new Set(certsEnTaller.map(c => String(c.usuario_id || '').trim()));

      this.renderListaUsuariosEmision(usuariosDisponibles, yaCertificadosSet);
      this.renderListaParticipantesCertificadosEnTaller(certsEnTaller);
    },

    renderListaUsuariosEmision(lista, yaCertificadosSet = new Set()) {
      const container = document.getElementById('listaUsuariosEmisionContainer');
      const infoSpan = document.getElementById('infoDuplicadosCount');
      if (!container) return;

      if (!lista || lista.length === 0) {
        container.innerHTML = '<div class="alert alert-light text-center py-3 mb-0"><i class="fa-solid fa-users-slash me-1"></i>No hay usuarios coincidentes con la búsqueda.</div>';
        if (infoSpan) infoSpan.textContent = '0 resultados encontradas';
        return;
      }

      let countYaCert = 0;
      let countElegibles = 0;
      let rowsHtml = '';

      lista.forEach((u) => {
        const uid = String(u.id || '').trim();
        const yaCert = uid !== '' && yaCertificadosSet.has(uid);

        if (yaCert) {
          countYaCert++;
          rowsHtml += `
            <div class="form-check py-1 border-bottom bg-warning-subtle text-muted opacity-75">
              <input class="form-check-input" type="checkbox" disabled id="checkUsrEmision_${u.id}">
              <label class="form-check-label w-100" for="checkUsrEmision_${u.id}">
                <strong class="text-dark">${window.utils.escapeHtml(u.nombre_completo || '')}</strong>
                <span class="badge bg-secondary font-monospace ms-2">${window.utils.escapeHtml(u.cedula || '')}</span>
                <span class="badge bg-warning text-dark ms-2"><i class="fa-solid fa-triangle-exclamation me-1"></i>Ya Certificado en este taller</span>
              </label>
            </div>
          `;
        } else {
          countElegibles++;
          const isChecked = usuariosSeleccionadosEmision.some(x => String(x.id || '').trim() === uid) ? 'checked' : '';
          rowsHtml += `
            <div class="form-check py-1 border-bottom">
              <input class="form-check-input check-usuario-emision" type="checkbox" value="${u.id}" id="checkUsrEmision_${u.id}" ${isChecked} onchange="window.certificadosModule.toggleUsuarioSeleccionado('${u.id}')">
              <label class="form-check-label w-100 cursor-pointer" for="checkUsrEmision_${u.id}">
                <strong>${window.utils.escapeHtml(u.nombre_completo || '')}</strong>
                <span class="badge bg-secondary font-monospace ms-2">${window.utils.escapeHtml(u.cedula || '')}</span>
              </label>
            </div>
          `;
        }
      });

      if (infoSpan) {
        const queryText = document.getElementById('inputSearchUsuariosEmision')?.value.trim();
        if (queryText) {
          infoSpan.innerHTML = `<span class="text-primary fw-bold">${lista.length} coincidencia(s)</span> | <span class="text-success fw-bold">${countElegibles} elegibles</span> | <span class="text-warning-emphasis fw-bold">${countYaCert} ya certificados</span>`;
        } else if (yaCertificadosSet.size > 0) {
          infoSpan.innerHTML = `<span class="text-success fw-bold">${countElegibles} elegibles</span> | <span class="text-warning-emphasis fw-bold">${countYaCert} ya certificados</span>`;
        } else {
          infoSpan.textContent = `${countElegibles} participantes elegibles`;
        }
      }

      container.innerHTML = rowsHtml;
      this.actualizarContadorUsuariosSeleccionados();
    },

    renderListaParticipantesCertificadosEnTaller(certsEnTaller) {
      const container = document.getElementById('containerParticipantesCertificadosEnTaller');
      const badgeCount = document.getElementById('badgeParticipantesCertificadosCount');
      if (!container) return;

      if (badgeCount) {
        badgeCount.textContent = `${certsEnTaller.length} certificados`;
      }

      if (!certsEnTaller || certsEnTaller.length === 0) {
        container.innerHTML = '<p class="text-center text-muted small py-2 mb-0"><i class="fa-solid fa-info-circle me-1"></i>Aún no hay participantes certificados en este taller.</p>';
        return;
      }

      let html = `
        <table class="table table-sm table-hover align-middle mb-0 small">
          <thead class="table-light">
            <tr>
              <th>#</th>
              <th>Nombre Completo</th>
              <th>Cédula</th>
              <th>Código Certificado</th>
              <th>Fecha Emisión</th>
              <th class="text-end">Acción</th>
            </tr>
          </thead>
          <tbody>
      `;

      certsEnTaller.forEach((c, i) => {
        html += `
          <tr>
            <td>${i + 1}</td>
            <td class="fw-semibold text-dark">${window.utils.escapeHtml(c.nombre_completo)}</td>
            <td><span class="badge bg-secondary font-monospace">${window.utils.escapeHtml(c.cedula)}</span></td>
            <td><span class="badge bg-dark text-warning font-monospace fw-bold">${window.utils.escapeHtml(c.codigo)}</span></td>
            <td>${window.utils.formatDate(c.fecha_curso)}</td>
            <td class="text-end">
              <button type="button" class="btn btn-xs btn-outline-success py-0 px-2 me-1" onclick="window.certificadosModule.verCertificado('${c.codigo}')" title="Ver Certificado">
                <i class="fa-solid fa-eye me-1"></i>Ver
              </button>
              <button type="button" class="btn btn-xs btn-outline-warning py-0 px-2 me-1" onclick="window.certificadosModule.abrirModalEditarCertificado('${c.id}', true)" title="Editar Certificación">
                <i class="fa-solid fa-pen-to-square me-1"></i>Editar
              </button>
              <button type="button" class="btn btn-xs btn-outline-danger py-0 px-2" onclick="window.certificadosModule.eliminarCertificadoCurso('${c.id}')" title="Eliminar / Anular Certificación de este Curso">
                <i class="fa-solid fa-trash me-1"></i>Eliminar
              </button>
            </td>
          </tr>
        `;
      });

      html += '</tbody></table>';
      container.innerHTML = html;
    },

    async eliminarCertificadoCurso(id) {
      const cert = certificadosVistaData.find(c => String(c.id).trim() === String(id).trim());
      const certNombre = cert ? cert.nombre_completo : 'este participante';
      const certCodigo = cert ? cert.codigo : '';

      window.utils.showConfirm({
        title: 'Anular Certificación de Taller',
        message: `¿Está seguro de eliminar la certificación asignada a ${certNombre} (${certCodigo})?`,
        subtext: 'Esta acción eliminará el certificado del curso y quedará registrada en la bitácora auditada de eliminaciones.',
        confirmText: 'Sí, Anular Certificado',
        onConfirm: async () => {
          try {
            const sessionUser = (window.authAdmin && window.authAdmin.getSession()) ? window.authAdmin.getSession().usuario : 'ADMIN';
            
            // Registrar en bitácora auditada de eliminaciones (hoja: certificados_eliminados)
            if (cert) {
              const auditPayload = {
                id: window.utils.generateUUID(),
                certificado_id: cert.id || '',
                codigo: cert.codigo || '',
                cedula: cert.cedula || '',
                nombre_completo: cert.nombre_completo || '',
                curso_id: cert.curso_id || '',
                nombre_curso: cert.nombre_curso || '',
                motivo_eliminacion: 'Eliminación manual desde modal de curso',
                eliminado_por: sessionUser,
                fecha_eliminacion: new Date().toISOString()
              };
              
              await window.api.post('create', { tabla: 'certificados_eliminados', data: auditPayload }).catch(e => console.warn('Bitácora local error:', e));
            }

            const res = await window.api.delete('certificados', id);
            if (res.status === 'success') {
              window.utils.showToast('Certificación eliminada y registrada en la bitácora auditada', 'success');
              await this.cargarCertificados();
              this.onCambioCursoEmision();
              if (window.cursosModule) await window.cursosModule.cargarCursos();
            } else {
              window.utils.showToast(res.message, 'danger');
            }
          } catch (e) {
            window.utils.showToast('Error al eliminar la certificación', 'danger');
          }
        }
      });
    },

    filtrarUsuariosModalEmision(query) {
      const curso_id = document.getElementById('emisionCursoId')?.value;
      const certsEnTaller = certificadosVistaData.filter(c => String(c.curso_id).trim() === String(curso_id).trim());
      const yaCertificadosSet = new Set(certsEnTaller.map(c => String(c.usuario_id).trim()));

      if (!query) {
        this.renderListaUsuariosEmision(usuariosDisponibles, yaCertificadosSet);
        return;
      }

      const q = query.trim().toUpperCase();
      const filtrados = usuariosDisponibles.filter(u =>
        String(u.cedula).toUpperCase().includes(q) ||
        String(u.nombre_completo).toUpperCase().includes(q)
      );
      this.renderListaUsuariosEmision(filtrados, yaCertificadosSet);
    },

    toggleUsuarioSeleccionado(id) {
      const idx = usuariosSeleccionadosEmision.findIndex(x => String(x.id) === String(id));
      if (idx !== -1) {
        usuariosSeleccionadosEmision.splice(idx, 1);
      } else {
        const u = usuariosDisponibles.find(x => String(x.id) === String(id));
        if (u) usuariosSeleccionadosEmision.push(u);
      }
      this.actualizarContadorUsuariosSeleccionados();
    },

    toggleSeleccionarTodosUsuarios(checked) {
      const curso_id = document.getElementById('emisionCursoId')?.value;
      const certsEnTaller = certificadosVistaData.filter(c => String(c.curso_id).trim() === String(curso_id).trim());
      const yaCertificadosSet = new Set(certsEnTaller.map(c => String(c.usuario_id).trim()));

      if (checked) {
        // Seleccionar solo elegibles (no certificados previamente)
        usuariosSeleccionadosEmision = usuariosDisponibles.filter(u => !yaCertificadosSet.has(String(u.id).trim()));
      } else {
        usuariosSeleccionadosEmision = [];
      }
      this.renderListaUsuariosEmision(usuariosDisponibles, yaCertificadosSet);
    },

    actualizarContadorUsuariosSeleccionados() {
      const badge = document.getElementById('badgeUsuariosSeleccionadosCount');
      if (badge) badge.textContent = `${usuariosSeleccionadosEmision.length} seleccionados`;
    },

    async ejecutarEmisionCertificados(e) {
      e.preventDefault();

      const curso_id = document.getElementById('emisionCursoId').value;
      const fecha_curso = document.getElementById('emisionFecha').value;
      const lugar = document.getElementById('emisionLugar').value.trim();

      const isTomoEnabled = document.getElementById('checkHabilitarTomoFolio')?.checked;
      const tomo = isTomoEnabled ? document.getElementById('emisionTomo').value.trim() : '';
      const folio = isTomoEnabled ? document.getElementById('emisionFolioInicial').value.trim() : '';
      const limite_por_folio = isTomoEnabled ? (document.getElementById('emisionLimitePorFolio')?.value || '15') : '15';

      if (!curso_id) {
        window.utils.showToast('Seleccione el taller o curso', 'warning');
        return;
      }

      if (usuariosSeleccionadosEmision.length === 0) {
        window.utils.showToast('Seleccione al menos un usuario elegible para emitir certificado', 'warning');
        return;
      }

      const btn = e.target.querySelector('button[type="submit"]');
      const oldText = btn.innerHTML;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-2"></i>Emitiendo Certificados...';
      btn.disabled = true;

      try {
        const datos_generales = { fecha_curso, lugar, tomo, folio, limite_por_folio };
        const res = await window.api.bulkCertificar(curso_id, usuariosSeleccionadosEmision, datos_generales);

        if (res.status === 'success') {
          window.utils.showToast(`Se emitieron ${res.count || usuariosSeleccionadosEmision.length} certificados con códigos únicos de verificación (AAA1234AAA)`, 'success');

          // Forzar recarga completa de datos del servidor para reflejar los nuevos certificados
          await this.cargarCertificados();

          // Cerrar el modal DESPUÉS de que los datos se hayan refrescado
          bootstrap.Modal.getOrCreateInstance(document.getElementById('modalCertificar')).hide();

          if (window.cursosModule) await window.cursosModule.cargarCursos();

          // Mostrar Reporte de Inclusión en Registro de Tomo y Folio
          this.mostrarReporteInclusionTomoFolio(curso_id, res.data || [], datos_generales);
        } else {
          window.utils.showToast(res.message, 'danger');
        }
      } catch (err) {
        window.utils.showToast('Error durante la emisión masiva', 'danger');
      } finally {
        btn.innerHTML = oldText;
        btn.disabled = false;
      }
    },

    abrirModalCargaRapida() {
      const modalEl = document.getElementById('modalCargaRapidaEmision');
      if (!modalEl) return;

      this.limpiarCargaRapida();
      bootstrap.Modal.getOrCreateInstance(modalEl).show();
    },

    limpiarCargaRapida() {
      const txt = document.getElementById('textareaCargaRapidaTexto');
      const file = document.getElementById('fileCargaRapidaCsv');
      if (txt) txt.value = '';
      if (file) file.value = '';
      this.analizarTextoCargaRapida();
    },

    cargarArchivoCsvEnTextarea(e) {
      const file = e.target.files ? e.target.files[0] : null;
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target.result;
        const txt = document.getElementById('textareaCargaRapidaTexto');
        if (txt) {
          txt.value = content;
          this.analizarTextoCargaRapida();
        }
      };
      reader.readAsText(file);
    },

    analizarTextoCargaRapida() {
      const texto = document.getElementById('textareaCargaRapidaTexto')?.value || '';
      const tbody = document.getElementById('tbodyPreviewCargaRapida');
      const badgeResumen = document.getElementById('badgeResumenCargaRapida');
      if (!tbody) return;

      if (!texto.trim()) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">Pegue texto arriba para analizar los datos.</td></tr>';
        if (badgeResumen) badgeResumen.innerHTML = '<span class="badge bg-secondary">0 detectados</span>';
        return;
      }

      const lineas = texto.split(/\r?\n/);
      const itemsAnalizados = [];

      const curso_id = document.getElementById('emisionCursoId')?.value;
      const certsEnTaller = certificadosVistaData.filter(c => String(c.curso_id || '').trim() === String(curso_id).trim());
      const yaCertificadosCedulas = new Set(certsEnTaller.map(c => window.utils.normalizeCedula(c.cedula).replace(/[\s-]/g, '').toUpperCase()));

      let countNuevos = 0;
      let countExistentes = 0;
      let countYaCertificados = 0;
      let countConflictos = 0;

      lineas.forEach((lineaRaw) => {
        const linea = lineaRaw.trim();
        if (!linea) return;

        const partes = linea.split(/[,;\t|]+/).map(p => p.trim());
        let cedulaRaw = partes[0] ? partes[0].toUpperCase() : '';
        let nombre = partes.slice(1).join(' ').trim().toUpperCase();

        if (!cedulaRaw) return;

        let normCedula = window.utils.normalizeCedula(cedulaRaw);
        let cleanCedula = normCedula.replace(/[\s-]/g, '').toUpperCase();

        let userExistente = usuariosDisponibles.find(u => window.utils.normalizeCedula(u.cedula).replace(/[\s-]/g, '').toUpperCase() === cleanCedula);
        let yaCertificado = yaCertificadosCedulas.has(cleanCedula);

        let estado = '';
        let estadoBadge = '';

        if (yaCertificado) {
          countYaCertificados++;
          estado = 'ya_certificado';
          estadoBadge = '<span class="badge bg-warning text-dark"><i class="fa-solid fa-triangle-exclamation me-1"></i>Ya Certificado (Omitir)</span>';
        } else if (userExistente) {
          const csvNameClean = String(nombre || '').trim().toUpperCase().replace(/\s+/g, ' ');
          const bdNameClean = String(userExistente.nombre_completo || '').trim().toUpperCase().replace(/\s+/g, ' ');

          if (csvNameClean && csvNameClean !== 'S/N' && csvNameClean !== bdNameClean) {
            countConflictos++;
            estado = 'conflicto_nombre';
            estadoBadge = `<span class="badge bg-danger text-wrap text-start"><i class="fa-solid fa-circle-exclamation me-1"></i>¡ALERTA! Cédula en BD a nombre de "${window.utils.escapeHtml(userExistente.nombre_completo)}" (No se procesará)</span>`;
          } else {
            countExistentes++;
            estado = 'existente';
            estadoBadge = '<span class="badge bg-success"><i class="fa-solid fa-user-check me-1"></i>Existe en BD (Auto-seleccionar)</span>';
            if (!nombre || nombre === 'S/N') {
              nombre = userExistente.nombre_completo;
            }
          }
        } else {
          countNuevos++;
          estado = 'nuevo';
          estadoBadge = '<span class="badge bg-primary"><i class="fa-solid fa-user-plus me-1"></i>Nuevo (Registrar y Seleccionar)</span>';
        }

        itemsAnalizados.push({
          num: itemsAnalizados.length + 1,
          cedula: normCedula,
          nombre: nombre || 'S/N',
          estado,
          estadoBadge,
          userExistente
        });
      });

      if (badgeResumen) {
        badgeResumen.innerHTML = `
          <span class="badge bg-primary me-1">${countNuevos} nuevos</span>
          <span class="badge bg-success me-1">${countExistentes} en BD</span>
          <span class="badge bg-warning text-dark me-1">${countYaCertificados} ya certificados</span>
          ${countConflictos > 0 ? `<span class="badge bg-danger">${countConflictos} conflictos</span>` : ''}
        `;
      }

      if (itemsAnalizados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">No se detectaron datos válidos. Revisa el formato de cédulas.</td></tr>';
        return;
      }

      let html = '';
      itemsAnalizados.forEach(item => {
        html += `
          <tr class="${item.estado === 'conflicto_nombre' ? 'table-danger' : ''}">
            <td>${item.num}</td>
            <td><span class="badge bg-dark font-monospace">${window.utils.escapeHtml(item.cedula)}</span></td>
            <td class="fw-semibold text-dark">${window.utils.escapeHtml(item.nombre)}</td>
            <td>${item.estadoBadge}</td>
          </tr>
        `;
      });
      tbody.innerHTML = html;
    },

    async procesarConfirmacionCargaRapida() {
      const texto = document.getElementById('textareaCargaRapidaTexto')?.value || '';
      if (!texto.trim()) {
        window.utils.showToast('Debe ingresar o subir una lista de participantes.', 'warning');
        return;
      }

      const curso_id = document.getElementById('emisionCursoId')?.value;
      const certsEnTaller = certificadosVistaData.filter(c => String(c.curso_id || '').trim() === String(curso_id).trim());
      const yaCertificadosCedulas = new Set(certsEnTaller.map(c => window.utils.normalizeCedula(c.cedula).replace(/[\s-]/g, '').toUpperCase()));

      const lineas = texto.split(/\r?\n/);
      const nuevosParaRegistrar = [];
      const cedulasParaSeleccionar = new Set();

      lineas.forEach(lineaRaw => {
        const linea = lineaRaw.trim();
        if (!linea) return;

        const partes = linea.split(/[,;\t|]+/).map(p => p.trim());
        let cedulaRaw = partes[0] ? partes[0].toUpperCase() : '';
        let nombre = partes.slice(1).join(' ').trim().toUpperCase();

        if (!cedulaRaw) return;
        const normCedula = window.utils.normalizeCedula(cedulaRaw);
        const cleanCedula = normCedula.replace(/[\s-]/g, '').toUpperCase();

        if (yaCertificadosCedulas.has(cleanCedula)) return; // Omitir duplicados ya certificados

        const userExistente = usuariosDisponibles.find(u => window.utils.normalizeCedula(u.cedula).replace(/[\s-]/g, '').toUpperCase() === cleanCedula);

        if (userExistente) {
          const csvNameClean = String(nombre || '').trim().toUpperCase().replace(/\s+/g, ' ');
          const bdNameClean = String(userExistente.nombre_completo || '').trim().toUpperCase().replace(/\s+/g, ' ');
          if (csvNameClean && csvNameClean !== 'S/N' && csvNameClean !== bdNameClean) {
            // NO PROCESAR si hay conflicto de nombre
            return;
          }
          cedulasParaSeleccionar.add(cleanCedula);
        } else {
          cedulasParaSeleccionar.add(cleanCedula);
          nuevosParaRegistrar.push({
            cedula: normCedula,
            nombre_completo: nombre || 'PARTICIPANTE REGISTRADO EN CARGA RÁPIDA'
          });
        }
      });

      if (cedulasParaSeleccionar.size === 0) {
        window.utils.showToast('No hay participantes nuevos ni elegibles válidos para seleccionar en la lista ingresada.', 'info');
        return;
      }

      const btnConfirmar = document.getElementById('btnConfirmarCargaRapida');
      if (btnConfirmar) {
        btnConfirmar.disabled = true;
        btnConfirmar.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i> Procesando...';
      }

      try {
        let creadosCount = 0;
        if (nuevosParaRegistrar.length > 0) {
          const bulkRes = await window.api.bulkCreateUsuarios(nuevosParaRegistrar);
          if (bulkRes.status === 'success') {
            creadosCount = bulkRes.createdCount || (bulkRes.created ? bulkRes.created.length : nuevosParaRegistrar.length);
            // Refrescar usuarios del sistema
            const uRes = await window.api.getAll('usuarios');
            if (uRes.status === 'success') {
              usuariosDisponibles = uRes.data || [];
            }
          }
        }

        // Auto-seleccionar a todos los usuarios elegibles en usuariosSeleccionadosEmision
        usuariosSeleccionadosEmision = usuariosDisponibles.filter(u => {
          const cleanCedula = window.utils.normalizeCedula(u.cedula).replace(/[\s-]/g, '').toUpperCase();
          return cedulasParaSeleccionar.has(cleanCedula) && !yaCertificadosCedulas.has(cleanCedula);
        });

        // Sincronizar UI del modal principal
        this.onCambioCursoEmision();

        // Cerrar modal de carga rápida
        const modalEl = document.getElementById('modalCargaRapidaEmision');
        if (modalEl) {
          bootstrap.Modal.getInstance(modalEl)?.hide();
        }

        window.utils.showToast(`¡Carga rápida exitosa! Se seleccionaron ${usuariosSeleccionadosEmision.length} participantes (${creadosCount} creados en la BD).`, 'success');
      } catch (e) {
        window.utils.showToast('Error procesando la carga rápida de usuarios', 'danger');
      } finally {
        if (btnConfirmar) {
          btnConfirmar.disabled = false;
          btnConfirmar.innerHTML = '<i class="fa-solid fa-check-double me-1"></i> Registrar Nuevos y Auto-Seleccionar';
        }
      }
    },

    async verCertificado(codigo) {
      const cert = certificadosVistaData.find(c => String(c.codigo).toUpperCase() === String(codigo).toUpperCase());
      if (!cert) {
        window.utils.showToast('Certificado no encontrado', 'danger');
        return;
      }

      const modalEl = document.getElementById('modalVerCertificado');
      if (!modalEl) return;

      try {
        const disenoRes = await window.api.getDisenoActivo();
        const disenoConfig = disenoRes.status === 'success' ? disenoRes.data : null;

        let parsedDiseno = disenoConfig?.diseno;
        if (typeof parsedDiseno === 'string') {
          try { parsedDiseno = JSON.parse(parsedDiseno); } catch (e) {}
        }

        const svgHtml = window.certRenderer.renderCertificateSVG(parsedDiseno, cert);
        document.getElementById('verCertificadoContainer').innerHTML = svgHtml;

        document.getElementById('btnImprimirModalCertificado').onclick = () => {
          const printWin = window.open('', '_blank');
          printWin.document.write(`
            <html><head><title>Imprimir Certificado ${cert.codigo}</title>
            <style>@page { size: landscape; margin: 0; } body { margin: 0; display: flex; justify-content: center; align-items: center; height: 100vh; }</style>
            </head><body>${svgHtml}</body></html>
          `);
          printWin.document.close();
          printWin.focus();
          setTimeout(() => { printWin.print(); printWin.close(); }, 500);
        };

        new bootstrap.Modal(modalEl).show();
      } catch (e) {
        window.utils.showToast('Error renderizando el certificado', 'danger');
      }
    },

    async eliminarCertificado(id) {
      const cert = certificadosVistaData.find(c => String(c.id).trim() === String(id).trim()) ||
                   (window.api._globalCache && window.api._globalCache.certificados ? window.api._globalCache.certificados.find(c => String(c.id).trim() === String(id).trim()) : null);
      const certNombre = cert ? (cert.nombre_completo || 'este participante') : 'este participante';
      const certCodigo = cert ? (cert.codigo || '') : '';

      window.utils.showConfirm({
        title: 'Anular Certificado',
        message: `¿Está seguro de anular/eliminar el certificado ${certCodigo} de ${certNombre}?`,
        subtext: 'Esta acción registrará la eliminación en la bitácora de auditoría del sistema.',
        confirmText: 'Sí, Anular Certificado',
        onConfirm: async () => {
          try {
            const sessionUser = (window.authAdmin && window.authAdmin.getSession()) ? window.authAdmin.getSession().usuario : 'ADMIN';

            if (cert) {
              const auditPayload = {
                id: window.utils.generateUUID(),
                certificado_id: cert.id || '',
                codigo: cert.codigo || '',
                cedula: cert.cedula || '',
                nombre_completo: cert.nombre_completo || '',
                curso_id: cert.curso_id || '',
                nombre_curso: cert.nombre_curso || '',
                motivo_eliminacion: 'Eliminación manual desde tabla principal de certificados',
                eliminado_por: sessionUser,
                fecha_eliminacion: new Date().toISOString()
              };
              await window.api.post('create', { tabla: 'certificados_eliminados', data: auditPayload }).catch(e => console.warn('Bitácora local error:', e));
            }

            const res = await window.api.delete('certificados', id);
            if (res.status === 'success') {
              window.utils.showToast('Certificado eliminado y registrado en la bitácora auditada', 'success');
              await this.cargarCertificados();
            } else {
              window.utils.showToast(res.message, 'danger');
            }
          } catch (e) {
            window.utils.showToast('Error al eliminar certificado', 'danger');
          }
        }
      });
    },

    abrirModalEditarCertificado(id, returnToBulk = false) {
      const cert = certificadosVistaData.find(c => String(c.id).trim() === String(id).trim()) ||
                   (window.api._globalCache && window.api._globalCache.certificados ? window.api._globalCache.certificados.find(c => String(c.id).trim() === String(id).trim()) : null);

      if (!cert) {
        window.utils.showToast('No se encontró la información del certificado a editar', 'danger');
        return;
      }

      document.getElementById('editarCertificadoId').value = cert.id;
      document.getElementById('editarCertificadoReturnBulk').value = returnToBulk ? 'true' : 'false';

      document.getElementById('lblEditarCertificadoNombre').textContent = cert.nombre_completo || 'Participante';
      document.getElementById('lblEditarCertificadoCedula').textContent = cert.cedula || '';
      document.getElementById('badgeEditarCertificadoCodigo').textContent = cert.codigo || '';

      document.getElementById('editarCertificadoTomo').value = cert.tomo || '';
      document.getElementById('editarCertificadoFolio').value = cert.folio || '';

      let fechaVal = cert.fecha_curso || '';
      if (fechaVal && fechaVal.includes('T')) {
        fechaVal = fechaVal.split('T')[0];
      }
      document.getElementById('editarCertificadoFecha').value = fechaVal;

      document.getElementById('editarCertificadoLugar').value = cert.lugar || 'Puerto Cabello, Venezuela';
      document.getElementById('editarCertificadoMatricula').value = cert.matricula || '';

      if (returnToBulk) {
        const modalCert = document.getElementById('modalCertificar');
        if (modalCert) bootstrap.Modal.getOrCreateInstance(modalCert).hide();
      }

      const modalEdit = document.getElementById('modalEditarCertificado');
      if (modalEdit) bootstrap.Modal.getOrCreateInstance(modalEdit).show();
    },

    cerrarModalEditarCertificado() {
      const returnToBulk = document.getElementById('editarCertificadoReturnBulk')?.value === 'true';
      const modalEdit = document.getElementById('modalEditarCertificado');
      if (modalEdit) bootstrap.Modal.getOrCreateInstance(modalEdit).hide();

      if (returnToBulk) {
        this.onCambioCursoEmision();
        const modalCert = document.getElementById('modalCertificar');
        if (modalCert) bootstrap.Modal.getOrCreateInstance(modalCert).show();
      }
    },

    async guardarEdicionCertificado(e) {
      e.preventDefault();

      const id = document.getElementById('editarCertificadoId').value;
      const returnToBulk = document.getElementById('editarCertificadoReturnBulk').value === 'true';
      const tomo = document.getElementById('editarCertificadoTomo').value.trim();
      const folio = document.getElementById('editarCertificadoFolio').value.trim();
      const fecha_curso = document.getElementById('editarCertificadoFecha').value;
      const lugar = document.getElementById('editarCertificadoLugar').value.trim();
      const matricula = document.getElementById('editarCertificadoMatricula').value.trim();

      if (!id) {
        window.utils.showToast('ID de certificado no especificado', 'danger');
        return;
      }

      const btn = document.getElementById('btnSubmitEditarCertificado');
      const oldText = btn.innerHTML;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-1"></i> Guardando...';
      btn.disabled = true;

      try {
        const editData = { tomo, folio, fecha_curso, lugar, matricula };
        const res = await window.api.update('certificados', id, editData);

        if (res.status === 'success') {
          window.utils.showToast('Certificación actualizada correctamente', 'success');

          // Actualizar datos locales directamente para respuesta instantánea
          const certIdx = certificadosVistaData.findIndex(c => String(c.id).trim() === String(id).trim());
          if (certIdx !== -1) {
            certificadosVistaData[certIdx] = {
              ...certificadosVistaData[certIdx],
              tomo, folio, fecha_curso, lugar, matricula
            };
          }

          await this.cargarCertificados();

          const modalEdit = document.getElementById('modalEditarCertificado');
          if (modalEdit) bootstrap.Modal.getOrCreateInstance(modalEdit).hide();

          if (returnToBulk) {
            this.onCambioCursoEmision();
            const modalCert = document.getElementById('modalCertificar');
            if (modalCert) bootstrap.Modal.getOrCreateInstance(modalCert).show();
          }
        } else {
          window.utils.showToast(res.message || 'Error al actualizar la certificación', 'danger');
        }
      } catch (err) {
        console.error('Error al actualizar certificado:', err);
        window.utils.showToast('Error al guardar cambios en la certificación', 'danger');
      } finally {
        btn.innerHTML = oldText;
        btn.disabled = false;
      }
    },

    mostrarReporteInclusionTomoFolio(curso_id, certificadosCreados, datosGenerales) {
      const cursoObj = cursosDisponibles.find(c => String(c.id) === String(curso_id));
      const cursoNombre = cursoObj ? cursoObj.nombre : 'CURSO DE CAPACITACIÓN';

      const lblCurso = document.getElementById('reporteInclusionCursoNombre');
      if (lblCurso) lblCurso.textContent = cursoNombre.toUpperCase();

      const lblFecha = document.getElementById('reporteInclusionFechaInfo');
      if (lblFecha) lblFecha.textContent = `Fecha del Curso: ${window.utils.formatDate(datosGenerales.fecha_curso)} | ${datosGenerales.lugar || 'Puerto Cabello, Venezuela'}`;

      const certsList = (certificadosCreados && certificadosCreados.length > 0)
        ? certificadosCreados
        : certificadosVistaData.filter(c => String(c.curso_id) === String(curso_id));

      const lblTotal = document.getElementById('reporteInclusionTotalCount');
      if (lblTotal) lblTotal.textContent = `${certsList.length} certificados emitidos`;

      const tomoTexto = datosGenerales.tomo ? datosGenerales.tomo : 'No especificado';
      let foliosTexto = 'No especificado';
      if (certsList.length > 0 && certsList[0].folio) {
        const minFolio = certsList[0].folio;
        const maxFolio = certsList[certsList.length - 1].folio;
        foliosTexto = (minFolio === maxFolio) ? `Folio ${minFolio}` : `Folios ${minFolio} al ${maxFolio}`;
      }
      const lblSummary = document.getElementById('reporteInclusionTomoFolioSummary');
      if (lblSummary) lblSummary.textContent = `Tomo / Libro: ${tomoTexto} | ${foliosTexto}`;

      const tbody = document.getElementById('tbodyReporteInclusionTomoFolio');
      if (tbody) {
        let html = '';
        certsList.forEach((c, idx) => {
          let uNombre = c.nombre_completo;
          let uCedula = c.cedula;

          if (!uNombre || !uCedula) {
            const userObj = usuariosDisponibles.find(u => String(u.id) === String(c.usuario_id));
            if (userObj) {
              uNombre = userObj.nombre_completo;
              uCedula = userObj.cedula;
            }
          }

          html += `
            <tr>
              <td>${idx + 1}</td>
              <td class="font-monospace">${window.utils.escapeHtml(uCedula || '')}</td>
              <td class="fw-bold text-dark">${window.utils.escapeHtml(uNombre || '')}</td>
              <td><span class="badge bg-dark text-warning font-monospace fw-bold">${window.utils.escapeHtml(c.codigo || '')}</span></td>
              <td><span class="badge bg-secondary font-monospace">${window.utils.escapeHtml(c.tomo || datosGenerales.tomo || 'N/A')}</span></td>
              <td><span class="badge bg-primary font-monospace fs-6">${window.utils.escapeHtml(c.folio || 'N/A')}</span></td>
            </tr>
          `;
        });
        tbody.innerHTML = html || '<tr><td colspan="6" class="text-center text-muted py-3">No hay detalles de emisión.</td></tr>';
      }

      const modalRep = document.getElementById('modalReporteInclusionTomoFolio');
      if (modalRep) bootstrap.Modal.getOrCreateInstance(modalRep).show();
    },

    imprimirReporteInclusion() {
      const content = document.getElementById('printableReporteInclusionArea')?.innerHTML;
      if (!content) return;

      const printWindow = window.open('', '_blank', 'width=900,height=700');
      printWindow.document.write(`
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <title>Reporte de Inclusión en Tomo y Folio - UPTPC</title>
          <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
          <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
          <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; padding: 20px; color: #333; }
            .table { font-size: 12px; }
            @media print {
              .no-print { display: none !important; }
            }
          </style>
        </head>
        <body>
          <div class="text-center mb-4">
            <h4 class="fw-bold mb-1">UNIVERSIDAD POLITÉCNICA TERRITORIAL DE PUERTO CABELLO</h4>
            <h6 class="text-secondary">UNIDAD DE CIENCIA Y TECNOLOGÍA - SISTEMA DE CERTIFICACIÓN</h6>
            <hr>
          </div>
          ${content}
          <div class="mt-5 pt-4 text-center">
            <div class="row">
              <div class="col-6">
                <p class="mb-0">__________________________________________</p>
                <small class="fw-bold">Firma del Responsable del Libro / Tomo</small>
              </div>
              <div class="col-6">
                <p class="mb-0">__________________________________________</p>
                <small class="fw-bold">Sello de Control de Registro</small>
              </div>
            </div>
          </div>
          <script>
            window.onload = function() { window.print(); window.close(); };
          </script>
        </body>
        </html>
      `);
      printWindow.document.close();
    },

    getCertificadosVistaData() {
      return certificadosVistaData;
    }
  };

  window.certificadosModule = certificadosModule;
})();
