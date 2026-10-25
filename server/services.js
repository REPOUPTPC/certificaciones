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

  async updateConfiguracion(clave, valor) {
    await db.execute({
      sql: "UPDATE configuracion SET valor = ?, updated_at = datetime('now') WHERE UPPER(clave) = UPPER(?);",
      args: [String(valor), String(clave)]
    });
    return { status: 'success', message: `Configuración ${clave} actualizada` };
  }
};

module.exports = services;
