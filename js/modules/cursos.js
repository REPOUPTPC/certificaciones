/**
 * ==============================================================================
 * SISTEMA DE GESTIÓN DE CERTIFICACIONES UPTPC - MÓDULO DE CURSOS (js/modules/cursos.js)
 * ==============================================================================
 */

(function() {
  let cursosData = [];
  let unidadesData = [];
  let tiposData = [];
  let firmasData = [];
  let disenosData = [];

  const cursosModule = {
    async init() {
      this.bindEvents();
      await this.cargarDependencias();
      await this.cargarCursos();
    },

    bindEvents() {
      if (this._eventsBound) return;
      this._eventsBound = true;

      document.getElementById('btnNuevoCurso')?.addEventListener('click', () => this.abrirModalCurso());
      document.getElementById('formCurso')?.addEventListener('submit', (e) => this.guardarCurso(e));
      document.getElementById('btnConfirmarGenerarReporteCurso')?.addEventListener('click', () => this.procesarGeneracionReporteCurso());
    },

    async cargarDependencias() {
      try {
        const [uRes, tRes, fRes, dRes] = await Promise.all([
          window.api.getAll('unidades'),
          window.api.getAll('tipo'),
          window.api.getAll('firmas'),
          window.api.getAll('disenos')
        ]);

        unidadesData = uRes.status === 'success' ? uRes.data || [] : [];
        tiposData = tRes.status === 'success' ? tRes.data || [] : [];
        firmasData = fRes.status === 'success' ? fRes.data || [] : [];
        disenosData = dRes.status === 'success' ? dRes.data || [] : [];
      } catch (e) {
        console.error('Error cargando dependencias de cursos:', e);
      }
    },

    async cargarCursos() {
      try {
        const [resCursos, resCerts] = await Promise.all([
          window.api.getAll('cursos'),
          window.api.getAll('certificados')
        ]);
        if (resCursos.status === 'success') {
          cursosData = resCursos.data || [];
          const certsData = resCerts.status === 'success' ? resCerts.data || [] : [];
          this.renderTablaCursos(cursosData, certsData);
        }
      } catch (e) {
        window.utils.showToast('Error cargando lista de cursos', 'danger');
      }
    },

    renderTablaCursos(lista, certsData = []) {
      const tbody = document.getElementById('tbodyCursos');
      if (!tbody) return;

      if (!lista || lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4">No hay cursos registrados.</td></tr>`;
        return;
      }

      const unidadesMap = {};
      unidadesData.forEach(u => {
        if (u.id) unidadesMap[String(u.id).trim()] = u.nombre;
        if (u.codigo) unidadesMap[String(u.codigo).trim()] = u.nombre;
        if (u.nombre) unidadesMap[String(u.nombre).trim()] = u.nombre;
      });

      const tiposMap = {};
      tiposData.forEach(t => {
        if (t.id) tiposMap[String(t.id).trim()] = t.tipo;
        if (t.tipo) tiposMap[String(t.tipo).trim()] = t.tipo;
      });

      const countMap = {};
      certsData.forEach(cert => {
        const cid = String(cert.curso_id).trim();
        countMap[cid] = (countMap[cid] || 0) + 1;
      });

      let html = '';
      lista.forEach((c, i) => {
        const cid = String(c.id).trim();
        const rawUnid = String(c.unidad_id || c.unidad || '').trim();
        const rawTipo = String(c.tipo_curso || c.idtipo_curso || c.tipo || '').trim();

        const unidNom = unidadesMap[rawUnid] || rawUnid || 'Unidad UPTPC';
        const tipoNom = tiposMap[rawTipo] || rawTipo || 'Taller';
        const totalEmitidos = countMap[cid] || 0;

        html += `
          <tr>
            <td>${i + 1}</td>
            <td><span class="badge bg-secondary font-monospace">${window.utils.escapeHtml(c.codigo_relacionado || 'N/A')}</span></td>
            <td class="fw-semibold">${window.utils.escapeHtml(c.nombre)}</td>
            <td><span class="badge bg-info text-dark">${window.utils.escapeHtml(tipoNom)}</span></td>
            <td class="small">${window.utils.escapeHtml(unidNom)}</td>
            <td>${c.horas || 0} hrs</td>
            <td>
              <span class="badge ${totalEmitidos > 0 ? 'bg-primary' : 'bg-secondary'} rounded-pill cursor-pointer px-2 py-1 fs-6"
                    onclick="window.certificadosModule.abrirModalCertificar('${c.id}')"
                    title="Ver participantes y emitir certificados">
                <i class="fa-solid fa-graduation-cap me-1"></i> ${totalEmitidos}
              </span>
            </td>
            <td>
              <button class="btn btn-sm btn-outline-success me-1" onclick="window.certificadosModule.abrirModalCertificar('${c.id}')" title="Emitir Certificados / Ver Participantes"><i class="fa-solid fa-graduation-cap"></i></button>
              <button class="btn btn-sm btn-outline-warning me-1" onclick="window.cursosModule.abrirModalFiltroReporteTomoFolio('${c.id}')" title="Generar Reporte de Registro de Tomo y Folio por Fecha"><i class="fa-solid fa-book-bookmark"></i></button>
              <button class="btn btn-sm btn-outline-primary me-1" onclick="window.cursosModule.abrirModalCurso('${c.id}')" title="Editar"><i class="fa-solid fa-pen"></i></button>
              <button class="btn btn-sm btn-outline-danger" onclick="window.cursosModule.eliminarCurso('${c.id}')" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
            </td>
          </tr>
        `;
      });

      tbody.innerHTML = html;
    },

    populateSelects() {
      const selUnidad = document.getElementById('cursoUnidadId');
      const selTipo = document.getElementById('cursoTipoId');
      const selF1 = document.getElementById('cursoFirma1');
      const selF2 = document.getElementById('cursoFirma2');
      const selF3 = document.getElementById('cursoFirma3');

      const defaultTipos = [
        { id: '1', tipo: 'Taller' },
        { id: '2', tipo: 'Curso' },
        { id: '3', tipo: 'Diplomado' },
        { id: '4', tipo: 'Seminario' },
        { id: '5', tipo: 'Conferencia' },
        { id: '6', tipo: 'Congreso' }
      ];

      let listaTipos = (tiposData && tiposData.length > 0) ? [...tiposData] : defaultTipos;
      defaultTipos.forEach(dt => {
        const existe = listaTipos.some(t => 
          String(t.id).trim().toLowerCase() === dt.id.toLowerCase() ||
          String(t.tipo).trim().toLowerCase() === dt.tipo.toLowerCase()
        );
        if (!existe) listaTipos.push(dt);
      });

      if (selUnidad) {
        selUnidad.innerHTML = '<option value="">-- Seleccionar Unidad --</option>' +
          unidadesData.map(u => `<option value="${u.id}">${window.utils.escapeHtml(u.nombre)} (${u.codigo})</option>`).join('');
      }

      if (selTipo) {
        selTipo.innerHTML = '<option value="">-- Seleccionar Tipo --</option>' +
          listaTipos.map(t => `<option value="${t.tipo || t.id}" data-id="${t.id}">${window.utils.escapeHtml(t.tipo)}</option>`).join('');
      }

      const firmasOpts = '<option value="">-- Ninguna --</option>' +
        firmasData.map(f => `<option value="${f.id}">${window.utils.escapeHtml(f.nombre)} (${f.cargo})</option>`).join('');

      if (selF1) selF1.innerHTML = firmasOpts;
      if (selF2) selF2.innerHTML = firmasOpts;
      if (selF3) selF3.innerHTML = firmasOpts;

      const selDiseno = document.getElementById('cursoDisenoId');
      if (selDiseno) {
        const disenosDisponibles = disenosData.filter(d => String(d.activo).toLowerCase() === 'true' || d.activo === true);
        selDiseno.innerHTML = '<option value="">-- Usar Diseño Predeterminado (Activo) --</option>' +
          disenosDisponibles.map(d => {
            const isTR = (String(d.tiro_retiro).toLowerCase() === 'true' || d.tiro_retiro === true) ? ' (Tiro/Retiro)' : '';
            return `<option value="${d.id}">${window.utils.escapeHtml(d.nombre)}${isTR}</option>`;
          }).join('');
      }
    },

    abrirModalCurso(id = null) {
      const modalEl = document.getElementById('modalCurso');
      if (!modalEl) return;

      // Resetear campos
      const form = document.getElementById('formCurso');
      if (form) form.reset();

      document.getElementById('cursoId').value = id || '';
      const titleEl = document.getElementById('modalCursoTitle');
      if (titleEl) titleEl.textContent = id ? 'Editar Curso / Taller' : 'Nuevo Curso / Taller';

      // Poblar opciones de selects
      this.populateSelects();

      const setSelectSmart = (elementId, ...posiblesValores) => {
        const selectEl = document.getElementById(elementId);
        if (!selectEl) return;
        
        let rawVal = '';
        for (let v of posiblesValores) {
          if (v !== undefined && v !== null && String(v).trim() !== '') {
            rawVal = String(v).trim();
            break;
          }
        }

        if (!rawVal) {
          selectEl.value = '';
          return;
        }

        const targetVal = rawVal.toLowerCase();
        let match = Array.from(selectEl.options).find(opt => 
          String(opt.value).trim().toLowerCase() === targetVal ||
          String(opt.text).trim().toLowerCase() === targetVal ||
          String(opt.getAttribute('data-id') || '').trim().toLowerCase() === targetVal ||
          String(opt.text).trim().toLowerCase().startsWith(targetVal) ||
          targetVal.startsWith(String(opt.text).trim().toLowerCase())
        );

        if (match) {
          selectEl.value = match.value;
        } else {
          selectEl.value = rawVal;
        }
      };

      // Cargar valores del curso a editar si existe
      if (id) {
        const c = cursosData.find(x => String(x.id).trim() === String(id).trim());
        if (c) {
          if (document.getElementById('cursoCodigoRel')) document.getElementById('cursoCodigoRel').value = c.codigo_relacionado || '';
          if (document.getElementById('cursoNombre')) document.getElementById('cursoNombre').value = c.nombre || '';
          if (document.getElementById('cursoContenido')) document.getElementById('cursoContenido').value = c.contenido || '';
          if (document.getElementById('cursoHoras')) document.getElementById('cursoHoras').value = c.horas || 16;
          if (document.getElementById('cursoMotivo')) document.getElementById('cursoMotivo').value = c.motivo || '';
          if (document.getElementById('cursoPonencias')) document.getElementById('cursoPonencias').value = c.ponencias || '';
          if (document.getElementById('cursoPrefijoMatricula')) document.getElementById('cursoPrefijoMatricula').value = c.matricula_prefijo || '';

          let tipoValor = c.tipo_curso || c.idtipo_curso || c.tipo;
          if (!tipoValor) {
            const textoBusqueda = ((c.nombre || '') + ' ' + (c.codigo_relacionado || '')).toUpperCase();
            if (textoBusqueda.includes('TALLER')) tipoValor = 'Taller';
            else if (textoBusqueda.includes('CURSO')) tipoValor = 'Curso';
            else if (textoBusqueda.includes('SEMINARIO')) tipoValor = 'Seminario';
            else if (textoBusqueda.includes('DIPLOMADO')) tipoValor = 'Diplomado';
            else if (textoBusqueda.includes('CONFERENCIA')) tipoValor = 'Conferencia';
            else if (textoBusqueda.includes('CONGRESO')) tipoValor = 'Congreso';
            else tipoValor = 'Taller';
          }

          setSelectSmart('cursoTipoId', tipoValor, 'Taller', 't1', '1');
          setSelectSmart('cursoUnidadId', c.unidad_id, c.unidad);
          setSelectSmart('cursoFirma1', c.idfirma1);
          setSelectSmart('cursoFirma2', c.idfirma2);
          setSelectSmart('cursoFirma3', c.idfirma3);
          setSelectSmart('cursoDisenoId', c.diseno);
        }
      } else {
        setSelectSmart('cursoTipoId', 'Taller', 't1', '1');
      }

      const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
      bsModal.show();
    },

    async guardarCurso(e) {
      e.preventDefault();
      const id = document.getElementById('cursoId').value;
      const codigo_relacionado = document.getElementById('cursoCodigoRel')?.value.trim() || '';
      const nombre = document.getElementById('cursoNombre')?.value.trim() || '';
      const contenido = document.getElementById('cursoContenido')?.value.trim() || '';
      
      const selTipoEl = document.getElementById('cursoTipoId');
      const tipoVal = selTipoEl?.value || 'Taller';
      const selectedOpt = selTipoEl?.options[selTipoEl.selectedIndex];
      const tipo_curso = selectedOpt ? selectedOpt.text : tipoVal;
      const idtipo_curso = selectedOpt ? (selectedOpt.getAttribute('data-id') || tipoVal) : tipoVal;

      const unidad_id = document.getElementById('cursoUnidadId')?.value || '';
      const horas = parseInt(document.getElementById('cursoHoras')?.value) || 0;
      const motivo = document.getElementById('cursoMotivo')?.value.trim() || '';
      const ponencias = document.getElementById('cursoPonencias')?.value.trim() || '';
      const diseno = document.getElementById('cursoDisenoId')?.value || '';
      const idfirma1 = document.getElementById('cursoFirma1')?.value || '';
      const idfirma2 = document.getElementById('cursoFirma2')?.value || '';
      const idfirma3 = document.getElementById('cursoFirma3')?.value || '';
      const matricula_prefijo = document.getElementById('cursoPrefijoMatricula')?.value.trim() || '';

      if (!nombre) {
        window.utils.showToast('Ingrese el nombre del curso', 'warning');
        return;
      }

      // Protección contra registro duplicado de eventos / cursos
      const nombreClean = nombre.toUpperCase();
      const codClean = codigo_relacionado.toUpperCase();
      const cursoExistente = cursosData.find(c => {
        if (id && String(c.id).trim() === String(id).trim()) return false;
        const sameName = String(c.nombre || '').trim().toUpperCase() === nombreClean;
        const sameCode = codClean && String(c.codigo_relacionado || '').trim().toUpperCase() === codClean;
        return sameName || sameCode;
      });

      if (cursoExistente) {
        window.utils.showToast(`¡ALERTA! Ya existe un curso/evento registrado con este nombre o código ("${cursoExistente.nombre}"). No se guardará como duplicado.`, 'warning', 'Registro Duplicado');
        return;
      }

      const payload = {
        codigo_relacionado,
        nombre,
        contenido,
        tipo_curso,
        idtipo_curso,
        unidad_id,
        horas,
        motivo,
        ponencias,
        diseno,
        idfirma1,
        idfirma2,
        idfirma3,
        matricula_prefijo
      };

      try {
        let res;
        if (id) res = await window.api.update('cursos', id, payload);
        else res = await window.api.create('cursos', payload);

        if (res.status === 'success') {
          window.utils.showToast('Curso guardado correctamente', 'success');
          const modalEl = document.getElementById('modalCurso');
          if (modalEl) {
            const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
            bsModal.hide();
          }
          await this.cargarCursos();
        } else {
          window.utils.showToast(res.message, 'danger');
        }
      } catch (err) {
        window.utils.showToast('Error de comunicación', 'danger');
      }
    },

    async eliminarCurso(id) {
      window.utils.showConfirm({
        title: 'Eliminar Taller / Curso',
        message: '¿Está seguro de eliminar este curso o taller?',
        subtext: 'Los certificados emitidos anteriormente para este taller podrían verse afectados.',
        confirmText: 'Sí, Eliminar Curso',
        onConfirm: async () => {
          try {
            const res = await window.api.delete('cursos', id);
            if (res.status === 'success') {
              window.utils.showToast('Curso eliminado correctamente', 'success');
              await this.cargarCursos();
            }
          } catch (e) {
            window.utils.showToast('Error al eliminar curso', 'danger');
          }
        }
      });
    },

    async abrirModalFiltroReporteTomoFolio(curso_id) {
      if (!curso_id) return;

      let cursoObj = cursosData.find(c => String(c.id).trim() === String(curso_id).trim());
      if (!cursoObj && window.api && window.api._globalCache && Array.isArray(window.api._globalCache.cursos)) {
        cursoObj = window.api._globalCache.cursos.find(c => String(c.id).trim() === String(curso_id).trim());
      }

      const nombreCurso = cursoObj ? cursoObj.nombre : 'TALLER / CURSO SELECCIONADO';

      const inputId = document.getElementById('filtroReporteCursoId');
      const lblNombre = document.getElementById('lblFiltroReporteCursoNombre');
      if (inputId) inputId.value = curso_id;
      if (lblNombre) lblNombre.textContent = nombreCurso.toUpperCase();

      let certsAll = (window.certificadosModule && window.certificadosModule.getCertificadosVistaData)
        ? window.certificadosModule.getCertificadosVistaData()
        : [];

      if (!certsAll || certsAll.length === 0) {
        try {
          const res = await window.api.getVistaCertificados();
          if (res && res.status === 'success' && Array.isArray(res.data)) {
            certsAll = res.data;
          }
        } catch (e) {
          console.warn('Error obteniendo vista de certificados:', e);
        }
      }

      if (!certsAll || certsAll.length === 0) {
        const rawCerts = (window.api && window.api._globalCache && Array.isArray(window.api._globalCache.certificados))
          ? window.api._globalCache.certificados : [];
        const rawUsers = (window.api && window.api._globalCache && Array.isArray(window.api._globalCache.usuarios))
          ? window.api._globalCache.usuarios : [];

        const usersMap = {};
        rawUsers.forEach(u => { if (u && u.id) usersMap[String(u.id).trim()] = u; });

        certsAll = rawCerts.map(c => {
          const u = usersMap[String(c.usuario_id || '').trim()] || {};
          return {
            ...c,
            nombre_completo: u.nombre_completo || 'Participante',
            cedula: u.cedula || '',
            nombre_curso: nombreCurso
          };
        });
      }

      const certsCurso = certsAll.filter(c => String(c.curso_id).trim() === String(curso_id).trim());

      const select = document.getElementById('selectFechaFiltroReporte');
      const btnGenerar = document.getElementById('btnConfirmarGenerarReporteCurso');

      if (select) {
        if (certsCurso.length === 0) {
          select.innerHTML = '<option value="">No hay certificados emitidos registrados para este taller</option>';
          select.disabled = true;
          if (btnGenerar) btnGenerar.disabled = true;
        } else {
          const datesMap = {};
          certsCurso.forEach(c => {
            let f = c.fecha_curso || 'Sin Fecha';
            if (f && f.includes('T')) f = f.split('T')[0];
            if (!datesMap[f]) datesMap[f] = [];
            datesMap[f].push(c);
          });

          const datesList = Object.keys(datesMap).sort().reverse();

          let html = `<option value="ALL">-- TODAS LAS EMISIONES DE ESTE TALLER (${certsCurso.length} certificados en total) --</option>`;
          datesList.forEach(f => {
            const cant = datesMap[f].length;
            const fechaFormatted = window.utils ? window.utils.formatDate(f) : f;
            html += `<option value="${f}">Emisión Fecha: ${fechaFormatted} (${cant} certificado${cant !== 1 ? 's' : ''})</option>`;
          });

          select.innerHTML = html;
          select.disabled = false;
          if (btnGenerar) btnGenerar.disabled = false;
        }
      }

      const modalEl = document.getElementById('modalFiltroReporteTomoFolio');
      if (modalEl) {
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
      } else {
        console.error('Modal #modalFiltroReporteTomoFolio no encontrado en el DOM');
      }
    },

    async procesarGeneracionReporteCurso() {
      const curso_id = document.getElementById('filtroReporteCursoId')?.value;
      const fechaSeleccionada = document.getElementById('selectFechaFiltroReporte')?.value;

      if (!curso_id || !fechaSeleccionada) {
        window.utils.showToast('Seleccione una fecha válida para el reporte', 'warning');
        return;
      }

      let certsAll = (window.certificadosModule && window.certificadosModule.getCertificadosVistaData)
        ? window.certificadosModule.getCertificadosVistaData()
        : [];

      if (!certsAll || certsAll.length === 0) {
        const res = await window.api.getVistaCertificados().catch(e => ({ status: 'error', data: [] }));
        if (res && res.status === 'success') certsAll = res.data || [];
      }

      if (!certsAll || certsAll.length === 0) {
        const rawCerts = (window.api && window.api._globalCache && Array.isArray(window.api._globalCache.certificados))
          ? window.api._globalCache.certificados : [];
        const rawUsers = (window.api && window.api._globalCache && Array.isArray(window.api._globalCache.usuarios))
          ? window.api._globalCache.usuarios : [];
        const cursoObj = cursosData.find(c => String(c.id).trim() === String(curso_id).trim());

        const usersMap = {};
        rawUsers.forEach(u => { if (u && u.id) usersMap[String(u.id).trim()] = u; });

        certsAll = rawCerts.map(c => {
          const u = usersMap[String(c.usuario_id || '').trim()] || {};
          return {
            ...c,
            nombre_completo: u.nombre_completo || 'Participante',
            cedula: u.cedula || '',
            nombre_curso: cursoObj ? cursoObj.nombre : ''
          };
        });
      }

      let certsFiltrados = certsAll.filter(c => String(c.curso_id).trim() === String(curso_id).trim());

      if (fechaSeleccionada !== 'ALL') {
        certsFiltrados = certsFiltrados.filter(c => {
          let f = c.fecha_curso || '';
          if (f && f.includes('T')) f = f.split('T')[0];
          return f === fechaSeleccionada;
        });
      }

      if (certsFiltrados.length === 0) {
        window.utils.showToast('No se encontraron certificados para la fecha seleccionada', 'warning');
        return;
      }

      const modalFiltro = document.getElementById('modalFiltroReporteTomoFolio');
      if (modalFiltro) bootstrap.Modal.getOrCreateInstance(modalFiltro).hide();

      const primerCert = certsFiltrados[0];
      const datosGenerales = {
        fecha_curso: (fechaSeleccionada !== 'ALL' ? fechaSeleccionada : (primerCert.fecha_curso || new Date().toISOString().split('T')[0])),
        lugar: primerCert.lugar || 'Puerto Cabello, Venezuela',
        tomo: primerCert.tomo || '',
        folio: primerCert.folio || ''
      };

      if (window.certificadosModule && window.certificadosModule.mostrarReporteInclusionTomoFolio) {
        window.certificadosModule.mostrarReporteInclusionTomoFolio(curso_id, certsFiltrados, datosGenerales);
      }
    }
  };

  window.cursosModule = cursosModule;
})();
