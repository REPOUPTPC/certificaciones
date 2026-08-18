/**
 * ==============================================================================
 * SISTEMA DE GESTIÓN DE CERTIFICACIONES UPTPC - ARCHIVO PRINCIPAL (js/app.js)
 * ==============================================================================
 */

(function() {
  document.addEventListener('DOMContentLoaded', async () => {
    initNavegacionSidebar();
    initModalConfiguracion();
    
    // Cargar módulo activo inicial (Dashboard)
    if (window.dashboardModule) {
      await window.dashboardModule.init();
    }
  });

  function initNavegacionSidebar() {
    const navLinks = document.querySelectorAll('.nav-link-tab');
    const sections = document.querySelectorAll('.tab-section');

    navLinks.forEach(link => {
      link.addEventListener('click', async (e) => {
        e.preventDefault();
        const targetId = link.getAttribute('data-target');

        navLinks.forEach(l => l.classList.remove('active'));
        link.classList.add('active');

        sections.forEach(sec => sec.style.display = 'none');
        const targetSec = document.getElementById(targetId);
        if (targetSec) targetSec.style.display = 'block';

        switch (targetId) {
          case 'secDashboard':
            if (window.dashboardModule) await window.dashboardModule.init();
            break;
          case 'secUsuarios':
            if (window.usuariosModule) await window.usuariosModule.init();
            break;
          case 'secUnidades':
            if (window.unidadesModule) await window.unidadesModule.init();
            break;
          case 'secFirmas':
            if (window.firmasModule) await window.firmasModule.init();
            break;
          case 'secCursos':
            if (window.cursosModule) await window.cursosModule.init();
            break;
          case 'secCertificados':
            if (window.certificadosModule) await window.certificadosModule.init();
            break;
          case 'secDisenador':
            if (window.disenadorModule) await window.disenadorModule.init();
            break;
          case 'secConsultas':
            if (window.consultasModule) await window.consultasModule.init();
            break;
        }
      });
    });
  }

  function initModalConfiguracion() {
    const btnAbrir = document.getElementById('btnAbrirConfiguracion');
    const modalEl = document.getElementById('modalConfiguracion');
    const inputUrl = document.getElementById('inputGoogleScriptUrl');
    const inputKey = document.getElementById('inputAdminSecretKey');
    const btnGuardar = document.getElementById('btnGuardarConfiguracion');
    const btnProbar = document.getElementById('btnProbarConexionScript');
    const statusContainer = document.getElementById('statusConexionScript');

    if (btnAbrir) {
      btnAbrir.addEventListener('click', () => {
        if (inputUrl) inputUrl.value = window.config.getApiUrl();
        if (inputKey) inputKey.value = window.config.getAdminKey();
        if (statusContainer) statusContainer.innerHTML = '';
        new bootstrap.Modal(modalEl).show();
      });
    }

    if (btnProbar) {
      btnProbar.addEventListener('click', async () => {
        const url = inputUrl ? inputUrl.value.trim() : '';
        const key = inputKey ? inputKey.value.trim() : '';
        if (!url) {
          statusContainer.innerHTML = '<div class="alert alert-warning py-2 mb-0">Ingrese un URL de Aplicación Web de Google Apps Script.</div>';
          return;
        }

        statusContainer.innerHTML = '<div class="alert alert-info py-2 mb-0"><i class="fa-solid fa-spinner fa-spin me-2"></i>Probando conexión y autenticación...</div>';
        
        window.config.setApiUrl(url);
        window.config.setAdminKey(key);
        try {
          const res = await window.api.verifyAdmin();
          if (res.status === 'success') {
            statusContainer.innerHTML = `<div class="alert alert-success py-2 mb-0"><i class="fa-solid fa-circle-check me-2"></i>${window.utils.escapeHtml(res.message)}</div>`;
          } else {
            statusContainer.innerHTML = `<div class="alert alert-danger py-2 mb-0"><i class="fa-solid fa-triangle-exclamation me-2"></i>${window.utils.escapeHtml(res.message || 'Clave de administración incorrecta')}</div>`;
          }
        } catch (e) {
          statusContainer.innerHTML = `<div class="alert alert-danger py-2 mb-0"><i class="fa-solid fa-circle-xmark me-2"></i>No se pudo autenticar. Verifique el URL y la Clave Secreta.</div>`;
        }
      });
    }

    if (btnGuardar) {
      btnGuardar.addEventListener('click', () => {
        if (inputUrl) window.config.setApiUrl(inputUrl.value.trim());
        if (inputKey) window.config.setAdminKey(inputKey.value.trim());
        window.utils.showToast('Configuración y Clave de Administración guardadas', 'success');
        bootstrap.Modal.getInstance(modalEl).hide();
      });
    }
  }
})();
