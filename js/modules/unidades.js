/**
 * ==============================================================================
 * SISTEMA DE GESTIÓN DE CERTIFICACIONES UPTPC - MÓDULO DE UNIDADES (js/modules/unidades.js)
 * ==============================================================================
 */

(function() {
  let unidadesData = [];

  const unidadesModule = {
    async init() {
      this.bindEvents();
      await this.cargarUnidades();
    },

    bindEvents() {
      document.getElementById('btnNuevaUnidad')?.addEventListener('click', () => this.abrirModalUnidad());
      document.getElementById('formUnidad')?.addEventListener('submit', (e) => this.guardarUnidad(e));

      // Manejador de subida de imagen local (Logo)
      const fileInput = document.getElementById('fileUnidadLogo');
      if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
          const file = e.target.files[0];
          if (!file) return;

          const previewContainer = document.getElementById('previewUnidadLogo');
          previewContainer.innerHTML = '<span class="text-info small"><i class="fa-solid fa-spinner fa-spin me-1"></i>Optimizando y subiendo a Google Drive...</span>';

          try {
            const base64 = await window.utils.compressImage(file, 600, 600, 0.85);
            const res = await window.api.uploadImage(base64, file.name);

            if (res.status === 'success' && res.url) {
              document.getElementById('unidadLogoUrl').value = res.url;
              previewContainer.innerHTML = `<img src="${res.url}" style="max-height:60px; max-width:120px; object-fit:contain;" class="border rounded p-1">`;
              window.utils.showToast('Logo subido a Google Drive exitosamente', 'success');
            } else {
              window.utils.showToast('Error al subir la imagen: ' + res.message, 'danger');
              previewContainer.innerHTML = '';
            }
          } catch (err) {
            window.utils.showToast('Error procesando archivo de imagen', 'danger');
            previewContainer.innerHTML = '';
          }
        });
      }
    },

    async cargarUnidades() {
      try {
        const res = await window.api.getAll('unidades');
        if (res.status === 'success') {
          unidadesData = res.data || [];
          this.renderTablaUnidades(unidadesData);
        }
      } catch (e) {
        window.utils.showToast('Error cargando unidades', 'danger');
      }
    },

    renderTablaUnidades(lista) {
      const tbody = document.getElementById('tbodyUnidades');
      if (!tbody) return;

      if (!lista || lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">No hay unidades registradas.</td></tr>`;
        return;
      }

      let html = '';
      lista.forEach((u, i) => {
        const logoImg = u.logo_url 
          ? `<img src="${u.logo_url}" alt="Logo" style="height:35px; max-width:80px; object-fit:contain;">`
          : `<span class="text-muted small">Sin logo</span>`;

        html += `
          <tr>
            <td>${i + 1}</td>
            <td><span class="badge bg-primary">${window.utils.escapeHtml(u.codigo)}</span></td>
            <td class="fw-semibold">${window.utils.escapeHtml(u.nombre)}</td>
            <td>${logoImg}</td>
            <td>
              <button class="btn btn-sm btn-outline-primary me-1" onclick="window.unidadesModule.abrirModalUnidad('${u.id}')"><i class="fa-solid fa-pen"></i></button>
              <button class="btn btn-sm btn-outline-danger" onclick="window.unidadesModule.eliminarUnidad('${u.id}')"><i class="fa-solid fa-trash"></i></button>
            </td>
          </tr>
        `;
      });

      tbody.innerHTML = html;
    },

    abrirModalUnidad(id = null) {
      const modalEl = document.getElementById('modalUnidad');
      if (!modalEl) return;

      document.getElementById('formUnidad').reset();
      document.getElementById('unidadId').value = id || '';
      document.getElementById('modalUnidadTitle').textContent = id ? 'Editar Unidad' : 'Nueva Unidad';
      document.getElementById('previewUnidadLogo').innerHTML = '';

      if (id) {
        const u = unidadesData.find(x => String(x.id).trim() === String(id).trim());
        if (u) {
          document.getElementById('unidadCodigo').value = u.codigo || '';
          document.getElementById('unidadNombre').value = u.nombre || '';
          document.getElementById('unidadLogoUrl').value = u.logo_url || '';
          if (u.logo_url) {
            document.getElementById('previewUnidadLogo').innerHTML = `<img src="${u.logo_url}" style="max-height:60px; max-width:120px; object-fit:contain;" class="border rounded p-1">`;
          }
        }
      }

      const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
      bsModal.show();
    },

    async guardarUnidad(e) {
      e.preventDefault();
      const id = document.getElementById('unidadId').value;
      const codigo = document.getElementById('unidadCodigo').value.trim().toUpperCase();
      const nombre = document.getElementById('unidadNombre').value.trim();
      const logo_url = document.getElementById('unidadLogoUrl').value.trim();

      if (!codigo || !nombre) {
        window.utils.showToast('Ingrese código y nombre de la unidad', 'warning');
        return;
      }

      const payload = { codigo, nombre, logo_url };
      try {
        let res;
        if (id) res = await window.api.update('unidades', id, payload);
        else res = await window.api.create('unidades', payload);

        if (res.status === 'success') {
          window.utils.showToast('Unidad guardada correctamente', 'success');
          const modalEl = document.getElementById('modalUnidad');
          if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).hide();
          await this.cargarUnidades();
        } else {
          window.utils.showToast(res.message, 'danger');
        }
      } catch (err) {
        window.utils.showToast('Error de comunicación', 'danger');
      }
    },

    async eliminarUnidad(id) {
      if (!confirm('¿Eliminar esta unidad?')) return;
      try {
        const res = await window.api.delete('unidades', id);
        if (res.status === 'success') {
          window.utils.showToast('Unidad eliminada', 'success');
          await this.cargarUnidades();
        }
      } catch (e) {
        window.utils.showToast('Error al eliminar', 'danger');
      }
    }
  };

  window.unidadesModule = unidadesModule;
})();
