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
      document.getElementById('checkHabilitarTomoFolio')?.addEventListener('change', (e) => this.toggleHabilitarTomoFolio(e.target.checked));

      // Eventos Carga Rápida (CSV / Lista de Texto)
      document.getElementById('btnAbrirCargaRapidaEmision')?.addEventListener('click', () => this.abrirModalCargaRapida());
      document.getElementById('textareaCargaRapidaTexto')?.addEventListener('input', () => this.analizarTextoCargaRapida());
      document.getElementById('fileCargaRapidaCsv')?.addEventListener('change', (e) => this.cargarArchivoCsvEnTextarea(e));
      document.getElementById('btnLimpiarCargaRapida')?.addEventListener('click', () => this.limpiarCargaRapida());
      document.getElementById('btnConfirmarCargaRapida')?.addEventListener('click', () => this.procesarConfirmacionCargaRapida());
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

    async abrirModalCertificar(cursoIdSeleccionado = null) {
      this.bindEvents(); // Garantiza la vinculación de eventos independientemente de la pestaña inicial

      const modalEl = document.getElementById('modalCertificar');
      if (!modalEl) return;

      // Cargar/actualizar datos frescos del servidor antes de mostrar el modal
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

      const emLugar = document.getElementById('emisionLugar');
      if (emLugar) emLugar.value = 'Puerto Cabello, Venezuela';

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
              <button type="button" class="btn btn-xs btn-outline-success py-0 px-2" onclick="window.certificadosModule.verCertificado('${c.codigo}')" title="Ver Certificado">
                <i class="fa-solid fa-eye me-1"></i>Ver
              </button>
            </td>
          </tr>
        `;
      });

      html += '</tbody></table>';
      container.innerHTML = html;
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
        const datos_generales = { fecha_curso, lugar, tomo, folio };
        const res = await window.api.bulkCertificar(curso_id, usuariosSeleccionadosEmision, datos_generales);

        if (res.status === 'success') {
          window.utils.showToast(`Se emitieron ${res.count || usuariosSeleccionadosEmision.length} certificados con códigos únicos de verificación (format AAA123AAA)`, 'success');
          bootstrap.Modal.getOrCreateInstance(document.getElementById('modalCertificar')).hide();
          await this.cargarCertificados();
          if (window.cursosModule) await window.cursosModule.cargarCursos();
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
      const yaCertificadosCedulas = new Set(certsEnTaller.map(c => String(c.cedula || '').replace(/[\s-]/g, '').toUpperCase()));

      let countNuevos = 0;
      let countExistentes = 0;
      let countYaCertificados = 0;

      lineas.forEach((lineaRaw) => {
        const linea = lineaRaw.trim();
        if (!linea) return;

        const partes = linea.split(/[,;\t|]+/).map(p => p.trim());
        let cedula = partes[0] ? partes[0].toUpperCase() : '';
        let nombre = partes.slice(1).join(' ').trim().toUpperCase();

        if (!cedula) return;

        if (/^[0-9]+$/.test(cedula)) {
          cedula = 'V-' + cedula;
        }

        const cleanCedula = cedula.replace(/[\s-]/g, '').toUpperCase();
        const userExistente = usuariosDisponibles.find(u => String(u.cedula || '').replace(/[\s-]/g, '').toUpperCase() === cleanCedula);
        const yaCertificado = yaCertificadosCedulas.has(cleanCedula);

        let estado = '';
        let estadoBadge = '';

        if (yaCertificado) {
          countYaCertificados++;
          estado = 'ya_certificado';
          estadoBadge = '<span class="badge bg-warning text-dark"><i class="fa-solid fa-triangle-exclamation me-1"></i>Ya Certificado (Omitir)</span>';
        } else if (userExistente) {
          countExistentes++;
          estado = 'existente';
          estadoBadge = '<span class="badge bg-success"><i class="fa-solid fa-user-check me-1"></i>Existe en BD (Auto-seleccionar)</span>';
          if (!nombre || nombre === 'S/N') {
            nombre = userExistente.nombre_completo;
          }
        } else {
          countNuevos++;
          estado = 'nuevo';
          estadoBadge = '<span class="badge bg-primary"><i class="fa-solid fa-user-plus me-1"></i>Nuevo (Registrar y Seleccionar)</span>';
        }

        itemsAnalizados.push({
          num: itemsAnalizados.length + 1,
          cedula,
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
          <span class="badge bg-warning text-dark">${countYaCertificados} ya certificados</span>
        `;
      }

      if (itemsAnalizados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">No se detectaron datos válidos. Revisa el formato de cédulas.</td></tr>';
        return;
      }

      let html = '';
      itemsAnalizados.forEach(item => {
        html += `
          <tr>
            <td>${item.num}</td>
            <td><span class="badge bg-secondary font-monospace">${window.utils.escapeHtml(item.cedula)}</span></td>
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
      const yaCertificadosCedulas = new Set(certsEnTaller.map(c => String(c.cedula || '').replace(/[\s-]/g, '').toUpperCase()));

      const lineas = texto.split(/\r?\n/);
      const nuevosParaRegistrar = [];
      const cedulasParaSeleccionar = new Set();

      lineas.forEach(lineaRaw => {
        const linea = lineaRaw.trim();
        if (!linea) return;

        const partes = linea.split(/[,;\t|]+/).map(p => p.trim());
        let cedula = partes[0] ? partes[0].toUpperCase() : '';
        let nombre = partes.slice(1).join(' ').trim().toUpperCase();

        if (!cedula) return;
        if (/^[0-9]+$/.test(cedula)) cedula = 'V-' + cedula;

        const cleanCedula = cedula.replace(/[\s-]/g, '').toUpperCase();
        if (yaCertificadosCedulas.has(cleanCedula)) return; // Omitir duplicados ya certificados

        cedulasParaSeleccionar.add(cleanCedula);

        const userExistente = usuariosDisponibles.find(u => String(u.cedula || '').replace(/[\s-]/g, '').toUpperCase() === cleanCedula);
        if (!userExistente) {
          nuevosParaRegistrar.push({
            cedula: cedula,
            nombre_completo: nombre || 'PARTICIPANTE REGISTRADO EN CARGA RÁPIDA'
          });
        }
      });

      if (cedulasParaSeleccionar.size === 0) {
        window.utils.showToast('No hay participantes nuevos ni elegibles para seleccionar en la lista ingresada.', 'info');
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
          const cleanCedula = String(u.cedula || '').replace(/[\s-]/g, '').toUpperCase();
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
      if (!confirm('¿Está seguro de anular/eliminar este certificado?')) return;

      try {
        const res = await window.api.delete('certificados', id);
        if (res.status === 'success') {
          window.utils.showToast('Certificado eliminado', 'success');
          await this.cargarCertificados();
        } else {
          window.utils.showToast(res.message, 'danger');
        }
      } catch (e) {
        window.utils.showToast('Error al eliminar certificado', 'danger');
      }
    }
  };

  window.certificadosModule = certificadosModule;
})();
