const db = require('./db');
const { uploadBase64Image, uploadBrochurePdf, getBrochureStatus, deleteObjectFromR2 } = require('./storage');
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
  curso_ofertado: ['id', 'taller', 'descripcion', 'valor_estudiante', 'valor_foraneo', 'flayer', 'curso_id', 'created_at'],
  banco: ['id', 'banco', 'created_at'],
  pagos: ['id', 'id_usuario', 'id_curso_ofertado', 'banco_origen', 'monto', 'numero_transferencia', 'fecha_pago', 'fecha_curso', 'capture', 'status', 'created_at'],
  configuracion: ['id', 'clave', 'valor', 'descripcion', 'categoria', 'updated_at'],
  presets_imagenes: ['id', 'nombre', 'categoria', 'url', 'descripcion', 'ancho_sugerido', 'alto_sugerido', 'created_at']
};

let ofertasPagosColumnsReady = false;

async function ensureOfertasPagosColumns() {
  if (ofertasPagosColumnsReady) return;
  try { await db.execute("ALTER TABLE curso_ofertado ADD COLUMN curso_id TEXT;"); } catch (e) {}
  try { await db.execute("ALTER TABLE pagos ADD COLUMN fecha_curso TEXT;"); } catch (e) {}
  ofertasPagosColumnsReady = true;
}

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

function normalizeCursoOfertadoId(val) {
  if (val === undefined || val === null) return null;
  const str = String(val).trim();
  if (!str) return null;
  if (/^\d+(\.0+)?$/.test(str)) {
    return String(parseInt(str, 10));
  }
  return str;
}

function normalizarTextoComparacion(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function isNombreGenericoParticipante(nombre) {
  const n = String(nombre || '').trim();
  if (!n) return true;
  return /^PARTICIPANTE(\s|$)/i.test(n);
}

function extraerNombreParticipante(obj) {
  if (!obj || typeof obj !== 'object') return '';
  const candidatos = [
    obj.nombre_completo,
    obj.nombre_del_participante,
    obj.nombre_participante,
    obj.nombres_y_apellidos,
    obj.nombre_apellido,
    obj.participante,
    obj.nombre,
    obj.usuario
  ];
  for (const c of candidatos) {
    if (c !== undefined && c !== null) {
      const limpio = String(c).replace(/\s+/g, ' ').trim().toUpperCase();
      if (limpio && !isNombreGenericoParticipante(limpio)) {
        return limpio;
      }
    }
  }
  const nombres = String(obj.nombres || obj.primer_nombre || '').replace(/\s+/g, ' ').trim();
  const apellidos = String(obj.apellidos || obj.apellido || obj.primer_apellido || '').replace(/\s+/g, ' ').trim();
  const combinado = [nombres, apellidos].filter(Boolean).join(' ').toUpperCase();
  if (combinado && !isNombreGenericoParticipante(combinado)) {
    return combinado;
  }
  return '';
}

function normalizarFechaIso(val) {
  if (val === undefined || val === null) return '';
  const str = String(val).trim();
  if (!str) return '';

  const buildIso = (y, m, d) => {
    let year = parseInt(y, 10);
    let month = parseInt(m, 10);
    let day = parseInt(d, 10);
    if (isNaN(year) || isNaN(month) || isNaN(day)) return '';
    if (year < 100) year += 2000;
    if (month > 12 && day <= 12) {
      const tmp = month;
      month = day;
      day = tmp;
    }
    if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return '';
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  // Formato ISO: YYYY-MM-DD o YYYY/MM/DD (con o sin hora)
  const mIso = str.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?:\D|$)/);
  if (mIso) {
    return buildIso(mIso[1], mIso[2], mIso[3]);
  }

  // Formato Latino / Excel (4 o 2 dígitos de año, con o sin hora): DD/MM/YYYY, DD-MM-YY, etc.
  const mLat = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2}|\d{4})(?:\D|$)/);
  if (mLat) {
    return buildIso(mLat[3], mLat[2], mLat[1]);
  }

  // Formato con nombre de mes en español: "30-oct-2026", "30 de octubre de 2026"
  const mesesMap = {
    ene: 1, enero: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, abr: 4, abril: 4,
    may: 5, mayo: 5, jun: 6, junio: 6, jul: 7, julio: 7, ago: 8, agosto: 8,
    sep: 9, sept: 9, septiembre: 9, setiembre: 9, oct: 10, octubre: 10,
    nov: 11, noviembre: 11, dic: 12, diciembre: 12
  };
  const mTxt = str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .match(/^(\d{1,2})[\s\/\-.]+(?:de\s+)?([a-z]+)[\s\/\-.]+(?:de\s+|del\s+)?(\d{2}|\d{4})\b/);
  if (mTxt && mesesMap[mTxt[2]]) {
    return buildIso(mTxt[3], mesesMap[mTxt[2]], mTxt[1]);
  }

  return '';
}

function generarTextoLugar(fechaStr) {
  const meses = ['ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO', 'SEPTIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE'];
  const norm = normalizarFechaIso(fechaStr);
  let d;
  if (norm) {
    const partes = norm.split('-');
    d = new Date(parseInt(partes[0], 10), parseInt(partes[1], 10) - 1, parseInt(partes[2], 10));
  } else {
    d = new Date();
  }
  if (isNaN(d.getTime())) d = new Date();
  return `PUERTO CABELLO ${String(d.getDate()).padStart(2, '0')} DE ${meses[d.getMonth()]} DE ${d.getFullYear()}`;
}

function isPagoAprobado(status) {
  if (status === true || status === 1) return true;
  const s = String(status || '').trim().toLowerCase();
  return s === 'true' || s === '1' || s === 'aprobado' || s === 'confirmado';
}

async function resolverOfertaYCursoAcademico(idCursoOfertado) {
  await ensureOfertasPagosColumns();
  const [ofertasRes, cursosRes] = await Promise.all([
    db.execute("SELECT * FROM curso_ofertado;"),
    db.execute("SELECT * FROM cursos;")
  ]);
  const ofertas = ofertasRes.rows || [];
  const cursos = cursosRes.rows || [];

  let oferta = null;
  const rawStr = idCursoOfertado !== undefined && idCursoOfertado !== null ? String(idCursoOfertado).trim() : '';

  if (rawStr) {
    oferta = ofertas.find(o => String(o.id).trim() === rawStr) || null;
    if (!oferta && /^\d+(\.0+)?$/.test(rawStr)) {
      const intVal = parseInt(rawStr, 10);
      oferta = ofertas.find(o => {
        const oid = String(o.id || '').trim();
        return (/^\d+(\.0+)?$/.test(oid) && parseInt(oid, 10) === intVal) || parseInt(oid, 10) === intVal;
      }) || null;
    }
  }

  let curso = null;
  if (oferta && oferta.curso_id) {
    const targetCursoId = String(oferta.curso_id).trim();
    curso = cursos.find(c => String(c.id).trim() === targetCursoId) || null;
  }
  if (!curso && oferta && oferta.taller) {
    const normTaller = normalizarTextoComparacion(oferta.taller);
    if (normTaller) {
      curso = cursos.find(c => normalizarTextoComparacion(c.nombre) === normTaller) || null;
    }
  }
  if (!oferta && !curso && rawStr) {
    curso = cursos.find(c => String(c.id).trim() === rawStr) || null;
  }

  return { oferta, curso };
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
    if (table === 'curso_ofertado' || table === 'pagos') {
      await ensureOfertasPagosColumns();
    }
    const res = await db.execute(`SELECT * FROM ${table};`);
    return { status: 'success', data: res.rows };
  },

  async getAllData() {
    await ensureOfertasPagosColumns();
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
    if (table === 'curso_ofertado' || table === 'pagos') {
      await ensureOfertasPagosColumns();
    }
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
    if (table === 'curso_ofertado' || table === 'pagos') {
      await ensureOfertasPagosColumns();
    }
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
        data.id_curso_ofertado = normalizeCursoOfertadoId(data.id_curso_ofertado);
      }
      if (data.fecha_curso !== undefined && data.fecha_curso !== null) {
        data.fecha_curso = normalizarFechaIso(data.fecha_curso);
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
    if (table === 'curso_ofertado' || table === 'pagos') {
      await ensureOfertasPagosColumns();
    }
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
        data.id_curso_ofertado = normalizeCursoOfertadoId(data.id_curso_ofertado);
      }
      if (data.fecha_curso !== undefined && data.fecha_curso !== null) {
        data.fecha_curso = normalizarFechaIso(data.fecha_curso);
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

  async uploadBrochure(pdfData, filename) {
    return await uploadBrochurePdf(pdfData, filename);
  },

  async getBrochureInfo() {
    return await getBrochureStatus();
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
    await ensureOfertasPagosColumns();
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

    const nombreRealRecibido = extraerNombreParticipante(pagoData);

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
      if (nombreRealRecibido && isNombreGenericoParticipante(nombreUsuario)) {
        await db.execute({
          sql: "UPDATE usuarios SET nombre_completo = ? WHERE id = ?;",
          args: [nombreRealRecibido, usuarioId]
        });
        nombreUsuario = nombreRealRecibido;
      }
    } else {
      usuarioId = generateUUID();
      nombreUsuario = nombreRealRecibido || `PARTICIPANTE ${cedulaNorm}`;
      const correo = String(pagoData.correo || pagoData.email || '').trim().toLowerCase();
      const telefono = String(pagoData.telefono || pagoData.celular || '').trim();
      const createdAt = new Date().toISOString();

      await db.execute({
        sql: "INSERT INTO usuarios (id, cedula, nombre_completo, correo, telefono, created_at) VALUES (?, ?, ?, ?, ?, ?);",
        args: [usuarioId, cedulaNorm, nombreUsuario, correo, telefono, createdAt]
      });
    }

    // Resolver curso_ofertado
    let cursoId = normalizeCursoOfertadoId(pagoData.id_curso_ofertado || pagoData.curso_id || null);
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
    const fechaPago = normalizarFechaIso(pagoData.fecha_pago || pagoData.fecha) || new Date().toISOString().split('T')[0];
    const fechaCurso = normalizarFechaIso(pagoData.fecha_curso || pagoData.fecha_emision || '');
    const capture = String(pagoData.capture || pagoData.comprobante_url || '').trim();
    const nuevoPagoId = generateUUID();
    const now = new Date().toISOString();

    // Guardar pago con status 'false' (PENDIENTE)
    await db.execute({
      sql: "INSERT INTO pagos (id, id_usuario, id_curso_ofertado, banco_origen, monto, numero_transferencia, fecha_pago, fecha_curso, capture, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);",
      args: [nuevoPagoId, usuarioId, cursoId, banco, monto, numRef, fechaPago, fechaCurso, capture, 'false', now]
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
        fecha_curso: fechaCurso,
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
    await ensureOfertasPagosColumns();
    if (!Array.isArray(pagosArray) || pagosArray.length === 0) {
      return { status: 'error', message: 'No se recibieron pagos para procesar en lote' };
    }
    // Por defecto, los participantes inexistentes se registran automáticamente con su cédula y nombre
    const crearUsuariosNuevos = opciones.crearUsuariosNuevos !== false && String(opciones.crearUsuariosNuevos).toLowerCase() !== 'false';
    const evitarDuplicados = opciones.evitarDuplicados !== false && String(opciones.evitarDuplicados).toLowerCase() !== 'false';
    const omitidos = [];
    let usuariosActualizados = 0;
    let pagosActualizados = 0;
    let duplicadosOmitidos = 0;

    const [existingUsersRes, ofertasRes, existingPagosRes] = await Promise.all([
      db.execute("SELECT id, cedula, nombre_completo, correo, telefono FROM usuarios;"),
      db.execute("SELECT id, taller FROM curso_ofertado;"),
      db.execute("SELECT id, id_usuario, id_curso_ofertado, monto, numero_transferencia, fecha_pago, fecha_curso, status FROM pagos;")
    ]);

    const usersByCedula = new Map();
    for (const u of existingUsersRes.rows) {
      const norm = normalizeCedula(u.cedula);
      if (norm) usersByCedula.set(norm, u);
    }

    const ofertasList = ofertasRes.rows;
    const primerCursoId = ofertasList[0]?.id || null;

    const pagosExistentes = (existingPagosRes.rows || []).map(p => ({ ...p }));

    const stmts = [];
    const created = [];
    const usuariosNuevosList = [];
    const usuariosReparadosList = [];
    const pagosActualizadosList = [];
    const usuariosNuevosStmts = [];

    for (const item of pagosArray) {
      const rawCed = item.cedula || item.ci || item.documento || '';
      const normCed = normalizeCedula(rawCed);
      if (!normCed) continue;

      let usr = usersByCedula.get(normCed);
      let usrId = '';
      let usrNombre = '';

      const nombreReal = extraerNombreParticipante(item);

      if (usr) {
        usrId = usr.id;
        usrNombre = usr.nombre_completo;
        // Si el participante fue creado antes con un nombre genérico (PARTICIPANTE V-...), se repara con el nombre real del CSV
        if (nombreReal && isNombreGenericoParticipante(usrNombre)) {
          usuariosNuevosStmts.push({
            sql: "UPDATE usuarios SET nombre_completo = ? WHERE id = ?;",
            args: [nombreReal, usrId]
          });
          const updatedUsr = { ...usr, id: usrId, cedula: normCed, nombre_completo: nombreReal };
          usersByCedula.set(normCed, updatedUsr);
          usuariosReparadosList.push(updatedUsr);
          usrNombre = nombreReal;
          usuariosActualizados++;
        }
      } else if (!crearUsuariosNuevos) {
        omitidos.push({ cedula: normCed, motivo: 'Participante no registrado en el sistema' });
        continue;
      } else {
        usrId = generateUUID();
        usrNombre = nombreReal || `PARTICIPANTE ${normCed}`;
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
        usuariosNuevosList.push(nuevoUsrObj);
      }

      let cursoId = normalizeCursoOfertadoId(item.id_curso_ofertado || item.curso_id || null);
      if (!cursoId && item.curso_ofertado) {
        const match = ofertasList.find(o =>
          normalizarTextoComparacion(o.taller).includes(normalizarTextoComparacion(item.curso_ofertado)) ||
          String(o.id) === String(item.curso_ofertado)
        );
        if (match) cursoId = String(match.id);
      }
      if (!cursoId) cursoId = primerCursoId ? String(primerCursoId) : null;

      const monto = parseFloat(item.monto || 0) || 0;
      const rawRefInput = String(item.numero_transferencia || item.referencia || '').trim();
      const tieneRefExplicita = Boolean(rawRefInput) && !/^CSV-/i.test(rawRefInput);
      const ref = rawRefInput || `CSV-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 900 + 100)}`;
      const banco = String(item.banco_origen || item.banco || 'Pago Móvil / Transferencia').trim();
      const fecha = normalizarFechaIso(item.fecha_pago || item.fecha) || new Date().toISOString().split('T')[0];
      const fechaCurso = normalizarFechaIso(item.fecha_curso || item.fecha_emision || '');
      const capture = String(item.capture || item.comprobante || item.comprobante_url || '').trim();

      if (evitarDuplicados) {
        const refNorm = ref.toUpperCase();
        const refSinCeros = /^\d{4,}$/.test(refNorm) ? refNorm.replace(/^0+/, '') : '';
        const cursoIdNorm = normalizeCursoOfertadoId(cursoId);
        const pagoDuplicado = pagosExistentes.find(p => {
          if (String(p.id_usuario) !== String(usrId)) return false;
          const pCursoNorm = normalizeCursoOfertadoId(p.id_curso_ofertado);
          const mismoCurso = !cursoIdNorm || !pCursoNorm || String(pCursoNorm) === String(cursoIdNorm);
          if (!mismoCurso) return false;

          const pRefNorm = String(p.numero_transferencia || '').trim().toUpperCase();
          const pRefSinCeros = /^\d{4,}$/.test(pRefNorm) ? pRefNorm.replace(/^0+/, '') : '';
          if (tieneRefExplicita && pRefNorm) {
            if (pRefNorm === refNorm) return true;
            if (refSinCeros && pRefSinCeros && refSinCeros === pRefSinCeros) return true;
          }
          if (!tieneRefExplicita && Math.abs((parseFloat(p.monto || 0) || 0) - monto) < 0.01) {
            if (String(p.fecha_pago || '').slice(0, 10) === fecha) return true;
            if (/^CSV-/i.test(pRefNorm) && !isPagoAprobado(p.status)) return true;
          }
          return false;
        });

        if (pagoDuplicado) {
          duplicadosOmitidos++;
          if (fechaCurso && String(pagoDuplicado.fecha_curso || '').trim() !== fechaCurso) {
            stmts.push({
              sql: "UPDATE pagos SET fecha_curso = ? WHERE id = ?;",
              args: [fechaCurso, pagoDuplicado.id]
            });
            pagoDuplicado.fecha_curso = fechaCurso;
            pagosActualizados++;
            pagosActualizadosList.push({ id: pagoDuplicado.id, fecha_curso: fechaCurso });
          }
          continue;
        }
      }

      const pagoId = generateUUID();
      const createdAt = new Date().toISOString();

      stmts.push({
        sql: "INSERT INTO pagos (id, id_usuario, id_curso_ofertado, banco_origen, monto, numero_transferencia, fecha_pago, fecha_curso, capture, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);",
        args: [pagoId, usrId, cursoId, banco, monto, ref, fecha, fechaCurso, capture, 'false', createdAt]
      });

      const nuevoPago = {
        id: pagoId,
        id_usuario: usrId,
        cedula: normCed,
        nombre_completo: usrNombre,
        id_curso_ofertado: cursoId,
        banco_origen: banco,
        monto,
        numero_transferencia: ref,
        fecha_pago: fecha,
        fecha_curso: fechaCurso,
        capture,
        status: 'PENDIENTE',
        created_at: createdAt
      };
      created.push(nuevoPago);
      pagosExistentes.push(nuevoPago);
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

    const usuariosCreados = usuariosNuevosList.length;
    const partesMsg = [];
    if (created.length > 0) {
      partesMsg.push(`Pagos nuevos registrados (PENDIENTE): ${created.length}`);
    }
    if (usuariosCreados > 0) {
      partesMsg.push(`Participantes nuevos creados: ${usuariosCreados}`);
    }
    if (usuariosActualizados > 0) {
      partesMsg.push(`Nombres genéricos reparados con nombre real: ${usuariosActualizados}`);
    }
    if (pagosActualizados > 0) {
      partesMsg.push(`Fechas de curso actualizadas en pagos previos: ${pagosActualizados}`);
    }
    if (duplicadosOmitidos > 0) {
      partesMsg.push(`Pagos ya existentes no duplicados: ${duplicadosOmitidos}`);
    }
    if (omitidos.length > 0) {
      partesMsg.push(`Omitidos (participante inexistente): ${omitidos.length}`);
    }

    const message = partesMsg.length > 0
      ? `Proceso completado. ${partesMsg.join(' | ')}.`
      : 'Proceso completado sin cambios nuevos.';

    return {
      status: 'success',
      message,
      count: created.length,
      pagosActualizados,
      duplicadosOmitidos,
      usuariosCreados,
      usuariosActualizados,
      usuariosNuevos: usuariosNuevosList,
      usuariosReparados: usuariosReparadosList,
      pagosActualizadosList,
      omitidos,
      data: created
    };
  },

  async aprobarPago(pagoId, opciones = {}, ejecutadoPor = 'ADMIN') {
    await ensureOfertasPagosColumns();
    if (!pagoId) {
      return { status: 'error', message: 'ID de pago no especificado.' };
    }

    const pagoRes = await db.execute({
      sql: "SELECT * FROM pagos WHERE id = ? LIMIT 1;",
      args: [String(pagoId)]
    });
    if (pagoRes.rows.length === 0) {
      return { status: 'error', message: 'No se encontró el registro de pago.' };
    }
    const pago = pagoRes.rows[0];

    const userRes = await db.execute({
      sql: "SELECT * FROM usuarios WHERE id = ? LIMIT 1;",
      args: [String(pago.id_usuario || '')]
    });
    if (userRes.rows.length === 0) {
      return { status: 'error', message: 'No se encontró el participante asociado a este pago.' };
    }

    const usuarioActual = { ...userRes.rows[0] };
    const nombreCorregido = extraerNombreParticipante(opciones);
    let usuarioNombreActualizado = false;

    if (nombreCorregido && nombreCorregido !== String(usuarioActual.nombre_completo || '').trim().toUpperCase()) {
      await db.execute({
        sql: "UPDATE usuarios SET nombre_completo = ? WHERE id = ?;",
        args: [nombreCorregido, String(usuarioActual.id)]
      });
      usuarioActual.nombre_completo = nombreCorregido;
      usuarioNombreActualizado = true;
    }

    // Candado de seguridad: impedir aprobar/certificar con nombre genérico PARTICIPANTE V-...
    if (isNombreGenericoParticipante(usuarioActual.nombre_completo)) {
      return {
        status: 'error',
        code: 'NOMBRE_GENERICO',
        message: `El participante (${usuarioActual.cedula}) aún tiene asignado un nombre genérico ("${usuarioActual.nombre_completo}"). Ingrese su nombre completo real para aprobar el pago y liberar el certificado.`
      };
    }

    const { oferta, curso } = await resolverOfertaYCursoAcademico(pago.id_curso_ofertado);

    const fechaCurso = normalizarFechaIso(opciones.fecha_curso) ||
      normalizarFechaIso(pago.fecha_curso) ||
      normalizarFechaIso(curso?.fecha_curso) ||
      new Date().toISOString().split('T')[0];

    await db.execute({
      sql: "UPDATE pagos SET status = 'APROBADO', fecha_curso = ? WHERE id = ?;",
      args: [fechaCurso, String(pagoId)]
    });

    if (!curso) {
      const nombreTallerRef = oferta?.taller || 'Taller sin vincular';
      return {
        status: 'success',
        pagoAprobado: true,
        certificadoEmitido: false,
        sinCursoVinculado: true,
        fecha_curso: fechaCurso,
        usuarioId: usuarioActual.id,
        usuarioNombre: usuarioActual.nombre_completo,
        usuarioCedula: usuarioActual.cedula,
        usuarioNombreActualizado,
        warning: `El pago fue aprobado, pero el taller "${nombreTallerRef}" aún no está vinculado a un Curso Académico en #cursos. Vincúlelo en Talleres Ofertados o cree el curso en #cursos para emitir el certificado.`,
        message: `Pago aprobado correctamente. Aviso: falta vincular el curso "${nombreTallerRef}" en Gestión de Cursos (#cursos) para emitir el certificado.`
      };
    }

    const existingCertRes = await db.execute({
      sql: "SELECT * FROM certificados WHERE usuario_id = ? AND curso_id = ? LIMIT 1;",
      args: [String(usuarioActual.id), String(curso.id)]
    });

    if (existingCertRes.rows.length > 0) {
      const certExistente = existingCertRes.rows[0];
      return {
        status: 'success',
        pagoAprobado: true,
        certificadoEmitido: false,
        yaExistiaCertificado: true,
        certificado: certExistente,
        cursoId: curso.id,
        cursoNombre: curso.nombre,
        fecha_curso: fechaCurso,
        usuarioId: usuarioActual.id,
        usuarioNombre: usuarioActual.nombre_completo,
        usuarioCedula: usuarioActual.cedula,
        usuarioNombreActualizado,
        message: `Pago aprobado. El participante ${usuarioActual.nombre_completo} ya poseía el certificado emitido (${certExistente.codigo}) para "${curso.nombre}".`
      };
    }

    const existingCodesRes = await db.execute("SELECT codigo FROM certificados;");
    const existingCodes = new Set((existingCodesRes.rows || []).map(r => String(r.codigo || '').trim().toUpperCase()));
    const codigo = generateUniqueCode(existingCodes);

    const lugar = String(opciones.lugar || '').trim() || generarTextoLugar(fechaCurso);
    const tomo = String(opciones.tomo || '').trim();
    const folio = String(opciones.folio || '').trim();
    const prefijoCurso = curso.matricula_prefijo || '';
    const matricula = generarMatricula(prefijoCurso, fechaCurso, usuarioActual.cedula) || '';
    const createdAt = new Date().toISOString();

    const newCert = {
      id: generateUUID(),
      usuario_id: String(usuarioActual.id),
      curso_id: String(curso.id),
      codigo,
      fecha_curso: fechaCurso,
      lugar,
      tomo,
      folio,
      matricula,
      created_at: createdAt
    };

    await db.execute({
      sql: "INSERT INTO certificados (id, usuario_id, curso_id, codigo, fecha_curso, lugar, tomo, folio, matricula, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);",
      args: [
        newCert.id,
        newCert.usuario_id,
        newCert.curso_id,
        newCert.codigo,
        newCert.fecha_curso,
        newCert.lugar,
        newCert.tomo,
        newCert.folio,
        newCert.matricula,
        newCert.created_at
      ]
    });

    return {
      status: 'success',
      pagoAprobado: true,
      certificadoEmitido: true,
      certificado: newCert,
      cursoId: curso.id,
      cursoNombre: curso.nombre,
      fecha_curso: fechaCurso,
      usuarioId: usuarioActual.id,
      usuarioNombre: usuarioActual.nombre_completo,
      usuarioCedula: usuarioActual.cedula,
      usuarioNombreActualizado,
      ejecutadoPor: String(ejecutadoPor || 'ADMIN'),
      message: `Pago aprobado y certificado ${newCert.codigo} liberado automáticamente para ${usuarioActual.nombre_completo}.`
    };
  },

  async revertirPago(pagoId, opciones = {}, ejecutadoPor = 'ADMIN') {
    await ensureOfertasPagosColumns();
    if (!pagoId) {
      return { status: 'error', message: 'ID de pago no especificado.' };
    }

    const pagoRes = await db.execute({
      sql: "SELECT * FROM pagos WHERE id = ? LIMIT 1;",
      args: [String(pagoId)]
    });
    if (pagoRes.rows.length === 0) {
      return { status: 'error', message: 'No se encontró el registro de pago.' };
    }
    const pago = pagoRes.rows[0];
    const wasAprobado = isPagoAprobado(pago.status);
    const eliminarPago = Boolean(opciones.eliminarPago);

    let certificadoAnulado = false;
    let codigoAnulado = '';
    let certificadoAnuladoId = '';
    let auditRecord = null;

    if (wasAprobado && pago.id_usuario) {
      const { oferta, curso } = await resolverOfertaYCursoAcademico(pago.id_curso_ofertado);
      if (curso) {
        // Verificar si el participante tiene otro pago APROBADO distinto para el mismo taller/curso
        const otrosPagosRes = await db.execute({
          sql: "SELECT id, id_curso_ofertado, status FROM pagos WHERE id_usuario = ? AND id != ?;",
          args: [String(pago.id_usuario), String(pagoId)]
        });
        let tieneOtroPagoAprobadoMismoCurso = false;
        for (const op of (otrosPagosRes.rows || [])) {
          if (!isPagoAprobado(op.status)) continue;
          if (String(op.id_curso_ofertado || '') === String(pago.id_curso_ofertado || '')) {
            tieneOtroPagoAprobadoMismoCurso = true;
            break;
          }
          const relOp = await resolverOfertaYCursoAcademico(op.id_curso_ofertado);
          if (relOp.curso && String(relOp.curso.id) === String(curso.id)) {
            tieneOtroPagoAprobadoMismoCurso = true;
            break;
          }
        }

        if (!tieneOtroPagoAprobadoMismoCurso) {
          const certRes = await db.execute({
            sql: "SELECT * FROM certificados WHERE usuario_id = ? AND curso_id = ? LIMIT 1;",
            args: [String(pago.id_usuario), String(curso.id)]
          });
          if (certRes.rows.length > 0) {
            const cert = certRes.rows[0];
            const userRes = await db.execute({
              sql: "SELECT cedula, nombre_completo FROM usuarios WHERE id = ? LIMIT 1;",
              args: [String(pago.id_usuario)]
            });
            const usr = userRes.rows[0] || {};
            const nowIso = new Date().toISOString();
            const motivo = String(opciones.motivo || '').trim() ||
              (eliminarPago
                ? `Eliminación de pago aprobado (Ref: ${pago.numero_transferencia || 'S/R'})`
                : `Reversión de pago aprobado a estado PENDIENTE (Ref: ${pago.numero_transferencia || 'S/R'})`);

            auditRecord = {
              id: generateUUID(),
              certificado_id: String(cert.id),
              codigo: String(cert.codigo || ''),
              cedula: String(usr.cedula || ''),
              nombre_completo: String(usr.nombre_completo || ''),
              curso_id: String(curso.id),
              nombre_curso: String(curso.nombre || oferta?.taller || ''),
              motivo_eliminacion: motivo,
              eliminado_por: String(ejecutadoPor || 'ADMIN'),
              fecha_eliminacion: nowIso,
              created_at: nowIso
            };

            await db.execute({
              sql: `INSERT INTO certificados_eliminados (id, certificado_id, codigo, cedula, nombre_completo, curso_id, nombre_curso, motivo_eliminacion, eliminado_por, fecha_eliminacion, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);`,
              args: [
                auditRecord.id,
                auditRecord.certificado_id,
                auditRecord.codigo,
                auditRecord.cedula,
                auditRecord.nombre_completo,
                auditRecord.curso_id,
                auditRecord.nombre_curso,
                auditRecord.motivo_eliminacion,
                auditRecord.eliminado_por,
                auditRecord.fecha_eliminacion,
                auditRecord.created_at
              ]
            });

            await db.execute({
              sql: "DELETE FROM certificados WHERE id = ?;",
              args: [String(cert.id)]
            });

            certificadoAnulado = true;
            codigoAnulado = auditRecord.codigo;
            certificadoAnuladoId = String(cert.id);
          }
        }
      }
    }

    if (eliminarPago) {
      await db.execute({
        sql: "DELETE FROM pagos WHERE id = ?;",
        args: [String(pagoId)]
      });
    } else {
      await db.execute({
        sql: "UPDATE pagos SET status = 'PENDIENTE' WHERE id = ?;",
        args: [String(pagoId)]
      });
    }

    let message = eliminarPago
      ? 'Declaración de pago eliminada correctamente.'
      : 'El pago ha sido revertido a estado PENDIENTE.';
    if (certificadoAnulado) {
      message += ` Se anuló automáticamente el certificado ${codigoAnulado} (registrado en certificados_eliminados).`;
    }

    return {
      status: 'success',
      pagoId: String(pagoId),
      pagoRevertido: !eliminarPago,
      pagoEliminado: eliminarPago,
      certificadoAnulado,
      codigoAnulado,
      certificadoAnuladoId,
      auditRecord,
      message
    };
  },

  async configurarFechaEmisionPagos(pagoIds, fechaCurso, opciones = {}, ejecutadoPor = 'ADMIN') {
    await ensureOfertasPagosColumns();
    const idsLimpios = Array.from(new Set(
      (Array.isArray(pagoIds) ? pagoIds : [])
        .map(id => String(id || '').trim())
        .filter(Boolean)
    ));

    if (idsLimpios.length === 0) {
      return { status: 'error', message: 'Debe seleccionar al menos un pago para configurar la fecha de emisión.' };
    }

    const fechaNorm = normalizarFechaIso(fechaCurso);
    if (!fechaNorm) {
      return { status: 'error', message: 'Por favor indique una Fecha de Emisión válida.' };
    }

    const lugarTexto = String(opciones.lugar || '').trim() || generarTextoLugar(fechaNorm);
    const actualizarCertificadosEmitidos = opciones.actualizarCertificadosEmitidos !== false;

    const updateStmts = idsLimpios.map(id => ({
      sql: "UPDATE pagos SET fecha_curso = ? WHERE id = ?;",
      args: [fechaNorm, id]
    }));

    const chunkSize = 50;
    for (let i = 0; i < updateStmts.length; i += chunkSize) {
      await db.batch(updateStmts.slice(i, i + chunkSize), 'write');
    }

    const certificadosActualizados = [];
    if (actualizarCertificadosEmitidos) {
      const placeholders = idsLimpios.map(() => '?').join(',');
      const pagosRes = await db.execute({
        sql: `SELECT id, id_usuario, id_curso_ofertado, status FROM pagos WHERE id IN (${placeholders});`,
        args: idsLimpios
      });
      const pagosAprobados = (pagosRes.rows || []).filter(p => isPagoAprobado(p.status) && p.id_usuario);

      if (pagosAprobados.length > 0) {
        const [ofertasRes, cursosRes, certsRes, usersRes] = await Promise.all([
          db.execute("SELECT * FROM curso_ofertado;"),
          db.execute("SELECT * FROM cursos;"),
          db.execute("SELECT * FROM certificados;"),
          db.execute("SELECT id, cedula FROM usuarios;")
        ]);
        const ofertas = ofertasRes.rows || [];
        const cursos = cursosRes.rows || [];
        const certs = certsRes.rows || [];
        const usersMap = new Map((usersRes.rows || []).map(u => [String(u.id), u]));

        const certStmts = [];
        const certsVistos = new Set();

        for (const p of pagosAprobados) {
          const rawOfrId = String(p.id_curso_ofertado || '').trim();
          let ofr = ofertas.find(o => String(o.id).trim() === rawOfrId) || null;
          if (!ofr && /^\d+(\.0+)?$/.test(rawOfrId)) {
            const intId = parseInt(rawOfrId, 10);
            ofr = ofertas.find(o => /^\d+(\.0+)?$/.test(String(o.id || '').trim()) && parseInt(o.id, 10) === intId) || null;
          }
          let cur = null;
          if (ofr && ofr.curso_id) {
            cur = cursos.find(c => String(c.id).trim() === String(ofr.curso_id).trim()) || null;
          }
          if (!cur && ofr && ofr.taller) {
            const normT = normalizarTextoComparacion(ofr.taller);
            cur = cursos.find(c => normalizarTextoComparacion(c.nombre) === normT) || null;
          }
          if (!cur) continue;

          const cert = certs.find(c => String(c.usuario_id) === String(p.id_usuario) && String(c.curso_id) === String(cur.id));
          if (!cert || certsVistos.has(String(cert.id))) continue;
          certsVistos.add(String(cert.id));

          const usr = usersMap.get(String(p.id_usuario));
          const prefCurso = cur.matricula_prefijo || '';
          const autoPrev = generarMatricula(prefCurso, cert.fecha_curso, usr?.cedula || '');
          const autoNew = generarMatricula(prefCurso, fechaNorm, usr?.cedula || '');
          const nuevaMatricula = (!cert.matricula || cert.matricula === autoPrev)
            ? (autoNew || cert.matricula || '')
            : cert.matricula;

          certStmts.push({
            sql: "UPDATE certificados SET fecha_curso = ?, lugar = ?, matricula = ? WHERE id = ?;",
            args: [fechaNorm, lugarTexto, nuevaMatricula, String(cert.id)]
          });
          certificadosActualizados.push({
            id: String(cert.id),
            fecha_curso: fechaNorm,
            lugar: lugarTexto,
            matricula: nuevaMatricula
          });
        }

        if (certStmts.length > 0) {
          for (let i = 0; i < certStmts.length; i += chunkSize) {
            await db.batch(certStmts.slice(i, i + chunkSize), 'write');
          }
        }
      }
    }

    const extraMsg = certificadosActualizados.length > 0
      ? ` También se actualizó la fecha en ${certificadosActualizados.length} certificado(s) ya emitido(s).`
      : '';

    return {
      status: 'success',
      actualizados: idsLimpios.length,
      pagoIds: idsLimpios,
      fecha_curso: fechaNorm,
      lugar: lugarTexto,
      certificadosActualizados,
      ejecutadoPor: String(ejecutadoPor || 'ADMIN'),
      message: `Fecha de emisión (${fechaNorm}) configurada y registrada en ${idsLimpios.length} pago(s).${extraMsg}`
    };
  },

  async bulkAprobarPagos(pagoIds, opciones = {}, ejecutadoPor = 'ADMIN') {
    await ensureOfertasPagosColumns();
    const idsLimpios = Array.from(new Set(
      (Array.isArray(pagoIds) ? pagoIds : [])
        .map(id => String(id || '').trim())
        .filter(Boolean)
    ));

    if (idsLimpios.length === 0) {
      return { status: 'error', message: 'Debe seleccionar al menos un pago para aprobar.' };
    }

    const placeholders = idsLimpios.map(() => '?').join(',');
    const [pagosRes, usuariosRes, ofertasRes, cursosRes, certsRes] = await Promise.all([
      db.execute({ sql: `SELECT * FROM pagos WHERE id IN (${placeholders});`, args: idsLimpios }),
      db.execute("SELECT * FROM usuarios;"),
      db.execute("SELECT * FROM curso_ofertado;"),
      db.execute("SELECT * FROM cursos;"),
      db.execute("SELECT * FROM certificados;")
    ]);

    const pagosMap = new Map((pagosRes.rows || []).map(p => [String(p.id).trim(), { ...p }]));
    const pagosSeleccionados = idsLimpios.map(id => pagosMap.get(id)).filter(Boolean);

    if (pagosSeleccionados.length === 0) {
      return { status: 'error', message: 'No se encontraron los registros de pago seleccionados.' };
    }

    const usuariosMap = new Map((usuariosRes.rows || []).map(u => [String(u.id).trim(), { ...u }]));
    const ofertas = ofertasRes.rows || [];
    const cursos = cursosRes.rows || [];
    const certs = certsRes.rows || [];

    const resolverOfertaYCursoMem = (idCursoOfertado) => {
      const rawId = String(idCursoOfertado ?? '').trim();
      let oferta = null;
      if (rawId) {
        oferta = ofertas.find(o => String(o.id).trim() === rawId) || null;
        if (!oferta && /^\d+(\.0+)?$/.test(rawId)) {
          const intId = parseInt(rawId, 10);
          oferta = ofertas.find(o => {
            const oid = String(o.id || '').trim();
            return /^\d+(\.0+)?$/.test(oid) && parseInt(oid, 10) === intId;
          }) || null;
        }
      }
      let curso = null;
      if (oferta && oferta.curso_id) {
        const cid = String(oferta.curso_id).trim();
        curso = cursos.find(c => String(c.id).trim() === cid) || null;
      }
      if (!curso && oferta && oferta.taller) {
        const normTaller = normalizarTextoComparacion(oferta.taller);
        if (normTaller) {
          curso = cursos.find(c => normalizarTextoComparacion(c.nombre) === normTaller) || null;
        }
      }
      return { oferta, curso };
    };

    const stmts = [];
    const usuariosReparados = [];
    const nombresCorregidos = (opciones && opciones.nombresCorregidos && typeof opciones.nombresCorregidos === 'object')
      ? opciones.nombresCorregidos
      : {};

    // 1. Aplicar correcciones de nombres suministradas en el modal masivo
    for (const [uidRaw, nomRaw] of Object.entries(nombresCorregidos)) {
      const uid = String(uidRaw || '').trim();
      const usr = usuariosMap.get(uid);
      if (!usr) continue;
      const limpio = extraerNombreParticipante({ nombre_completo: nomRaw });
      if (limpio && limpio !== String(usr.nombre_completo || '').trim().toUpperCase()) {
        usr.nombre_completo = limpio;
        stmts.push({
          sql: "UPDATE usuarios SET nombre_completo = ? WHERE id = ?;",
          args: [limpio, uid]
        });
        usuariosReparados.push({ id: uid, cedula: usr.cedula, nombre_completo: limpio });
      }
    }

    // 2. Validar candado NOMBRE_GENERICO y fechas de emisión en todos los pagos seleccionados
    const pendientesNombre = [];
    const usuariosGenVistos = new Set();
    const respetarIndividuales = Boolean(opciones.respetarFechasIndividuales);
    const fechaGlobalOpt = normalizarFechaIso(opciones.fecha_curso);
    const pagosSinFecha = [];

    for (const p of pagosSeleccionados) {
      const usr = usuariosMap.get(String(p.id_usuario || '').trim());
      if (!usr) {
        return { status: 'error', message: `No se encontró el participante asociado al pago Ref. ${p.numero_transferencia || p.id}.` };
      }
      if (isNombreGenericoParticipante(usr.nombre_completo)) {
        if (!usuariosGenVistos.has(String(usr.id))) {
          usuariosGenVistos.add(String(usr.id));
          pendientesNombre.push({
            usuario_id: String(usr.id),
            cedula: String(usr.cedula || ''),
            nombre_actual: String(usr.nombre_completo || '')
          });
        }
      }

      const { oferta, curso } = resolverOfertaYCursoMem(p.id_curso_ofertado);
      const fechaFila = respetarIndividuales
        ? (normalizarFechaIso(p.fecha_curso) || normalizarFechaIso(curso?.fecha_curso) || fechaGlobalOpt)
        : (fechaGlobalOpt || normalizarFechaIso(p.fecha_curso) || normalizarFechaIso(curso?.fecha_curso));

      if (!fechaFila) {
        pagosSinFecha.push({
          pago_id: String(p.id),
          cedula: String(usr.cedula || ''),
          taller: oferta?.taller || 'Taller'
        });
      }
    }

    if (pendientesNombre.length > 0) {
      return {
        status: 'error',
        code: 'NOMBRE_GENERICO_LOTE',
        pendientesNombre,
        message: `Hay ${pendientesNombre.length} participante(s) con nombre genérico ("PARTICIPANTE ..."). Ingrese su nombre completo real para aprobar y emitir sus certificados.`
      };
    }

    if (pagosSinFecha.length > 0) {
      return {
        status: 'error',
        code: 'SIN_FECHA_EMISION',
        pagosSinFecha,
        message: `Hay ${pagosSinFecha.length} pago(s) sin Fecha de Emisión configurada. Seleccione la fecha de emisión del taller para continuar.`
      };
    }

    // 3. Aprobar pagos y generar certificados en lote
    const existingCodes = new Set(certs.map(c => String(c.codigo || '').trim().toUpperCase()).filter(Boolean));
    const certPorUsuarioCurso = new Map(
      certs.map(c => [`${String(c.usuario_id).trim()}|${String(c.curso_id).trim()}`, c])
    );

    const lugarCustom = String(opciones.lugar || '').trim();
    const tomo = String(opciones.tomo || '').trim();
    const folioRaw = String(opciones.folio || '').trim();
    const limitePorFolio = Math.max(1, parseInt(opciones.limite_por_folio, 10) || 15);

    const pagosAprobados = [];
    const certificadosEmitidos = [];
    const talleresSinVincular = new Set();
    let nuevosAprobadosCount = 0;
    let yaExistianCount = 0;
    let sinCursoVinculadoCount = 0;

    for (const p of pagosSeleccionados) {
      const usr = usuariosMap.get(String(p.id_usuario || '').trim());
      const { oferta, curso } = resolverOfertaYCursoMem(p.id_curso_ofertado);
      const wasAprob = isPagoAprobado(p.status);
      if (!wasAprob) nuevosAprobadosCount++;

      const fechaFila = respetarIndividuales
        ? (normalizarFechaIso(p.fecha_curso) || normalizarFechaIso(curso?.fecha_curso) || fechaGlobalOpt)
        : (fechaGlobalOpt || normalizarFechaIso(p.fecha_curso) || normalizarFechaIso(curso?.fecha_curso));

      stmts.push({
        sql: "UPDATE pagos SET status = 'APROBADO', fecha_curso = ? WHERE id = ?;",
        args: [fechaFila, String(p.id)]
      });
      pagosAprobados.push({
        id: String(p.id),
        status: 'APROBADO',
        fecha_curso: fechaFila
      });

      if (!curso) {
        sinCursoVinculadoCount++;
        talleresSinVincular.add(oferta?.taller || 'Taller sin vincular');
        continue;
      }

      const keyCert = `${String(usr.id).trim()}|${String(curso.id).trim()}`;
      if (certPorUsuarioCurso.has(keyCert)) {
        yaExistianCount++;
        continue;
      }

      const codigo = generateUniqueCode(existingCodes);
      existingCodes.add(codigo);

      let folioCalculado = folioRaw;
      if (folioRaw && /^\d+$/.test(folioRaw)) {
        const folioBase = parseInt(folioRaw, 10);
        const incremento = Math.floor(certificadosEmitidos.length / limitePorFolio);
        folioCalculado = String(folioBase + incremento).padStart(folioRaw.length, '0');
      }

      const lugarFila = (!respetarIndividuales && lugarCustom)
        ? lugarCustom
        : generarTextoLugar(fechaFila);
      const matricula = generarMatricula(curso.matricula_prefijo || '', fechaFila, usr.cedula) || '';
      const createdAt = new Date().toISOString();

      const newCert = {
        id: generateUUID(),
        usuario_id: String(usr.id),
        curso_id: String(curso.id),
        codigo,
        fecha_curso: fechaFila,
        lugar: lugarFila,
        tomo,
        folio: folioCalculado,
        matricula,
        created_at: createdAt
      };

      certPorUsuarioCurso.set(keyCert, newCert);
      certificadosEmitidos.push(newCert);
      stmts.push({
        sql: "INSERT INTO certificados (id, usuario_id, curso_id, codigo, fecha_curso, lugar, tomo, folio, matricula, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);",
        args: [
          newCert.id,
          newCert.usuario_id,
          newCert.curso_id,
          newCert.codigo,
          newCert.fecha_curso,
          newCert.lugar,
          newCert.tomo,
          newCert.folio,
          newCert.matricula,
          newCert.created_at
        ]
      });
    }

    const chunkSize = 50;
    for (let i = 0; i < stmts.length; i += chunkSize) {
      await db.batch(stmts.slice(i, i + chunkSize), 'write');
    }

    const partesMsg = [`${pagosAprobados.length} pago(s) aprobado(s)`];
    if (certificadosEmitidos.length > 0) {
      partesMsg.push(`${certificadosEmitidos.length} certificado(s) liberado(s) automáticamente`);
    }
    if (yaExistianCount > 0) {
      partesMsg.push(`${yaExistianCount} ya poseía(n) certificado previo`);
    }
    if (sinCursoVinculadoCount > 0) {
      partesMsg.push(`${sinCursoVinculadoCount} pendiente(s) por vincular curso en #cursos`);
    }

    const warning = sinCursoVinculadoCount > 0
      ? `Aviso: ${sinCursoVinculadoCount} pago(s) fueron aprobados, pero su taller (${Array.from(talleresSinVincular).join(', ')}) aún no está vinculado a #cursos para emitir el certificado.`
      : '';

    return {
      status: 'success',
      aprobadosCount: pagosAprobados.length,
      nuevosAprobadosCount,
      certificadosEmitidosCount: certificadosEmitidos.length,
      yaExistianCount,
      sinCursoVinculadoCount,
      talleresSinVincular: Array.from(talleresSinVincular),
      pagosAprobados,
      certificadosEmitidos,
      usuariosReparados,
      ejecutadoPor: String(ejecutadoPor || 'ADMIN'),
      warning,
      message: partesMsg.join(' • ') + '.'
    };
  },

  async bulkRevertirPagos(pagoIds, opciones = {}, ejecutadoPor = 'ADMIN') {
    await ensureOfertasPagosColumns();
    const idsLimpios = Array.from(new Set(
      (Array.isArray(pagoIds) ? pagoIds : [])
        .map(id => String(id || '').trim())
        .filter(Boolean)
    ));

    if (idsLimpios.length === 0) {
      return { status: 'error', message: 'Debe seleccionar al menos un pago.' };
    }

    const eliminarPago = Boolean(opciones.eliminarPago);
    const idsSet = new Set(idsLimpios);

    const [allPagosRes, usuariosRes, ofertasRes, cursosRes, certsRes] = await Promise.all([
      db.execute("SELECT * FROM pagos;"),
      db.execute("SELECT id, cedula, nombre_completo FROM usuarios;"),
      db.execute("SELECT * FROM curso_ofertado;"),
      db.execute("SELECT * FROM cursos;"),
      db.execute("SELECT * FROM certificados;")
    ]);

    const allPagos = allPagosRes.rows || [];
    const pagosSeleccionados = allPagos.filter(p => idsSet.has(String(p.id).trim()));

    if (pagosSeleccionados.length === 0) {
      return { status: 'error', message: 'No se encontraron los registros de pago seleccionados.' };
    }

    const pagosAprobadosEnSeleccion = pagosSeleccionados.filter(p => isPagoAprobado(p.status));
    if (!eliminarPago && pagosAprobadosEnSeleccion.length === 0) {
      return {
        status: 'error',
        message: 'Ninguno de los pagos seleccionados se encuentra APROBADO para anular su verificación.'
      };
    }

    const usuariosMap = new Map((usuariosRes.rows || []).map(u => [String(u.id).trim(), u]));
    const ofertas = ofertasRes.rows || [];
    const cursos = cursosRes.rows || [];
    const certs = certsRes.rows || [];

    const resolverOfertaYCursoMem = (idCursoOfertado) => {
      const rawId = String(idCursoOfertado ?? '').trim();
      let oferta = null;
      if (rawId) {
        oferta = ofertas.find(o => String(o.id).trim() === rawId) || null;
        if (!oferta && /^\d+(\.0+)?$/.test(rawId)) {
          const intId = parseInt(rawId, 10);
          oferta = ofertas.find(o => {
            const oid = String(o.id || '').trim();
            return /^\d+(\.0+)?$/.test(oid) && parseInt(oid, 10) === intId;
          }) || null;
        }
      }
      let curso = null;
      if (oferta && oferta.curso_id) {
        const cid = String(oferta.curso_id).trim();
        curso = cursos.find(c => String(c.id).trim() === cid) || null;
      }
      if (!curso && oferta && oferta.taller) {
        const normTaller = normalizarTextoComparacion(oferta.taller);
        if (normTaller) {
          curso = cursos.find(c => normalizarTextoComparacion(c.nombre) === normTaller) || null;
        }
      }
      return { oferta, curso };
    };

    // Pagos APROBADOS que permanecerán activos fuera de la selección actual
    const pagosAprobadosRestantes = allPagos.filter(p =>
      !idsSet.has(String(p.id).trim()) && isPagoAprobado(p.status)
    );

    const stmts = [];
    const auditRecords = [];
    const certificadosAnuladosIds = [];
    const codigosAnulados = [];
    const certsYaAnuladosSet = new Set();
    const nowIso = new Date().toISOString();

    for (const p of pagosAprobadosEnSeleccion) {
      if (!p.id_usuario) continue;
      const { curso } = resolverOfertaYCursoMem(p.id_curso_ofertado);
      if (!curso) continue;

      const tieneOtroPagoActivoMismoCurso = pagosAprobadosRestantes.some(op => {
        if (String(op.id_usuario) !== String(p.id_usuario)) return false;
        if (String(op.id_curso_ofertado || '') === String(p.id_curso_ofertado || '')) return true;
        const relOp = resolverOfertaYCursoMem(op.id_curso_ofertado);
        return Boolean(relOp.curso && String(relOp.curso.id) === String(curso.id));
      });

      if (tieneOtroPagoActivoMismoCurso) continue;

      const cert = certs.find(c =>
        String(c.usuario_id) === String(p.id_usuario) && String(c.curso_id) === String(curso.id)
      );
      if (!cert || certsYaAnuladosSet.has(String(cert.id))) continue;

      certsYaAnuladosSet.add(String(cert.id));
      const usr = usuariosMap.get(String(p.id_usuario).trim()) || {};
      const motivo = String(opciones.motivo || '').trim() ||
        (eliminarPago
          ? `Eliminación masiva de pago aprobado (Ref: ${p.numero_transferencia || 'S/R'})`
          : `Anulación masiva de verificación de pago a PENDIENTE (Ref: ${p.numero_transferencia || 'S/R'})`);

      const auditRecord = {
        id: generateUUID(),
        certificado_id: String(cert.id),
        codigo: String(cert.codigo || ''),
        cedula: String(usr.cedula || ''),
        nombre_completo: String(usr.nombre_completo || ''),
        curso_id: String(curso.id),
        nombre_curso: String(curso.nombre || ''),
        motivo_eliminacion: motivo,
        eliminado_por: String(ejecutadoPor || 'ADMIN'),
        fecha_eliminacion: nowIso,
        created_at: nowIso
      };

      auditRecords.push(auditRecord);
      certificadosAnuladosIds.push(String(cert.id));
      codigosAnulados.push(String(cert.codigo || ''));

      stmts.push({
        sql: "INSERT INTO certificados_eliminados (id, certificado_id, codigo, cedula, nombre_completo, curso_id, nombre_curso, motivo_eliminacion, eliminado_por, fecha_eliminacion, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);",
        args: [
          auditRecord.id,
          auditRecord.certificado_id,
          auditRecord.codigo,
          auditRecord.cedula,
          auditRecord.nombre_completo,
          auditRecord.curso_id,
          auditRecord.nombre_curso,
          auditRecord.motivo_eliminacion,
          auditRecord.eliminado_por,
          auditRecord.fecha_eliminacion,
          auditRecord.created_at
        ]
      });
      stmts.push({
        sql: "DELETE FROM certificados WHERE id = ?;",
        args: [String(cert.id)]
      });
    }

    const pagosObjetivosMutacion = eliminarPago ? pagosSeleccionados : pagosAprobadosEnSeleccion;
    const pagoIdsProcesados = pagosObjetivosMutacion.map(p => String(p.id));

    for (const p of pagosObjetivosMutacion) {
      if (eliminarPago) {
        stmts.push({
          sql: "DELETE FROM pagos WHERE id = ?;",
          args: [String(p.id)]
        });
      } else {
        stmts.push({
          sql: "UPDATE pagos SET status = 'PENDIENTE' WHERE id = ?;",
          args: [String(p.id)]
        });
      }
    }

    const chunkSize = 50;
    for (let i = 0; i < stmts.length; i += chunkSize) {
      await db.batch(stmts.slice(i, i + chunkSize), 'write');
    }

    const accionTxt = eliminarPago
      ? `${pagoIdsProcesados.length} pago(s) eliminado(s)`
      : `${pagoIdsProcesados.length} verificación(es) de pago revertida(s) a PENDIENTE`;
    const certTxt = auditRecords.length > 0
      ? ` y ${auditRecords.length} certificado(s) anulado(s) (registrados en certificados_eliminados)`
      : '';

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
      ejecutadoPor: String(ejecutadoPor || 'ADMIN'),
      message: `${accionTxt}${certTxt}.`
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
      campo_array TEXT,
      api_key TEXT,
      api_secret TEXT,
      descripcion TEXT,
      activa TEXT DEFAULT 'true',
      ultima_importacion TEXT,
      ultimo_resultado TEXT,
      created_at TEXT
    );`);
    try { await db.execute("ALTER TABLE fuentes_externas ADD COLUMN api_secret TEXT;"); } catch (e) {}
    try { await db.execute("ALTER TABLE fuentes_externas ADD COLUMN descripcion TEXT;"); } catch (e) {}
    try { await db.execute("ALTER TABLE fuentes_externas ADD COLUMN campo_array TEXT;"); } catch (e) {}
    fuentesTableReady = true;
  },

  async listFuentesExternas() {
    await this.ensureFuentesExternasTable();
    const res = await db.execute("SELECT * FROM fuentes_externas ORDER BY created_at ASC;");
    const data = res.rows.map(r => ({
      ...r,
      api_key: r.api_key || '',
      api_secret_masked: r.api_secret ? (r.api_secret.slice(0, 7) + '••••' + r.api_secret.slice(-4)) : '',
      tiene_api_key: Boolean(r.api_key),
      tiene_api_secret: Boolean(r.api_secret),
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
    const campoArray = String(fuente.campo_array || '').trim();
    const descripcion = String(fuente.descripcion || '').trim();
    const activa = fuente.activa === false || String(fuente.activa).toLowerCase() === 'false' ? 'false' : 'true';

    if (fuente.id) {
      const existing = await db.execute({ sql: "SELECT * FROM fuentes_externas WHERE id = ? LIMIT 1;", args: [String(fuente.id)] });
      if (existing.rows.length === 0) return { status: 'error', message: 'Fuente externa no encontrada.' };
      
      let apiKey = existing.rows[0].api_key || '';
      if (fuente.borrar_api_key) apiKey = '';
      else if (fuente.api_key !== undefined && String(fuente.api_key).trim() !== '') apiKey = String(fuente.api_key).trim();

      let apiSecret = existing.rows[0].api_secret || '';
      if (fuente.borrar_api_secret) apiSecret = '';
      else if (fuente.api_secret !== undefined && String(fuente.api_secret).trim() !== '') apiSecret = String(fuente.api_secret).trim();

      await db.execute({
        sql: "UPDATE fuentes_externas SET nombre = ?, url = ?, campo_cedula = ?, campo_nombre = ?, campo_array = ?, descripcion = ?, api_key = ?, api_secret = ?, activa = ? WHERE id = ?;",
        args: [nombre, url, campoCedula, campoNombre, campoArray, descripcion, apiKey, apiSecret, activa, String(fuente.id)]
      });
      return { status: 'success', message: 'Fuente externa actualizada correctamente.', id: fuente.id };
    }

    const id = generateUUID();
    await db.execute({
      sql: "INSERT INTO fuentes_externas (id, nombre, url, campo_cedula, campo_nombre, campo_array, descripcion, api_key, api_secret, activa, ultima_importacion, ultimo_resultado, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);",
      args: [id, nombre, url, campoCedula, campoNombre, campoArray, descripcion, String(fuente.api_key || '').trim(), String(fuente.api_secret || '').trim(), activa, '', '', new Date().toISOString()]
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
   * Ejecuta una prueba en vivo contra la fuente (usando ID existente o credenciales temporales del modal)
   */
  async testFuenteExterna(params = {}) {
    await this.ensureFuentesExternasTable();
    let fuente = { ...params };
    if (params.id) {
      const fRes = await db.execute({ sql: "SELECT * FROM fuentes_externas WHERE id = ? LIMIT 1;", args: [String(params.id)] });
      if (fRes.rows.length === 0) return { status: 'error', message: 'Fuente externa no encontrada.' };
      fuente = { ...fRes.rows[0], ...params };
      // Conservar secretos si no se enviaron en params
      if (!params.api_key && fRes.rows[0].api_key) fuente.api_key = fRes.rows[0].api_key;
      if (!params.api_secret && fRes.rows[0].api_secret) fuente.api_secret = fRes.rows[0].api_secret;
    }

    if (!validarUrlExterna(fuente.url)) {
      return { status: 'error', message: 'La dirección web ingresada no es válida (debe iniciar con http:// o https://).' };
    }

    try {
      const { json, latenciaMs } = await consultarEndpointExterno(fuente);
      const registros = extraerRegistrosJson(json, fuente.campo_array);
      if (!Array.isArray(registros)) {
        return {
          status: 'error',
          message: 'La fuente respondió correctamente (200 OK), pero no se detectó un array de estudiantes/participantes en el JSON.',
          latenciaMs,
          jsonPreview: json
        };
      }

      // Comparar contra usuarios existentes en Turso
      const existingRes = await db.execute("SELECT cedula FROM usuarios;");
      const existentes = new Set(existingRes.rows.map(r => normalizeCedula(r.cedula)).filter(Boolean));

      const listaEstudiantes = [];
      let nuevosCount = 0;
      let existentesCount = 0;
      let invalidosCount = 0;
      const vistos = new Set();

      for (const reg of registros) {
        if (!reg || typeof reg !== 'object') { invalidosCount++; continue; }
        const cedula = normalizeCedula(obtenerCampo(reg, fuente.campo_cedula, CAMPOS_CEDULA));
        let nombre = String(obtenerCampo(reg, fuente.campo_nombre, CAMPOS_NOMBRE) || '').trim();
        if (!nombre && !fuente.campo_nombre) {
          const nombres = obtenerCampo(reg, '', ['nombres', 'primer_nombre', 'first_name', 'firstname']);
          const apellidos = obtenerCampo(reg, '', ['apellidos', 'apellido', 'primer_apellido', 'last_name', 'lastname']);
          nombre = [nombres, apellidos].filter(Boolean).join(' ').trim();
        }
        nombre = nombre.replace(/\s+/g, ' ').toUpperCase();

        if (!cedula || !nombre) { invalidosCount++; continue; }
        if (vistos.has(cedula)) continue;
        vistos.add(cedula);

        const yaExiste = existentes.has(cedula);
        if (yaExiste) existentesCount++;
        else nuevosCount++;

        listaEstudiantes.push({
          cedula,
          nombre_completo: nombre,
          ya_en_bd: yaExiste
        });
      }

      return {
        status: 'success',
        message: `Conexión en vivo exitosa (${latenciaMs} ms). Se encontraron ${registros.length} registros en la fuente.`,
        latenciaMs,
        resumen: {
          total_recibidos: registros.length,
          validos: listaEstudiantes.length,
          nuevos: nuevosCount,
          existentes: existentesCount,
          invalidos: invalidosCount
        },
        estudiantes: listaEstudiantes
      };
    } catch (err) {
      return {
        status: 'error',
        message: `Fallo al conectar con la fuente externa: ${err.message}`
      };
    }
  },

  /**
   * Descarga el JSON de la fuente externa y registra en `usuarios` las cédulas que no existan.
   */
  async importarFuenteExterna(id, soloPrevisualizar = false) {
    await this.ensureFuentesExternasTable();
    const fRes = await db.execute({ sql: "SELECT * FROM fuentes_externas WHERE id = ? LIMIT 1;", args: [String(id || '')] });
    if (fRes.rows.length === 0) return { status: 'error', message: 'Fuente externa no encontrada.' };
    const fuente = fRes.rows[0];

    if (!validarUrlExterna(fuente.url)) {
      return { status: 'error', message: 'La URL configurada en la fuente no es válida.' };
    }

    // 1. Descargar JSON con headers x-api-key y x-api-secret
    let json;
    let latenciaMs = 0;
    try {
      const resp = await consultarEndpointExterno(fuente);
      json = resp.json;
      latenciaMs = resp.latenciaMs;
    } catch (err) {
      if (!soloPrevisualizar) await registrarResultadoFuente(fuente.id, `ERROR: ${err.message}`);
      return { status: 'error', message: `No se pudo obtener datos de "${fuente.nombre}": ${err.message}` };
    }

    // 2. Extraer registros
    const registros = extraerRegistrosJson(json, fuente.campo_array);
    if (!Array.isArray(registros)) {
      const msg = 'No se encontró una lista de registros en el JSON recibido.';
      if (!soloPrevisualizar) await registrarResultadoFuente(fuente.id, `ERROR: ${msg}`);
      return { status: 'error', message: msg };
    }

    // 3. Comparar contra usuarios existentes
    const existingRes = await db.execute("SELECT cedula FROM usuarios;");
    const existentes = new Set(existingRes.rows.map(r => normalizeCedula(r.cedula)).filter(Boolean));

    const nuevos = [];
    const todosProcesados = [];
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

      const yaEsta = existentes.has(cedula);
      if (yaEsta) {
        yaExistentes++;
      } else {
        nuevos.push({ id: generateUUID(), cedula, nombre_completo: nombre });
      }

      todosProcesados.push({
        cedula,
        nombre_completo: nombre,
        ya_en_bd: yaEsta
      });
    }

    const resumen = {
      total_recibidos: registros.length,
      nuevos: nuevos.length,
      existentes: yaExistentes,
      invalidos,
      duplicados_en_fuente: duplicadosEnFuente,
      latenciaMs
    };

    if (soloPrevisualizar) {
      return {
        status: 'success',
        message: `Prueba en vivo con "${fuente.nombre}": ${registros.length} registros en JSON, ${nuevos.length} nuevos por registrar.`,
        resumen,
        estudiantes: todosProcesados
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

    const textoResultado = `${now.slice(0, 19).replace('T', ' ')} | Recibidos: ${resumen.total_recibidos}, Nuevos: ${resumen.nuevos}, Ya en BD: ${resumen.existentes}`;
    await registrarResultadoFuente(fuente.id, textoResultado, now);

    return {
      status: 'success',
      message: `Importación desde "${fuente.nombre}" completada. Participantes nuevos registrados: ${nuevos.length} (ya existentes: ${yaExistentes}).`,
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

async function consultarEndpointExterno(fuente) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  const t0 = Date.now();
  try {
    const headers = {
      'Accept': 'application/json',
      'User-Agent': 'UPTPC-Certificaciones/2.0'
    };
    if (fuente.api_key) {
      headers['x-api-key'] = String(fuente.api_key).trim();
      headers['Authorization'] = `Bearer ${String(fuente.api_key).trim()}`;
    }
    if (fuente.api_secret) {
      headers['x-api-secret'] = String(fuente.api_secret).trim();
      headers['x-secret'] = String(fuente.api_secret).trim();
    }
    const resp = await fetch(fuente.url, { method: 'GET', headers, signal: controller.signal });
    const latenciaMs = Date.now() - t0;
    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`HTTP ${resp.status}: ${errText.slice(0, 150) || resp.statusText}`);
    }
    const text = await resp.text();
    let json;
    try {
      json = JSON.parse(text.replace(/^\uFEFF/, ''));
    } catch (e) {
      throw new Error('La respuesta recibida no es un formato JSON válido.');
    }
    return { ok: true, json, latenciaMs };
  } finally {
    clearTimeout(timer);
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

// Admite: [ ... ], { data: [...] }, { estudiantes: [...] }, { usuarios: [...] }, etc.
function extraerRegistrosJson(json, campoArrayPreferido = '') {
  if (Array.isArray(json)) return json;
  if (!json || typeof json !== 'object') return null;
  if (campoArrayPreferido && Array.isArray(json[campoArrayPreferido])) {
    return json[campoArrayPreferido];
  }
  const preferidas = ['estudiantes', 'data', 'usuarios', 'participantes', 'personas', 'alumnos', 'results', 'resultados', 'items', 'records', 'rows', 'registros'];
  for (const k of preferidas) {
    if (Array.isArray(json[k])) return json[k];
  }
  for (const k of preferidas) {
    if (json[k] && typeof json[k] === 'object') {
      const inner = extraerRegistrosJson(json[k], campoArrayPreferido);
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
