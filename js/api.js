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
        { id: 'usr-1', cedula: 'V-12345678', nombre_completo: 'JUAN ALBERTO PÉREZ', correo: 'juan.perez@uptpc.edu.ve', telefono: '04121234567', created_at: new Date().toISOString() },
        { id: 'usr-2', cedula: 'V-87654321', nombre_completo: 'MARÍA FERNANDA GÓMEZ', correo: 'maria.gomez@gmail.com', telefono: '04147654321', created_at: new Date().toISOString() }
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
      certificados_eliminados: [],
      curso_ofertado: [
        {
          id: 'co-1',
          taller: 'DESARROLLO WEB FULL STACK CON JAVASCRIPT Y FRAMEWORKS',
          descripcion: 'Aprende a construir aplicaciones web completas, modernas y dinámicas desde cero.',
          valor_estudiante: 10,
          valor_foraneo: 25,
          flayer: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=600&auto=format&fit=crop&q=80',
          created_at: new Date().toISOString()
        },
        {
          id: 'co-2',
          taller: 'FUNDAMENTOS DE INTELIGENCIA ARTIFICIAL Y PROMPT ENGINEERING',
          descripcion: 'Domina los conceptos de IA generativa, optimización de prompts y automatización.',
          valor_estudiante: 15,
          valor_foraneo: 30,
          flayer: 'https://images.unsplash.com/photo-1677442136019-21780efad99a?w=600&auto=format&fit=crop&q=80',
          created_at: new Date().toISOString()
        }
      ],
      banco: [
        { id: 'b-1', banco: 'Banco de Venezuela (0102)', created_at: new Date().toISOString() },
        { id: 'b-2', banco: 'Banesco (0134)', created_at: new Date().toISOString() },
        { id: 'b-3', banco: 'Banco Mercantil (0105)', created_at: new Date().toISOString() },
        { id: 'b-4', banco: 'BBVA Provincial (0108)', created_at: new Date().toISOString() },
        { id: 'b-5', banco: 'Banco Nacional de Crédito BNC (0191)', created_at: new Date().toISOString() },
        { id: 'b-6', banco: 'Bancamiga (0172)', created_at: new Date().toISOString() },
        { id: 'b-7', banco: 'Pago Móvil / Otras Entidades', created_at: new Date().toISOString() }
      ],
      pagos: [],
      presets_imagenes: []
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
      if (!apiUrl) throw new Error('No API URL configured');
      const queryParams = new URLSearchParams({ action, ...params, _t: String(Date.now()) });
      const response = await fetch(`${apiUrl}?${queryParams.toString()}`, {
        method: 'GET',
        cache: 'no-store'
      });
      if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
      return await response.json();
    },

    ensureAllTables(cacheObj) {
      if (!cacheObj || typeof cacheObj !== 'object') return cacheObj;
      const tables = ['unidades', 'firmas', 'tipo', 'usuarios', 'cursos', 'certificados', 'disenos', 'admin', 'consulta', 'certificados_eliminados', 'curso_ofertado', 'banco', 'pagos', 'configuracion'];
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
          const tables = ['unidades', 'firmas', 'tipo', 'usuarios', 'cursos', 'certificados', 'disenos', 'admin', 'consulta', 'certificados_eliminados', 'curso_ofertado', 'banco', 'pagos'];
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
          const rawId = String(params.id || '').trim();
          let found = this._globalCache[targetTable].find(r => String(r.id).trim() === rawId);
          if (!found && /^\d+(\.0+)?$/.test(rawId)) {
            const intId = parseInt(rawId, 10);
            found = this._globalCache[targetTable].find(r => {
              const rid = String(r.id || '').trim();
              return /^\d+(\.0+)?$/.test(rid) && parseInt(rid, 10) === intId;
            });
          }
          if (found) {
            return { status: 'success', data: found };
          }
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

      // Fallback directo al backend remoto
      try {
        const json = await this.fetchRemoteDirect(action, params);
        if (json && json.status === 'success' && json.data && action === 'getById' && targetTable && this._globalCache) {
          if (!Array.isArray(this._globalCache[targetTable])) this._globalCache[targetTable] = [];
          const exists = this._globalCache[targetTable].some(r => String(r.id) === String(json.data.id));
          if (!exists) this._globalCache[targetTable].push(json.data);
        }
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
            const naturalKey = { admin: 'usuario', unidades: 'codigo' }[targetTable];
            const exists = this._globalCache[targetTable].some(r =>
              String(r.id) === String(newItem.id) ||
              (naturalKey && newItem[naturalKey] && String(r[naturalKey]).trim().toUpperCase() === String(newItem[naturalKey]).trim().toUpperCase())
            );
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
            const cleanU = window.utils ? window.utils.normalizeCedula(u.cedula).replace(/[\s-]/g, '').toUpperCase() : String(u.cedula).toUpperCase();
            const exists = this._globalCache.usuarios.some(existing => {
              const cleanEx = window.utils ? window.utils.normalizeCedula(existing.cedula).replace(/[\s-]/g, '').toUpperCase() : String(existing.cedula).toUpperCase();
              return cleanEx === cleanU;
            });
            if (!exists) {
              const itemToAdd = {
                id: u.id || (window.utils ? window.utils.generateUUID() : 'usr_' + Date.now()),
                cedula: u.cedula,
                nombre_completo: u.nombre_completo,
                created_at: u.created_at || new Date().toISOString()
              };
              this._globalCache.usuarios.push(itemToAdd);
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

        case 'bulkCreatePagos': {
          if (!Array.isArray(this._globalCache.pagos)) this._globalCache.pagos = [];
          if (!Array.isArray(this._globalCache.usuarios)) this._globalCache.usuarios = [];

          const nuevosUsuarios = (json && Array.isArray(json.usuariosNuevos)) ? json.usuariosNuevos : [];
          nuevosUsuarios.forEach(u => {
            if (!this._globalCache.usuarios.some(ex => String(ex.id) === String(u.id))) {
              this._globalCache.usuarios.push(u);
            }
          });

          const reparados = (json && Array.isArray(json.usuariosReparados)) ? json.usuariosReparados : [];
          reparados.forEach(u => {
            const idxU = this._globalCache.usuarios.findIndex(ex => String(ex.id) === String(u.id));
            if (idxU !== -1) {
              this._globalCache.usuarios[idxU] = { ...this._globalCache.usuarios[idxU], nombre_completo: u.nombre_completo };
            }
          });

          const actualizadosPagos = (json && Array.isArray(json.pagosActualizadosList)) ? json.pagosActualizadosList : [];
          actualizadosPagos.forEach(pa => {
            const idxP = this._globalCache.pagos.findIndex(ex => String(ex.id) === String(pa.id));
            if (idxP !== -1) {
              this._globalCache.pagos[idxP] = { ...this._globalCache.pagos[idxP], fecha_curso: pa.fecha_curso };
            }
          });

          const nuevosPagos = (json && Array.isArray(json.data)) ? json.data : [];
          nuevosPagos.forEach(p => {
            if (!this._globalCache.pagos.some(ex => String(ex.id) === String(p.id))) {
              this._globalCache.pagos.push(p);
            }
          });
          break;
        }

        case 'aprobarPago': {
          if (!Array.isArray(this._globalCache.pagos)) this._globalCache.pagos = [];
          const pagoIdx = this._globalCache.pagos.findIndex(p => String(p.id) === String(payload.id));
          if (pagoIdx !== -1) {
            this._globalCache.pagos[pagoIdx] = {
              ...this._globalCache.pagos[pagoIdx],
              status: 'APROBADO',
              fecha_curso: (json && json.fecha_curso) || (payload.opciones && payload.opciones.fecha_curso) || this._globalCache.pagos[pagoIdx].fecha_curso || ''
            };
          }
          if (json && json.usuarioNombreActualizado && json.usuarioId && Array.isArray(this._globalCache.usuarios)) {
            const uIdx = this._globalCache.usuarios.findIndex(u => String(u.id) === String(json.usuarioId));
            if (uIdx !== -1) {
              this._globalCache.usuarios[uIdx] = { ...this._globalCache.usuarios[uIdx], nombre_completo: json.usuarioNombre };
            }
          }
          if (json && json.certificadoEmitido && json.certificado) {
            if (!Array.isArray(this._globalCache.certificados)) this._globalCache.certificados = [];
            const existsCert = this._globalCache.certificados.some(c => String(c.id) === String(json.certificado.id));
            if (!existsCert) {
              this._globalCache.certificados.push(json.certificado);
            }
          }
          break;
        }

        case 'revertirPago': {
          if (Array.isArray(this._globalCache.pagos)) {
            if (json && json.pagoEliminado) {
              this._globalCache.pagos = this._globalCache.pagos.filter(p => String(p.id) !== String(payload.id));
            } else {
              const pIdx = this._globalCache.pagos.findIndex(p => String(p.id) === String(payload.id));
              if (pIdx !== -1) {
                this._globalCache.pagos[pIdx] = { ...this._globalCache.pagos[pIdx], status: 'PENDIENTE' };
              }
            }
          }
          if (json && json.certificadoAnulado) {
            if (Array.isArray(this._globalCache.certificados)) {
              this._globalCache.certificados = this._globalCache.certificados.filter(c =>
                String(c.id) !== String(json.certificadoAnuladoId) &&
                (!json.codigoAnulado || String(c.codigo).toUpperCase() !== String(json.codigoAnulado).toUpperCase())
              );
            }
            if (json.auditRecord) {
              if (!Array.isArray(this._globalCache.certificados_eliminados)) this._globalCache.certificados_eliminados = [];
              const existsAud = this._globalCache.certificados_eliminados.some(a => String(a.id) === String(json.auditRecord.id));
              if (!existsAud) {
                this._globalCache.certificados_eliminados.push(json.auditRecord);
              }
            }
          }
          break;
        }

        case 'configurarFechaEmisionPagos': {
          const targetIds = new Set(
            ((json && Array.isArray(json.pagoIds)) ? json.pagoIds : (Array.isArray(payload.pagoIds) ? payload.pagoIds : []))
              .map(id => String(id).trim())
          );
          const nuevaFecha = (json && json.fecha_curso) ? json.fecha_curso : (payload.fecha_curso || '');
          if (Array.isArray(this._globalCache.pagos) && nuevaFecha && targetIds.size > 0) {
            this._globalCache.pagos = this._globalCache.pagos.map(p =>
              targetIds.has(String(p.id).trim()) ? { ...p, fecha_curso: nuevaFecha } : p
            );
          }
          if (json && Array.isArray(json.certificadosActualizados) && Array.isArray(this._globalCache.certificados)) {
            const certUpdatesMap = new Map(json.certificadosActualizados.map(cu => [String(cu.id), cu]));
            this._globalCache.certificados = this._globalCache.certificados.map(c => {
              const upd = certUpdatesMap.get(String(c.id));
              return upd ? { ...c, fecha_curso: upd.fecha_curso, lugar: upd.lugar, matricula: upd.matricula } : c;
            });
          }
          break;
        }

        case 'bulkAprobarPagos': {
          if (!Array.isArray(this._globalCache.pagos)) this._globalCache.pagos = [];
          if (!Array.isArray(this._globalCache.usuarios)) this._globalCache.usuarios = [];
          if (!Array.isArray(this._globalCache.certificados)) this._globalCache.certificados = [];

          const aprobadosMap = new Map(
            ((json && Array.isArray(json.pagosAprobados)) ? json.pagosAprobados : [])
              .map(pa => [String(pa.id).trim(), pa])
          );
          if (aprobadosMap.size > 0) {
            this._globalCache.pagos = this._globalCache.pagos.map(p => {
              const upd = aprobadosMap.get(String(p.id).trim());
              return upd ? { ...p, status: 'APROBADO', fecha_curso: upd.fecha_curso || p.fecha_curso || '' } : p;
            });
          }

          const reparados = (json && Array.isArray(json.usuariosReparados)) ? json.usuariosReparados : [];
          reparados.forEach(ur => {
            const idxU = this._globalCache.usuarios.findIndex(u => String(u.id) === String(ur.id));
            if (idxU !== -1) {
              this._globalCache.usuarios[idxU] = { ...this._globalCache.usuarios[idxU], nombre_completo: ur.nombre_completo };
            }
          });

          const emitidos = (json && Array.isArray(json.certificadosEmitidos)) ? json.certificadosEmitidos : [];
          emitidos.forEach(nc => {
            const exists = this._globalCache.certificados.some(c => String(c.id) === String(nc.id));
            if (!exists) {
              this._globalCache.certificados.push(nc);
            }
          });
          break;
        }

        case 'bulkRevertirPagos': {
          const eliminarPago = Boolean(json && json.eliminarPago !== undefined ? json.eliminarPago : (payload.opciones && payload.opciones.eliminarPago));
          const idsProc = new Set(
            ((json && Array.isArray(json.pagoIdsProcesados)) ? json.pagoIdsProcesados : (Array.isArray(payload.pagoIds) ? payload.pagoIds : []))
              .map(id => String(id).trim())
          );
          if (Array.isArray(this._globalCache.pagos) && idsProc.size > 0) {
            if (eliminarPago) {
              this._globalCache.pagos = this._globalCache.pagos.filter(p => !idsProc.has(String(p.id).trim()));
            } else {
              this._globalCache.pagos = this._globalCache.pagos.map(p =>
                idsProc.has(String(p.id).trim()) ? { ...p, status: 'PENDIENTE' } : p
              );
            }
          }
          if (json && Array.isArray(json.certificadosAnuladosIds) && json.certificadosAnuladosIds.length > 0) {
            const anuladosSet = new Set(json.certificadosAnuladosIds.map(id => String(id)));
            if (Array.isArray(this._globalCache.certificados)) {
              this._globalCache.certificados = this._globalCache.certificados.filter(c => !anuladosSet.has(String(c.id)));
            }
          }
          if (json && Array.isArray(json.auditRecords) && json.auditRecords.length > 0) {
            if (!Array.isArray(this._globalCache.certificados_eliminados)) this._globalCache.certificados_eliminados = [];
            json.auditRecords.forEach(ar => {
              const ex = this._globalCache.certificados_eliminados.some(a => String(a.id) === String(ar.id));
              if (!ex) this._globalCache.certificados_eliminados.push(ar);
            });
          }
          break;
        }

        case 'saveDiseno': {
          if (!Array.isArray(this._globalCache.disenos)) this._globalCache.disenos = [];
          const disenoData = (json && json.data) ? json.data : payload.diseno_data;
          if (disenoData) {
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
            const valState = (payload.estado === false || String(payload.estado).toLowerCase() === 'false') ? 'FALSE' : 'TRUE';
            const target = this._globalCache.disenos.find(d => String(d.id) === activeId);
            if (target) target.activo = valState;
          }
          break;
        }
      }

      try {
        sessionStorage.setItem('uptpc_real_drive_cache_v2', JSON.stringify(this._globalCache));
      } catch (e) {}
    },

    _inflightPosts: {},

    // Evita que la misma mutación (doble clic, listeners repetidos, tareas en paralelo) se envíe dos veces
    post(action, payload = {}) {
      let key = null;
      if (['create', 'update', 'bulkCertificar', 'bulkCreateUsuarios', 'bulkCreatePagos', 'aprobarPago', 'revertirPago', 'bulkAprobarPagos', 'bulkRevertirPagos', 'configurarFechaEmisionPagos'].includes(action)) {
        try { key = action + '|' + JSON.stringify(payload); } catch (e) { key = null; }
      }
      if (key && this._inflightPosts[key]) return this._inflightPosts[key];

      const p = this._postInternal(action, payload);
      if (key) {
        this._inflightPosts[key] = p;
        const clear = () => { delete this._inflightPosts[key]; };
        p.then(clear, clear);
      }
      return p;
    },

    async _postInternal(action, payload = {}) {
      const apiUrl = window.config.getApiUrl();
      const targetTable = payload.tabla || payload.table;
      if (targetTable) {
        payload.tabla = targetTable;
        payload.table = targetTable;
      }

      if (apiUrl && !this._forceMockMode) {
        try {
          const session = (window.authAdmin && window.authAdmin.getSession) ? window.authAdmin.getSession() : null;
          const userRole = session ? (session.tipo || '') : '';

          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json;charset=utf-8',
              'X-User-Role': userRole
            },
            body: JSON.stringify({ action, userRole, ...payload })
          });
          if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
          const json = await response.json();

          if (json && json.status === 'error') {
            window.utils.showToast(json.message || 'Error en la operación del servidor', 'danger');
            this._isUsingMockData = false;
            return json;
          }

          if (json && json.status === 'success') {
            this.applyMutationToCache(action, payload, json);
            this.preloadAllData(true).catch(e => console.warn('Refresco de cache:', e));
          }

          this._isUsingMockData = false;
          return json;
        } catch (err) {
          console.error('Error al enviar solicitud al backend:', err);
          window.utils.showToast(`Error de conexión (${err.message}). Guardando en caché local temporal.`, 'warning');
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
    async verifyAdmin(usuario, clave) { return this.post('verifyAdmin', { usuario, clave }); },
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
    async setDisenoActivo(id, estado = true) { return this.post('setDisenoActivo', { id, estado }); },
    async getDashboardStats() { return this.get('getDashboardStats'); },
    async logConsulta(certificado_id, direccion_ip = '') { return this.post('logConsulta', { certificado_id, direccion_ip }); },
    async backupDatabase() { return this.get('backup'); },
    async getConfiguraciones() { return this.get('getConfiguraciones'); },
    async updateConfiguracion(clave, valor) { return this.post('updateConfiguracion', { clave, valor }); },
    async getApiKeyInfo() { return this.get('getApiKeyInfo'); },
    async regenerateApiKey() { return this.post('regenerateApiKey'); },
    async toggleApiKey(habilitada) { return this.post('toggleApiKey', { habilitada }); },
    async inyectarPago(pagoData) { return this.post('inyectarPago', pagoData); },
    async bulkCreatePagos(pagos, opciones = {}) { return this.post('bulkCreatePagos', { pagos, opciones }); },
    async aprobarPago(id, opciones = {}) {
      const ejecutadoPor = (window.authAdmin && window.authAdmin.getSession && window.authAdmin.getSession())
        ? (window.authAdmin.getSession().usuario || 'ADMIN')
        : 'ADMIN';
      return this.post('aprobarPago', { id, opciones, ejecutadoPor });
    },
    async revertirPago(id, opciones = {}) {
      const ejecutadoPor = (window.authAdmin && window.authAdmin.getSession && window.authAdmin.getSession())
        ? (window.authAdmin.getSession().usuario || 'ADMIN')
        : 'ADMIN';
      return this.post('revertirPago', { id, opciones, ejecutadoPor });
    },
    async bulkAprobarPagos(pagoIds, opciones = {}) {
      const ejecutadoPor = (window.authAdmin && window.authAdmin.getSession && window.authAdmin.getSession())
        ? (window.authAdmin.getSession().usuario || 'ADMIN')
        : 'ADMIN';
      return this.post('bulkAprobarPagos', { pagoIds, opciones, ejecutadoPor });
    },
    async bulkRevertirPagos(pagoIds, opciones = {}) {
      const ejecutadoPor = (window.authAdmin && window.authAdmin.getSession && window.authAdmin.getSession())
        ? (window.authAdmin.getSession().usuario || 'ADMIN')
        : 'ADMIN';
      return this.post('bulkRevertirPagos', { pagoIds, opciones, ejecutadoPor });
    },
    async configurarFechaEmisionPagos(pagoIds, fecha_curso, opciones = {}) {
      const ejecutadoPor = (window.authAdmin && window.authAdmin.getSession && window.authAdmin.getSession())
        ? (window.authAdmin.getSession().usuario || 'ADMIN')
        : 'ADMIN';
      return this.post('configurarFechaEmisionPagos', { pagoIds, fecha_curso, opciones, ejecutadoPor });
    },
    async listFuentesExternas() { return this.get('listFuentesExternas'); },
    async saveFuenteExterna(fuente) { return this.post('saveFuenteExterna', { fuente }); },
    async deleteFuenteExterna(id) { return this.post('deleteFuenteExterna', { id }); },
    async importarFuenteExterna(id, soloPrevisualizar = false) {
      return this.post('importarFuenteExterna', { id, soloPrevisualizar });
    },
    async testFuenteExterna(params = {}) {
      return this.post('testFuenteExterna', params);
    },
    async getCursosOfertadosApi(apiKey = null) {
      const params = apiKey ? { api_key: apiKey } : {};
      return this.get('getCursosOfertadosApi', params);
    },
    async getPresetsLogos() { return this.getAll('presets_imagenes'); },
    async createPresetLogo(data) { return this.create('presets_imagenes', data); },
    async deletePresetLogo(id) { return this.delete('presets_imagenes', id); },
    
    async uploadImage(base64Data, filename = 'imagen.png', folder = 'general') {
      return this.post('uploadImage', { base64Data, filename, folder });
    },

    async getBrochureInfo() {
      return this.get('getBrochureInfo');
    },

    async getBrochureUploadUrl() {
      return this.get('getBrochureUploadUrl');
    },

    async uploadBrochure(pdfData, filename = 'brochure.pdf') {
      return this.post('uploadBrochure', { pdfData, filename });
    },

    _cachedTasaDolar: null,
    _tasaDolarTime: 0,

    async fetchTasaDolar() {
      // Usar caché de 5 minutos para la tasa
      if (this._cachedTasaDolar && (Date.now() - this._tasaDolarTime < 300000)) {
        return this._cachedTasaDolar;
      }
      try {
        const resp = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
        if (resp.ok) {
          const data = await resp.json();
          const tasa = (data && (data.promedio || data.precio)) ? (data.promedio || data.precio) : null;
          if (tasa && !isNaN(tasa) && tasa > 0) {
            this._cachedTasaDolar = parseFloat(tasa);
            this._tasaDolarTime = Date.now();
            return this._cachedTasaDolar;
          }
        }
      } catch (e) {
        console.warn('Error al obtener tasa oficial de DolarAPI:', e);
      }
      return 36.5; // Tasa por defecto de respaldo
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

        case 'getBrochureInfo': {
          return {
            status: 'success',
            exists: true,
            url: 'brochure/index.html',
            size: 2154300,
            lastModified: new Date().toISOString()
          };
        }

        case 'getBrochureUploadUrl': {
          return {
            status: 'success',
            uploadUrl: null,
            publicUrl: 'brochure/index.html'
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

          const existingCedulas = new Set(db.usuarios.map(u => window.utils ? window.utils.normalizeCedula(u.cedula).replace(/[\s-]/g, '').toUpperCase() : String(u.cedula).toUpperCase()));
          const created = [];
          const skipped = [];

          list.forEach(u => {
            const normCedula = window.utils ? window.utils.normalizeCedula(u.cedula) : String(u.cedula || '').trim().toUpperCase();
            const cleanCedula = normCedula.replace(/[\s-]/g, '').toUpperCase();
            const nombre = String(u.nombre_completo || '').trim();

            if (existingCedulas.has(cleanCedula)) {
              skipped.push({ cedula: normCedula, nombre, reason: 'Ya existe' });
            } else {
              const newItem = { id: window.utils ? window.utils.generateUUID() : 'usr_' + Date.now(), cedula: normCedula, nombre_completo: nombre, created_at: new Date().toISOString() };
              db.usuarios.push(newItem);
              existingCedulas.add(cleanCedula);
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
              matricula: u.matricula || window.utils.generarMatricula(datos.matricula_prefijo, datos.fecha_curso, u.cedula) || datos.matricula || ''
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
          const valState = (payload.estado === false || String(payload.estado).toLowerCase() === 'false') ? 'FALSE' : 'TRUE';
          const item = db.disenos.find(d => String(d.id) === String(payload.id));
          if (item) item.activo = valState;
          saveLocalDb(db);
          return { status: 'success', message: `Diseño ${valState === 'TRUE' ? 'activado' : 'desactivado'}` };
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

        case 'verifyAdmin': {
          const userVal = String(payload.usuario || '').trim().toUpperCase();
          const passVal = String(payload.clave || '').trim();
          let adminUsers = db.admin || [];
          if (adminUsers.length === 0) {
            adminUsers = [
              {
                id: 'super-admin-01',
                usuario: 'CIENCIA_TECNOLOGIA',
                clave: 'CYT_01012023',
                tipo: 'SUPER_ADMIN',
                status: 'ACTIVO',
                permisos: '*'
              }
            ];
          }
          const found = adminUsers.find(u => String(u.usuario || '').trim().toUpperCase() === userVal);
          if (!found) {
            return { status: 'error', message: 'Usuario no registrado' };
          }
          if (String(found.clave || '').trim() !== passVal) {
            return { status: 'error', message: 'Contraseña incorrecta' };
          }
          if (String(found.status || '').toUpperCase() !== 'ACTIVO') {
            return { status: 'error', message: 'Usuario inactivo' };
          }
          return { status: 'success', authenticated: true, user: found };
        }

        case 'updateConfiguracion': {
          if (!db.configuracion) db.configuracion = [];
          const idx = db.configuracion.findIndex(c => c.clave === payload.clave);
          if (idx !== -1) {
            db.configuracion[idx].valor = payload.valor;
          } else {
            db.configuracion.push({ clave: payload.clave, valor: payload.valor });
          }
          saveLocalDb(db);
          return { status: 'success', message: 'Configuración actualizada localmente' };
        }

        case 'bulkCreatePagos': {
          const list = payload.pagos || [];
          const opciones = payload.opciones || {};
          const crearUsuariosNuevos = opciones.crearUsuariosNuevos !== false;
          if (!db.pagos) db.pagos = [];
          if (!db.usuarios) db.usuarios = [];
          const created = [];
          const usuariosNuevos = [];
          const usuariosReparados = [];
          const pagosActualizadosList = [];

          list.forEach(item => {
            const normCed = window.utils ? window.utils.normalizeCedula(item.cedula) : String(item.cedula || '').trim().toUpperCase();
            if (!normCed) return;
            const nombreReal = String(item.nombre_completo || '').trim().toUpperCase();
            const esGen = !nombreReal || /^PARTICIPANTE(\s|$)/i.test(nombreReal);
            let usr = db.usuarios.find(u => (window.utils ? window.utils.normalizeCedula(u.cedula) : String(u.cedula)) === normCed);
            if (usr) {
              if (!esGen && /^PARTICIPANTE(\s|$)/i.test(String(usr.nombre_completo || '').trim())) {
                usr.nombre_completo = nombreReal;
                usuariosReparados.push({ ...usr });
              }
            } else if (crearUsuariosNuevos) {
              usr = {
                id: window.utils ? window.utils.generateUUID() : 'usr_' + Date.now(),
                cedula: normCed,
                nombre_completo: !esGen ? nombreReal : `PARTICIPANTE ${normCed}`,
                created_at: new Date().toISOString()
              };
              db.usuarios.push(usr);
              usuariosNuevos.push(usr);
            } else {
              return;
            }

            const ref = String(item.numero_transferencia || item.referencia || `CSV-${Date.now().toString().slice(-6)}`).trim();
            const fechaCurso = String(item.fecha_curso || '').trim();
            const dup = db.pagos.find(p => String(p.id_usuario) === String(usr.id) && String(p.numero_transferencia || '').toUpperCase() === ref.toUpperCase());
            if (dup) {
              if (fechaCurso && dup.fecha_curso !== fechaCurso) {
                dup.fecha_curso = fechaCurso;
                pagosActualizadosList.push({ id: dup.id, fecha_curso: fechaCurso });
              }
              return;
            }
            const nuevoPago = {
              id: window.utils ? window.utils.generateUUID() : 'pago_' + Date.now(),
              id_usuario: usr.id,
              id_curso_ofertado: item.id_curso_ofertado || null,
              banco_origen: item.banco_origen || 'Pago Móvil / Transferencia',
              monto: parseFloat(item.monto || 0) || 0,
              numero_transferencia: ref,
              fecha_pago: item.fecha_pago || new Date().toISOString().split('T')[0],
              fecha_curso: fechaCurso,
              capture: item.capture || '',
              status: 'PENDIENTE',
              created_at: new Date().toISOString()
            };
            db.pagos.push(nuevoPago);
            created.push(nuevoPago);
          });
          saveLocalDb(db);
          return {
            status: 'success',
            message: `Pagos procesados localmente: ${created.length} nuevos`,
            count: created.length,
            usuariosNuevos,
            usuariosReparados,
            pagosActualizadosList,
            data: created
          };
        }

        case 'aprobarPago': {
          if (!db.pagos) db.pagos = [];
          if (!db.usuarios) db.usuarios = [];
          if (!db.certificados) db.certificados = [];
          const pago = db.pagos.find(p => String(p.id) === String(payload.id));
          if (!pago) return { status: 'error', message: 'Pago no encontrado' };
          const usr = db.usuarios.find(u => String(u.id) === String(pago.id_usuario));
          if (!usr) return { status: 'error', message: 'Participante no encontrado' };
          const opciones = payload.opciones || {};
          let usuarioNombreActualizado = false;
          if (opciones.nombre_completo && !/^PARTICIPANTE(\s|$)/i.test(String(opciones.nombre_completo).trim())) {
            usr.nombre_completo = String(opciones.nombre_completo).trim().toUpperCase();
            usuarioNombreActualizado = true;
          }
          if (!usr.nombre_completo || /^PARTICIPANTE(\s|$)/i.test(String(usr.nombre_completo).trim())) {
            return { status: 'error', code: 'NOMBRE_GENERICO', message: 'Ingrese el nombre real del participante antes de aprobar.' };
          }
          const oferta = (db.curso_ofertado || []).find(o => String(o.id) === String(pago.id_curso_ofertado));
          const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
          const curso = (db.cursos || []).find(c =>
            (oferta && oferta.curso_id && String(c.id) === String(oferta.curso_id)) ||
            (oferta && oferta.taller && norm(c.nombre) === norm(oferta.taller))
          );
          const fechaCurso = opciones.fecha_curso || pago.fecha_curso || (curso && curso.fecha_curso) || new Date().toISOString().split('T')[0];
          pago.status = 'APROBADO';
          pago.fecha_curso = fechaCurso;
          if (!curso) {
            saveLocalDb(db);
            return {
              status: 'success',
              pagoAprobado: true,
              certificadoEmitido: false,
              sinCursoVinculado: true,
              fecha_curso: fechaCurso,
              usuarioId: usr.id,
              usuarioNombre: usr.nombre_completo,
              usuarioNombreActualizado,
              warning: 'Falta vincular el curso en #cursos para emitir el certificado.',
              message: 'Pago aprobado localmente (falta vincular curso para emitir certificado).'
            };
          }
          const existente = db.certificados.find(c => String(c.usuario_id) === String(usr.id) && String(c.curso_id) === String(curso.id));
          if (existente) {
            saveLocalDb(db);
            return {
              status: 'success',
              pagoAprobado: true,
              certificadoEmitido: false,
              yaExistiaCertificado: true,
              certificado: existente,
              cursoId: curso.id,
              cursoNombre: curso.nombre,
              fecha_curso: fechaCurso,
              usuarioId: usr.id,
              usuarioNombre: usr.nombre_completo,
              usuarioNombreActualizado,
              message: `Pago aprobado. Certificado previo: ${existente.codigo}`
            };
          }
          const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
          const digits = '0123456789';
          const codigo = Array.from({ length: 3 }, () => letters[Math.floor(Math.random() * 26)]).join('') +
            Array.from({ length: 4 }, () => digits[Math.floor(Math.random() * 10)]).join('') +
            Array.from({ length: 3 }, () => letters[Math.floor(Math.random() * 26)]).join('');
          const newCert = {
            id: window.utils ? window.utils.generateUUID() : 'cert_' + Date.now(),
            usuario_id: usr.id,
            curso_id: curso.id,
            codigo,
            fecha_curso: fechaCurso,
            lugar: opciones.lugar || 'PUERTO CABELLO, VENEZUELA',
            tomo: opciones.tomo || '',
            folio: opciones.folio || '',
            matricula: window.utils ? window.utils.generarMatricula(curso.matricula_prefijo, fechaCurso, usr.cedula) : '',
            created_at: new Date().toISOString()
          };
          db.certificados.push(newCert);
          saveLocalDb(db);
          return {
            status: 'success',
            pagoAprobado: true,
            certificadoEmitido: true,
            certificado: newCert,
            cursoId: curso.id,
            cursoNombre: curso.nombre,
            fecha_curso: fechaCurso,
            usuarioId: usr.id,
            usuarioNombre: usr.nombre_completo,
            usuarioNombreActualizado,
            message: `Pago aprobado y certificado ${codigo} emitido.`
          };
        }

        case 'revertirPago': {
          if (!db.pagos) db.pagos = [];
          const pago = db.pagos.find(p => String(p.id) === String(payload.id));
          if (!pago) return { status: 'error', message: 'Pago no encontrado' };
          const opciones = payload.opciones || {};
          const eliminarPago = Boolean(opciones.eliminarPago);
          const wasAprob = String(pago.status).toLowerCase() === 'true' || String(pago.status).toUpperCase() === 'APROBADO' || pago.status === true;
          let certificadoAnulado = false;
          let codigoAnulado = '';
          let certificadoAnuladoId = '';
          let auditRecord = null;
          if (wasAprob) {
            const oferta = (db.curso_ofertado || []).find(o => String(o.id) === String(pago.id_curso_ofertado));
            const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
            const curso = (db.cursos || []).find(c =>
              (oferta && oferta.curso_id && String(c.id) === String(oferta.curso_id)) ||
              (oferta && oferta.taller && norm(c.nombre) === norm(oferta.taller))
            );
            if (curso && Array.isArray(db.certificados)) {
              const certIdx = db.certificados.findIndex(c => String(c.usuario_id) === String(pago.id_usuario) && String(c.curso_id) === String(curso.id));
              if (certIdx !== -1) {
                const cert = db.certificados[certIdx];
                const usr = (db.usuarios || []).find(u => String(u.id) === String(pago.id_usuario)) || {};
                auditRecord = {
                  id: window.utils ? window.utils.generateUUID() : 'aud_' + Date.now(),
                  certificado_id: cert.id,
                  codigo: cert.codigo,
                  cedula: usr.cedula || '',
                  nombre_completo: usr.nombre_completo || '',
                  curso_id: curso.id,
                  nombre_curso: curso.nombre || '',
                  motivo_eliminacion: eliminarPago ? 'Eliminación de pago aprobado' : 'Reversión de pago a PENDIENTE',
                  eliminado_por: payload.ejecutadoPor || 'ADMIN',
                  fecha_eliminacion: new Date().toISOString(),
                  created_at: new Date().toISOString()
                };
                if (!db.certificados_eliminados) db.certificados_eliminados = [];
                db.certificados_eliminados.push(auditRecord);
                db.certificados.splice(certIdx, 1);
                certificadoAnulado = true;
                codigoAnulado = cert.codigo;
                certificadoAnuladoId = cert.id;
              }
            }
          }
          if (eliminarPago) {
            db.pagos = db.pagos.filter(p => String(p.id) !== String(payload.id));
          } else {
            pago.status = 'PENDIENTE';
          }
          saveLocalDb(db);
          return {
            status: 'success',
            pagoRevertido: !eliminarPago,
            pagoEliminado: eliminarPago,
            certificadoAnulado,
            codigoAnulado,
            certificadoAnuladoId,
            auditRecord,
            message: eliminarPago ? 'Pago eliminado localmente.' : 'Pago revertido a PENDIENTE.'
          };
        }

        case 'configurarFechaEmisionPagos': {
          if (!db.pagos) db.pagos = [];
          const idsSet = new Set((Array.isArray(payload.pagoIds) ? payload.pagoIds : []).map(id => String(id).trim()).filter(Boolean));
          const fechaCurso = String(payload.fecha_curso || '').trim();
          if (idsSet.size === 0 || !fechaCurso) {
            return { status: 'error', message: 'Seleccione al menos un pago e indique una fecha válida.' };
          }
          const opciones = payload.opciones || {};
          const lugar = String(opciones.lugar || '').trim() || 'PUERTO CABELLO, VENEZUELA';
          const actualizarCerts = opciones.actualizarCertificadosEmitidos !== false;
          const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
          const certificadosActualizados = [];

          db.pagos.forEach(p => {
            if (!idsSet.has(String(p.id).trim())) return;
            p.fecha_curso = fechaCurso;
            const isOk = String(p.status).toLowerCase() === 'true' || String(p.status).toUpperCase() === 'APROBADO' || p.status === true;
            if (actualizarCerts && isOk && p.id_usuario && Array.isArray(db.certificados)) {
              const oferta = (db.curso_ofertado || []).find(o => String(o.id).trim() === String(p.id_curso_ofertado).trim());
              const curso = (db.cursos || []).find(c =>
                (oferta && oferta.curso_id && String(c.id) === String(oferta.curso_id)) ||
                (oferta && oferta.taller && norm(c.nombre) === norm(oferta.taller))
              );
              if (curso) {
                const cert = db.certificados.find(c => String(c.usuario_id) === String(p.id_usuario) && String(c.curso_id) === String(curso.id));
                if (cert) {
                  const usr = (db.usuarios || []).find(u => String(u.id) === String(p.id_usuario)) || {};
                  cert.fecha_curso = fechaCurso;
                  cert.lugar = lugar;
                  if (window.utils && window.utils.generarMatricula) {
                    cert.matricula = window.utils.generarMatricula(curso.matricula_prefijo, fechaCurso, usr.cedula) || cert.matricula || '';
                  }
                  certificadosActualizados.push({
                    id: cert.id,
                    fecha_curso: cert.fecha_curso,
                    lugar: cert.lugar,
                    matricula: cert.matricula
                  });
                }
              }
            }
          });

          saveLocalDb(db);
          return {
            status: 'success',
            actualizados: idsSet.size,
            pagoIds: Array.from(idsSet),
            fecha_curso: fechaCurso,
            lugar,
            certificadosActualizados,
            message: `Fecha de emisión (${fechaCurso}) configurada en ${idsSet.size} pago(s).`
          };
        }

        case 'bulkAprobarPagos': {
          if (!db.pagos) db.pagos = [];
          if (!db.usuarios) db.usuarios = [];
          if (!db.certificados) db.certificados = [];
          const ids = Array.from(new Set((Array.isArray(payload.pagoIds) ? payload.pagoIds : []).map(id => String(id).trim()).filter(Boolean)));
          if (ids.length === 0) return { status: 'error', message: 'Seleccione al menos un pago.' };
          const opciones = payload.opciones || {};
          const nombresCorregidos = (opciones.nombresCorregidos && typeof opciones.nombresCorregidos === 'object') ? opciones.nombresCorregidos : {};
          const usuariosReparados = [];

          Object.entries(nombresCorregidos).forEach(([uid, nom]) => {
            const usr = db.usuarios.find(u => String(u.id) === String(uid));
            const cleanNom = String(nom || '').replace(/\s+/g, ' ').trim().toUpperCase();
            if (usr && cleanNom && !/^PARTICIPANTE(\s|$)/i.test(cleanNom)) {
              usr.nombre_completo = cleanNom;
              usuariosReparados.push({ id: usr.id, cedula: usr.cedula, nombre_completo: cleanNom });
            }
          });

          const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
          const respetarIndividuales = Boolean(opciones.respetarFechasIndividuales);
          const pagosSeleccionados = ids.map(id => db.pagos.find(p => String(p.id).trim() === id)).filter(Boolean);
          const pagosAprobados = [];
          const certificadosEmitidos = [];
          const talleresSinVincular = new Set();
          let yaExistianCount = 0;
          let sinCursoVinculadoCount = 0;

          for (const pago of pagosSeleccionados) {
            const usr = db.usuarios.find(u => String(u.id) === String(pago.id_usuario));
            if (!usr || /^PARTICIPANTE(\s|$)/i.test(String(usr.nombre_completo || '').trim())) {
              return { status: 'error', code: 'NOMBRE_GENERICO_LOTE', message: 'Uno o más participantes tienen nombre genérico.' };
            }
            const oferta = (db.curso_ofertado || []).find(o => String(o.id) === String(pago.id_curso_ofertado));
            const curso = (db.cursos || []).find(c =>
              (oferta && oferta.curso_id && String(c.id) === String(oferta.curso_id)) ||
              (oferta && oferta.taller && norm(c.nombre) === norm(oferta.taller))
            );
            const fechaFila = respetarIndividuales
              ? (pago.fecha_curso || (curso && curso.fecha_curso) || opciones.fecha_curso || '')
              : (opciones.fecha_curso || pago.fecha_curso || (curso && curso.fecha_curso) || '');
            if (!fechaFila) {
              return { status: 'error', code: 'SIN_FECHA_EMISION', message: 'Indique la Fecha de Emisión del certificado.' };
            }
            pago.status = 'APROBADO';
            pago.fecha_curso = fechaFila;
            pagosAprobados.push({ id: pago.id, status: 'APROBADO', fecha_curso: fechaFila });

            if (!curso) {
              sinCursoVinculadoCount++;
              talleresSinVincular.add((oferta && oferta.taller) || 'Taller sin vincular');
              continue;
            }
            const existente = db.certificados.find(c => String(c.usuario_id) === String(usr.id) && String(c.curso_id) === String(curso.id));
            if (existente) {
              yaExistianCount++;
              continue;
            }
            const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            const digits = '0123456789';
            const codigo = Array.from({ length: 3 }, () => letters[Math.floor(Math.random() * 26)]).join('') +
              Array.from({ length: 4 }, () => digits[Math.floor(Math.random() * 10)]).join('') +
              Array.from({ length: 3 }, () => letters[Math.floor(Math.random() * 26)]).join('');
            const folioRaw = String(opciones.folio || '').trim();
            let folioCalc = folioRaw;
            if (folioRaw && /^\d+$/.test(folioRaw)) {
              const lim = Math.max(1, parseInt(opciones.limite_por_folio, 10) || 15);
              folioCalc = String(parseInt(folioRaw, 10) + Math.floor(certificadosEmitidos.length / lim)).padStart(folioRaw.length, '0');
            }
            const newCert = {
              id: window.utils ? window.utils.generateUUID() : 'cert_' + Date.now() + '_' + certificadosEmitidos.length,
              usuario_id: usr.id,
              curso_id: curso.id,
              codigo,
              fecha_curso: fechaFila,
              lugar: (!respetarIndividuales && opciones.lugar) ? opciones.lugar : 'PUERTO CABELLO, VENEZUELA',
              tomo: opciones.tomo || '',
              folio: folioCalc,
              matricula: window.utils ? window.utils.generarMatricula(curso.matricula_prefijo, fechaFila, usr.cedula) : '',
              created_at: new Date().toISOString()
            };
            db.certificados.push(newCert);
            certificadosEmitidos.push(newCert);
          }

          saveLocalDb(db);
          return {
            status: 'success',
            aprobadosCount: pagosAprobados.length,
            certificadosEmitidosCount: certificadosEmitidos.length,
            yaExistianCount,
            sinCursoVinculadoCount,
            talleresSinVincular: Array.from(talleresSinVincular),
            pagosAprobados,
            certificadosEmitidos,
            usuariosReparados,
            message: `${pagosAprobados.length} pago(s) aprobado(s) y ${certificadosEmitidos.length} certificado(s) emitido(s) localmente.`
          };
        }

        case 'bulkRevertirPagos': {
          if (!db.pagos) db.pagos = [];
          const idsSet = new Set((Array.isArray(payload.pagoIds) ? payload.pagoIds : []).map(id => String(id).trim()).filter(Boolean));
          if (idsSet.size === 0) return { status: 'error', message: 'Seleccione al menos un pago.' };
          const opciones = payload.opciones || {};
          const eliminarPago = Boolean(opciones.eliminarPago);
          const isOk = p => String(p.status).toLowerCase() === 'true' || String(p.status).toUpperCase() === 'APROBADO' || p.status === true;
          const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();

          const selPagos = db.pagos.filter(p => idsSet.has(String(p.id).trim()));
          const aprobEnSel = selPagos.filter(isOk);
          if (!eliminarPago && aprobEnSel.length === 0) {
            return { status: 'error', message: 'Ningún pago seleccionado está APROBADO para revertir.' };
          }
          const restantesAprob = db.pagos.filter(p => !idsSet.has(String(p.id).trim()) && isOk(p));
          const auditRecords = [];
          const certificadosAnuladosIds = [];
          const codigosAnulados = [];

          aprobEnSel.forEach(pago => {
            const oferta = (db.curso_ofertado || []).find(o => String(o.id) === String(pago.id_curso_ofertado));
            const curso = (db.cursos || []).find(c =>
              (oferta && oferta.curso_id && String(c.id) === String(oferta.curso_id)) ||
              (oferta && oferta.taller && norm(c.nombre) === norm(oferta.taller))
            );
            if (!curso || !Array.isArray(db.certificados)) return;
            const otroActivo = restantesAprob.some(op => String(op.id_usuario) === String(pago.id_usuario) && String(op.id_curso_ofertado) === String(pago.id_curso_ofertado));
            if (otroActivo) return;
            const certIdx = db.certificados.findIndex(c => String(c.usuario_id) === String(pago.id_usuario) && String(c.curso_id) === String(curso.id));
            if (certIdx !== -1) {
              const cert = db.certificados[certIdx];
              const usr = (db.usuarios || []).find(u => String(u.id) === String(pago.id_usuario)) || {};
              const aud = {
                id: window.utils ? window.utils.generateUUID() : 'aud_' + Date.now() + '_' + auditRecords.length,
                certificado_id: cert.id,
                codigo: cert.codigo,
                cedula: usr.cedula || '',
                nombre_completo: usr.nombre_completo || '',
                curso_id: curso.id,
                nombre_curso: curso.nombre || '',
                motivo_eliminacion: eliminarPago ? 'Eliminación masiva de pago aprobado' : 'Anulación masiva de verificación de pago',
                eliminado_por: payload.ejecutadoPor || 'ADMIN',
                fecha_eliminacion: new Date().toISOString(),
                created_at: new Date().toISOString()
              };
              if (!db.certificados_eliminados) db.certificados_eliminados = [];
              db.certificados_eliminados.push(aud);
              auditRecords.push(aud);
              certificadosAnuladosIds.push(cert.id);
              codigosAnulados.push(cert.codigo);
              db.certificados.splice(certIdx, 1);
            }
          });

          const pagoIdsProcesados = (eliminarPago ? selPagos : aprobEnSel).map(p => String(p.id));
          if (eliminarPago) {
            db.pagos = db.pagos.filter(p => !idsSet.has(String(p.id).trim()));
          } else {
            aprobEnSel.forEach(p => { p.status = 'PENDIENTE'; });
          }

          saveLocalDb(db);
          return {
            status: 'success',
            eliminarPago,
            procesadosCount: pagoIdsProcesados.length,
            revertidosCount: eliminarPago ? 0 : pagoIdsProcesados.length,
            eliminadosCount: eliminarPago ? pagoIdsProcesados.length : 0,
            certificadosAnuladosCount: auditRecords.length,
            pagoIdsProcesados,
            certificadosAnuladosIds,
            codigosAnulados,
            auditRecords,
            message: eliminarPago ? `${pagoIdsProcesados.length} pago(s) eliminado(s) localmente.` : `${pagoIdsProcesados.length} pago(s) revertido(s) localmente.`
          };
        }

        case 'uploadImage': {
          return { status: 'success', url: payload.base64Data, filename: payload.filename };
        }

        case 'uploadBrochure': {
          return {
            status: 'success',
            message: 'Brochure subido localmente (Modo Mock)',
            url: 'brochure/index.html',
            size: (payload.pdfData || '').length,
            filename: 'brochure.pdf'
          };
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
