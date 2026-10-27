/**
 * ==============================================================================
 * SISTEMA DE GESTIÓN DE CERTIFICACIONES UPTPC - MÓDULO AUTH & ADMIN (js/auth-admin.js)
 * ==============================================================================
 */

(function() {
  const STORAGE_KEY_SESSION = 'uptpc_admin_active_session';
  const MAP_LOGOS_UNIDADES = {
    'CYT': 'https://pub-b61fc0d596e8472a9cda031c9e80faeb.r2.dev/img/logos/logo_cyt.png',
    'EXTENSION': 'https://pub-b61fc0d596e8472a9cda031c9e80faeb.r2.dev/img/logos/logo_extension.png',
    'BIENESTAR': 'https://pub-b61fc0d596e8472a9cda031c9e80faeb.r2.dev/img/logos/logo_bienestar.png',
    'MPPEU': 'https://pub-b61fc0d596e8472a9cda031c9e80faeb.r2.dev/img/logos/logo_mppeu.png',
    'TALENTO': 'https://pub-b61fc0d596e8472a9cda031c9e80faeb.r2.dev/img/logos/logo_talento.png'
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

    isAuditor() {
      const session = this.getSession();
      return Boolean(session && session.tipo === 'AUDITOR');
    },

    isAdministracion() {
      const session = this.getSession();
      if (!session) return false;
      const t = String(session.tipo || '').toUpperCase();
      return t === 'ADMINISTRADORA' || t === 'ADMINISTRACION' || t === 'ADMIN_PAGOS';
    },

    isAdministradora() {
      return this.isAdministracion();
    },

    hasSectionPermission(targetSecId) {
      const session = this.getSession();
      if (!session) return false;
      if (session.tipo === 'SUPER_ADMIN' || session.permisos === '*') return true;
      const t = String(session.tipo || '').toUpperCase();
      if (t === 'ADMINISTRADORA' || t === 'ADMINISTRACION' || t === 'ADMIN_PAGOS') {
        return targetSecId === 'secOfertas';
      }
      if (session.tipo === 'AUDITOR') {
        const auditables = ['secDashboard', 'secUsuarios', 'secUnidades', 'secFirmas', 'secCursos', 'secCertificados', 'secConsultas'];
        return auditables.includes(targetSecId);
      }

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

        // Si el usuario es ADMINISTRADORA / ADMINISTRACION, asegurar redirección inmediata a #ofertas
        if (this.isAdministradora() && window.location.hash !== '#ofertas') {
          window.location.hash = '#ofertas';
        }

        const initialHash = window.location.hash || (this.isAdministradora() ? '#ofertas' : '#dashboard');
        await this.registrarVisitaAdmin(initialHash);
      }
    },

    mostrarModalLogin() {
      const modalEl = document.getElementById('modalLoginAdmin');
      if (!modalEl) return;

      const inputKey = document.getElementById('loginAdminKey');
      if (inputKey) inputKey.value = window.config.getAdminKey();

      const inputApi = document.getElementById('inputApiUrlModal');
      if (inputApi && window.config) {
        inputApi.value = window.config.getApiUrl();
      }

      const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
      bsModal.show();
    },

    guardarApiUrlModal() {
      const inputApi = document.getElementById('inputApiUrlModal');
      if (inputApi && window.config) {
        const val = inputApi.value.trim();
        window.config.setApiUrl(val);
        alert('URL de API guardada: ' + (val || '/api') + '. La página se recargará para aplicar los cambios.');
        window.location.reload();
      }
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
      const navMantenimiento = document.getElementById('navLinkMantenimiento');
      const navConfiguracion = document.getElementById('navLinkConfiguracion');

      // Clases de rol en el body para control de visualización CSS
      document.body.classList.remove('role-super-admin', 'role-auditor', 'role-administracion', 'role-admin');

      if (session && badgeConnected && lblNombre && lblTipo) {
        badgeConnected.style.display = 'inline-flex';
        lblNombre.textContent = session.usuario;

        const tipoUpper = String(session.tipo || '').toUpperCase();
        if (tipoUpper === 'SUPER_ADMIN') {
          document.body.classList.add('role-super-admin');
          lblTipo.innerHTML = '<span class="badge bg-danger"><i class="fa-solid fa-crown me-1"></i>SUPER_ADMIN</span>';
        } else if (tipoUpper === 'ADMINISTRADORA' || tipoUpper === 'ADMINISTRACION' || tipoUpper === 'ADMIN_PAGOS') {
          document.body.classList.add('role-administracion');
          lblTipo.innerHTML = '<span class="badge bg-success"><i class="fa-solid fa-cash-register me-1"></i>ADMINISTRADORA (Pagos)</span>';
        } else if (tipoUpper === 'AUDITOR') {
          document.body.classList.add('role-auditor');
          lblTipo.innerHTML = '<span class="badge bg-info text-dark fw-bold"><i class="fa-solid fa-shield-halved me-1"></i>AUDITOR (Solo Lectura)</span>';
        } else {
          document.body.classList.add('role-admin');
          lblTipo.innerHTML = '<span class="badge bg-primary">ADMIN</span>';
        }
      } else if (badgeConnected) {
        badgeConnected.style.display = 'none';
      }

      if (navAdminLink) {
        navAdminLink.style.display = (session && session.tipo === 'SUPER_ADMIN') ? 'flex' : 'none';
      }
      if (navMantenimiento) {
        navMantenimiento.style.display = (session && session.tipo === 'SUPER_ADMIN') ? 'flex' : 'none';
      }
      if (navConfiguracion) {
        navConfiguracion.style.display = (session && session.tipo === 'SUPER_ADMIN') ? 'flex' : 'none';
      }

      this.aplicarPermisosSidebar(session);
    },

    aplicarPermisosSidebar(session) {
      if (!session) return;
      const navLinks = document.querySelectorAll('.nav-link-tab');
      const tipoUpper = String(session.tipo || '').toUpperCase();

      navLinks.forEach(link => {
        const target = link.getAttribute('data-target');

        // Caso Perfil ADMINISTRADORA / ADMINISTRACION: Solo Verificación de Pagos (secOfertas)
        if (tipoUpper === 'ADMINISTRADORA' || tipoUpper === 'ADMINISTRACION' || tipoUpper === 'ADMIN_PAGOS') {
          if (target === 'secOfertas') {
            link.style.display = '';
            const textEl = link.querySelector('.sidebar-text');
            if (textEl) textEl.textContent = 'Verificación de Pagos';
            const iconEl = link.querySelector('i');
            if (iconEl) iconEl.className = 'fa-solid fa-receipt me-2';
          } else {
            link.style.display = 'none';
          }
          return;
        }

        // Restaurar texto normal de Ofertas Cursos si no es ADMINISTRACION
        if (target === 'secOfertas') {
          const textEl = link.querySelector('.sidebar-text');
          if (textEl) textEl.textContent = 'Ofertas Cursos';
          const iconEl = link.querySelector('i');
          if (iconEl) iconEl.className = 'fa-solid fa-store me-2';
        }

        // Caso Perfil AUDITOR: Solo Lectura en Secciones Auditables
        if (tipoUpper === 'AUDITOR') {
          const auditables = ['secDashboard', 'secUsuarios', 'secUnidades', 'secFirmas', 'secCursos', 'secCertificados', 'secConsultas'];
          link.style.display = auditables.includes(target) ? '' : 'none';
          return;
        }

        // Caso SUPER_ADMIN o ADMIN con permisos específicos
        if (target === 'secAdministradores' || target === 'secMantenimiento' || target === 'secConfiguracion') {
          link.style.display = session.tipo === 'SUPER_ADMIN' ? '' : 'none';
        } else if (session.tipo === 'SUPER_ADMIN' || session.permisos === '*') {
          link.style.display = '';
        } else {
          const permitido = this.hasSectionPermission(target);
          link.style.display = permitido ? '' : 'none';
        }
      });

      // Control adicional en secOfertas: Si es ADMINISTRADORA / ADMINISTRACION, ocultar tab de talleres/tienda y activar tab pagos
      const tabTalleresLi = document.getElementById('tab-talleres-tab')?.closest('.nav-item');
      const btnNuevaOferta = document.getElementById('btnNuevaOfertaCurso');
      if (tipoUpper === 'ADMINISTRADORA' || tipoUpper === 'ADMINISTRACION' || tipoUpper === 'ADMIN_PAGOS') {
        if (tabTalleresLi) tabTalleresLi.style.display = 'none';
        if (btnNuevaOferta) btnNuevaOferta.style.display = 'none';
        // Asegurar que tab-pagos esté activo
        setTimeout(() => {
          const tabPagosBtn = document.getElementById('tab-pagos-tab');
          if (tabPagosBtn && typeof bootstrap !== 'undefined') {
            bootstrap.Tab.getOrCreateInstance(tabPagosBtn).show();
          }
        }, 100);
      } else {
        if (tabTalleresLi) tabTalleresLi.style.display = '';
        if (btnNuevaOferta) btnNuevaOferta.style.display = '';
      }
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

    _autocorregirPromise: null,

    // Una sola ejecución a la vez y solo se envía el campo logo_url (nunca se recrea el registro)
    autocorregirLogosUnidades() {
      if (this._autocorregirPromise) return this._autocorregirPromise;
      this._autocorregirPromise = (async () => {
        try {
          const res = await window.api.getAll('unidades');
          if (res.status === 'success' && Array.isArray(res.data) && res.data.length > 0) {
            const procesados = new Set();
            for (const u of res.data) {
              const cod = String(u.codigo || '').trim().toUpperCase();
              if (procesados.has(cod)) continue;
              const urlOficial = MAP_LOGOS_UNIDADES[cod];
              if (urlOficial && u.id && (u.logo_url !== urlOficial || (u.logo_url && u.logo_url.includes('supabase')))) {
                procesados.add(cod);
                await window.api.post('update', { tabla: 'unidades', id: u.id, data: { logo_url: urlOficial } });
              }
            }
          }
        } catch (e) {
          console.error('Error al verificar/autocorregir logos de unidades:', e);
        } finally {
          this._autocorregirPromise = null;
        }
      })();
      return this._autocorregirPromise;
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

    async finalizarLoginExitoso(usuario) {
      this.setSession(usuario);
      this.actualizarUiSesion(usuario);
      this.ocultarModalLogin();

      if (window.utils && window.utils.showLoading) {
        window.utils.showLoading(35, 'Cargando datos del sistema...', 'Conectando con base de datos Turso LibSQL');
      }

      // Precarga integral de datos desde Turso
      if (window.api && window.api.preloadAllData) {
        try {
          await window.api.preloadAllData(true);
        } catch (e) {
          console.warn('Advertencia precargando datos post-login:', e);
        }
      }

      // Tareas secundarias en segundo plano de forma no bloqueante
      this.autocorregirLogosUnidades().catch(e => console.warn('Autocorregir logos background:', e));
      this.registrarVisitaAdmin(window.location.hash || '#dashboard').catch(e => console.warn('Visita admin background:', e));

      // Determinar sección de inicio según el perfil
      const tipoUpper = String(usuario.tipo || '').toUpperCase();
      let targetSec = 'secDashboard';

      if (tipoUpper === 'ADMINISTRADORA' || tipoUpper === 'ADMINISTRACION' || tipoUpper === 'ADMIN_PAGOS') {
        targetSec = 'secOfertas';
      } else if (tipoUpper === 'AUDITOR') {
        targetSec = 'secDashboard';
      } else {
        const currentHash = window.location.hash || '#dashboard';
        const mappedSec = window.hashMap ? window.hashMap[currentHash] : null;
        if (mappedSec && this.hasSectionPermission(mappedSec)) {
          targetSec = mappedSec;
        } else {
          targetSec = 'secDashboard';
        }
      }

      if (window.navegarASeccion) {
        await window.navegarASeccion(targetSec, true);
      }

      // Si es ADMINISTRADORA o ADMINISTRACION, asegurar activación inmediata de la pestaña de Verificación de Pagos
      if (tipoUpper === 'ADMINISTRADORA' || tipoUpper === 'ADMINISTRACION' || tipoUpper === 'ADMIN_PAGOS') {
        setTimeout(() => {
          const tabPagosBtn = document.getElementById('tab-pagos-tab');
          if (tabPagosBtn && typeof bootstrap !== 'undefined') {
            bootstrap.Tab.getOrCreateInstance(tabPagosBtn).show();
          }
        }, 150);
      }

      if (window.utils && window.utils.hideLoading) {
        window.utils.hideLoading();
      }

      if (window.utils && window.utils.showToast) {
        window.utils.showToast(`¡Bienvenido al sistema, ${usuario.usuario}!`, 'success');
      }
    },

    async procesarLogin() {
      const userVal = document.getElementById('loginUsuario').value.trim();
      const passVal = document.getElementById('loginClave').value.trim();
      const statusDiv = document.getElementById('statusLoginAdmin');

      statusDiv.innerHTML = '<div class="alert alert-info py-2 mb-0"><i class="fa-solid fa-spinner fa-spin me-2"></i>Verificando credenciales con la base de datos...</div>';

      if (window.utils && window.utils.showLoading) {
        window.utils.showLoading(30, 'Autenticando administrador...', 'Verificando datos con Turso LibSQL');
      }

      try {
        // Intento 1: Verificación directa y segura en el backend
        let authDirecta = null;
        try {
          authDirecta = await window.api.verifyAdmin(userVal, passVal);
        } catch (eAuth) {
          console.warn('Verificación directa backend falló, probando fallback:', eAuth);
        }

        if (authDirecta && authDirecta.status === 'success' && authDirecta.authenticated && authDirecta.user) {
          await this.finalizarLoginExitoso(authDirecta.user);
          return;
        }

        if (authDirecta && authDirecta.status === 'error' && authDirecta.message !== 'Usuario no registrado') {
          if (window.utils && window.utils.hideLoading) window.utils.hideLoading();
          statusDiv.innerHTML = `<div class="alert alert-danger py-2 mb-0"><i class="fa-solid fa-triangle-exclamation me-2"></i>${authDirecta.message || 'Usuario o contraseña incorrectos.'}</div>`;
          return;
        }

        // Intento 2 (Fallback): Consulta a la tabla admin
        let adminUsers = [];
        const res = await window.api.getAll('admin');
        if (res.status === 'success' && Array.isArray(res.data) && res.data.length > 0) {
          adminUsers = res.data;
        }

        let usuarioEncontrado = adminUsers.find(u => String(u.usuario).trim().toUpperCase() === userVal.toUpperCase());

        if (!usuarioEncontrado && userVal.toUpperCase() === DEFAULT_SUPER_ADMIN.usuario && passVal === DEFAULT_SUPER_ADMIN.clave) {
          usuarioEncontrado = { ...DEFAULT_SUPER_ADMIN };
        }

        if (!usuarioEncontrado || String(usuarioEncontrado.clave).trim() !== passVal) {
          if (window.utils && window.utils.hideLoading) window.utils.hideLoading();
          statusDiv.innerHTML = '<div class="alert alert-danger py-2 mb-0"><i class="fa-solid fa-triangle-exclamation me-2"></i>Usuario o contraseña incorrectos.</div>';
          return;
        }

        if (String(usuarioEncontrado.status).toUpperCase() !== 'ACTIVO') {
          if (window.utils && window.utils.hideLoading) window.utils.hideLoading();
          statusDiv.innerHTML = '<div class="alert alert-warning py-2 mb-0"><i class="fa-solid fa-user-slash me-2"></i>Esta cuenta de usuario ha sido DESACTIVADA por el Super Admin.</div>';
          return;
        }

        await this.finalizarLoginExitoso(usuarioEncontrado);
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

        // Oculta duplicados históricos (mismo usuario) conservando el primer registro
        const vistos = new Set();
        lista = lista.filter(a => {
          const k = String(a.usuario || '').trim().toUpperCase();
          if (!k || vistos.has(k)) return false;
          vistos.add(k);
          return true;
        });

        if (lista.length === 0) {
          lista = [DEFAULT_SUPER_ADMIN];
        }

        let html = '';
        lista.forEach((item, i) => {
          const tipoNorm = String(item.tipo || '').toUpperCase();
          const esSuper = tipoNorm === 'SUPER_ADMIN';
          let badgeTipo = '<span class="badge bg-primary">ADMIN</span>';
          if (esSuper) {
            badgeTipo = '<span class="badge bg-danger"><i class="fa-solid fa-crown me-1"></i>SUPER_ADMIN</span>';
          } else if (tipoNorm === 'ADMINISTRADORA' || tipoNorm === 'ADMINISTRACION' || tipoNorm === 'ADMIN_PAGOS') {
            badgeTipo = '<span class="badge bg-success"><i class="fa-solid fa-cash-register me-1"></i>ADMINISTRADORA</span>';
          } else if (tipoNorm === 'AUDITOR') {
            badgeTipo = '<span class="badge bg-info text-dark"><i class="fa-solid fa-shield-halved me-1"></i>AUDITOR</span>';
          }

          const badgeStatus = String(item.status).toUpperCase() === 'ACTIVO' ? '<span class="badge bg-success">ACTIVO</span>' : '<span class="badge bg-secondary">INACTIVO</span>';

          let permsTexto = 'Acceso Total (*)';
          if (tipoNorm === 'ADMINISTRADORA' || tipoNorm === 'ADMINISTRACION' || tipoNorm === 'ADMIN_PAGOS') {
            permsTexto = 'Solo Verificación de Pagos';
          } else if (tipoNorm === 'AUDITOR') {
            permsTexto = 'Solo Lectura (Auditoría Integral)';
          } else if (!esSuper && item.permisos && item.permisos !== '*') {
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
      const selectTipo = document.getElementById('adminUsuarioTipo');
      if (selectTipo) selectTipo.value = adminData ? adminData.tipo : 'ADMINISTRADORA';
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

      const sincronizarPermisosPorTipo = (tipoSel) => {
        const t = String(tipoSel || '').toUpperCase();
        if (t === 'SUPER_ADMIN') {
          checkboxes.forEach(cb => { cb.checked = true; cb.disabled = false; });
        } else if (t === 'ADMINISTRADORA' || t === 'ADMINISTRACION') {
          checkboxes.forEach(cb => { cb.checked = (cb.value === 'secOfertas'); cb.disabled = false; });
        } else if (t === 'AUDITOR') {
          const auditables = ['secDashboard', 'secUsuarios', 'secUnidades', 'secFirmas', 'secCursos', 'secCertificados', 'secConsultas'];
          checkboxes.forEach(cb => { cb.checked = auditables.includes(cb.value); cb.disabled = false; });
        } else {
          // ADMIN genérico
          checkboxes.forEach(cb => {
            if (!adminData) {
              cb.checked = false;
            } else {
              cb.checked = permsArray.includes(cb.value);
            }
            cb.disabled = false;
          });
        }
      };

      if (adminData) {
        checkboxes.forEach(cb => {
          if (adminData.permisos === '*') {
            cb.checked = true;
          } else {
            cb.checked = permsArray.includes(cb.value);
          }
        });
      } else {
        sincronizarPermisosPorTipo(selectTipo ? selectTipo.value : 'ADMINISTRACION');
      }

      if (selectTipo && !selectTipo.dataset.boundChange) {
        selectTipo.dataset.boundChange = 'true';
        selectTipo.addEventListener('change', () => {
          sincronizarPermisosPorTipo(selectTipo.value);
        });
      }

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

      let finalPermisos = '*';
      if (tipo === 'SUPER_ADMIN') {
        finalPermisos = '*';
      } else if (tipo === 'ADMINISTRADORA' || tipo === 'ADMINISTRACION') {
        finalPermisos = JSON.stringify(['secOfertas']);
      } else if (tipo === 'AUDITOR') {
        finalPermisos = JSON.stringify(['secDashboard', 'secUsuarios', 'secUnidades', 'secFirmas', 'secCursos', 'secCertificados', 'secConsultas']);
      } else {
        finalPermisos = JSON.stringify(checkedPerms);
      }

      const dataPayload = {
        id: id || Date.now() + '_' + Math.floor(Math.random() * 1000),
        usuario: usuario,
        clave: claveFinal,
        tipo: tipo,
        status: status,
        permisos: finalPermisos,
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
  window.guardarApiUrlModal = () => authAdmin.guardarApiUrlModal();

  document.addEventListener('DOMContentLoaded', () => {
    authAdmin.init();
  });
})();
