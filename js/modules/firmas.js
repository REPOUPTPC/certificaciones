/**
 * ==============================================================================
 * SISTEMA DE GESTIÓN DE CERTIFICACIONES UPTPC - MÓDULO DE FIRMAS (js/modules/firmas.js)
 * ==============================================================================
 */

(function() {
  let firmasData = [];

  const firmasModule = {
    async init() {
      this.bindEvents();
      await this.cargarFirmas();
    },

    bindEvents() {
      document.getElementById('btnNuevaFirma')?.addEventListener('click', () => this.abrirModalFirma());
      document.getElementById('formFirma')?.addEventListener('submit', (e) => this.guardarFirma(e));

      // Subida de imagen para Firma Digital
      const fileFirma = document.getElementById('fileFirmaImg');
      if (fileFirma) {
        fileFirma.addEventListener('change', async (e) => {
          const file = e.target.files[0];
          if (!file) return;

          const preview = document.getElementById('previewFirmaImg');
          preview.innerHTML = '<span class="text-info small"><i class="fa-solid fa-spinner fa-spin me-1"></i>Optimizando y subiendo a Google Drive...</span>';

          try {
            const base64 = await window.utils.compressImage(file, 600, 600, 0.85);
            const res = await window.api.uploadImage(base64, file.name);

            if (res.status === 'success' && res.url) {
              document.getElementById('firmaUrl').value = res.url;
              preview.innerHTML = `<img src="${res.url}" style="max-height:50px; max-width:120px; object-fit:contain;" class="border rounded p-1">`;
              window.utils.showToast('Firma digital guardada en Google Drive', 'success');
            } else {
              window.utils.showToast('Error al subir firma: ' + res.message, 'danger');
              preview.innerHTML = '';
            }
          } catch (err) {
            window.utils.showToast('Error procesando archivo de firma', 'danger');
            preview.innerHTML = '';
          }
        });
      }

      // Subida de imagen para Sello Institucional
      const fileSello = document.getElementById('fileSelloImg');
      if (fileSello) {
        fileSello.addEventListener('change', async (e) => {
          const file = e.target.files[0];
          if (!file) return;

          const preview = document.getElementById('previewSelloImg');
          preview.innerHTML = '<span class="text-info small"><i class="fa-solid fa-spinner fa-spin me-1"></i>Optimizando y subiendo a Google Drive...</span>';

          try {
            const base64 = await window.utils.compressImage(file, 600, 600, 0.85);
            const res = await window.api.uploadImage(base64, file.name);

            if (res.status === 'success' && res.url) {
              document.getElementById('selloUrl').value = res.url;
              preview.innerHTML = `<img src="${res.url}" style="max-height:50px; max-width:120px; object-fit:contain;" class="border rounded p-1">`;
              window.utils.showToast('Sello guardado en Google Drive', 'success');
            } else {
              window.utils.showToast('Error al subir sello: ' + res.message, 'danger');
              preview.innerHTML = '';
            }
          } catch (err) {
            window.utils.showToast('Error procesando archivo de sello', 'danger');
            preview.innerHTML = '';
          }
        });
      }
    },

    async cargarFirmas() {
      try {
        const res = await window.api.getAll('firmas');
        if (res.status === 'success') {
          firmasData = res.data || [];
          this.renderTablaFirmas(firmasData);
        }
      } catch (e) {
        window.utils.showToast('Error cargando firmas', 'danger');
      }
    },

    renderTablaFirmas(lista) {
      const tbody = document.getElementById('tbodyFirmas');
      if (!tbody) return;

      if (!lista || lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">No hay firmas registradas.</td></tr>`;
        return;
      }

      let html = '';
      lista.forEach((f, i) => {
        const firmaImg = f.firma ? `<img src="${f.firma}" alt="Firma" style="height:35px; max-width:80px; object-fit:contain;">` : 'N/A';
        const selloImg = f.sello ? `<img src="${f.sello}" alt="Sello" style="height:35px; max-width:80px; object-fit:contain;">` : 'N/A';

        html += `
          <tr>
            <td>${i + 1}</td>
            <td class="fw-semibold">${window.utils.escapeHtml(f.nombre)}</td>
            <td>${window.utils.escapeHtml(f.cargo)}</td>
            <td>${firmaImg} / ${selloImg}</td>
            <td>
              <button class="btn btn-sm btn-outline-primary me-1" onclick="window.firmasModule.abrirModalFirma('${f.id}')"><i class="fa-solid fa-pen"></i></button>
              <button class="btn btn-sm btn-outline-danger" onclick="window.firmasModule.eliminarFirma('${f.id}')"><i class="fa-solid fa-trash"></i></button>
            </td>
          </tr>
        `;
      });

      tbody.innerHTML = html;
    },

    abrirModalFirma(id = null) {
      const modalEl = document.getElementById('modalFirma');
      if (!modalEl) return;

      document.getElementById('formFirma').reset();
      document.getElementById('firmaId').value = id || '';
      document.getElementById('modalFirmaTitle').textContent = id ? 'Editar Autoridad Firmante' : 'Nueva Autoridad Firmante';
      document.getElementById('previewFirmaImg').innerHTML = '';
      document.getElementById('previewSelloImg').innerHTML = '';

      if (id) {
        const f = firmasData.find(x => String(x.id).trim() === String(id).trim());
        if (f) {
          document.getElementById('firmaNombre').value = f.nombre || '';
          document.getElementById('firmaCargo').value = f.cargo || '';
          document.getElementById('firmaUrl').value = f.firma || '';
          document.getElementById('selloUrl').value = f.sello || '';

          if (f.firma) {
            document.getElementById('previewFirmaImg').innerHTML = `<img src="${f.firma}" style="max-height:50px; max-width:120px; object-fit:contain;" class="border rounded p-1">`;
          }
          if (f.sello) {
            document.getElementById('previewSelloImg').innerHTML = `<img src="${f.sello}" style="max-height:50px; max-width:120px; object-fit:contain;" class="border rounded p-1">`;
          }
        }
      }

      const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
      bsModal.show();
    },

    async guardarFirma(e) {
      e.preventDefault();
      const id = document.getElementById('firmaId').value;
      const nombre = document.getElementById('firmaNombre').value.trim();
      const cargo = document.getElementById('firmaCargo').value.trim();
      const firma = document.getElementById('firmaUrl').value.trim();
      const sello = document.getElementById('selloUrl').value.trim();

      if (!nombre || !cargo) {
        window.utils.showToast('Ingrese nombre y cargo de la autoridad', 'warning');
        return;
      }

      const payload = { nombre, cargo, firma, sello };
      try {
        let res;
        if (id) res = await window.api.update('firmas', id, payload);
        else res = await window.api.create('firmas', payload);

        if (res.status === 'success') {
          window.utils.showToast('Firmante guardado exitosamente', 'success');
          const modalEl = document.getElementById('modalFirma');
          if (modalEl) bootstrap.Modal.getOrCreateInstance(modalEl).hide();
          await this.cargarFirmas();
        } else {
          window.utils.showToast(res.message, 'danger');
        }
      } catch (err) {
        window.utils.showToast('Error de comunicación', 'danger');
      }
    },

    async eliminarFirma(id) {
      if (!confirm('¿Eliminar este firmante?')) return;
      try {
        const res = await window.api.delete('firmas', id);
        if (res.status === 'success') {
          window.utils.showToast('Firmante eliminado', 'success');
          await this.cargarFirmas();
        }
      } catch (e) {
        window.utils.showToast('Error al eliminar', 'danger');
      }
    }
  };

  window.firmasModule = firmasModule;
})();
