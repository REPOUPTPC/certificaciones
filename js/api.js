/**
 * ==============================================================================
 * SISTEMA DE GESTIÓN DE CERTIFICACIONES UPTPC - CLIENTE API (js/api.js)
 * ==============================================================================
 */

(function() {
  const LOCAL_STORAGE_DB_KEY = 'uptpc_local_mock_db_v1';

  function getLocalDb() {
    const defaultDb = {
      unidades: [
        { id: 'u1', codigo: 'CYT', nombre: 'Unidad de Ciencia y Tecnología', logo_url: 'img/IMAGE.jpeg', created_at: new Date().toISOString() },
        { id: 'u2', codigo: 'BIENESTAR', nombre: 'Unidad de Bienestar Estudiantil', logo_url: '', created_at: new Date().toISOString() },
        { id: 'u3', codigo: 'EXTENSION', nombre: 'Dirección de Extensión Universitaria', logo_url: '', created_at: new Date().toISOString() }
      ],
      firmas: [
        { id: 'f1', nombre: 'Msc. Carlos Rodríguez', cargo: 'Rector UPTPC', firma: '', sello: '', created_at: new Date().toISOString() },
        { id: 'f2', nombre: 'Dra. Elena Mendoza', cargo: 'Directora de Ciencia y Tecnología', firma: '', sello: '', created_at: new Date().toISOString() }
      ],
      tipo: [
        { id: 't1', tipo: 'Taller', created_at: new Date().toISOString() },
        { id: 't2', tipo: 'Curso', created_at: new Date().toISOString() },
        { id: 't3', tipo: 'Seminario', created_at: new Date().toISOString() },
        { id: 't4', tipo: 'Diplomado', created_at: new Date().toISOString() }
      ],
      usuarios: [
        { id: 'usr-1', cedula: 'V-12345678', nombre_completo: 'JUAN ALBERTO PÉREZ', created_at: new Date().toISOString() },
        { id: 'usr-2', cedula: 'V-87654321', nombre_completo: 'MARÍA FERNANDA GÓMEZ', created_at: new Date().toISOString() }
      ],
      cursos: [
        {
          id: 'cur-1',
          codigo_relacionado: 'TALLER-CYT-01',
          nombre: 'INTRODUCCIÓN A LA INTELIGENCIA ARTIFICIAL Y DESARROLLO WEB',
          contenido: 'Conceptos fundamentales de la IA, LLMs y desarrollo de módulos web interactivos',
          idtipo_curso: 't1',
          unidad_id: 'u1',
          horas: 16,
          motivo: 'Por su valiosa participación y aprovechamiento en el taller de formación tecnológica.',
          ponencias: 'Módulo 1: Fundamentos de IA | Módulo 2: Javascript Moderno',
          idfirma1: 'f1',
          idfirma2: 'f2',
          created_at: new Date().toISOString(),
          matricula_prefijo: 'IA-2026'
        }
      ],
      certificados: [
        {
          id: 'cert-1',
          usuario_id: 'usr-1',
          curso_id: 'cur-1',
          codigo: 'HGQ5573DTY',
          fecha_curso: '2026-05-20',
          lugar: 'Puerto Cabello, Venezuela',
          tomo: '',
          folio: '',
          created_at: new Date().toISOString(),
          matricula: ''
        }
      ],
      disenos: [],
      consulta: [],
      certificados_eliminados: []
    };

    const stored = localStorage.getItem(LOCAL_STORAGE_DB_KEY);
    if (!stored) {
      localStorage.setItem(LOCAL_STORAGE_DB_KEY, JSON.stringify(defaultDb));
      return defaultDb;
    }

    try {
      const db = JSON.parse(stored);
      if (!Array.isArray(db.certificados_eliminados)) db.certificados_eliminados = [];
      return db;
    } catch (e) {
      return defaultDb;
    }
  }

  function saveLocalDb(db) {
    localStorage.setItem(LOCAL_STORAGE_DB_KEY, JSON.stringify(db));
  }

  window.api = {
    // ── Sistema de Precarga Global y Caché Inteligente de Datos Reales ──
    _globalCache: null,
    _isPreloaded: false,
    _isPreloading: false,
    _cache: {},
    _cacheTTL: 60000,

    clearCache() {
      this._cache = {};
      this._globalCache = null;
      this._isPreloaded = false;
      try {
        sessionStorage.removeItem('uptpc_real_drive_cache_v2');
      } catch (e) {}
    },

    async fetchRemoteDirect(action, params = {}) {
      const apiUrl = window.config.getApiUrl();
      const adminKey = window.config.getAdminKey();
      if (!apiUrl) throw new Error('No API URL configured');
      const queryParams = new URLSearchParams({ action, admin_key: adminKey, ...params });
      const response = await fetch(`${apiUrl}?${queryParams.toString()}`, {
        method: 'GET',
        mode: 'cors'
      });
      if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
      return await response.json();
    },

    ensureAllTables(cacheObj) {
      if (!cacheObj || typeof cacheObj !== 'object') return cacheObj;
      const tables = ['unidades', 'firmas', 'tipo', 'usuarios', 'cursos', 'certificados', 'disenos', 'admin', 'consulta', 'certificados_eliminados'];
      tables.forEach(t => {
        if (!Array.isArray(cacheObj[t])) cacheObj[t] = [];
      });
      return cacheObj;
    },

    async preloadAllData(force = false) {
      if (!force && this._globalCache && this._isPreloaded) {
        this.ensureAllTables(this._globalCache);
        return this._globalCache;
      }

      if (this._isPreloading) {
        while (this._isPreloading) {
          await new Promise(r => setTimeout(r, 100));
        }
        if (this._globalCache) {
          this.ensureAllTables(this._globalCache);
          return this._globalCache;
        }
      }

      // Intentar cargar la caché real desde sessionStorage
      if (!force) {
        try {
          const stored = sessionStorage.getItem('uptpc_real_drive_cache_v2');
          if (stored) {
            const parsed = JSON.parse(stored);
            if (parsed && typeof parsed === 'object' && Array.isArray(parsed.usuarios) && Array.isArray(parsed.cursos)) {
              this._globalCache = this.ensureAllTables(parsed);
              this._isPreloaded = true;
              this._isUsingMockData = false;
              return this._globalCache;
            }
          }
        } catch (e) {}
      }

      this._isPreloading = true;

      if (window.config.hasApiUrl() && !this._forceMockMode) {
        try {
          // Intento 1: Acción unificada getAllData desde Google Apps Script
          const resCombined = await this.fetchRemoteDirect('getAllData');
          if (resCombined && resCombined.status === 'success' && resCombined.data && typeof resCombined.data === 'object') {
            this._globalCache = this.ensureAllTables(resCombined.data);
            this._isPreloaded = true;
            this._isUsingMockData = false;
            try {
              sessionStorage.setItem('uptpc_real_drive_cache_v2', JSON.stringify(this._globalCache));
            } catch (e) {}
            this._isPreloading = false;
            return this._globalCache;
          }
        } catch (errCombined) {
          console.warn('Acción getAllData no disponible en servidor remoto. Ejecutando peticiones paralelas por tabla:', errCombined);
        }

        // Intento 2 (Fallback): Peticiones paralelas por tabla individual a Google Apps Script
        try {
          const tables = ['unidades', 'firmas', 'tipo', 'usuarios', 'cursos', 'certificados', 'disenos', 'admin', 'consulta', 'certificados_eliminados'];
          const results = await Promise.all(
            tables.map(t => this.fetchRemoteDirect('getAll', { tabla: t }).catch(e => ({ status: 'error', data: [] })))
          );

          const combined = {};
          tables.forEach((t, index) => {
            const res = results[index];
            combined[t] = (res && res.status === 'success' && Array.isArray(res.data)) ? res.data : [];
          });

          this._globalCache = this.ensureAllTables(combined);
          this._isPreloaded = true;
          this._isUsingMockData = false;
          try {
            sessionStorage.setItem('uptpc_real_drive_cache_v2', JSON.stringify(this._globalCache));
          } catch (e) {}
          this._isPreloading = false;
          return this._globalCache;
        } catch (errParallel) {
          console.error('Error al precargar tablas de Google Drive:', errParallel);
        }
      }

      const localDb = getLocalDb();
      this._globalCache = localDb;
      this._isPreloaded = true;
      this._isUsingMockData = true;
      this._isPreloading = false;
      return this._globalCache;
    },

    async refreshData() {
      return this.preloadAllData(true);
    },

    _isUsingMockData: false,

    isUsingMockData() {
      return this._isUsingMockData;
    },

    async get(action, params = {}) {
      const targetTable = params.tabla || params.table;
      if (targetTable) {
        params.tabla = targetTable;
        params.table = targetTable;
      }

      if (this._forceMockMode) {
        this._isUsingMockData = true;
        return this.mockGet(action, params);
      }

      // Servir desde la caché global precargada si está disponible
      if (this._globalCache && this._isPreloaded) {
        if (action === 'getAll' && targetTable && Array.isArray(this._globalCache[targetTable])) {
          return { status: 'success', data: this._globalCache[targetTable] };
        }
        if (action === 'getAllData') {
          return { status: 'success', data: this._globalCache };
        }
        if (action === 'getById' && targetTable && Array.isArray(this._globalCache[targetTable])) {
          const found = this._globalCache[targetTable].find(r => String(r.id) === String(params.id));
          return { status: 'success', data: found || null };
        }
        if (action === 'searchCertificado') {
          const termino = String(params.termino || '').trim().toUpperCase();
          const vista = this.buildVistaCertificados(this._globalCache);
          const esCodigo = /^[A-Z]{3}[0-9]{3,4}[A-Z]{3}$/.test(termino);
          const res = vista.filter(c => {
            if (esCodigo) {
              return String(c.codigo).toUpperCase() === termino;
            } else {
              const cedulaLimpia = String(c.cedula || '').replace(/[\s-]/g, '').toUpperCase();
              const termLimpio = termino.replace(/[\s-]/g, '');
              return cedulaLimpia.includes(termLimpio) || String(c.cedula).toUpperCase() === termino;
            }
          });
          return { status: 'success', data: res };
        }
        if (action === 'getVistaCertificados') {
          return { status: 'success', data: this.buildVistaCertificados(this._globalCache) };
        }
        if (action === 'getDisenoActivo') {
          const disenos = this._globalCache.disenos || [];
          const activo = disenos.find(d => String(d.activo).toLowerCase() === 'true' || d.activo === true);
          return { status: 'success', data: activo || disenos[0] || null };
        }
        if (action === 'getDashboardStats') {
          const vista = this.buildVistaCertificados(this._globalCache);
          return {
            status: 'success',
            data: {
              totalCertificados: (this._globalCache.certificados || []).length,
              totalUsuarios: (this._globalCache.usuarios || []).length,
              totalCursos: (this._globalCache.cursos || []).length,
              totalUnidades: (this._globalCache.unidades || []).length,
              totalDisenos: (this._globalCache.disenos || []).length,
              totalVerificaciones: (this._globalCache.consulta || []).length,
              ultimosCertificados: vista.slice(-5).reverse()
            }
          };
        }
      }

      // Fallback directo a Google Apps Script
      try {
        const json = await this.fetchRemoteDirect(action, params);
        this._isUsingMockData = false;
        return json;
      } catch (err) {
        console.warn('Conexión remota con Google Apps Script no disponible, recurriendo a modo local:', err);
        this._isUsingMockData = true;
        return this.mockGet(action, params);
      }
    },

    applyMutationToCache(action, payload, json) {
      if (!this._globalCache) return;

      const targetTable = payload.tabla || payload.table;

      switch (action) {
        case 'create': {
          if (targetTable) {
            if (!Array.isArray(this._globalCache[targetTable])) {
              this._globalCache[targetTable] = [];
            }
            const newItem = (json && json.data) ? json.data : { ...payload.data };
            if (!newItem.id && payload.data && payload.data.id) newItem.id = payload.data.id;
            const exists = this._globalCache[targetTable].some(r => String(r.id) === String(newItem.id));
            if (!exists) {
              this._globalCache[targetTable].push(newItem);
            }
          }
          break;
        }

        case 'update': {
          if (targetTable && Array.isArray(this._globalCache[targetTable])) {
            const searchId = String(payload.id);
            const idx = this._globalCache[targetTable].findIndex(r => String(r.id) === searchId);
            if (idx !== -1) {
              this._globalCache[targetTable][idx] = {
                ...this._globalCache[targetTable][idx],
                ...(payload.data || {}),
                id: payload.id
              };
            } else if (payload.data) {
              this._globalCache[targetTable].push({ ...payload.data, id: payload.id });
            }
          }
          break;
        }

        case 'delete': {
          if (targetTable && Array.isArray(this._globalCache[targetTable])) {
            const deleteId = String(payload.id);
            this._globalCache[targetTable] = this._globalCache[targetTable].filter(r => String(r.id) !== deleteId);
          }
          break;
        }

        case 'bulkCreateUsuarios': {
          if (!Array.isArray(this._globalCache.usuarios)) this._globalCache.usuarios = [];
          const newUsers = (json && Array.isArray(json.created)) ? json.created : (payload.usuarios || []);
          newUsers.forEach(u => {
            const exists = this._globalCache.usuarios.some(existing => String(existing.cedula).toUpperCase() === String(u.cedula).toUpperCase());
            if (!exists) {
              this._globalCache.usuarios.push(u);
            }
          });
          break;
        }

        case 'bulkCertificar': {
          if (!Array.isArray(this._globalCache.certificados)) this._globalCache.certificados = [];
          const newCerts = (json && Array.isArray(json.data)) ? json.data : [];
          newCerts.forEach(c => {
            const exists = this._globalCache.certificados.some(existing => String(existing.id) === String(c.id));
            if (!exists) {
              this._globalCache.certificados.push(c);
            }
          });
          break;
        }

        case 'saveDiseno': {
          if (!Array.isArray(this._globalCache.disenos)) this._globalCache.disenos = [];
          const disenoData = (json && json.data) ? json.data : payload.diseno_data;
          if (disenoData) {
            const isActivo = String(disenoData.activo).toLowerCase() === 'true' || disenoData.activo === true;
            if (isActivo) {
              this._globalCache.disenos.forEach(d => d.activo = 'FALSE');
            }
            const idx = this._globalCache.disenos.findIndex(d => String(d.id) === String(disenoData.id));
            if (idx !== -1) {
              this._globalCache.disenos[idx] = { ...this._globalCache.disenos[idx], ...disenoData };
            } else {
              this._globalCache.disenos.push(disenoData);
            }
          }
          break;
        }

        case 'setDisenoActivo': {
          if (Array.isArray(this._globalCache.disenos)) {
            const activeId = String(payload.id);
            this._globalCache.disenos.forEach(d => {
              d.activo = (String(d.id) === activeId) ? 'TRUE' : 'FALSE';
            });
          }
          break;
        }
      }

      try {
        sessionStorage.setItem('uptpc_real_drive_cache_v2', JSON.stringify(this._globalCache));
      } catch (e) {}

      try {
        sessionStorage.setItem('uptpc_real_drive_cache_v2', JSON.stringify(this._globalCache));
      } catch (e) {}
    },

    async post(action, payload = {}) {
      const apiUrl = window.config.getApiUrl();
      const adminKey = window.config.getAdminKey();
      const targetTable = payload.tabla || payload.table;
      if (targetTable) {
        payload.tabla = targetTable;
        payload.table = targetTable;
      }

      if (apiUrl && !this._forceMockMode) {
        try {
          const response = await fetch(apiUrl, {
            method: 'POST',
            mode: 'cors',
            headers: {
              'Content-Type': 'text/plain;charset=utf-8'
            },
            body: JSON.stringify({ action, admin_key: adminKey, ...payload })
          });
          if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
          const json = await response.json();

          if (json && json.status === 'error' && json.code === 403) {
            window.utils.showToast('Acceso denegado (403): Clave de Administración incorrecta. Operación de modificación bloqueada por seguridad.', 'danger');
            this._isUsingMockData = false;
            return json;
          }

          if (json && json.status === 'success') {
            // 1. Aplicar inmediatamente el cambio a la caché local en memoria
            this.applyMutationToCache(action, payload, json);

            // 2. Re-sincronizar en segundo plano con Google Drive
            this.preloadAllData(true).catch(e => console.warn('Refresco de cache post-edicion background:', e));
          }

          this._isUsingMockData = false;
          return json;
        } catch (err) {
          console.error('Error al enviar solicitud a Google Apps Script:', err);
          window.utils.showToast(`Advertencia: No se pudo conectar con Google Sheets (${err.message}). Se guardó localmente.`, 'warning');
          this._isUsingMockData = true;
          return this.mockPost(action, payload);
        }
      }

      this._isUsingMockData = true;
      const localRes = this.mockPost(action, payload);
      this.applyMutationToCache(action, payload, localRes);
      return localRes;
    },

    setForceMockMode(force) {
      this._forceMockMode = Boolean(force);
      this.clearCache();
    },

    async ping() { return this.get('ping'); },
    async verifyAdmin() { return this.get('verifyAdmin'); },
    async getAll(table) { return this.get('getAll', { tabla: table, table }); },
    async getById(table, id) { return this.get('getById', { tabla: table, table, id }); },
    async create(table, data) { return this.post('create', { tabla: table, table, data }); },
    async update(table, id, data) { return this.post('update', { tabla: table, table, id, data }); },
    async delete(table, id) { return this.post('delete', { tabla: table, table, id }); },
    async searchCertificados(termino) { return this.get('searchCertificado', { termino }); },
    async getVistaCertificados() { return this.get('getVistaCertificados'); },
    async bulkCreateUsuarios(usuarios) { return this.post('bulkCreateUsuarios', { usuarios }); },
    async bulkCertificar(curso_id, usuarios, datos_generales) { return this.post('bulkCertificar', { curso_id, usuarios, datos_generales }); },
    async getDisenoActivo() { return this.get('getDisenoActivo'); },
    async saveDiseno(diseno_data) { return this.post('saveDiseno', { diseno_data }); },
    async setDisenoActivo(id) { return this.post('setDisenoActivo', { id }); },
    async getDashboardStats() { return this.get('getDashboardStats'); },
    async logConsulta(certificado_id, direccion_ip = '') { return this.post('logConsulta', { certificado_id, direccion_ip }); },
    
    async uploadImage(base64Data, filename = 'imagen.png') {
      return this.post('uploadImage', { base64Data, filename });
    },

    mockGet(action, params) {
      const db = getLocalDb();

      switch (action) {
        case 'ping':
          return { status: 'success', message: 'Sistema UPTPC en modo Local (Almacenamiento Local del Navegador)' };

        case 'getAll': {
          const table = params.tabla || params.table;
          return { status: 'success', data: db[table] || [] };
        }

        case 'getById': {
          const table = params.tabla || params.table;
          const record = (db[table] || []).find(r => String(r.id) === String(params.id));
          return { status: 'success', data: record || null };
        }

        case 'searchCertificado': {
          const termino = String(params.termino || '').trim().toUpperCase();
          const vista = this.buildVistaCertificados(db);
          const esCodigo = /^[A-Z]{3}[0-9]{3,4}[A-Z]{3}$/.test(termino);

          const res = vista.filter(c => {
            if (esCodigo) {
              return String(c.codigo).toUpperCase() === termino;
            } else {
              const cedulaLimpia = String(c.cedula || '').replace(/[\s-]/g, '').toUpperCase();
              const termLimpio = termino.replace(/[\s-]/g, '');
              return cedulaLimpia.includes(termLimpio) || String(c.cedula).toUpperCase() === termino;
            }
          });

          return { status: 'success', data: res };
        }

        case 'getVistaCertificados':
          return { status: 'success', data: this.buildVistaCertificados(db) };

        case 'getDisenoActivo': {
          const disenos = db.disenos || [];
          const activo = disenos.find(d => String(d.activo).toLowerCase() === 'true' || d.activo === true);
          return { status: 'success', data: activo || disenos[0] || null };
        }

        case 'getDashboardStats': {
          const vista = this.buildVistaCertificados(db);
          return {
            status: 'success',
            data: {
              totalCertificados: (db.certificados || []).length,
              totalUsuarios: (db.usuarios || []).length,
              totalCursos: (db.cursos || []).length,
              totalUnidades: (db.unidades || []).length,
              totalDisenos: (db.disenos || []).length,
              totalVerificaciones: (db.consulta || []).length,
              ultimosCertificados: vista.slice(-5).reverse()
            }
          };
        }

        default:
          return { status: 'error', message: `Acción local ${action} no soportada` };
      }
    },

    mockPost(action, payload) {
      const db = getLocalDb();

      switch (action) {
        case 'uploadImage': {
          return {
            status: 'success',
            message: 'Imagen cargada localmente',
            url: payload.base64Data
          };
        }

        case 'create': {
          const table = payload.table || payload.tabla;
          if (table) {
            if (!db[table]) db[table] = [];
            const item = { ...payload.data, id: payload.data.id || window.utils.generateUUID(), created_at: new Date().toISOString() };
            db[table].push(item);
            saveLocalDb(db);
            return { status: 'success', message: 'Creado correctamente', data: item };
          }
          return { status: 'error', message: 'Tabla no especificada' };
        }

        case 'update': {
          const table = payload.table || payload.tabla;
          if (table) {
            if (!db[table]) db[table] = [];
            const idx = db[table].findIndex(r => String(r.id) === String(payload.id));
            if (idx !== -1) {
              db[table][idx] = { ...db[table][idx], ...payload.data, updated_at: new Date().toISOString() };
              saveLocalDb(db);
              return { status: 'success', message: 'Actualizado correctamente' };
            }
            const newItem = { ...payload.data, id: payload.id, created_at: new Date().toISOString() };
            db[table].push(newItem);
            saveLocalDb(db);
            return { status: 'success', message: 'Creado correctamente', data: newItem };
          }
          return { status: 'error', message: 'Tabla no especificada' };
        }

        case 'delete': {
          const table = payload.table || payload.tabla;
          if (!table || !db[table]) return { status: 'error', message: 'Tabla no existe' };
          db[table] = db[table].filter(r => String(r.id) !== String(payload.id));
          saveLocalDb(db);
          return { status: 'success', message: 'Eliminado correctamente' };
        }

        case 'bulkCreateUsuarios': {
          const list = payload.usuarios || [];
          if (!db.usuarios) db.usuarios = [];

          const existingCedulas = new Set(db.usuarios.map(u => String(u.cedula).toUpperCase()));
          const created = [];
          const skipped = [];

          list.forEach(u => {
            const cedula = String(u.cedula || '').trim().toUpperCase();
            const nombre = String(u.nombre_completo || '').trim();

            if (existingCedulas.has(cedula)) {
              skipped.push({ cedula, nombre, reason: 'Ya existe' });
            } else {
              const newItem = { id: window.utils.generateUUID(), cedula, nombre_completo: nombre, created_at: new Date().toISOString() };
              db.usuarios.push(newItem);
              existingCedulas.add(cedula);
              created.push(newItem);
            }
          });

          saveLocalDb(db);
          return { status: 'success', message: `Registrados ${created.length}, Omitidos ${skipped.length}`, created, skipped };
        }

        case 'bulkCertificar': {
          const cursoId = payload.curso_id;
          const usuarios = payload.usuarios || [];
          const datos = payload.datos_generales || {};

          if (!db.certificados) db.certificados = [];
          const existingCodes = new Set(db.certificados.map(c => String(c.codigo).toUpperCase()));

          // Función para generar timestamp en formato PostgreSQL compatible
          const pgTimestamp = () => {
            const now = new Date();
            const pad = (n, len = 2) => String(n).padStart(len, '0');
            const ms = pad(now.getUTCMilliseconds(), 3);
            const micros = ms + pad(Math.floor(Math.random() * 1000), 3);
            return `${now.getUTCFullYear()}-${pad(now.getUTCMonth()+1)}-${pad(now.getUTCDate())} ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}.${micros}+00`;
          };

          // Función para generar lugar en formato correcto
          const generarLugar = (fechaStr) => {
            const meses = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
            let d;
            if (fechaStr) {
              const partes = fechaStr.split('-');
              if (partes.length === 3) {
                d = new Date(parseInt(partes[0]), parseInt(partes[1])-1, parseInt(partes[2]));
              } else {
                d = new Date(fechaStr);
              }
            } else {
              d = new Date();
            }
            if (isNaN(d.getTime())) d = new Date();
            return `PUERTO CABELLO ${String(d.getDate()).padStart(2,'0')} DE ${meses[d.getMonth()]} DE ${d.getFullYear()}`;
          };

          const created = [];
          usuarios.forEach((u, i) => {
            const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            const digits = '0123456789';
            let code = '';
            do {
              code = Array.from({length:3}, ()=>letters[Math.floor(Math.random()*26)]).join('') +
                     Array.from({length:4}, ()=>digits[Math.floor(Math.random()*10)]).join('') +
                     Array.from({length:3}, ()=>letters[Math.floor(Math.random()*26)]).join('');
            } while(existingCodes.has(code));

            existingCodes.add(code);

            const limiteFolio = parseInt(datos.limite_por_folio) || 15;
            const folioCalculado = datos.folio ? String(parseInt(datos.folio) + Math.floor(i / limiteFolio)) : '';

            const item = {
              id: window.utils.generateUUID(),
              usuario_id: u.id,
              curso_id: cursoId,
              codigo: code,
              fecha_curso: datos.fecha_curso || new Date().toISOString().split('T')[0],
              lugar: datos.lugar || generarLugar(datos.fecha_curso),
              tomo: datos.tomo || '',
              folio: folioCalculado,
              created_at: pgTimestamp(),
              matricula: datos.matricula || ''
            };
            db.certificados.push(item);
            created.push(item);
          });

          saveLocalDb(db);
          return { status: 'success', message: `Emitidos ${created.length} certificados`, data: created };
        }

        case 'saveDiseno': {
          const data = payload.diseno_data || {};
          if (!db.disenos) db.disenos = [];
          const isActivo = String(data.activo) === 'true' || data.activo === true;

          if (isActivo) {
            db.disenos.forEach(d => d.activo = 'FALSE');
          }

          let item;
          if (data.id) {
            const idx = db.disenos.findIndex(d => String(d.id) === String(data.id));
            if (idx !== -1) {
              db.disenos[idx] = { ...db.disenos[idx], ...data, activo: isActivo ? 'TRUE' : 'FALSE', updated_at: new Date().toISOString() };
              item = db.disenos[idx];
            }
          }

          if (!item) {
            item = {
              id: window.utils.generateUUID(),
              nombre: data.nombre || 'Diseño Certificado',
              descripcion: data.descripcion || '',
              diseno: typeof data.diseno === 'object' ? JSON.stringify(data.diseno) : data.diseno,
              activo: isActivo ? 'TRUE' : 'FALSE',
              ancho: data.ancho || 1123,
              alto: data.alto || 794,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            };
            db.disenos.push(item);
          }

          saveLocalDb(db);
          return { status: 'success', message: 'Diseño guardado exitosamente', data: item };
        }

        case 'setDisenoActivo': {
          if (!db.disenos) db.disenos = [];
          db.disenos.forEach(d => {
            d.activo = (String(d.id) === String(payload.id)) ? 'TRUE' : 'FALSE';
          });
          saveLocalDb(db);
          return { status: 'success', message: 'Diseño activado' };
        }

        case 'logConsulta': {
          if (!db.consulta) db.consulta = [];
          const item = {
            id: window.utils.generateUUID(),
            certificado_id: payload.certificado_id,
            direccion_ip: payload.direccion_ip || '127.0.0.1',
            fecha: new Date().toISOString()
          };
          db.consulta.push(item);
          saveLocalDb(db);
          return { status: 'success' };
        }

        default:
          return { status: 'error', message: `Acción local POST ${action} no soportada` };
      }
    },

    buildVistaCertificados(db) {
      const certs = db.certificados || [];
      const usersMap = Object.fromEntries((db.usuarios || []).map(u => [String(u.id).trim(), u]));
      const cursosMap = Object.fromEntries((db.cursos || []).map(c => [String(c.id).trim(), c]));
      const unidadesMap = Object.fromEntries((db.unidades || []).map(u => [String(u.id).trim(), u]));
      const tiposMap = Object.fromEntries((db.tipo || []).map(t => [String(t.id).trim(), t]));
      const firmasMap = Object.fromEntries((db.firmas || []).map(f => [String(f.id).trim(), f]));

      return certs.map(cert => {
        const user = usersMap[String(cert.usuario_id).trim()] || {};
        const curso = cursosMap[String(cert.curso_id).trim()] || {};
        const unidad = unidadesMap[String(curso.unidad_id).trim()] || {};
        const tipo = tiposMap[String(curso.idtipo_curso).trim()] || {};

        const f1 = firmasMap[String(curso.idfirma1).trim()] || {};
        const f2 = firmasMap[String(curso.idfirma2).trim()] || {};
        const f3 = firmasMap[String(curso.idfirma3).trim()] || {};

        return {
          id: cert.id,
          usuario_id: cert.usuario_id || '',
          curso_id: cert.curso_id || '',
          codigo: cert.codigo,
          cedula: user.cedula || '',
          nombre_completo: user.nombre_completo || '',
          nombre_curso: curso.nombre || '',
          contenido: curso.contenido || '',
          horas: curso.horas || 0,
          tipo_curso: tipo.tipo || 'Taller',
          unidad_nombre: unidad.nombre || 'Unidad de Ciencia y Tecnología',
          unidad_codigo: unidad.codigo || 'CYT',
          logo_url: unidad.logo_url || '',
          fecha_curso: cert.fecha_curso || '2026-05-20',
          lugar: cert.lugar || 'Puerto Cabello, Venezuela',
          tomo: cert.tomo || '',
          folio: cert.folio || '',
          motivo: curso.motivo || '',
          ponencias: curso.ponencias || '',
          matricula: cert.matricula || '',

          // Firmante 1
          firma1_nombre: f1.nombre || '',
          firma1_cargo: f1.cargo || '',
          firma1_url: f1.firma || '',
          sello1_url: f1.sello || '',

          // Firmante 2
          firma2_nombre: f2.nombre || '',
          firma2_cargo: f2.cargo || '',
          firma2_url: f2.firma || '',
          sello2_url: f2.sello || '',

          // Firmante 3
          firma3_nombre: f3.nombre || '',
          firma3_cargo: f3.cargo || '',
          firma3_url: f3.firma || '',
          sello3_url: f3.sello || ''
        };
      });
    }
  };
})();
