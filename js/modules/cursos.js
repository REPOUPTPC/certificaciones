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

  const cursosModule = {
    async init() {
      this.bindEvents();
      await this.cargarDependencias();
      await this.cargarCursos();
    },

    bindEvents() {
      document.getElementById('btnNuevoCurso')?.addEventListener('click', () => this.abrirModalCurso());
      document.getElementById('formCurso')?.addEventListener('submit', (e) => this.guardarCurso(e));
    },

    async cargarDependencias() {
      try {
        const [uRes, tRes, fRes] = await Promise.all([
          window.api.getAll('unidades'),
          window.api.getAll('tipo'),
          window.api.getAll('firmas')
        ]);

        unidadesData = uRes.status === 'success' ? uRes.data || [] : [];
        tiposData = tRes.status === 'success' ? tRes.data || [] : [];
        firmasData = fRes.status === 'success' ? fRes.data || [] : [];
      } catch (e) {
        console.error('Error cargando dependencias de cursos:', e);
      }
    },

    async cargarCursos() {
      try {
        await this.cargarDependencias();
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

      const unidadesMap = Object.fromEntries(unidadesData.map(u => [String(u.id).trim(), u.nombre]));
      const tiposMap = Object.fromEntries(tiposData.map(t => [String(t.id).trim(), t.tipo]));

      const countMap = {};
      certsData.forEach(cert => {
        const cid = String(cert.curso_id).trim();
        countMap[cid] = (countMap[cid] || 0) + 1;
      });

      let html = '';
      lista.forEach((c, i) => {
        const cid = String(c.id).trim();
        const unidNom = unidadesMap[String(c.unidad_id).trim()] || 'Unidad UPTPC';
        const tipoNom = tiposMap[String(c.idtipo_curso).trim()] || 'Taller';
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

      if (selUnidad) {
        selUnidad.innerHTML = '<option value="">-- Seleccionar Unidad --</option>' +
          unidadesData.map(u => `<option value="${u.id}">${window.utils.escapeHtml(u.nombre)} (${u.codigo})</option>`).join('');
      }

      if (selTipo) {
        selTipo.innerHTML = '<option value="">-- Seleccionar Tipo --</option>' +
          tiposData.map(t => `<option value="${t.id}">${window.utils.escapeHtml(t.tipo)}</option>`).join('');
      }

      const firmasOpts = '<option value="">-- Ninguna --</option>' +
        firmasData.map(f => `<option value="${f.id}">${window.utils.escapeHtml(f.nombre)} (${f.cargo})</option>`).join('');

      if (selF1) selF1.innerHTML = firmasOpts;
      if (selF2) selF2.innerHTML = firmasOpts;
      if (selF3) selF3.innerHTML = firmasOpts;
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

      // Cargar valores del curso a editar si existe
      if (id) {
        const c = cursosData.find(x => String(x.id).trim() === String(id).trim());
        if (c) {
          if (document.getElementById('cursoCodigoRel')) document.getElementById('cursoCodigoRel').value = c.codigo_relacionado || '';
          if (document.getElementById('cursoNombre')) document.getElementById('cursoNombre').value = c.nombre || '';
          if (document.getElementById('cursoContenido')) document.getElementById('cursoContenido').value = c.contenido || '';
          if (document.getElementById('cursoTipoId')) document.getElementById('cursoTipoId').value = c.idtipo_curso || '';
          if (document.getElementById('cursoUnidadId')) document.getElementById('cursoUnidadId').value = c.unidad_id || '';
          if (document.getElementById('cursoHoras')) document.getElementById('cursoHoras').value = c.horas || 16;
          if (document.getElementById('cursoMotivo')) document.getElementById('cursoMotivo').value = c.motivo || '';
          if (document.getElementById('cursoPonencias')) document.getElementById('cursoPonencias').value = c.ponencias || '';
          if (document.getElementById('cursoFirma1')) document.getElementById('cursoFirma1').value = c.idfirma1 || '';
          if (document.getElementById('cursoFirma2')) document.getElementById('cursoFirma2').value = c.idfirma2 || '';
          if (document.getElementById('cursoFirma3')) document.getElementById('cursoFirma3').value = c.idfirma3 || '';
          if (document.getElementById('cursoPrefijoMatricula')) document.getElementById('cursoPrefijoMatricula').value = c.matricula_prefijo || '';
        }
      }

      // Abrir modal usando Bootstrap 5 de manera segura e instantánea
      const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
      bsModal.show();
    },

    async guardarCurso(e) {
      e.preventDefault();
      const id = document.getElementById('cursoId').value;
      const codigo_relacionado = document.getElementById('cursoCodigoRel')?.value.trim() || '';
      const nombre = document.getElementById('cursoNombre')?.value.trim() || '';
      const contenido = document.getElementById('cursoContenido')?.value.trim() || '';
      const idtipo_curso = document.getElementById('cursoTipoId')?.value || '';
      const unidad_id = document.getElementById('cursoUnidadId')?.value || '';
      const horas = parseInt(document.getElementById('cursoHoras')?.value) || 0;
      const motivo = document.getElementById('cursoMotivo')?.value.trim() || '';
      const ponencias = document.getElementById('cursoPonencias')?.value.trim() || '';
      const idfirma1 = document.getElementById('cursoFirma1')?.value || '';
      const idfirma2 = document.getElementById('cursoFirma2')?.value || '';
      const idfirma3 = document.getElementById('cursoFirma3')?.value || '';
      const matricula_prefijo = document.getElementById('cursoPrefijoMatricula')?.value.trim() || '';

      if (!nombre) {
        window.utils.showToast('Ingrese el nombre del curso', 'warning');
        return;
      }

      const payload = {
        codigo_relacionado,
        nombre,
        contenido,
        idtipo_curso,
        unidad_id,
        horas,
        motivo,
        ponencias,
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
      if (!confirm('¿Eliminar este curso? Los certificados emitidos podrían verse afectados.')) return;
      try {
        const res = await window.api.delete('cursos', id);
        if (res.status === 'success') {
          window.utils.showToast('Curso eliminado correctamente', 'success');
          await this.cargarCursos();
        }
      } catch (e) {
        window.utils.showToast('Error al eliminar', 'danger');
      }
    }
  };

  window.cursosModule = cursosModule;
})();
