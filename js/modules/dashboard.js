/**
 * ==============================================================================
 * SISTEMA DE GESTIÓN DE CERTIFICACIONES UPTPC - DASHBOARD (js/modules/dashboard.js)
 * ==============================================================================
 */

(function() {
  const dashboardModule = {
    async init() {
      await this.cargarMétricas();
    },

    async cargarMétricas() {
      try {
        const res = await window.api.getDashboardStats();

        if (res.status === 'success' && res.data) {
          const d = res.data;
          const el1 = document.getElementById('metricTotalCertificados');
          const el2 = document.getElementById('metricTotalUsuarios');
          const el3 = document.getElementById('metricTotalCursos');
          const el4 = document.getElementById('metricTotalUnidades');
          const el5 = document.getElementById('metricTotalVerificaciones');

          if (el1) el1.textContent = d.totalCertificados || 0;
          if (el2) el2.textContent = d.totalUsuarios || 0;
          if (el3) el3.textContent = d.totalCursos || 0;
          if (el4) el4.textContent = d.totalUnidades || 0;
          if (el5) el5.textContent = d.totalVerificaciones || 0;

          this.renderUltimosCertificados(d.ultimosCertificados || []);
        }
      } catch (e) {
        console.error('Error cargando métricas del dashboard:', e);
      }
    },

    renderUltimosCertificados(lista) {
      const tbody = document.getElementById('tbodyUltimosCertificadosDashboard');
      if (!tbody) return;

      if (!lista || lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-3">No hay actividad reciente.</td></tr>`;
        return;
      }

      let html = '';
      lista.forEach((c) => {
        html += `
          <tr>
            <td><span class="badge bg-dark font-monospace text-warning fw-bold">${window.utils.escapeHtml(c.codigo)}</span></td>
            <td><strong>${window.utils.escapeHtml(c.nombre_completo)}</strong><br><small class="text-muted">${window.utils.escapeHtml(c.cedula)}</small></td>
            <td class="small">${window.utils.escapeHtml(c.nombre_curso)}</td>
            <td><span class="badge bg-info text-dark">${window.utils.escapeHtml(c.unidad_codigo)}</span></td>
            <td class="small">${window.utils.formatDate(c.fecha_curso)}</td>
          </tr>
        `;
      });

      tbody.innerHTML = html;
    }
  };

  window.dashboardModule = dashboardModule;
})();
