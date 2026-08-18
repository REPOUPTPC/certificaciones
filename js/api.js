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
        { id: 'u1', codigo: 'CYT', nombre: 'Unidad de Ciencia y Tecnología', logo_url: 'https://tuyatgbswyaaetytathd.supabase.co/storage/v1/object/public/logos/UPTPC_LOGO.png', created_at: new Date().toISOString() },
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
      consulta: []
    };

    const stored = localStorage.getItem(LOCAL_STORAGE_DB_KEY);
    if (!stored) {
      localStorage.setItem(LOCAL_STORAGE_DB_KEY, JSON.stringify(defaultDb));
      return defaultDb;
    }

    try {
      return JSON.parse(stored);
    } catch (e) {
      return defaultDb;
    }
  }

  function saveLocalDb(db) {
    localStorage.setItem(LOCAL_STORAGE_DB_KEY, JSON.stringify(db));
  }

  window.api = {
    async get(action, params = {}) {
      const apiUrl = window.config.getApiUrl();

      if (apiUrl) {
        try {
          const queryParams = new URLSearchParams({ action, ...params });
          const response = await fetch(`${apiUrl}?${queryParams.toString()}`, {
            method: 'GET',
            mode: 'cors'
          });
          if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
          const json = await response.json();
          return json;
        } catch (err) {
          console.warn('Conexión remota con Google Apps Script no disponible, recurriendo a modo local:', err);
        }
      }

      return this.mockGet(action, params);
    },

    async post(action, payload = {}) {
      const apiUrl = window.config.getApiUrl();

      if (apiUrl) {
        try {
          const response = await fetch(apiUrl, {
            method: 'POST',
            mode: 'cors',
            headers: {
              'Content-Type': 'text/plain;charset=utf-8'
            },
            body: JSON.stringify({ action, ...payload })
          });
          if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
          const json = await response.json();
          
          // Además de guardar en Google Sheets, actualizamos la caché local
          this.mockPost(action, payload);
          return json;
        } catch (err) {
          console.error('Error al enviar solicitud a Google Apps Script:', err);
          window.utils.showToast(`Advertencia: No se pudo conectar con Google Sheets (${err.message}). Se guardó localmente.`, 'warning');
          return this.mockPost(action, payload);
        }
      }

      window.utils.showToast('Nota: Operando en almacenamiento local del navegador (Configure el URL de API para guardar en Google Sheets)', 'info');
      return this.mockPost(action, payload);
    },

    async ping() { return this.get('ping'); },
    async getAll(table) { return this.get('getAll', { table }); },
    async getById(table, id) { return this.get('getById', { table, id }); },
    async create(table, data) { return this.post('create', { table, data }); },
    async update(table, id, data) { return this.post('update', { table, id, data }); },
    async delete(table, id) { return this.post('delete', { table, id }); },
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
          const table = params.table;
          return { status: 'success', data: db[table] || [] };
        }

        case 'getById': {
          const table = params.table;
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
          const table = payload.table;
          if (!db[table]) db[table] = [];
          const item = { ...payload.data, id: payload.data.id || window.utils.generateUUID(), created_at: new Date().toISOString() };
          db[table].push(item);
          saveLocalDb(db);
          return { status: 'success', message: 'Creado correctamente', data: item };
        }

        case 'update': {
          const table = payload.table;
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

        case 'delete': {
          const table = payload.table;
          if (!db[table]) return { status: 'error', message: 'Tabla no existe' };
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

          const created = [];
          usuarios.forEach((u, i) => {
            const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            const digits = '0123456789';
            let code = '';
            do {
              code = Array.from({length:3}, ()=>letters[Math.floor(Math.random()*26)]).join('') +
                     Array.from({length:3}, ()=>digits[Math.floor(Math.random()*10)]).join('') +
                     Array.from({length:3}, ()=>letters[Math.floor(Math.random()*26)]).join('');
            } while(existingCodes.has(code));

            existingCodes.add(code);

            const item = {
              id: window.utils.generateUUID(),
              usuario_id: u.id,
              curso_id: cursoId,
              codigo: code,
              fecha_curso: datos.fecha_curso || new Date().toISOString().split('T')[0],
              lugar: datos.lugar || 'Puerto Cabello, Venezuela',
              tomo: datos.tomo || '',
              folio: datos.folio ? String(parseInt(datos.folio) + i) : '',
              created_at: new Date().toISOString(),
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
