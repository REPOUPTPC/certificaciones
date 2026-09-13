/**
 * ==============================================================================
 * SISTEMA DE GESTIÓN DE CERTIFICACIONES UPTPC - MÓDULO DE USUARIOS (js/modules/usuarios.js)
 * ==============================================================================
 */

(function() {
  let usuariosData = [];
  let usuariosMasivosParsed = [];

  const usuariosModule = {
    async init() {
      this.bindEvents();
      await this.cargarUsuarios();
    },

    bindEvents() {
      if (this._eventsBound) return;
      this._eventsBound = true;

      document.getElementById('btnNuevoUsuario')?.addEventListener('click', () => this.abrirModalUsuario());
      document.getElementById('btnCargaMasivaUsuarios')?.addEventListener('click', () => this.abrirModalCargaMasiva());
      document.getElementById('formUsuario')?.addEventListener('submit', (e) => this.guardarUsuario(e));
      document.getElementById('inputSearchUsuarios')?.addEventListener('input', (e) => this.filtrarUsuarios(e.target.value));
      
      const txtMasivo = document.getElementById('textareaCargaMasiva');
      if (txtMasivo) {
        txtMasivo.addEventListener('input', () => this.procesarTextoMasivo());
      }

      document.getElementById('fileCsvUsuarios')?.addEventListener('change', (e) => this.cargarArchivoCsvMasivo(e));
      document.getElementById('btnDescargarPlantillaCsvUsuarios')?.addEventListener('click', () => this.descargarPlantillaCsv());
      document.getElementById('btnConfirmarCargaMasiva')?.addEventListener('click', () => this.ejecutarCargaMasiva());
    },

    descargarPlantillaCsv() {
      const templateContent = 'cedula,nombre_completo\nV-12345678,PEDRO PEREZ\nV-87654321,MARIA GOMEZ\nE-98765432,JUAN SMITH';
      window.utils.downloadCsvTemplate('plantilla_usuarios.csv', templateContent);
    },

    cargarArchivoCsvMasivo(e) {
      const file = e.target.files ? e.target.files[0] : null;
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target.result;
        const txt = document.getElementById('textareaCargaMasiva');
        if (txt) {
          txt.value = content;
          this.procesarTextoMasivo();
        }
      };
      reader.readAsText(file);
    },

    async cargarUsuarios() {
      try {
        const res = await window.api.getAll('usuarios');
        if (res.status === 'success') {
          usuariosData = res.data || [];
          this.renderTablaUsuarios(usuariosData);
        } else {
          window.utils.showToast('Error cargando usuarios: ' + res.message, 'danger');
        }
      } catch (e) {
        window.utils.showToast('Error de conexión al cargar usuarios', 'danger');
      }
    },

    renderTablaUsuarios(lista) {
      const tbody = document.getElementById('tbodyUsuarios');
      if (!tbody) return;

      if (!lista || lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4"><i class="fa-solid fa-users fa-2x mb-2"></i><br>No se encontraron usuarios registrados.</td></tr>`;
        return;
      }

      let html = '';
      lista.forEach((u, i) => {
        html += `
          <tr>
            <td>${i + 1}</td>
            <td><span class="badge bg-dark font-monospace">${window.utils.escapeHtml(u.cedula)}</span></td>
            <td class="fw-semibold">${window.utils.escapeHtml(u.nombre_completo)}</td>
            <td>
              <button class="btn btn-sm btn-outline-primary me-1" onclick="window.usuariosModule.abrirModalUsuario('${u.id}')" title="Editar"><i class="fa-solid fa-pen"></i></button>
              <button class="btn btn-sm btn-outline-danger" onclick="window.usuariosModule.eliminarUsuario('${u.id}')" title="Eliminar"><i class="fa-solid fa-trash"></i></button>
            </td>
          </tr>
        `;
      });

      tbody.innerHTML = html;
      const badge = document.getElementById('badgeTotalUsuarios');
      if (badge) badge.textContent = `${lista.length} registrados`;
    },

    filtrarUsuarios(query) {
      if (!query) {
        this.renderTablaUsuarios(usuariosData);
        return;
      }
      const q = query.trim().toUpperCase();
      const filtrados = usuariosData.filter(u => 
        String(u.cedula).toUpperCase().includes(q) || 
        String(u.nombre_completo).toUpperCase().includes(q)
      );
      this.renderTablaUsuarios(filtrados);
    },

    abrirModalUsuario(id = null) {
      const modalEl = document.getElementById('modalUsuario');
      if (!modalEl) return;

      document.getElementById('formUsuario').reset();
      document.getElementById('usuarioId').value = id || '';
      document.getElementById('modalUsuarioTitle').textContent = id ? 'Editar Usuario' : 'Nuevo Usuario';

      if (id) {
        const u = usuariosData.find(x => String(x.id).trim() === String(id).trim());
        if (u) {
          document.getElementById('usuarioCedula').value = u.cedula || '';
          document.getElementById('usuarioNombre').value = u.nombre_completo || '';
        }
      }

      const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
      bsModal.show();
    },

    async guardarUsuario(e) {
      e.preventDefault();
      const id = document.getElementById('usuarioId').value;
      const cedula = window.utils.normalizeCedula(document.getElementById('usuarioCedula').value);
      const nombre_completo = document.getElementById('usuarioNombre').value.trim();

      if (!cedula || !nombre_completo) {
        window.utils.showToast('Por favor ingrese la cédula y el nombre completo', 'warning');
        return;
      }

      // Validar si la cédula ya existe a nombre de otra persona al crear un nuevo usuario
      if (!id) {
        const cleanCedula = cedula.replace(/[\s-]/g, '').toUpperCase();
        const existente = usuariosData.find(u => window.utils.normalizeCedula(u.cedula).replace(/[\s-]/g, '').toUpperCase() === cleanCedula);
        if (existente) {
          if (existente.nombre_completo.trim().toUpperCase() !== nombre_completo.toUpperCase()) {
            window.utils.showToast(`¡ALERTA! La cédula ${cedula} ya se encuentra registrada a nombre de "${existente.nombre_completo}". No se procesará.`, 'danger', 'Conflicto de Cédula');
            return;
          } else {
            window.utils.showToast(`La cédula ${cedula} ya está registrada para este usuario.`, 'warning');
            return;
          }
        }
      }

      const payload = { cedula, nombre_completo };
      const btn = e.target.querySelector('button[type="submit"]');
      btn.disabled = true;

      try {
        let res;
        if (id) {
          res = await window.api.update('usuarios', id, payload);
        } else {
          res = await window.api.create('usuarios', payload);
        }

        if (res.status === 'success') {
          window.utils.showToast(id ? 'Usuario actualizado' : 'Usuario registrado exitosamente', 'success');
          const modalEl = document.getElementById('modalUsuario');
          if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).hide();
          await this.cargarUsuarios();
        } else {
          window.utils.showToast(res.message, 'danger');
        }
      } catch (err) {
        window.utils.showToast('Error de comunicación', 'danger');
      } finally {
        btn.disabled = false;
      }
    },

    async eliminarUsuario(id) {
      window.utils.showConfirm({
        title: 'Eliminar Usuario / Participante',
        message: '¿Está seguro de eliminar este usuario o participante del sistema?',
        subtext: 'Esta acción no se puede deshacer.',
        confirmText: 'Sí, Eliminar Usuario',
        onConfirm: async () => {
          try {
            const res = await window.api.delete('usuarios', id);
            if (res.status === 'success') {
              window.utils.showToast('Usuario eliminado correctamente', 'success');
              await this.cargarUsuarios();
            } else {
              window.utils.showToast(res.message, 'danger');
            }
          } catch (e) {
            window.utils.showToast('Error al eliminar usuario', 'danger');
          }
        }
      });
    },

    abrirModalCargaMasiva() {
      const modalEl = document.getElementById('modalCargaMasivaUsuarios');
      if (!modalEl) return;

      document.getElementById('textareaCargaMasiva').value = '';
      const fileInput = document.getElementById('fileCsvUsuarios');
      if (fileInput) fileInput.value = '';
      document.getElementById('previewCargaMasivaContainer').innerHTML = '<div class="alert alert-light text-center">Pegue el texto o suba un archivo CSV para previsualizar los usuarios.</div>';
      document.getElementById('btnConfirmarCargaMasiva').disabled = true;

      const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
      bsModal.show();
    },

    procesarTextoMasivo() {
      const text = document.getElementById('textareaCargaMasiva').value;
      usuariosMasivosParsed = window.utils.parseUserImportText(text);

      const container = document.getElementById('previewCargaMasivaContainer');
      const btnConfirmar = document.getElementById('btnConfirmarCargaMasiva');

      if (usuariosMasivosParsed.length === 0) {
        container.innerHTML = '<div class="alert alert-warning">No se detectaron registros válidos. Asegúrese de que cada línea contenga: <strong>Cédula, Nombre Completo</strong></div>';
        btnConfirmar.disabled = true;
        return;
      }

      const existingUsersMap = new Map();
      usuariosData.forEach(u => {
        const normC = window.utils.normalizeCedula(u.cedula).replace(/[\s-]/g, '').toUpperCase();
        if (normC) existingUsersMap.set(normC, u);
      });

      let validadosCount = 0;
      let omitidosCount = 0;
      let conflictosCount = 0;

      let rowsHtml = '';
      usuariosMasivosParsed.forEach((u, i) => {
        const normCedula = window.utils.normalizeCedula(u.cedula);
        const cleanCedula = normCedula.replace(/[\s-]/g, '').toUpperCase();
        const existingUser = existingUsersMap.get(cleanCedula);

        let statusBadge = '';
        if (!existingUser) {
          validadosCount++;
          u.estadoMasivo = 'nuevo';
          u.cedulaNormalizada = normCedula;
          statusBadge = '<span class="badge bg-success"><i class="fa-solid fa-check me-1"></i>Válido (Nuevo)</span>';
        } else {
          const csvNameClean = String(u.nombre_completo || '').trim().toUpperCase().replace(/\s+/g, ' ');
          const bdNameClean = String(existingUser.nombre_completo || '').trim().toUpperCase().replace(/\s+/g, ' ');

          if (csvNameClean === bdNameClean) {
            omitidosCount++;
            u.estadoMasivo = 'duplicado_mismo_nombre';
            statusBadge = '<span class="badge bg-secondary"><i class="fa-solid fa-user-check me-1"></i>Ya existe (Omitir)</span>';
          } else {
            conflictosCount++;
            u.estadoMasivo = 'conflicto_nombre';
            statusBadge = `<span class="badge bg-danger text-wrap text-start"><i class="fa-solid fa-circle-exclamation me-1"></i>¡ALERTA! Cédula en BD a nombre de "${window.utils.escapeHtml(existingUser.nombre_completo)}" (No se procesará)</span>`;
          }
        }

        rowsHtml += `
          <tr class="${u.estadoMasivo === 'conflicto_nombre' ? 'table-danger' : ''}">
            <td>${i + 1}</td>
            <td><span class="badge bg-dark font-monospace">${window.utils.escapeHtml(normCedula)}</span></td>
            <td>${window.utils.escapeHtml(u.nombre_completo)}</td>
            <td>${statusBadge}</td>
          </tr>
        `;
      });

      container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-2 small">
          <span><strong>${usuariosMasivosParsed.length}</strong> detectados:
            <span class="text-success fw-bold me-2">${validadosCount} nuevos válidos</span>
            <span class="text-secondary fw-bold me-2">${omitidosCount} ya existen</span>
            ${conflictosCount > 0 ? `<span class="text-danger fw-bold"><i class="fa-solid fa-triangle-exclamation me-1"></i>${conflictosCount} conflicto(s) de nombre</span>` : ''}
          </span>
        </div>
        <div class="table-responsive" style="max-height: 250px;">
          <table class="table table-sm table-hover border align-middle">
            <thead class="table-light"><tr><th>#</th><th>Cédula</th><th>Nombre Completo</th><th>Estado</th></tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      `;

      btnConfirmar.disabled = validadosCount === 0;
    },

    async ejecutarCargaMasiva() {
      const nuevosParaRegistrar = usuariosMasivosParsed.filter(u => u.estadoMasivo === 'nuevo').map(u => ({
        cedula: u.cedulaNormalizada || window.utils.normalizeCedula(u.cedula),
        nombre_completo: u.nombre_completo
      }));

      if (nuevosParaRegistrar.length === 0) {
        window.utils.showToast('No hay registros nuevos válidos para procesar.', 'info');
        return;
      }

      const btn = document.getElementById('btnConfirmarCargaMasiva');
      const oldText = btn.innerHTML;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin me-2"></i>Procesando...';
      btn.disabled = true;

      try {
        const res = await window.api.bulkCreateUsuarios(nuevosParaRegistrar);

        if (res.status === 'success') {
          window.utils.showToast(res.message, 'success');
          const modalEl = document.getElementById('modalCargaMasivaUsuarios');
          if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).hide();
          await this.cargarUsuarios();
        } else {
          window.utils.showToast(res.message, 'danger');
        }
      } catch (err) {
        window.utils.showToast('Error en la carga masiva', 'danger');
      } finally {
        btn.innerHTML = oldText;
        btn.disabled = false;
      }
    }
  };

  window.usuariosModule = usuariosModule;
})();
