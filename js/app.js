/**
 * ==============================================================================
 * SISTEMA DE GESTIÓN DE CERTIFICACIONES UPTPC - ARCHIVO PRINCIPAL (js/app.js)
 * ==============================================================================
 */

(function() {
  document.addEventListener('DOMContentLoaded', async () => {
    initSwitchModoConexion();
    initBotonSincronizar();
    initNavegacionSidebar();
    initModalConfiguracion();
    if (window.utils && window.utils.setupPasswordToggles) {
      window.utils.setupPasswordToggles();
    }

    // Si hay una sesión activa, precargar datos de Google Drive inmediatamente
    if (window.authAdmin && window.authAdmin.isLoggedIn() && window.api && window.api.preloadAllData) {
      await window.api.preloadAllData();
    }
  });

  function initSwitchModoConexion() {
    const switchEl = document.getElementById('switchModoConexion');
    const lblEl = document.getElementById('lblModoConexion');

    const actualizarEstadoUi = () => {
      if (!switchEl || !lblEl) return;
      const isMock = window.api ? window.api.isUsingMockData() : false;
      if (isMock) {
        switchEl.checked = false;
        lblEl.className = 'form-check-label fw-bold small cursor-pointer mb-0 text-warning';
        lblEl.innerHTML = '<i class="fa-solid fa-flask me-1"></i> Datos de Prueba (Local)';
      } else {
        switchEl.checked = true;
        lblEl.className = 'form-check-label fw-bold small cursor-pointer mb-0 text-success';
        lblEl.innerHTML = '<i class="fa-solid fa-cloud me-1"></i> Datos Reales';
      }
    };

    if (switchEl) {
      switchEl.addEventListener('change', async () => {
        const forceMock = !switchEl.checked;
        if (window.api && window.api.setForceMockMode) {
          window.api.setForceMockMode(forceMock);
        }
        if (window.api && window.api.preloadAllData) {
          await window.api.preloadAllData(true);
        }

        actualizarEstadoUi();

        const modoNombre = forceMock ? 'Modo de Datos Ficticios (Local)' : 'Modo de Datos Reales (Google Sheets)';
        window.utils.showToast(`Modo cambiado a: ${modoNombre}`, forceMock ? 'warning' : 'success');

        // Recargar la sección actual
        const currentHash = window.location.hash || '#dashboard';
        const targetId = document.querySelector(`.nav-link-tab.active`)?.getAttribute('data-target') || 'secDashboard';
        
        if (window.utils && window.utils.showLoading) {
          window.utils.showLoading(20, 'Cargando datos...', `Conectando con ${modoNombre}`);
        }

        try {
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
            case 'secAdministradores':
              if (window.authAdmin) await window.authAdmin.cargarTablaAdministradores();
              break;
          }
        } finally {
          actualizarEstadoUi();
          if (window.utils && window.utils.hideLoading) window.utils.hideLoading();
        }
      });
    }

    // Exportar helper global para actualizar estado
    window.actualizarSwitchModoConexion = actualizarEstadoUi;
  }

  function initNavegacionSidebar() {
    const navLinks = document.querySelectorAll('.nav-link-tab');
    const sections = document.querySelectorAll('.tab-section');

    const hashMap = {
      '#dashboard': 'secDashboard',
      '#usuarios': 'secUsuarios',
      '#unidades': 'secUnidades',
      '#firmas': 'secFirmas',
      '#cursos': 'secCursos',
      '#certificados': 'secCertificados',
      '#disenador': 'secDisenador',
      '#consultas': 'secConsultas',
      '#administradores': 'secAdministradores'
    };

    async function navegarASeccion(targetId, updateHash = true) {
      if (window.authAdmin) {
        if (!window.authAdmin.isLoggedIn()) {
          window.authAdmin.mostrarModalLogin();
          return;
        }

        if (!window.authAdmin.hasSectionPermission(targetId)) {
          if (window.utils) window.utils.showToast('Acceso restringido: No posee permisos para acceder a esta sección.', 'warning');
          targetId = 'secDashboard';
        }
      }

      if (window.utils && window.utils.showLoading && targetId !== 'secAdministradores') {
        window.utils.showLoading(20, 'Cargando sección...', 'Preparando vista');
      }

      navLinks.forEach(l => l.classList.remove('active'));
      const activeLink = document.querySelector(`.nav-link-tab[data-target="${targetId}"]`);
      if (activeLink) activeLink.classList.add('active');

      sections.forEach(sec => sec.style.display = 'none');
      const targetSec = document.getElementById(targetId);
      if (targetSec) targetSec.style.display = 'block';

      if (updateHash) {
        const hashEntry = Object.entries(hashMap).find(([, v]) => v === targetId);
        if (hashEntry) {
          history.replaceState(null, '', hashEntry[0]);
        }
      }

      // Registrar visita en audit log (visita_admin)
      if (window.authAdmin && window.authAdmin.isLoggedIn()) {
        const currentHash = window.location.hash || '#dashboard';
        window.authAdmin.registrarVisitaAdmin(currentHash);
      }

      try {
        if (window.utils && window.utils.showLoading && targetId !== 'secAdministradores') {
          window.utils.showLoading(60, 'Obteniendo datos...', 'Consultando registros');
        }

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
          case 'secAdministradores':
            if (window.authAdmin) await window.authAdmin.cargarTablaAdministradores();
            break;
        }

        if (window.utils && window.utils.showLoading && targetId !== 'secAdministradores') {
          window.utils.showLoading(100, '¡Completado!', 'Carga lista');
        }
      } finally {
        if (window.actualizarSwitchModoConexion) window.actualizarSwitchModoConexion();
        if (window.utils && window.utils.hideLoading && targetId !== 'secAdministradores') {
          window.utils.hideLoading();
        }
      }
    }

    navLinks.forEach(link => {
      link.addEventListener('click', async (e) => {
        e.preventDefault();
        const targetId = link.getAttribute('data-target');
        await navegarASeccion(targetId);
      });
    });

    window.addEventListener('hashchange', () => {
      const hash = window.location.hash || '#dashboard';
      const targetId = hashMap[hash];
      if (targetId) navegarASeccion(targetId, false);
    });

    const initialHash = window.location.hash || '#dashboard';
    const initialTarget = hashMap[initialHash] || 'secDashboard';
    navegarASeccion(initialTarget);
  }

  function initModalConfiguracion() {
    const btnAbrir = document.getElementById('btnAbrirConfiguracion');
    const modalEl = document.getElementById('modalConfiguracion');
    const inputKey = document.getElementById('inputAdminSecretKey');
    const btnGuardar = document.getElementById('btnGuardarConfiguracion');
    const btnProbar = document.getElementById('btnProbarConexionScript');
    const statusContainer = document.getElementById('statusConexionScript');

    if (btnAbrir) {
      btnAbrir.addEventListener('click', () => {
        if (inputKey) inputKey.value = window.config.getAdminKey();
        if (statusContainer) statusContainer.innerHTML = '';
        bootstrap.Modal.getOrCreateInstance(modalEl).show();
        if (window.utils && window.utils.setupPasswordToggles) window.utils.setupPasswordToggles();
      });
    }

    if (btnProbar) {
      btnProbar.addEventListener('click', async () => {
        const key = inputKey ? inputKey.value.trim() : '';
        statusContainer.innerHTML = '<div class="alert alert-info py-2 mb-0"><i class="fa-solid fa-spinner fa-spin me-2"></i>Probando conexión y autenticación...</div>';
        
        window.config.setAdminKey(key);
        try {
          const res = await window.api.verifyAdmin();
          if (res.status === 'success') {
            statusContainer.innerHTML = `<div class="alert alert-success py-2 mb-0"><i class="fa-solid fa-circle-check me-2"></i>${window.utils.escapeHtml(res.message)}</div>`;
          } else {
            statusContainer.innerHTML = `<div class="alert alert-danger py-2 mb-0"><i class="fa-solid fa-triangle-exclamation me-2"></i>${window.utils.escapeHtml(res.message || 'Clave de administración incorrecta')}</div>`;
          }
        } catch (e) {
          statusContainer.innerHTML = `<div class="alert alert-danger py-2 mb-0"><i class="fa-solid fa-circle-xmark me-2"></i>No se pudo autenticar. Verifique la Clave Secreta (API KEY).</div>`;
        }
      });
    }

    if (btnGuardar) {
      btnGuardar.addEventListener('click', () => {
        if (inputKey) window.config.setAdminKey(inputKey.value.trim());
        window.utils.showToast('API KEY de Administración guardada exitosamente', 'success');
        const inst = bootstrap.Modal.getInstance(modalEl);
        if (inst) inst.hide();
      });
    }
  }

  function initBotonSincronizar() {
    const btnSync = document.getElementById('btnSincronizarDatos');
    if (!btnSync) return;

    btnSync.addEventListener('click', async () => {
      const icon = btnSync.querySelector('i');
      if (icon) icon.classList.add('fa-spin');
      btnSync.disabled = true;

      if (window.utils && window.utils.showToast) {
        window.utils.showToast('Sincronizando datos con Google Drive...', 'info');
      }

      try {
        if (window.api && window.api.refreshData) {
          await window.api.refreshData();
        }

        const targetId = document.querySelector(`.nav-link-tab.active`)?.getAttribute('data-target') || 'secDashboard';
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
          case 'secAdministradores':
            if (window.authAdmin) await window.authAdmin.cargarTablaAdministradores();
            break;
        }

        if (window.utils && window.utils.showToast) {
          window.utils.showToast('¡Datos sincronizados correctamente con Google Drive!', 'success');
        }
      } catch (err) {
        console.error('Error al sincronizar datos:', err);
        if (window.utils && window.utils.showToast) {
          window.utils.showToast('Error al sincronizar: ' + err.message, 'danger');
        }
      } finally {
        if (icon) icon.classList.remove('fa-spin');
        btnSync.disabled = false;
      }
    });
  }
})();
