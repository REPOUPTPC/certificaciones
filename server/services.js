const db = require('./db');
const { uploadBase64Image, deleteObjectFromR2 } = require('./storage');
const crypto = require('crypto');

const ALLOWED_TABLES = [
  'unidades', 'firmas', 'tipo', 'usuarios', 'cursos', 'certificados',
  'disenos', 'admin', 'consulta', 'visita_admin', 'certificados_eliminados',
  'curso_ofertado', 'banco', 'pagos', 'configuracion', 'presets_imagenes'
];

const TABLE_COLUMNS = {
  admin: ['id', 'usuario', 'clave', 'tipo', 'status', 'permisos', 'created_at'],
  unidades: ['id', 'codigo', 'nombre', 'logo_url', 'created_at'],
  firmas: ['id', 'nombre', 'cargo', 'firma', 'sello', 'created_at'],
  tipo: ['id', 'tipo', 'created_at'],
  usuarios: ['id', 'cedula', 'nombre_completo', 'correo', 'telefono', 'created_at'],
  cursos: ['id', 'codigo_relacionado', 'nombre', 'contenido', 'tipo_curso', 'idtipo_curso', 'unidad_id', 'horas', 'motivo', 'ponencias', 'idfirma1', 'idfirma2', 'idfirma3', 'matricula_prefijo', 'diseno', 'fecha_curso', 'created_at'],
  certificados: ['id', 'usuario_id', 'curso_id', 'codigo', 'fecha_curso', 'lugar', 'tomo', 'folio', 'matricula', 'created_at'],
  disenos: ['id', 'nombre', 'descripcion', 'tiro', 'retiro', 'tiro_retiro', 'activo', 'ancho', 'alto', 'created_at', 'updated_at'],
  consulta: ['id', 'certificado_id', 'direccion_ip', 'fecha', 'created_at'],
  visita_admin: ['id', 'usuario', 'ip', 'sitio', 'fecha_hora', 'created_at'],
  certificados_eliminados: ['id', 'certificado_id', 'codigo', 'cedula', 'nombre_completo', 'curso_id', 'nombre_curso', 'motivo_eliminacion', 'eliminado_por', 'fecha_eliminacion', 'created_at'],
  curso_ofertado: ['id', 'taller', 'descripcion', 'valor_estudiante', 'valor_foraneo', 'flayer', 'created_at'],
  banco: ['id', 'banco', 'created_at'],
  pagos: ['id', 'id_usuario', 'id_curso_ofertado', 'banco_origen', 'monto', 'numero_transferencia', 'fecha_pago', 'capture', 'status', 'created_at'],
  configuracion: ['id', 'clave', 'valor', 'descripcion', 'categoria', 'updated_at'],
  presets_imagenes: ['id', 'nombre', 'categoria', 'url', 'descripcion', 'ancho_sugerido', 'alto_sugerido', 'created_at']
};

function checkTable(table) {
  if (!ALLOWED_TABLES.includes(table)) {
    throw new Error(`Tabla no permitida: ${table}`);
  }
}

function generateUUID() {
  return crypto.randomUUID();
}

function generateUniqueCode(existingSet) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  const rand = (chars, len) => Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  let code = '';
  let tries = 0;
  do {
    code = rand(letters, 3) + rand(digits, 4) + rand(letters, 3);
    tries++;
  } while (existingSet && existingSet.has(code) && tries < 2000);
  return code;
}

function generarMatricula(prefijo, fecha, cedula) {
  const pref = String(prefijo || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!pref) return '';
  const m = String(fecha || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const mes = m ? parseInt(m[2], 10) : 0;
  if (!mes || mes < 1 || mes > 12) return '';
  const digitos = String(cedula || '').replace(/\D/g, '');
  if (!digitos) return '';
  return pref + String(mes).padStart(2, '0') + digitos.slice(-3).padStart(3, '0');
}

function normalizeCedula(str) {
  let clean = String(str || '').trim().toUpperCase().replace(/[\s.-]/g, '');
  if (!clean) return '';
  let prefix = 'V';
  if (clean.startsWith('V') || clean.startsWith('E') || clean.startsWith('J') || clean.startsWith('G')) {
    prefix = clean[0];
    clean = clean.slice(1);
  }
  const digits = clean.replace(/\D/g, '');
  return digits ? `${prefix}-${digits}` : '';
}

/**
 * Servicio unificado de datos
 */
const services = {
  async ping() {
    return {
      status: 'success',
      message: 'API UPTPC Node.js + Turso + Cloudflare R2 Activa',
      timestamp: new Date().toISOString()
    };
  },

  async getAll(table) {
    checkTable(table);
    const res = await db.execute(`SELECT * FROM ${table};`);
    return { status: 'success', data: res.rows };
  },

  async getAllData() {
    const data = {};
    for (const tbl of ALLOWED_TABLES) {
      try {
        const res = await db.execute(`SELECT * FROM ${tbl};`);
        data[tbl] = res.rows;
      } catch (e) {
        data[tbl] = [];
      }
    }
    return { status: 'success', data, timestamp: new Date().toISOString() };
  },

  async getById(table, id) {
    checkTable(table);
    const res = await db.execute({
      sql: `SELECT * FROM ${table} WHERE id = ? LIMIT 1;`,
      args: [String(id)]
    });
    if (res.rows.length === 0) {
      return { status: 'error', message: 'Registro no encontrado' };
    }
    return { status: 'success', data: res.rows[0] };
  },

  async getVistaCertificados() {
    const sql = `
      SELECT
        c.id,
        c.usuario_id,
        c.curso_id,
        c.codigo,
        c.fecha_curso,
        c.lugar,
        c.tomo,
        c.folio,
        c.matricula,
        c.created_at,
        u.cedula,
        u.nombre_completo,
        u.correo as usuario_correo,
        u.telefono as usuario_telefono,
        cur.nombre as nombre_curso,
        cur.contenido,
        cur.horas,
        COALESCE(t.tipo, cur.tipo_curso, 'Taller') as tipo_curso,
        cur.motivo,
        cur.ponencias,
        cur.diseno,
        un.nombre as unidad_nombre,
        un.codigo as unidad_codigo,
        un.logo_url,
        f1.nombre as firma1_nombre,
        f1.cargo as firma1_cargo,
        f1.firma as firma1_url,
        f1.sello as sello1_url,
        f2.nombre as firma2_nombre,
        f2.cargo as firma2_cargo,
        f2.firma as firma2_url,
        f2.sello as sello2_url,
        f3.nombre as firma3_nombre,
        f3.cargo as firma3_cargo,
        f3.firma as firma3_url,
        f3.sello as sello3_url
      FROM certificados c
      LEFT JOIN usuarios u ON c.usuario_id = u.id
      LEFT JOIN cursos cur ON c.curso_id = cur.id
      LEFT JOIN unidades un ON cur.unidad_id = un.id
      LEFT JOIN tipo t ON cur.idtipo_curso = t.id OR cur.tipo_curso = t.tipo
      LEFT JOIN firmas f1 ON cur.idfirma1 = f1.id
      LEFT JOIN firmas f2 ON cur.idfirma2 = f2.id
      LEFT JOIN firmas f3 ON cur.idfirma3 = f3.id
      ORDER BY c.created_at DESC;
    `;
    const res = await db.execute(sql);
    return { status: 'success', data: res.rows };
  },

  async searchCertificado(termino) {
    if (!termino) return { status: 'success', data: [] };
    const term = String(termino).trim().toUpperCase();
    const esCodigo = /^[A-Z]{3}[0-9]{3,4}[A-Z]{3}$/.test(term);
    const termLimpio = term.replace(/[\s-]/g, '');

    const sql = `
      SELECT
        c.id,
        c.usuario_id,
        c.curso_id,
        c.codigo,
        c.fecha_curso,
        c.lugar,
        c.tomo,
        c.folio,
        c.matricula,
        c.created_at,
        u.cedula,
        u.nombre_completo,
        u.correo as usuario_correo,
        u.telefono as usuario_telefono,
        cur.nombre as nombre_curso,
        cur.contenido,
        cur.horas,
        COALESCE(t.tipo, cur.tipo_curso, 'Taller') as tipo_curso,
        cur.motivo,
        cur.ponencias,
        cur.diseno,
        un.nombre as unidad_nombre,
        un.codigo as unidad_codigo,
        un.logo_url,
        f1.nombre as firma1_nombre,
        f1.cargo as firma1_cargo,
        f1.firma as firma1_url,
        f1.sello as sello1_url,
        f2.nombre as firma2_nombre,
        f2.cargo as firma2_cargo,
        f2.firma as firma2_url,
        f2.sello as sello2_url,
        f3.nombre as firma3_nombre,
        f3.cargo as firma3_cargo,
        f3.firma as firma3_url,
        f3.sello as sello3_url
      FROM certificados c
      LEFT JOIN usuarios u ON c.usuario_id = u.id
      LEFT JOIN cursos cur ON c.curso_id = cur.id
      LEFT JOIN unidades un ON cur.unidad_id = un.id
      LEFT JOIN tipo t ON cur.idtipo_curso = t.id OR cur.tipo_curso = t.tipo
      LEFT JOIN firmas f1 ON cur.idfirma1 = f1.id
      LEFT JOIN firmas f2 ON cur.idfirma2 = f2.id
      LEFT JOIN firmas f3 ON cur.idfirma3 = f3.id
      WHERE UPPER(TRIM(c.codigo)) = ?
         OR UPPER(REPLACE(REPLACE(u.cedula, '-', ''), ' ', '')) LIKE ?
         OR UPPER(u.cedula) = ?
      ORDER BY c.created_at DESC;
    `;
    const res = await db.execute({
      sql,
      args: [term, `%${termLimpio}%`, term]
    });
    return { status: 'success', data: res.rows };
  },

  async getDisenoActivo() {
    const res = await db.execute("SELECT * FROM disenos WHERE UPPER(activo) = 'TRUE' LIMIT 1;");
    if (res.rows.length > 0) {
      return { status: 'success', data: res.rows[0] };
    }
    const fallback = await db.execute("SELECT * FROM disenos ORDER BY created_at DESC LIMIT 1;");
    return { status: 'success', data: fallback.rows[0] || null };
  },

  async saveDiseno(disenoData) {
    if (!disenoData || !disenoData.nombre) {
      return { status: 'error', message: 'El diseño requiere un nombre' };
    }
    const isActivo = String(disenoData.activo).toLowerCase() === 'true' || disenoData.activo === true;
    let tiroJson = disenoData.tiro || disenoData.diseno || '';
    if (typeof tiroJson === 'object') tiroJson = JSON.stringify(tiroJson);
    let retiroJson = disenoData.retiro || '';
    if (typeof retiroJson === 'object') retiroJson = JSON.stringify(retiroJson);

    const isTiroRetiro = String(disenoData.tiro_retiro).toLowerCase() === 'true' || disenoData.tiro_retiro === true;
    const disenoId = disenoData.id || generateUUID();

    if (isActivo) {
      await db.execute("UPDATE disenos SET activo = 'FALSE';");
    }

    await db.execute({
      sql: `INSERT INTO disenos (id, nombre, descripcion, tiro, retiro, tiro_retiro, activo, ancho, alto, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
            ON CONFLICT(id) DO UPDATE SET
              nombre = excluded.nombre,
              descripcion = excluded.descripcion,
              tiro = excluded.tiro,
              retiro = excluded.retiro,
              tiro_retiro = excluded.tiro_retiro,
              activo = excluded.activo,
              ancho = excluded.ancho,
              alto = excluded.alto,
              updated_at = datetime('now');`,
      args: [
        disenoId,
        disenoData.nombre,
        disenoData.descripcion || '',
        tiroJson,
        retiroJson,
        isTiroRetiro ? 'TRUE' : 'FALSE',
        isActivo ? 'TRUE' : 'FALSE',
        Number(disenoData.ancho) || 1123,
        Number(disenoData.alto) || 794
      ]
    });

    return { status: 'success', message: 'Diseño guardado exitosamente', id: disenoId };
  },

  async setDisenoActivo(disenoId, estado = true) {
    const valActivo = (estado === true || String(estado).toLowerCase() === 'true') ? 'TRUE' : 'FALSE';
    if (valActivo === 'TRUE') {
      await db.execute("UPDATE disenos SET activo = 'FALSE';");
    }
    const res = await db.execute({
      sql: "UPDATE disenos SET activo = ?, updated_at = datetime('now') WHERE id = ?;",
      args: [valActivo, String(disenoId)]
    });
    if (res.rowsAffected === 0) {
      return { status: 'error', message: 'Diseño no encontrado' };
    }
    return { status: 'success', message: `Diseño ${valActivo === 'TRUE' ? 'activado' : 'desactivado'} correctamente` };
  },

  async logConsulta(certificadoId, ip) {
    const id = generateUUID();
    await db.execute({
      sql: "INSERT INTO consulta (id, certificado_id, direccion_ip, fecha) VALUES (?, ?, ?, datetime('now'));",
      args: [id, certificadoId || '', ip || '127.0.0.1']
    });
    return { status: 'success', message: 'Consulta registrada' };
  },

  async getDashboardStats() {
    const [cCount, uCount, curCount, unCount, dCount, consCount, ultimos] = await Promise.all([
      db.execute("SELECT count(*) as total FROM certificados;"),
      db.execute("SELECT count(*) as total FROM usuarios;"),
      db.execute("SELECT count(*) as total FROM cursos;"),
      db.execute("SELECT count(*) as total FROM unidades;"),
      db.execute("SELECT count(*) as total FROM disenos;"),
      db.execute("SELECT count(*) as total FROM consulta;"),
      this.getVistaCertificados()
    ]);

    return {
      status: 'success',
      data: {
        totalCertificados: Number(cCount.rows[0]?.total || 0),
        totalUsuarios: Number(uCount.rows[0]?.total || 0),
        totalCursos: Number(curCount.rows[0]?.total || 0),
        totalUnidades: Number(unCount.rows[0]?.total || 0),
        totalDisenos: Number(dCount.rows[0]?.total || 0),
        totalVerificaciones: Number(consCount.rows[0]?.total || 0),
        ultimosCertificados: (ultimos.data || []).slice(0, 5)
      }
    };
  },

  async createRecord(table, recordData) {
    checkTable(table);
    const validCols = new Set(TABLE_COLUMNS[table] || []);
    const data = {};

    // Filtrar estrictamente a columnas existentes en la tabla
    for (const key of Object.keys(recordData || {})) {
      if (validCols.has(key)) {
        data[key] = recordData[key];
      }
    }

    // Normalizaciones específicas para pagos
    if (table === 'pagos') {
      if (data.id_curso_ofertado !== undefined && data.id_curso_ofertado !== null) {
        const parsedCurso = parseInt(data.id_curso_ofertado, 10);
        if (!isNaN(parsedCurso)) {
          data.id_curso_ofertado = String(parsedCurso);
        }
      }
      if (data.status === undefined || data.status === false || String(data.status).toLowerCase() === 'false' || String(data.status) === '0') {
        data.status = 'PENDIENTE';
      } else if (data.status === true || String(data.status).toLowerCase() === 'true' || String(data.status) === '1' || String(data.status).toLowerCase() === 'aprobado') {
        data.status = 'APROBADO';
      }
    }

    // Auto-generar UUID si la tabla lo usa como PK y no vino
    if (validCols.has('id') && (!data.id || String(data.id).trim() === '')) {
      if (table !== 'curso_ofertado' && table !== 'banco' && table !== 'tipo') {
        data.id = generateUUID();
      }
    }

    // Auto-generar timestamps de auditoría si la tabla posee dichas columnas
    if (validCols.has('created_at') && !data.created_at) {
      data.created_at = new Date().toISOString();
    }
    if (validCols.has('fecha_hora') && !data.fecha_hora) {
      data.fecha_hora = new Date().toISOString();
    }
    if (validCols.has('fecha') && !data.fecha) {
      data.fecha = new Date().toISOString();
    }

    const keys = Object.keys(data);
    if (keys.length === 0) {
      return { status: 'error', message: `No se enviaron campos válidos para la tabla ${table}` };
    }

    const placeholders = keys.map(() => '?').join(', ');
    const values = keys.map(k => data[k]);

    const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders});`;
    await db.execute({ sql, args: values });

    return { status: 'success', message: `Registro creado exitosamente en ${table}`, data };
  },

  async updateRecord(table, id, recordData) {
    checkTable(table);
    const validCols = new Set(TABLE_COLUMNS[table] || []);
    const data = {};

    // Filtrar solo columnas válidas excluyendo la clave primaria 'id'
    for (const key of Object.keys(recordData || {})) {
      if (key !== 'id' && validCols.has(key)) {
        data[key] = recordData[key];
      }
    }

    // Normalizaciones específicas para pagos
    if (table === 'pagos') {
      if (data.id_curso_ofertado !== undefined && data.id_curso_ofertado !== null) {
        const parsedCurso = parseInt(data.id_curso_ofertado, 10);
        if (!isNaN(parsedCurso)) {
          data.id_curso_ofertado = String(parsedCurso);
        }
      }
      if (data.status !== undefined && data.status !== null) {
        if (data.status === true || String(data.status).toLowerCase() === 'true' || String(data.status) === '1' || String(data.status).toLowerCase() === 'aprobado') {
          data.status = 'APROBADO';
        } else if (data.status === false || String(data.status).toLowerCase() === 'false' || String(data.status) === '0' || String(data.status).toLowerCase() === 'pendiente') {
          data.status = 'PENDIENTE';
        }
      }
    }

    if (validCols.has('updated_at') && !data.updated_at) {
      data.updated_at = new Date().toISOString();
    }

    const keys = Object.keys(data);
    if (keys.length === 0) return { status: 'success', message: 'Sin cambios válidos para actualizar' };

    const setClauses = keys.map(k => `${k} = ?`).join(', ');
    const values = keys.map(k => data[k]);
    values.push(String(id));

    const sql = `UPDATE ${table} SET ${setClauses} WHERE id = ?;`;
    await db.execute({ sql, args: values });

    return { status: 'success', message: `Registro actualizado en ${table}` };
  },

  async deleteRecord(table, id) {
    checkTable(table);
    await db.execute({
      sql: `DELETE FROM ${table} WHERE id = ?;`,
      args: [String(id)]
    });
    return { status: 'success', message: `Registro eliminado de ${table}` };
  },

  async bulkCreateUsuarios(usuariosArray) {
    if (!Array.isArray(usuariosArray) || usuariosArray.length === 0) {
      return { status: 'success', message: 'Ningún usuario recibido', createdCount: 0, skippedCount: 0, created: [], skipped: [] };
    }

    const created = [];
    const skipped = [];
    const existing = await db.execute("SELECT cedula FROM usuarios;");
    const existingSet = new Set(existing.rows.map(r => String(r.cedula).trim().toUpperCase()));

    const stmts = [];
    for (const u of usuariosArray) {
      const cedulaNorm = String(u.cedula || '').trim().toUpperCase();
      if (!cedulaNorm || existingSet.has(cedulaNorm)) {
        skipped.push(u);
        continue;
      }
      existingSet.add(cedulaNorm);
      const newUsr = {
        id: u.id || generateUUID(),
        cedula: cedulaNorm,
        nombre_completo: String(u.nombre_completo || '').trim().toUpperCase(),
        correo: u.correo || '',
        telefono: u.telefono || '',
        created_at: new Date().toISOString()
      };
      stmts.push({
        sql: "INSERT INTO usuarios (id, cedula, nombre_completo, correo, telefono, created_at) VALUES (?, ?, ?, ?, ?, ?);",
        args: [newUsr.id, newUsr.cedula, newUsr.nombre_completo, newUsr.correo, newUsr.telefono, newUsr.created_at]
      });
      created.push(newUsr);
    }

    if (stmts.length > 0) {
      const chunkSize = 50;
      for (let i = 0; i < stmts.length; i += chunkSize) {
        await db.batch(stmts.slice(i, i + chunkSize), 'write');
      }
    }

    return {
      status: 'success',
      message: `Proceso completado. Registrados: ${created.length}, Omitidos: ${skipped.length}`,
      createdCount: created.length,
      skippedCount: skipped.length,
      created,
      skipped
    };
  },

  async bulkCertificar(cursoId, usuariosList, datosGenerales = {}) {
    if (!cursoId || !Array.isArray(usuariosList) || usuariosList.length === 0) {
      return { status: 'error', message: 'Parámetros incompletos para emisión masiva' };
    }

    const [existingCodesRes, cursoRes] = await Promise.all([
      db.execute("SELECT codigo FROM certificados;"),
      db.execute({ sql: "SELECT * FROM cursos WHERE id = ? LIMIT 1;", args: [String(cursoId)] })
    ]);

    const existingCodes = new Set(existingCodesRes.rows.map(r => String(r.codigo).trim().toUpperCase()));
    const cursoObj = cursoRes.rows[0] || {};
    const prefijoCurso = cursoObj.matricula_prefijo || datosGenerales.matricula_prefijo || '';

    const created = [];
    const stmts = [];
    const fechaCurso = datosGenerales.fecha_curso || new Date().toISOString().split('T')[0];
    const lugar = datosGenerales.lugar || 'Puerto Cabello, Venezuela';

    usuariosList.forEach((u, index) => {
      const codigo = generateUniqueCode(existingCodes);
      existingCodes.add(codigo);

      let folioCalculado = datosGenerales.folio || '';
      if (datosGenerales.folio && !isNaN(parseInt(datosGenerales.folio))) {
        const folioBase = parseInt(datosGenerales.folio);
        const limite = parseInt(datosGenerales.limite_por_folio) || 15;
        const incremento = Math.floor(index / limite);
        folioCalculado = String(folioBase + incremento);
      }

      const matricula = u.matricula || generarMatricula(prefijoCurso, fechaCurso, u.cedula) || datosGenerales.matricula || '';

      const newCert = {
        id: generateUUID(),
        usuario_id: u.id,
        curso_id: cursoId,
        codigo,
        fecha_curso: fechaCurso,
        lugar,
        tomo: datosGenerales.tomo || '',
        folio: folioCalculado,
        matricula,
        created_at: new Date().toISOString()
      };

      stmts.push({
        sql: "INSERT INTO certificados (id, usuario_id, curso_id, codigo, fecha_curso, lugar, tomo, folio, matricula, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);",
        args: [newCert.id, newCert.usuario_id, newCert.curso_id, newCert.codigo, newCert.fecha_curso, newCert.lugar, newCert.tomo, newCert.folio, newCert.matricula, newCert.created_at]
      });

      created.push(newCert);
    });

    if (stmts.length > 0) {
      const chunkSize = 50;
      for (let i = 0; i < stmts.length; i += chunkSize) {
        await db.batch(stmts.slice(i, i + chunkSize), 'write');
      }
    }

    return {
      status: 'success',
      message: `Se emitieron exitosamente ${created.length} certificados`,
      count: created.length,
      data: created
    };
  },

  async uploadImage(base64Data, filename, folder) {
    return await uploadBase64Image(base64Data, filename, folder);
  },

  async verifyAdmin(usuario, clave) {
    if (!usuario || !clave) {
      return { status: 'error', message: 'Credenciales incompletas', authenticated: false };
    }
    const res = await db.execute({
      sql: "SELECT * FROM admin WHERE UPPER(TRIM(usuario)) = UPPER(TRIM(?)) LIMIT 1;",
      args: [String(usuario)]
    });
    if (res.rows.length === 0) {
      return { status: 'error', message: 'Usuario no registrado', authenticated: false };
    }
    const user = res.rows[0];
    if (String(user.clave).trim() !== String(clave).trim()) {
      return { status: 'error', message: 'Contraseña incorrecta', authenticated: false };
    }
    if (String(user.status).toUpperCase() !== 'ACTIVO') {
      return { status: 'error', message: 'Cuenta desactivada por el Super Admin', authenticated: false };
    }
    const { clave: _, ...safeUser } = user;
    return {
      status: 'success',
      authenticated: true,
      message: 'Autenticación exitosa',
      user: safeUser
    };
  },

  async backupDatabase() {
    const allData = await this.getAllData();
    return {
      status: 'success',
      export_date: new Date().toISOString(),
      platform: 'Vercel + Turso (LibSQL) + Cloudflare R2',
      data: allData.data
    };
  },

  async getConfiguraciones() {
    const res = await db.execute("SELECT * FROM configuracion ORDER BY categoria, clave;");
    return { status: 'success', data: res.rows };
  },

  async updateConfiguracion(clave, valor, descripcion = '', categoria = 'SISTEMA') {
    const claveUpper = String(clave).trim().toUpperCase();
    const existing = await db.execute({
      sql: "SELECT * FROM configuracion WHERE UPPER(clave) = ? LIMIT 1;",
      args: [claveUpper]
    });
    if (existing.rows.length > 0) {
      await db.execute({
        sql: "UPDATE configuracion SET valor = ?, updated_at = datetime('now') WHERE UPPER(clave) = ?;",
        args: [String(valor), claveUpper]
      });
    } else {
      await db.execute({
        sql: "INSERT INTO configuracion (id, clave, valor, descripcion, categoria, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'));",
        args: [claveUpper.toLowerCase(), claveUpper, String(valor), descripcion || 'Configuración del sistema', categoria]
      });
    }
    return { status: 'success', message: `Configuración ${claveUpper} actualizada` };
  },

  async getApiKeyConfig() {
    const res = await db.execute("SELECT clave, valor FROM configuracion WHERE UPPER(clave) IN ('API_KEY_SECRET', 'API_KEY_HABILITADA', 'API_KEY_LAST_USED');");
    const map = {};
    res.rows.forEach(r => { map[String(r.clave).toUpperCase()] = r.valor; });

    let secret = map['API_KEY_SECRET'];
    if (!secret) {
      secret = 'uptpc_live_' + crypto.randomBytes(24).toString('hex');
      await this.updateConfiguracion('API_KEY_SECRET', secret, 'Clave secreta para inyección externa de pagos vía API', 'INTEGRACION');
    }

    let habilitada = map['API_KEY_HABILITADA'];
    if (habilitada === undefined) {
      habilitada = 'true';
      await this.updateConfiguracion('API_KEY_HABILITADA', 'true', 'Habilitar o suspender acceso por API Key', 'INTEGRACION');
    }

    const lastUsed = map['API_KEY_LAST_USED'] || 'Sin registros recientes';

    let totalInyectados = 0;
    try {
      const countRes = await db.execute("SELECT COUNT(*) as total FROM pagos WHERE numero_transferencia LIKE 'API-%' OR banco_origen LIKE '%API%';");
      totalInyectados = countRes.rows[0]?.total || 0;
    } catch (e) {}

    return {
      status: 'success',
      data: {
        apiKey: secret,
        habilitada: String(habilitada).toLowerCase() !== 'false',
        lastUsed,
        totalInyectados
      }
    };
  },

  async regenerateApiKey() {
    const newKey = 'uptpc_live_' + crypto.randomBytes(24).toString('hex');
    await this.updateConfiguracion('API_KEY_SECRET', newKey, 'Clave secreta para inyección externa de pagos vía API', 'INTEGRACION');
    return {
      status: 'success',
      message: 'Nueva API Key generada con éxito.',
      apiKey: newKey
    };
  },

  async toggleApiKey(habilitada) {
    const val = String(habilitada).toLowerCase() === 'true' || habilitada === true ? 'true' : 'false';
    await this.updateConfiguracion('API_KEY_HABILITADA', val, 'Habilitar o suspender acceso por API Key', 'INTEGRACION');
    return {
      status: 'success',
      message: `API Key ${val === 'true' ? 'habilitada' : 'deshabilitada'} exitosamente.`,
      habilitada: val === 'true'
    };
  },

  async inyectarPago(pagoData = {}, providedApiKey = '', isInternalAdmin = false) {
    if (!isInternalAdmin) {
      const resConfig = await db.execute("SELECT clave, valor FROM configuracion WHERE UPPER(clave) IN ('API_KEY_SECRET', 'API_KEY_HABILITADA');");
      const map = {};
      resConfig.rows.forEach(r => { map[String(r.clave).toUpperCase()] = r.valor; });

      const habilitada = map['API_KEY_HABILITADA'] !== 'false';
      if (!habilitada) {
        return { status: 'error', message: 'La plataforma de inyección vía API Key se encuentra temporalmente deshabilitada.' };
      }

      const activeSecret = map['API_KEY_SECRET'];
      if (!activeSecret || !providedApiKey || String(providedApiKey).trim() !== String(activeSecret).trim()) {
        return { status: 'error', message: 'API Key no autorizada o inválida.' };
      }
    }

    const rawCedula = String(pagoData.cedula || pagoData.ci || pagoData.documento || '').trim();
    const cedulaNorm = normalizeCedula(rawCedula);
    if (!cedulaNorm) {
      return { status: 'error', message: 'El campo "cedula" es obligatorio para la inyección de datos (ej: V-12345678).' };
    }

    // Buscar o registrar usuario automáticamente por cédula
    const userRes = await db.execute({
      sql: "SELECT * FROM usuarios WHERE UPPER(REPLACE(REPLACE(cedula, '-', ''), ' ', '')) = UPPER(REPLACE(?, '-', '')) LIMIT 1;",
      args: [cedulaNorm]
    });

    let usuarioId = '';
    let nombreUsuario = '';
    if (userRes.rows.length > 0) {
      usuarioId = userRes.rows[0].id;
      nombreUsuario = userRes.rows[0].nombre_completo;
    } else {
      usuarioId = generateUUID();
      nombreUsuario = String(pagoData.nombre_completo || pagoData.nombre || `PARTICIPANTE ${cedulaNorm}`).trim().toUpperCase();
      const correo = String(pagoData.correo || pagoData.email || '').trim().toLowerCase();
      const telefono = String(pagoData.telefono || pagoData.celular || '').trim();
      const createdAt = new Date().toISOString();

      await db.execute({
        sql: "INSERT INTO usuarios (id, cedula, nombre_completo, correo, telefono, created_at) VALUES (?, ?, ?, ?, ?, ?);",
        args: [usuarioId, cedulaNorm, nombreUsuario, correo, telefono, createdAt]
      });
    }

    // Resolver curso_ofertado
    let cursoId = pagoData.id_curso_ofertado || pagoData.curso_id || null;
    if (cursoId) {
      const pInt = parseInt(cursoId, 10);
      if (!isNaN(pInt)) cursoId = String(pInt);
    }
    if (!cursoId && pagoData.taller) {
      const cRes = await db.execute({
        sql: "SELECT id FROM curso_ofertado WHERE UPPER(taller) LIKE UPPER(?) LIMIT 1;",
        args: [`%${pagoData.taller}%`]
      });
      if (cRes.rows.length > 0) cursoId = String(cRes.rows[0].id);
    }
    if (!cursoId) {
      const primerCurso = await db.execute("SELECT id FROM curso_ofertado ORDER BY id DESC LIMIT 1;");
      cursoId = primerCurso.rows[0]?.id ? String(primerCurso.rows[0].id) : null;
    }

    const monto = parseFloat(pagoData.monto || pagoData.monto_bs || 0) || 0;
    const numRef = String(pagoData.numero_transferencia || pagoData.referencia || pagoData.ref || `API-${Date.now().toString().slice(-8)}`).trim();
    const banco = String(pagoData.banco_origen || pagoData.banco || 'Inyección API Externa').trim();
    const fechaPago = String(pagoData.fecha_pago || pagoData.fecha || new Date().toISOString().split('T')[0]).trim();
    const capture = String(pagoData.capture || pagoData.comprobante_url || '').trim();
    const nuevoPagoId = generateUUID();
    const now = new Date().toISOString();

    // Guardar pago con status 'false' (PENDIENTE)
    await db.execute({
      sql: "INSERT INTO pagos (id, id_usuario, id_curso_ofertado, banco_origen, monto, numero_transferencia, fecha_pago, capture, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);",
      args: [nuevoPagoId, usuarioId, cursoId, banco, monto, numRef, fechaPago, capture, 'false', now]
    });

    // Registrar última fecha de uso del API
    await this.updateConfiguracion('API_KEY_LAST_USED', now, 'Fecha y hora de la última petición recibida', 'INTEGRACION');

    return {
      status: 'success',
      message: 'Pago inyectado exitosamente vía API. Queda a la espera de verificación administrativa.',
      data: {
        id: nuevoPagoId,
        id_usuario: usuarioId,
        cedula: cedulaNorm,
        nombre_completo: nombreUsuario,
        id_curso_ofertado: cursoId,
        monto,
        numero_transferencia: numRef,
        banco_origen: banco,
        fecha_pago: fechaPago,
        status: 'PENDIENTE',
        created_at: now
      }
    };
  },

  async getCursosOfertadosApi(providedApiKey = '', isInternalAdmin = false) {
    if (!isInternalAdmin) {
      const resConfig = await db.execute("SELECT clave, valor FROM configuracion WHERE UPPER(clave) IN ('API_KEY_SECRET', 'API_KEY_HABILITADA');");
      const map = {};
      resConfig.rows.forEach(r => { map[String(r.clave).toUpperCase()] = r.valor; });

      const habilitada = map['API_KEY_HABILITADA'] !== 'false';
      if (!habilitada) {
        return { status: 'error', message: 'La plataforma de API del sistema se encuentra temporalmente deshabilitada.' };
      }

      const activeSecret = map['API_KEY_SECRET'];
      if (!activeSecret || !providedApiKey || String(providedApiKey).trim() !== String(activeSecret).trim()) {
        return { status: 'error', message: 'Secreto o API Key no autorizada o no proporcionada.' };
      }
    }

    const resCursos = await db.execute("SELECT id, taller, descripcion, valor_estudiante, valor_foraneo, flayer, created_at FROM curso_ofertado ORDER BY id DESC;");
    const cursosRaw = resCursos.rows || [];

    let tasaDolar = 36.5;
    try {
      const resTasa = await db.execute("SELECT valor FROM configuracion WHERE UPPER(clave) = 'TASA_DOLAR_VALOR' LIMIT 1;");
      if (resTasa.rows.length > 0 && parseFloat(resTasa.rows[0].valor) > 0) {
        tasaDolar = parseFloat(resTasa.rows[0].valor);
      }
    } catch(e) {}

    let bancosDisponibles = [];
    try {
      const resBancos = await db.execute("SELECT id, banco FROM banco ORDER BY id;");
      bancosDisponibles = resBancos.rows.map(b => b.banco);
    } catch(e) {}

    const cursosFormateados = cursosRaw.map(c => {
      const valEstUsd = parseFloat(c.valor_estudiante || 0);
      const valForUsd = parseFloat(c.valor_foraneo || 0);
      const valEstBs = parseFloat((valEstUsd * tasaDolar).toFixed(2));
      const valForBs = parseFloat((valForUsd * tasaDolar).toFixed(2));

      return {
        id: c.id,
        taller: c.taller,
        titulo: c.taller,
        descripcion: c.descripcion || '',
        precios: {
          usd: {
            estudiante: valEstUsd,
            foraneo: valForUsd,
            formato_estudiante: `$${valEstUsd.toFixed(2)} USD`,
            formato_foraneo: `$${valForUsd.toFixed(2)} USD`
          },
          bs: {
            tasa_bcv: tasaDolar,
            estudiante: valEstBs,
            foraneo: valForBs,
            formato_estudiante: `${valEstBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs.`,
            formato_foraneo: `${valForBs.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs.`
          }
        },
        flayer: c.flayer || '',
        portada_url: c.flayer || '',
        fecha_creacion: c.created_at || '',
        disponible: true
      };
    });

    return {
      status: 'success',
      plataforma: 'Universidad Politécnica Territorial de Puerto Cabello (UPTPC)',
      tasa_oficial_bcv: tasaDolar,
      total_cursos: cursosFormateados.length,
      bancos_receptores: bancosDisponibles,
      cursos: cursosFormateados,
      timestamp: new Date().toISOString()
    };
  },

  async bulkCreatePagos(pagosArray, opciones = {}) {
    if (!Array.isArray(pagosArray) || pagosArray.length === 0) {
      return { status: 'error', message: 'No se recibieron pagos para procesar en lote' };
    }
    // Por defecto, los participantes inexistentes se registran automáticamente con su cédula y nombre
    const crearUsuariosNuevos = opciones.crearUsuariosNuevos !== false && String(opciones.crearUsuariosNuevos).toLowerCase() !== 'false';
    const omitidos = [];
    let usuariosActualizados = 0;

    const existingUsersRes = await db.execute("SELECT id, cedula, nombre_completo FROM usuarios;");
    const usersByCedula = new Map();
    for (const u of existingUsersRes.rows) {
      const norm = normalizeCedula(u.cedula);
      if (norm) usersByCedula.set(norm, u);
    }

    const ofertasRes = await db.execute("SELECT id, taller FROM curso_ofertado;");
    const ofertasList = ofertasRes.rows;
    const primerCursoId = ofertasList[0]?.id || null;

    const stmts = [];
    const created = [];
    const usuariosNuevosStmts = [];

    for (const item of pagosArray) {
      const rawCed = item.cedula || item.ci || '';
      const normCed = normalizeCedula(rawCed);
      if (!normCed) continue;

      let usr = usersByCedula.get(normCed);
      let usrId = '';
      let usrNombre = '';

      const nombreRecibido = String(item.nombre_completo || item.nombre || '').trim().toUpperCase();

      if (usr) {
        usrId = usr.id;
        usrNombre = usr.nombre_completo;
        // Si el participante fue creado antes con un nombre genérico, se completa con el nombre real recibido
        if (nombreRecibido && /^PARTICIPANTE\s/i.test(String(usrNombre || ''))) {
          usuariosNuevosStmts.push({
            sql: "UPDATE usuarios SET nombre_completo = ? WHERE id = ?;",
            args: [nombreRecibido, usrId]
          });
          usersByCedula.set(normCed, { id: usrId, cedula: normCed, nombre_completo: nombreRecibido });
          usrNombre = nombreRecibido;
          usuariosActualizados++;
        }
      } else if (!crearUsuariosNuevos) {
        omitidos.push({ cedula: normCed, motivo: 'Participante no registrado en el sistema' });
        continue;
      } else {
        usrId = generateUUID();
        usrNombre = nombreRecibido || `PARTICIPANTE ${normCed}`;
        const nuevoUsrObj = {
          id: usrId,
          cedula: normCed,
          nombre_completo: usrNombre,
          correo: item.correo || '',
          telefono: item.telefono || '',
          created_at: new Date().toISOString()
        };
        usuariosNuevosStmts.push({
          sql: "INSERT INTO usuarios (id, cedula, nombre_completo, correo, telefono, created_at) VALUES (?, ?, ?, ?, ?, ?);",
          args: [nuevoUsrObj.id, nuevoUsrObj.cedula, nuevoUsrObj.nombre_completo, nuevoUsrObj.correo, nuevoUsrObj.telefono, nuevoUsrObj.created_at]
        });
        usersByCedula.set(normCed, nuevoUsrObj);
      }

      let cursoId = item.id_curso_ofertado || item.curso_id || null;
      if (cursoId) {
        const pInt = parseInt(cursoId, 10);
        if (!isNaN(pInt)) cursoId = String(pInt);
      }
      if (!cursoId && item.curso_ofertado) {
        const match = ofertasList.find(o => 
          String(o.taller).toUpperCase().includes(String(item.curso_ofertado).toUpperCase()) ||
          String(o.id) === String(item.curso_ofertado)
        );
        if (match) cursoId = String(match.id);
      }
      if (!cursoId) cursoId = primerCursoId ? String(primerCursoId) : null;

      const monto = parseFloat(item.monto || 0) || 0;
      const ref = String(item.numero_transferencia || item.referencia || `CSV-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`).trim();
      const banco = String(item.banco_origen || item.banco || 'Pago Móvil / Transferencia').trim();
      const fecha = String(item.fecha_pago || item.fecha || new Date().toISOString().split('T')[0]).trim();
      const capture = String(item.capture || item.comprobante || item.comprobante_url || '').trim();
      const pagoId = generateUUID();
      const createdAt = new Date().toISOString();

      stmts.push({
        sql: "INSERT INTO pagos (id, id_usuario, id_curso_ofertado, banco_origen, monto, numero_transferencia, fecha_pago, capture, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);",
        args: [pagoId, usrId, cursoId, banco, monto, ref, fecha, capture, 'false', createdAt]
      });

      created.push({
        id: pagoId,
        id_usuario: usrId,
        cedula: normCed,
        nombre_completo: usrNombre,
        id_curso_ofertado: cursoId,
        monto,
        numero_transferencia: ref,
        status: 'PENDIENTE'
      });
    }

    if (usuariosNuevosStmts.length > 0) {
      const chunkSize = 50;
      for (let i = 0; i < usuariosNuevosStmts.length; i += chunkSize) {
        await db.batch(usuariosNuevosStmts.slice(i, i + chunkSize), 'write');
      }
    }

    if (stmts.length > 0) {
      const chunkSize = 50;
      for (let i = 0; i < stmts.length; i += chunkSize) {
        await db.batch(stmts.slice(i, i + chunkSize), 'write');
      }
    }

    const usuariosCreados = usuariosNuevosStmts.filter(s => s.sql.startsWith('INSERT')).length;
    let message = `Se han registrado exitosamente ${created.length} pagos masivos en estado PENDIENTE.`;
    if (usuariosCreados > 0) message += ` Participantes nuevos registrados: ${usuariosCreados}.`;
    if (usuariosActualizados > 0) message += ` Nombres completados: ${usuariosActualizados}.`;
    if (omitidos.length > 0) message += ` Omitidos (participante inexistente): ${omitidos.length}.`;

    return {
      status: 'success',
      message,
      count: created.length,
      usuariosCreados,
      usuariosActualizados,
      omitidos,
      data: created
    };
  },

  // ═════════════════════════════════════════════════════════════════
  // FUENTES EXTERNAS DE PARTICIPANTES (API JSON: cédula + nombre completo)
  // ═════════════════════════════════════════════════════════════════

  async ensureFuentesExternasTable() {
    if (fuentesTableReady) return;
    await db.execute(`CREATE TABLE IF NOT EXISTS fuentes_externas (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      url TEXT NOT NULL,
      campo_cedula TEXT,
      campo_nombre TEXT,
      api_key TEXT,
      activa TEXT DEFAULT 'true',
      ultima_importacion TEXT,
      ultimo_resultado TEXT,
      created_at TEXT
    );`);
    fuentesTableReady = true;
  },

  async listFuentesExternas() {
    await this.ensureFuentesExternasTable();
    const res = await db.execute("SELECT * FROM fuentes_externas ORDER BY created_at ASC;");
    // Nunca se devuelve la API key completa al navegador
    const data = res.rows.map(r => ({
      ...r,
      api_key: '',
      tiene_api_key: Boolean(r.api_key),
      activa: String(r.activa).toLowerCase() !== 'false'
    }));
    return { status: 'success', data };
  },

  async saveFuenteExterna(fuente = {}) {
    await this.ensureFuentesExternasTable();
    const nombre = String(fuente.nombre || '').trim();
    const url = String(fuente.url || '').trim();
    if (!nombre) return { status: 'error', message: 'El nombre de la fuente es obligatorio.' };
    if (!validarUrlExterna(url)) {
      return { status: 'error', message: 'La dirección web debe ser una URL válida que comience por http:// o https://' };
    }

    const campoCedula = String(fuente.campo_cedula || '').trim();
    const campoNombre = String(fuente.campo_nombre || '').trim();
    const activa = fuente.activa === false || String(fuente.activa).toLowerCase() === 'false' ? 'false' : 'true';

    if (fuente.id) {
      const existing = await db.execute({ sql: "SELECT * FROM fuentes_externas WHERE id = ? LIMIT 1;", args: [String(fuente.id)] });
      if (existing.rows.length === 0) return { status: 'error', message: 'Fuente externa no encontrada.' };
      // Si no se envía una nueva API key se conserva la anterior (salvo que se pida borrarla)
      let apiKey = existing.rows[0].api_key || '';
      if (fuente.borrar_api_key) apiKey = '';
      else if (String(fuente.api_key || '').trim()) apiKey = String(fuente.api_key).trim();

      await db.execute({
        sql: "UPDATE fuentes_externas SET nombre = ?, url = ?, campo_cedula = ?, campo_nombre = ?, api_key = ?, activa = ? WHERE id = ?;",
        args: [nombre, url, campoCedula, campoNombre, apiKey, activa, String(fuente.id)]
      });
      return { status: 'success', message: 'Fuente externa actualizada correctamente.', id: fuente.id };
    }

    const id = generateUUID();
    await db.execute({
      sql: "INSERT INTO fuentes_externas (id, nombre, url, campo_cedula, campo_nombre, api_key, activa, ultima_importacion, ultimo_resultado, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);",
      args: [id, nombre, url, campoCedula, campoNombre, String(fuente.api_key || '').trim(), activa, '', '', new Date().toISOString()]
    });
    return { status: 'success', message: 'Fuente externa registrada correctamente.', id };
  },

  async deleteFuenteExterna(id) {
    await this.ensureFuentesExternasTable();
    if (!id) return { status: 'error', message: 'ID de fuente no especificado.' };
    await db.execute({ sql: "DELETE FROM fuentes_externas WHERE id = ?;", args: [String(id)] });
    return { status: 'success', message: 'Fuente externa eliminada.' };
  },

  /**
   * Descarga el JSON de la fuente externa y registra en `usuarios` las cédulas que no existan.
   * Con soloPrevisualizar = true no escribe en la base de datos (modo prueba).
   */
  async importarFuenteExterna(id, soloPrevisualizar = false) {
    await this.ensureFuentesExternasTable();
    const fRes = await db.execute({ sql: "SELECT * FROM fuentes_externas WHERE id = ? LIMIT 1;", args: [String(id || '')] });
    if (fRes.rows.length === 0) return { status: 'error', message: 'Fuente externa no encontrada.' };
    const fuente = fRes.rows[0];

    if (!validarUrlExterna(fuente.url)) {
      return { status: 'error', message: 'La URL configurada en la fuente no es válida.' };
    }

    // 1. Descargar JSON
    let json;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      const headers = { 'Accept': 'application/json' };
      if (fuente.api_key) {
        headers['Authorization'] = `Bearer ${fuente.api_key}`;
        headers['x-api-key'] = fuente.api_key;
      }
      const resp = await fetch(fuente.url, { method: 'GET', headers, signal: controller.signal });
      if (!resp.ok) throw new Error(`La fuente respondió con HTTP ${resp.status}`);
      const text = await resp.text();
      try {
        json = JSON.parse(text.replace(/^\uFEFF/, ''));
      } catch (e) {
        throw new Error('La respuesta de la fuente no es un JSON válido.');
      }
    } catch (err) {
      const msg = err.name === 'AbortError' ? 'Tiempo de espera agotado (20 s) al consultar la fuente.' : err.message;
      if (!soloPrevisualizar) await registrarResultadoFuente(fuente.id, `ERROR: ${msg}`);
      return { status: 'error', message: `No se pudo obtener datos de "${fuente.nombre}": ${msg}` };
    } finally {
      clearTimeout(timer);
    }

    // 2. Extraer registros
    const registros = extraerRegistrosJson(json);
    if (!Array.isArray(registros)) {
      const msg = 'No se encontró una lista de registros en el JSON recibido.';
      if (!soloPrevisualizar) await registrarResultadoFuente(fuente.id, `ERROR: ${msg}`);
      return { status: 'error', message: msg };
    }

    // 3. Comparar contra usuarios existentes
    const existingRes = await db.execute("SELECT cedula FROM usuarios;");
    const existentes = new Set(existingRes.rows.map(r => normalizeCedula(r.cedula)).filter(Boolean));

    const nuevos = [];
    let yaExistentes = 0;
    let invalidos = 0;
    let duplicadosEnFuente = 0;
    const vistosEnFuente = new Set();

    for (const reg of registros) {
      if (!reg || typeof reg !== 'object') { invalidos++; continue; }
      const cedula = normalizeCedula(obtenerCampo(reg, fuente.campo_cedula, CAMPOS_CEDULA));
      let nombre = String(obtenerCampo(reg, fuente.campo_nombre, CAMPOS_NOMBRE) || '').trim();
      if (!nombre && !fuente.campo_nombre) {
        const nombres = obtenerCampo(reg, '', ['nombres', 'primer_nombre', 'first_name', 'firstname']);
        const apellidos = obtenerCampo(reg, '', ['apellidos', 'apellido', 'primer_apellido', 'last_name', 'lastname']);
        nombre = [nombres, apellidos].filter(Boolean).join(' ').trim();
      }
      nombre = nombre.replace(/\s+/g, ' ').toUpperCase();

      if (!cedula || !nombre) { invalidos++; continue; }
      if (vistosEnFuente.has(cedula)) { duplicadosEnFuente++; continue; }
      vistosEnFuente.add(cedula);

      if (existentes.has(cedula)) { yaExistentes++; continue; }
      nuevos.push({ id: generateUUID(), cedula, nombre_completo: nombre });
    }

    const resumen = {
      total_recibidos: registros.length,
      nuevos: nuevos.length,
      existentes: yaExistentes,
      invalidos,
      duplicados_en_fuente: duplicadosEnFuente
    };

    if (soloPrevisualizar) {
      return {
        status: 'success',
        message: `Prueba de "${fuente.nombre}": ${registros.length} registros recibidos, ${nuevos.length} nuevos por registrar.`,
        resumen,
        muestra: nuevos.slice(0, 15)
      };
    }

    // 4. Registrar nuevos participantes
    const now = new Date().toISOString();
    const stmts = nuevos.map(u => ({
      sql: "INSERT INTO usuarios (id, cedula, nombre_completo, correo, telefono, created_at) VALUES (?, ?, ?, ?, ?, ?);",
      args: [u.id, u.cedula, u.nombre_completo, '', '', now]
    }));
    const chunkSize = 50;
    for (let i = 0; i < stmts.length; i += chunkSize) {
      await db.batch(stmts.slice(i, i + chunkSize), 'write');
    }

    const textoResultado = `${now} | Recibidos: ${resumen.total_recibidos}, Nuevos: ${resumen.nuevos}, Existentes: ${resumen.existentes}, Inválidos: ${resumen.invalidos}`;
    await registrarResultadoFuente(fuente.id, textoResultado, now);

    return {
      status: 'success',
      message: `Importación desde "${fuente.nombre}" completada. Participantes nuevos registrados: ${nuevos.length} (ya existentes: ${yaExistentes}, inválidos: ${invalidos}).`,
      resumen,
      created: nuevos
    };
  }
};

// ─── Utilidades para fuentes externas ───────────────────────────────
let fuentesTableReady = false;

const CAMPOS_CEDULA = ['cedula', 'cédula', 'ci', 'cedula_identidad', 'nro_cedula', 'numero_cedula', 'documento', 'dni', 'identificacion', 'id_number', 'document'];
const CAMPOS_NOMBRE = ['nombre_completo', 'nombrecompleto', 'nombre_apellido', 'nombres_apellidos', 'full_name', 'fullname', 'nombre', 'name'];

function validarUrlExterna(url) {
  try {
    const u = new URL(String(url || '').trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

// Busca un valor dentro del objeto: primero por la ruta indicada (admite "persona.cedula"), luego por nombres comunes
function obtenerCampo(obj, rutaPreferida, candidatos) {
  const leerRuta = (o, ruta) => String(ruta).split('.').reduce((acc, k) => {
    if (acc === undefined || acc === null || typeof acc !== 'object') return undefined;
    if (k in acc) return acc[k];
    const key = Object.keys(acc).find(x => x.toLowerCase() === k.toLowerCase());
    return key !== undefined ? acc[key] : undefined;
  }, o);

  if (rutaPreferida) {
    const v = leerRuta(obj, rutaPreferida);
    return v === undefined || v === null ? '' : String(v);
  }
  const keys = Object.keys(obj);
  for (const c of candidatos) {
    const key = keys.find(k => k.toLowerCase() === c);
    if (key !== undefined && obj[key] !== null && obj[key] !== undefined && String(obj[key]).trim() !== '') {
      return String(obj[key]);
    }
  }
  return '';
}

// Admite: [ ... ], { data: [...] }, { usuarios: [...] }, { data: { items: [...] } }, etc.
function extraerRegistrosJson(json) {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== 'object') return null;
  const preferidas = ['data', 'usuarios', 'participantes', 'estudiantes', 'personas', 'results', 'resultados', 'items', 'records', 'rows', 'registros'];
  for (const k of preferidas) {
    if (Array.isArray(json[k])) return json[k];
  }
  for (const k of preferidas) {
    if (json[k] && typeof json[k] === 'object') {
      const inner = extraerRegistrosJson(json[k]);
      if (inner) return inner;
    }
  }
  const primerArray = Object.values(json).find(v => Array.isArray(v));
  return primerArray || null;
}

async function registrarResultadoFuente(id, texto, fecha = null) {
  try {
    if (fecha) {
      await db.execute({ sql: "UPDATE fuentes_externas SET ultimo_resultado = ?, ultima_importacion = ? WHERE id = ?;", args: [texto, fecha, String(id)] });
    } else {
      await db.execute({ sql: "UPDATE fuentes_externas SET ultimo_resultado = ? WHERE id = ?;", args: [texto, String(id)] });
    }
  } catch (e) {
    console.warn('No se pudo registrar el resultado de la fuente externa:', e.message);
  }
}

module.exports = services;
