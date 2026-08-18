/**
 * ==============================================================================
 * SISTEMA DE GESTIÓN DE CERTIFICACIONES UPTPC - BITÁCORA DE CONSULTAS (js/modules/consultas.js)
 * ==============================================================================
 */

(function() {
  const consultasModule = {
    async init() {
      await this.cargarConsultas();
    },

    async cargarConsultas() {
      try {
        const res = await window.api.getAll('consulta');
        if (res.status === 'success') {
          this.renderTablaConsultas(res.data || []);
        }
      } catch (e) {
        console.error('Error cargando bitácora de consultas:', e);
      }
    },

    renderTablaConsultas(lista) {
      const tbody = document.getElementById('tbodyConsultasLog');
      if (!tbody) return;

      if (!lista || lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4"><i class="fa-solid fa-clock-rotate-left fa-2x mb-2"></i><br>No hay registros de consultas en la bitácora.</td></tr>`;
        return;
      }

      let html = '';
      const listaInvertida = [...lista].reverse();

      listaInvertida.forEach((item, i) => {
        html += `
          <tr>
            <td>${i + 1}</td>
            <td><span class="badge bg-secondary font-monospace">${window.utils.escapeHtml(item.certificado_id || 'N/A')}</span></td>
            <td><span class="badge bg-dark">${window.utils.escapeHtml(item.direccion_ip || '127.0.0.1')}</span></td>
            <td class="small">${item.fecha ? new Date(item.fecha).toLocaleString('es-VE') : 'N/A'}</td>
          </tr>
        `;
      });

      tbody.innerHTML = html;
    }
  };

  window.consultasModule = consultasModule;
})();
