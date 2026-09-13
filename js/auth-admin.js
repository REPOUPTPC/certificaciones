/**
 * ==============================================================================
 * SISTEMA DE GESTIÓN DE CERTIFICACIONES UPTPC - MÓDULO AUTH & ADMIN (js/auth-admin.js)
 * ==============================================================================
 */

(function() {
  const STORAGE_KEY_SESSION = 'uptpc_admin_active_session';
  const MAP_LOGOS_UNIDADES = {
    'CYT': 'https://lh3.googleusercontent.com/d/1oKZUgu4Q8waYsM7vHGVF2ODi2jmLK1tg',
    'EXTENSION': 'https://lh3.googleusercontent.com/d/1xpan01071vA7EQ9bdy8113fKGlESQcLj',
    'BIENESTAR': 'https://lh3.googleusercontent.com/d/1x_M9v0rRL3aioGM1neA6VSGVUBlN4UrT',
    'MPPEU': 'https://lh3.googleusercontent.com/d/1GF-vtwLal4JLujzcY3LDZypVwIqdfTou'
  };

  const DEFAULT_SUPER_ADMIN = {
    id: 'super-admin-01',
    usuario: 'CIENCIA_TECNOLOGIA',
    clave: 'CYT_01012023',
    tipo: 'SUPER_ADMIN',
    status: 'ACTIVO',
    permisos: '*'
  };

  let cachedPublicIp = null;
  let chartUserInstance = null;
  let chartHourInstance = null;

  async function obtenerIpPublica() {
    if (cachedPublicIp) return cachedPublicIp;
    try {
      const res = await fetch('https://api.ipify.org?format=json');
      const data = await res.json();
      if (data && data.ip) {
        cachedPublicIp = data.ip;
        return cachedPublicIp;
      }
    } catch (e) {}

    try {
      const res = await fetch('https://ipapi.co/json/');
      const data = await res.json();
      if (data && data.ip) {
        cachedPublicIp = data.ip;
        return cachedPublicIp;
      }
    } catch (e) {}

    cachedPublicIp = '186.24.12.5';
    return cachedPublicIp;
  }

  function validarContrasenaAlfanumerica(pwd) {
    if (!pwd || pwd.length < 6) {
      return { esValido: false, motivo: 'La contraseña debe tener al menos 6 caracteres.' };
    }
    const tieneLetras = /[a-zA-Z]/.test(pwd);
    const tieneNumeros = /[0-9]/.test(pwd);

    if (!tieneLetras && tieneNumeros) {
      return { esValido: false, motivo: 'Contraseña solo numérica. Debe incluir también letras (A-Z).' };
    }
    if (tieneLetras && !tieneNumeros) {
      return { esValido: false, motivo: 'Contraseña solo de letras. Debe incluir también números (0-9).' };
    }
    if (!tieneLetras || !tieneNumeros) {
      return { esValido: false, motivo: 'Debe combinar letras y números obligatoriamente.' };
    }
    return { esValido: true, motivo: 'Contraseña válida' };
  }

  const authAdmin = {
    getSession() {
      const raw = sessionStorage.getItem(STORAGE_KEY_SESSION) || localStorage.getItem(STORAGE_KEY_SESSION);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch (e) {
        return null;
      }
    },

    setSession(sessionData) {
      if (sessionData) {
        const json = JSON.stringify(sessionData);
        sessionStorage.setItem(STORAGE_KEY_SESSION, json);
        localStorage.setItem(STORAGE_KEY_SESSION, json);
      } else {
        sessionStorage.removeItem(STORAGE_KEY_SESSION);
        localStorage.removeItem(STORAGE_KEY_SESSION);
      }
    },

    isLoggedIn() {
      const session = this.getSession();
      return Boolean(session && session.usuario && session.status === 'ACTIVO');
    },

    isSuperAdmin() {
      const session = this.getSession();
      return Boolean(session && session.tipo === 'SUPER_ADMIN');
    },

    hasSectionPermission(targetSecId) {
      const session = this.getSession();
      if (!session) return false;
      if (session.tipo === 'SUPER_ADMIN' || session.permisos === '*') return true;

      let perms = session.permisos;
      if (typeof perms === 'string') {
        try { perms = JSON.parse(perms); } catch (e) { perms = perms.split(','); }
      }
      if (!Array.isArray(perms)) return true;
      return perms.includes(targetSecId);
    },

    async init() {
      this.initEventListeners();
      this.initPasswordValidationListeners();
      if (window.utils && window.utils.setupPasswordToggles) {
        window.utils.setupPasswordToggles();
      }
      
      const session = this.getSession();
      if (!session || !this.isLoggedIn()) {
        this.mostrarModalLogin();
      } else {
        this.actualizarUiSesion(session);
        await this.autocorregirLogosUnidades();
        const initialHash = window.location.hash || '#dashboard';
        await this.registrarVisitaAdmin(initialHash);
      }
    },

    mostrarModalLogin() {
      const modalEl = document.getElementById('modalLoginAdmin');
      if (!modalEl) return;

      const inputKey = document.getElementById('loginAdminKey');
      if (inputKey) inputKey.value = window.config.getAdminKey();

      const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
      bsModal.show();
    },

    ocultarModalLogin() {
      const modalEl = document.getElementById('modalLoginAdmin');
      if (!modalEl) return;
      const bsModal = bootstrap.Modal.getInstance(modalEl);
      if (bsModal) bsModal.hide();
    },

    actualizarUiSesion(session) {
      const badgeConnected = document.getElementById('badgeUserConnected');
      const lblNombre = document.getElementById('lblUserNombre');
      const lblTipo = document.getElementById('lblUserTipo');
      const navAdminLink = document.getElementById('navLinkAdministradores');

      if (session && badgeConnected && lblNombre && lblTipo) {
        badgeConnected.style.display = 'inline-flex';
        lblNombre.textContent = session.usuario;
        lblTipo.textContent = session.tipo;
      } else if (badgeConnected) {
        badgeConnected.style.display = 'none';
      }

      if (navAdminLink) {
        navAdminLink.style.display = (session && session.tipo === 'SUPER_ADMIN') ? 'flex' : 'none';
      }

      this.aplicarPermisosSidebar(session);
    },

    aplicarPermisosSidebar(session) {
      if (!session) return;
      const navLinks = document.querySelectorAll('.nav-link-tab');
      navLinks.forEach(link => {
        const target = link.getAttribute('data-target');
        if (target === 'secAdministradores') {
          link.style.display = session.tipo === 'SUPER_ADMIN' ? '' : 'none';
        } else if (session.tipo === 'SUPER_ADMIN' || session.permisos === '*') {
          link.style.display = '';
        } else {
          const permitido = this.hasSectionPermission(target);
          link.style.display = permitido ? '' : 'none';
        }
      });
    },

    async registrarVisitaAdmin(sitioHash) {
      const session = this.getSession();
      if (!session || !session.usuario) return;

      const ip = await obtenerIpPublica();
      const payload = {
        id: Date.now() + '_' + Math.floor(Math.random() * 1000),
        usuario: session.usuario,
        ip: ip,
        sitio: sitioHash || '#dashboard',
        fecha_hora: new Date().toISOString()
      };

      try {
        await window.api.post('create', { tabla: 'visita_admin', data: payload });
      } catch (e) {
        console.warn('Registro de visita admin local:', payload);
      }
    },

    async autocorregirLogosUnidades() {
      try {
        const res = await window.api.getAll('unidades');
        if (res.status === 'success' && Array.isArray(res.data) && res.data.length > 0) {
          for (const u of res.data) {
            const cod = String(u.codigo || '').trim().toUpperCase();
            const urlOficial = MAP_LOGOS_UNIDADES[cod];
            if (urlOficial && (u.logo_url !== urlOficial || (u.logo_url && u.logo_url.includes('supabase')))) {
              u.logo_url = urlOficial;
              await window.api.post('update', { tabla: 'unidades', id: u.id, data: u });
            }
          }
        }
      } catch (e) {
        console.error('Error al verificar/autocorregir logos de unidades:', e);
      }
    },

    initEventListeners() {
      // Form Login Admin
      const formLogin = document.getElementById('formLoginAdmin');
      if (formLogin) {
        formLogin.addEventListener('submit', async (e) => {
          e.preventDefault();
          await this.procesarLogin();
        });
      }

      // Cerrar Sesión Global
      const btnLogout = document.getElementById('btnCerrarSesionGlobal');
      if (btnLogout) {
        btnLogout.addEventListener('click', () => {
          this.cerrarSesion();
        });
      }

      // Abrir Modal Cambiar Clave
      const btnCambiarClave = document.getElementById('btnCambiarClaveGlobal');
      if (btnCambiarClave) {
        btnCambiarClave.addEventListener('click', () => {
          const modalEl = document.getElementById('modalCambiarClave');
          if (modalEl) {
            document.getElementById('formCambiarClave').reset();
            document.getElementById('statusCambiarClave').innerHTML = '';
            
            // Limpiar clases de validación
            ['nuevaClave', 'confirmarNuevaClave'].forEach(id => {
              const el = document.getElementById(id);
              if (el) el.classList.remove('is-invalid', 'is-valid');
            });

            bootstrap.Modal.getOrCreateInstance(modalEl).show();
            if (window.utils && window.utils.setupPasswordToggles) window.utils.setupPasswordToggles();
          }
        });
      }

      // Form Cambiar Clave
      const formCambiarClave = document.getElementById('formCambiarClave');
      if (formCambiarClave) {
        formCambiarClave.addEventListener('submit', async (e) => {
          e.preventDefault();
          await this.procesarCambiarClave();
        });
      }

      // Nuevo Admin (Super Admin)
      const btnNuevoAdmin = document.getElementById('btnNuevoAdmin');
      if (btnNuevoAdmin) {
        btnNuevoAdmin.addEventListener('click', () => {
          this.abrirModalAdminUser();
        });
      }

      // Form Admin User
      const formAdminUser = document.getElementById('formAdminUser');
      if (formAdminUser) {
        formAdminUser.addEventListener('submit', async (e) => {
          e.preventDefault();
          await this.guardarAdminUser();
        });
      }
    },

    // ── Validación en Tiempo Real de Contraseñas Alfanuméricas ──
    initPasswordValidationListeners() {
      const inputNueva = document.getElementById('nuevaClave');
      const inputConfirmar = document.getElementById('confirmarNuevaClave');
      const inputAdminClave = document.getElementById('adminUsuarioClave');
      const feedbackNueva = document.getElementById('feedbackNuevaClave');
      const feedbackConfirmar = document.getElementById('feedbackConfirmarNuevaClave');
      const feedbackAdminClave = document.getElementById('feedbackAdminUsuarioClave');

      const validarNueva = () => {
        if (!inputNueva) return true;
        const val = inputNueva.value;
        if (!val) {
          inputNueva.classList.remove('is-invalid', 'is-valid');
          return false;
        }
        const check = validarContrasenaAlfanumerica(val);
        if (!check.esValido) {
          inputNueva.classList.add('is-invalid');
          inputNueva.classList.remove('is-valid');
          if (feedbackNueva) feedbackNueva.textContent = check.motivo;
          return false;
        } else {
          inputNueva.classList.remove('is-invalid');
          inputNueva.classList.add('is-valid');
          return true;
        }
      };

      const validarConfirmar = () => {
        if (!inputConfirmar || !inputNueva) return true;
        const valNueva = inputNueva.value;
        const valConf = inputConfirmar.value;
        if (!valConf) {
          inputConfirmar.classList.remove('is-invalid', 'is-valid');
          return false;
        }
        if (valConf !== valNueva) {
          inputConfirmar.classList.add('is-invalid');
          inputConfirmar.classList.remove('is-valid');
          if (feedbackConfirmar) feedbackConfirmar.textContent = 'Las contraseñas no coinciden.';
          return false;
        } else {
          inputConfirmar.classList.remove('is-invalid');
          inputConfirmar.classList.add('is-valid');
          return true;
        }
      };

      const validarAdminClave = () => {
        if (!inputAdminClave) return true;
        const val = inputAdminClave.value;
        if (!val) {
          inputAdminClave.classList.remove('is-invalid', 'is-valid');
          return true; // Es opcional al editar
        }
        const check = validarContrasenaAlfanumerica(val);
        if (!check.esValido) {
          inputAdminClave.classList.add('is-invalid');
          inputAdminClave.classList.remove('is-valid');
          if (feedbackAdminClave) feedbackAdminClave.textContent = check.motivo;
          return false;
        } else {
          inputAdminClave.classList.remove('is-invalid');
          inputAdminClave.classList.add('is-valid');
          return true;
        }
      };

      if (inputNueva) {
        inputNueva.addEventListener('input', () => { validarNueva(); if (inputConfirmar && inputConfirmar.value) validarConfirmar(); });
        inputNueva.addEventListener('blur', validarNueva);
      }

      if (inputConfirmar) {
        inputConfirmar.addEventListener('input', validarConfirmar);
        inputConfirmar.addEventListener('blur', validarConfirmar);
      }

      if (inputAdminClave) {
        inputAdminClave.addEventListener('input', validarAdminClave);
        inputAdminClave.addEventListener('blur', validarAdminClave);
      }
    },

    async procesarLogin() {
      const userVal = document.getElementById('loginUsuario').value.trim();
      const passVal = document.getElementById('loginClave').value.trim();
      const apiKeyVal = document.getElementById('loginAdminKey').value.trim();
      const statusDiv = document.getElementById('statusLoginAdmin');

      statusDiv.innerHTML = '<div class="alert alert-info py-2 mb-0"><i class="fa-solid fa-spinner fa-spin me-2"></i>Verificando credenciales...</div>';

      if (apiKeyVal) {
        window.config.setAdminKey(apiKeyVal);
      }

      if (window.utils && window.utils.showLoading) {
        window.utils.showLoading(20, 'Autenticando administrador...', 'Verificando datos con la base de datos');
      }

      try {
        let adminUsers = [];
        if (window.utils && window.utils.showLoading) window.utils.showLoading(45, 'Consultando usuarios admin...', 'Conectando servidor Google Apps Script');
        const res = await window.api.getAll('admin');
        if (res.status === 'success' && Array.isArray(res.data) && res.data.length > 0) {
          adminUsers = res.data;
        }

        let usuarioEncontrado = adminUsers.find(u => String(u.usuario).trim().toUpperCase() === userVal.toUpperCase());

        // Si la tabla admin no posee registros aún en Sheets/local, validar contra SUPER_ADMIN por defecto
        if (!usuarioEncontrado && userVal.toUpperCase() === DEFAULT_SUPER_ADMIN.usuario && passVal === DEFAULT_SUPER_ADMIN.clave) {
          usuarioEncontrado = { ...DEFAULT_SUPER_ADMIN };
          await window.api.post('create', { tabla: 'admin', data: usuarioEncontrado });
        }

        if (window.utils && window.utils.showLoading) window.utils.showLoading(80, 'Validando permisos de sesión...', 'Cargando configuraciones del sistema');

        if (!usuarioEncontrado) {
          if (window.utils && window.utils.hideLoading) window.utils.hideLoading();
          statusDiv.innerHTML = '<div class="alert alert-danger py-2 mb-0"><i class="fa-solid fa-triangle-exclamation me-2"></i>Usuario o contraseña incorrectos.</div>';
          return;
        }

        if (String(usuarioEncontrado.clave).trim() !== passVal) {
          if (window.utils && window.utils.hideLoading) window.utils.hideLoading();
          statusDiv.innerHTML = '<div class="alert alert-danger py-2 mb-0"><i class="fa-solid fa-triangle-exclamation me-2"></i>Usuario o contraseña incorrectos.</div>';
          return;
        }

        if (String(usuarioEncontrado.status).toUpperCase() !== 'ACTIVO') {
          if (window.utils && window.utils.hideLoading) window.utils.hideLoading();
          statusDiv.innerHTML = '<div class="alert alert-warning py-2 mb-0"><i class="fa-solid fa-user-slash me-2"></i>Esta cuenta de usuario ha sido DESACTIVADA por el Super Admin.</div>';
          return;
        }

        if (window.utils && window.utils.showLoading) window.utils.showLoading(100, '¡Acceso Concedido!', 'Bienvenido al sistema');

        // Login exitoso
        this.setSession(usuarioEncontrado);
        this.actualizarUiSesion(usuarioEncontrado);
        this.ocultarModalLogin();

        // Iniciar precarga de todos los datos reales de Google Drive
        if (window.api && window.api.preloadAllData) {
          if (window.utils) window.utils.showToast('Precargando datos completos desde Google Drive para navegación fluida...', 'info');
          await window.api.preloadAllData(true);
        }

        window.utils.showToast(`Bienvenido al sistema, ${usuarioEncontrado.usuario}`, 'success');

        if (window.utils && window.utils.hideLoading) window.utils.hideLoading();

        // Tareas secundarias en segundo plano de forma no bloqueante
        this.autocorregirLogosUnidades().catch(e => console.warn('Autocorregir logos background:', e));
        this.registrarVisitaAdmin(window.location.hash || '#dashboard').catch(e => console.warn('Visita admin background:', e));

        // Refrescar datos reales de la sección activa (ej: Dashboard)
        const currentHash = window.location.hash || '#dashboard';
        if ((currentHash === '#dashboard' || currentHash === '') && window.dashboardModule) {
          window.dashboardModule.init().catch(e => console.error('Error cargando dashboard post-login:', e));
        }

      } catch (err) {
        if (window.utils && window.utils.hideLoading) window.utils.hideLoading();
        console.error('Error en proceso de login:', err);
        statusDiv.innerHTML = `<div class="alert alert-danger py-2 mb-0">Error de conexión: ${err.message}</div>`;
      }
    },

    cerrarSesion() {
      if (window.api && window.api.clearCache) {
        window.api.clearCache();
      }
      this.setSession(null);
      this.actualizarUiSesion(null);
      window.utils.showToast('Sesión cerrada correctamente', 'info');
      this.mostrarModalLogin();
    },

    async procesarCambiarClave() {
      const session = this.getSession();
      if (!session) return;

      const nuevaClave = document.getElementById('nuevaClave').value.trim();
      const confirmarNueva = document.getElementById('confirmarNuevaClave').value.trim();
      const statusDiv = document.getElementById('statusCambiarClave');

      const check = validarContrasenaAlfanumerica(nuevaClave);
      if (!check.esValido) {
        statusDiv.innerHTML = `<div class="alert alert-warning py-2 mt-2"><i class="fa-solid fa-triangle-exclamation me-1"></i>${check.motivo}</div>`;
        return;
      }

      if (nuevaClave !== confirmarNueva) {
        statusDiv.innerHTML = '<div class="alert alert-warning py-2 mt-2"><i class="fa-solid fa-triangle-exclamation me-1"></i>Las nuevas contraseñas no coinciden.</div>';
        return;
      }

      if (window.utils && window.utils.showLoading) {
        window.utils.showLoading(30, 'Actualizando contraseña...', 'Enviando petición a la base de datos');
      }

      statusDiv.innerHTML = '<div class="alert alert-info py-2 mt-2"><i class="fa-solid fa-spinner fa-spin me-2"></i>Actualizando contraseña...</div>';

      try {
        const res = await window.api.getAll('admin');
        let recordToUpdate = null;
        if (res.status === 'success' && Array.isArray(res.data)) {
          recordToUpdate = res.data.find(u => String(u.usuario).trim().toUpperCase() === session.usuario.toUpperCase());
        }

        if (window.utils && window.utils.showLoading) window.utils.showLoading(75, 'Guardando cambios...', 'Actualizando credenciales de seguridad');

        if (recordToUpdate) {
          recordToUpdate.clave = nuevaClave;
          await window.api.post('update', { tabla: 'admin', id: recordToUpdate.id, data: recordToUpdate });
        } else {
          session.clave = nuevaClave;
          await window.api.post('create', { tabla: 'admin', data: session });
        }

        session.clave = nuevaClave;
        this.setSession(session);

        if (window.utils && window.utils.showLoading) window.utils.showLoading(100, '¡Contraseña Actualizada!', 'Operación completada exitosamente');

        statusDiv.innerHTML = '<div class="alert alert-success py-2 mt-2"><i class="fa-solid fa-check me-2"></i>Contraseña actualizada exitosamente.</div>';
        setTimeout(() => {
          if (window.utils && window.utils.hideLoading) window.utils.hideLoading();
          const modalEl = document.getElementById('modalCambiarClave');
          if (modalEl) bootstrap.Modal.getInstance(modalEl).hide();
        }, 800);

      } catch (e) {
        if (window.utils && window.utils.hideLoading) window.utils.hideLoading();
        statusDiv.innerHTML = `<div class="alert alert-danger py-2 mt-2">Error al cambiar contraseña: ${e.message}</div>`;
      }
    },

    // ── Módulo Administradores (Super Admin) ──
    async cargarTablaAdministradores() {
      const tbody = document.getElementById('tbodyAdministradores');
      if (!tbody) return;

      if (window.utils && window.utils.showLoading) {
        window.utils.showLoading(30, 'Cargando Administradores...', 'Obteniendo usuarios y estadísticas de acceso');
      }

      try {
        const res = await window.api.getAll('admin');
        let lista = (res.status === 'success' && Array.isArray(res.data)) ? res.data : [];

        if (lista.length === 0) {
          lista = [DEFAULT_SUPER_ADMIN];
        }

        let html = '';
        lista.forEach((item, i) => {
          const esSuper = item.tipo === 'SUPER_ADMIN';
          const badgeTipo = esSuper ? '<span class="badge bg-danger">SUPER_ADMIN</span>' : '<span class="badge bg-info text-dark">ADMIN</span>';
          const badgeStatus = String(item.status).toUpperCase() === 'ACTIVO' ? '<span class="badge bg-success">ACTIVO</span>' : '<span class="badge bg-secondary">INACTIVO</span>';

          let permsTexto = 'Acceso Total (*)';
          if (!esSuper && item.permisos && item.permisos !== '*') {
            try {
              const pArray = typeof item.permisos === 'string' ? JSON.parse(item.permisos) : item.permisos;
              permsTexto = `${pArray.length} sección(es)`;
            } catch (e) {
              permsTexto = item.permisos;
            }
          }

          html += `
            <tr>
              <td>${i + 1}</td>
              <td class="fw-bold">${window.utils.escapeHtml(item.usuario)}</td>
              <td>${badgeTipo}</td>
              <td>${badgeStatus}</td>
              <td><small class="text-muted">${window.utils.escapeHtml(permsTexto)}</small></td>
              <td>
                <button class="btn btn-sm btn-outline-primary me-1" onclick="window.authAdmin.editarAdminUser('${item.id || item.usuario}')" title="Editar / Cambiar Clave / Permisos">
                  <i class="fa-solid fa-pen-to-square"></i>
                </button>
              </td>
            </tr>
          `;
        });

        tbody.innerHTML = html;

        if (window.utils && window.utils.showLoading) window.utils.showLoading(75, 'Generando Gráficas de Conexión...', 'Analizando historial de visitas');
        await this.cargarEstadisticasConexion();
        await this.cargarBitacoraCertificadosEliminados();

        if (window.utils && window.utils.showLoading) window.utils.showLoading(100, '¡Carga Completa!', 'Sección lista');
        setTimeout(() => {
          if (window.utils && window.utils.hideLoading) window.utils.hideLoading();
        }, 300);

      } catch (e) {
        if (window.utils && window.utils.hideLoading) window.utils.hideLoading();
        console.error('Error cargando tabla admin:', e);
      }
    },

    async cargarBitacoraCertificadosEliminados() {
      const tbody = document.getElementById('tbodyCertificadosEliminados');
      if (!tbody) return;

      try {
        const res = await window.api.getAll('certificados_eliminados');
        let lista = (res && res.status === 'success' && Array.isArray(res.data)) ? res.data : [];

        if (lista.length === 0 && window.api._globalCache && Array.isArray(window.api._globalCache.certificados_eliminados)) {
          lista = window.api._globalCache.certificados_eliminados;
        }

        const badge = document.getElementById('badgeTotalCertificadosEliminados');

        if (lista.length === 0) {
          tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4"><i class="fa-solid fa-shield-check fa-2x mb-2 text-success"></i><br>No hay registros de certificados eliminados en el sistema.</td></tr>`;
          if (badge) badge.textContent = '0 registros';
          return;
        }

        lista.sort((a, b) => new Date(b.created_at || b.fecha_eliminacion || 0) - new Date(a.created_at || a.fecha_eliminacion || 0));

        let html = '';
        lista.forEach((item, i) => {
          const fechaStr = item.created_at || item.fecha_eliminacion;
          const fechaFormatted = window.utils ? window.utils.formatDate(fechaStr) : (fechaStr || '-');

          html += `
            <tr>
              <td>${i + 1}</td>
              <td><span class="badge bg-danger font-monospace fw-bold fs-6">${window.utils.escapeHtml(item.codigo || 'N/A')}</span></td>
              <td class="fw-semibold">${window.utils.escapeHtml(item.nombre_completo || 'N/A')}<br><small class="text-muted">${window.utils.escapeHtml(item.cedula || '')}</small></td>
              <td class="small">${window.utils.escapeHtml(item.nombre_curso || 'N/A')}</td>
              <td class="small text-danger italic">${window.utils.escapeHtml(item.motivo_eliminacion || 'Anulación / Eliminación manual')}</td>
              <td><span class="badge bg-secondary font-monospace">${window.utils.escapeHtml(item.eliminado_por || 'ADMIN')}</span></td>
              <td class="small text-muted">${window.utils.escapeHtml(fechaFormatted)}</td>
            </tr>
          `;
        });

        tbody.innerHTML = html;
        if (badge) badge.textContent = `${lista.length} registro${lista.length !== 1 ? 's' : ''}`;
      } catch (e) {
        console.error('Error cargando bitácora de certificados eliminados:', e);
      }
    },

    // ── GRÁFICOS DE ESTADÍSTICAS DE CONEXIÓN ADMIN (CHART.JS) ──
    async cargarEstadisticasConexion() {
      const canvasUser = document.getElementById('chartUsuariosConexiones');
      const canvasHour = document.getElementById('chartHorasConexiones');
      if (!canvasUser || !canvasHour || typeof Chart === 'undefined') return;

      try {
        const res = await window.api.getAll('visita_admin');
        let visitas = (res.status === 'success' && Array.isArray(res.data)) ? res.data : [];

        // Si no hay datos aún, generar datos representativos para visualización inicial
        if (visitas.length === 0) {
          visitas = [
            { usuario: 'CIENCIA_TECNOLOGIA', fecha_hora: new Date(Date.now() - 3600000 * 2).toISOString() },
            { usuario: 'CIENCIA_TECNOLOGIA', fecha_hora: new Date(Date.now() - 3600000 * 5).toISOString() },
            { usuario: 'CIENCIA_TECNOLOGIA', fecha_hora: new Date(Date.now() - 3600000 * 10).toISOString() },
            { usuario: 'COORDINACION_EXT', fecha_hora: new Date(Date.now() - 3600000 * 4).toISOString() },
            { usuario: 'BIENESTAR_ADMIN', fecha_hora: new Date(Date.now() - 3600000 * 8).toISOString() }
          ];
        }

        // 1. Agrupar por usuario
        const usuariosMap = {};
        visitas.forEach(v => {
          const u = String(v.usuario || 'Desconocido').trim();
          usuariosMap[u] = (usuariosMap[u] || 0) + 1;
        });

        const userLabels = Object.keys(usuariosMap);
        const userData = Object.values(usuariosMap);
        const userColors = ['#0d6efd', '#0dcaf0', '#ffc107', '#20c997', '#fd7e14', '#6610f2', '#e83e8c'];

        // Destruir gráfica anterior si existe
        if (chartUserInstance) chartUserInstance.destroy();

        chartUserInstance = new Chart(canvasUser.getContext('2d'), {
          type: 'doughnut',
          data: {
            labels: userLabels,
            datasets: [{
              data: userData,
              backgroundColor: userColors.slice(0, userLabels.length),
              borderWidth: 2,
              borderColor: '#ffffff'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom' },
              tooltip: {
                callbacks: {
                  label: (ctx) => ` ${ctx.label}: ${ctx.raw} conexiones`
                }
              }
            }
          }
        });

        // 2. Agrupar por horas del día (00:00 a 23:00)
        const horasArr = new Array(24).fill(0);
        visitas.forEach(v => {
          if (v.fecha_hora) {
            try {
              const date = new Date(v.fecha_hora);
              const hr = date.getHours();
              if (hr >= 0 && hr < 24) horasArr[hr]++;
            } catch (e) {}
          }
        });

        const hourLabels = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);

        if (chartHourInstance) chartHourInstance.destroy();

        chartHourInstance = new Chart(canvasHour.getContext('2d'), {
          type: 'bar',
          data: {
            labels: hourLabels,
            datasets: [{
              label: 'Conexiones',
              data: horasArr,
              backgroundColor: '#0d6efd',
              borderRadius: 4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              y: { beginAtZero: true, ticks: { precision: 0 } },
              x: { grid: { display: false } }
            },
            plugins: {
              legend: { display: false }
            }
          }
        });

      } catch (e) {
        console.error('Error al generar gráficas de conexión admin:', e);
      }
    },

    abrirModalAdminUser(adminData = null) {
      const form = document.getElementById('formAdminUser');
      if (form) form.reset();

      document.getElementById('adminUserId').value = adminData ? adminData.id : '';
      document.getElementById('adminUsuarioName').value = adminData ? adminData.usuario : '';
      document.getElementById('adminUsuarioClave').value = '';
      document.getElementById('adminUsuarioTipo').value = adminData ? adminData.tipo : 'ADMIN';
      document.getElementById('adminUsuarioStatus').value = adminData ? adminData.status : 'ACTIVO';

      const inputClave = document.getElementById('adminUsuarioClave');
      if (inputClave) inputClave.classList.remove('is-invalid', 'is-valid');

      // Checkboxes de permisos
      const checkboxes = document.querySelectorAll('#checkboxesSeccionesPermisos input[type="checkbox"]');
      let permsArray = [];
      if (adminData && adminData.permisos) {
        if (typeof adminData.permisos === 'string') {
          try { permsArray = JSON.parse(adminData.permisos); } catch (e) { permsArray = adminData.permisos.split(','); }
        } else if (Array.isArray(adminData.permisos)) {
          permsArray = adminData.permisos;
        }
      }

      checkboxes.forEach(cb => {
        if (!adminData || adminData.permisos === '*') {
          cb.checked = true;
        } else {
          cb.checked = permsArray.includes(cb.value);
        }
      });

      const title = document.getElementById('modalAdminUserTitle');
      if (title) title.innerHTML = adminData ? '<i class="fa-solid fa-user-pen me-2"></i>Editar Administrador' : '<i class="fa-solid fa-user-plus me-2"></i>Nuevo Administrador';

      bootstrap.Modal.getOrCreateInstance(document.getElementById('modalAdminUser')).show();
      if (window.utils && window.utils.setupPasswordToggles) window.utils.setupPasswordToggles();
    },

    async editarAdminUser(idOrUsuario) {
      try {
        const res = await window.api.getAll('admin');
        const lista = (res.status === 'success' && Array.isArray(res.data)) ? res.data : [DEFAULT_SUPER_ADMIN];
        const found = lista.find(u => u.id === idOrUsuario || u.usuario === idOrUsuario);
        if (found) {
          this.abrirModalAdminUser(found);
        }
      } catch (e) {
        console.error('Error al editar admin user:', e);
      }
    },

    async guardarAdminUser() {
      const id = document.getElementById('adminUserId').value;
      const usuario = document.getElementById('adminUsuarioName').value.trim();
      const clave = document.getElementById('adminUsuarioClave').value.trim();
      const tipo = document.getElementById('adminUsuarioTipo').value;
      const status = document.getElementById('adminUsuarioStatus').value;

      if (clave) {
        const check = validarContrasenaAlfanumerica(clave);
        if (!check.esValido) {
          window.utils.showToast(check.motivo, 'warning');
          return;
        }
      }

      const checkedPerms = [];
      document.querySelectorAll('#checkboxesSeccionesPermisos input[type="checkbox"]:checked').forEach(cb => {
        checkedPerms.push(cb.value);
      });

      if (!usuario) {
        window.utils.showToast('Ingrese el nombre de usuario', 'warning');
        return;
      }

      if (window.utils && window.utils.showLoading) {
        window.utils.showLoading(40, 'Guardando Administrador...', 'Procesando cambios en el servidor');
      }

      const res = await window.api.getAll('admin');
      const lista = (res.status === 'success' && Array.isArray(res.data)) ? res.data : [];
      const existente = lista.find(u => u.id === id || String(u.usuario).toUpperCase() === usuario.toUpperCase());

      let claveFinal = clave;
      if (!claveFinal && existente) {
        claveFinal = existente.clave;
      }
      if (!claveFinal) claveFinal = 'CYT_01012023';

      const dataPayload = {
        id: id || Date.now() + '_' + Math.floor(Math.random() * 1000),
        usuario: usuario,
        clave: claveFinal,
        tipo: tipo,
        status: status,
        permisos: tipo === 'SUPER_ADMIN' ? '*' : JSON.stringify(checkedPerms),
        created_at: existente ? existente.created_at : new Date().toISOString()
      };

      if (existente && existente.id) {
        await window.api.post('update', { tabla: 'admin', id: existente.id, data: dataPayload });
        window.utils.showToast('Administrador actualizado exitosamente', 'success');
      } else {
        await window.api.post('create', { tabla: 'admin', data: dataPayload });
        window.utils.showToast('Nuevo Administrador creado exitosamente', 'success');
      }

      if (window.utils && window.utils.showLoading) window.utils.showLoading(100, '¡Guardado con éxito!', 'Actualizando lista');

      bootstrap.Modal.getInstance(document.getElementById('modalAdminUser')).hide();
      await this.cargarTablaAdministradores();
      if (window.utils && window.utils.hideLoading) window.utils.hideLoading();
    }
  };

  window.authAdmin = authAdmin;

  document.addEventListener('DOMContentLoaded', () => {
    authAdmin.init();
  });
})();
