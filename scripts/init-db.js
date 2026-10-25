require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { createClient } = require('@libsql/client');

const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN
});

async function run() {
  console.log('=== INICIALIZANDO ESQUEMA Y TABLAS EN TURSO (LIBSQL) ===');

  const createTableStatements = [
    `CREATE TABLE IF NOT EXISTS admin (
      id TEXT PRIMARY KEY,
      usuario TEXT UNIQUE NOT NULL,
      clave TEXT NOT NULL,
      tipo TEXT DEFAULT 'ADMIN',
      status TEXT DEFAULT 'ACTIVO',
      permisos TEXT DEFAULT '*',
      created_at TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS unidades (
      id TEXT PRIMARY KEY,
      codigo TEXT UNIQUE NOT NULL,
      nombre TEXT NOT NULL,
      logo_url TEXT,
      created_at TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS firmas (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      cargo TEXT NOT NULL,
      firma TEXT,
      sello TEXT,
      created_at TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS tipo (
      id INTEGER PRIMARY KEY,
      tipo TEXT NOT NULL,
      created_at TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS usuarios (
      id TEXT PRIMARY KEY,
      cedula TEXT UNIQUE NOT NULL,
      nombre_completo TEXT NOT NULL,
      correo TEXT,
      telefono TEXT,
      created_at TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS cursos (
      id TEXT PRIMARY KEY,
      codigo_relacionado TEXT,
      nombre TEXT NOT NULL,
      contenido TEXT,
      tipo_curso TEXT,
      idtipo_curso TEXT,
      unidad_id TEXT,
      horas INTEGER DEFAULT 0,
      motivo TEXT,
      ponencias TEXT,
      idfirma1 TEXT,
      idfirma2 TEXT,
      idfirma3 TEXT,
      matricula_prefijo TEXT,
      diseno TEXT,
      fecha_curso TEXT,
      created_at TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS certificados (
      id TEXT PRIMARY KEY,
      usuario_id TEXT NOT NULL,
      curso_id TEXT NOT NULL,
      codigo TEXT UNIQUE NOT NULL,
      fecha_curso TEXT,
      lugar TEXT,
      tomo TEXT,
      folio TEXT,
      matricula TEXT,
      created_at TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS disenos (
      id TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      descripcion TEXT,
      tiro TEXT,
      retiro TEXT,
      tiro_retiro TEXT DEFAULT 'FALSE',
      activo TEXT DEFAULT 'FALSE',
      ancho INTEGER DEFAULT 1123,
      alto INTEGER DEFAULT 794,
      created_at TEXT,
      updated_at TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS consulta (
      id TEXT PRIMARY KEY,
      certificado_id TEXT,
      direccion_ip TEXT,
      fecha TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS visita_admin (
      id TEXT PRIMARY KEY,
      usuario TEXT,
      ip TEXT,
      sitio TEXT,
      fecha_hora TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS certificados_eliminados (
      id TEXT PRIMARY KEY,
      certificado_id TEXT,
      codigo TEXT,
      cedula TEXT,
      nombre_completo TEXT,
      curso_id TEXT,
      nombre_curso TEXT,
      motivo_eliminacion TEXT,
      eliminado_por TEXT,
      fecha_eliminacion TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS curso_ofertado (
      id INTEGER PRIMARY KEY,
      taller TEXT NOT NULL,
      descripcion TEXT,
      valor_estudiante REAL DEFAULT 0,
      valor_foraneo REAL DEFAULT 0,
      flayer TEXT,
      created_at TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS banco (
      id INTEGER PRIMARY KEY,
      banco TEXT NOT NULL,
      created_at TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS pagos (
      id TEXT PRIMARY KEY,
      id_usuario TEXT,
      id_curso_ofertado TEXT,
      banco_origen TEXT,
      monto REAL DEFAULT 0,
      numero_transferencia TEXT,
      fecha_pago TEXT,
      capture TEXT,
      status TEXT DEFAULT 'PENDIENTE',
      created_at TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS configuracion (
      id TEXT PRIMARY KEY,
      clave TEXT UNIQUE NOT NULL,
      valor TEXT NOT NULL,
      descripcion TEXT,
      categoria TEXT DEFAULT 'GENERAL',
      updated_at TEXT
    );`,

    // Índices de alto rendimiento
    `CREATE INDEX IF NOT EXISTS idx_cert_codigo ON certificados(codigo);`,
    `CREATE INDEX IF NOT EXISTS idx_cert_usuario ON certificados(usuario_id);`,
    `CREATE INDEX IF NOT EXISTS idx_cert_curso ON certificados(curso_id);`,
    `CREATE INDEX IF NOT EXISTS idx_usr_cedula ON usuarios(cedula);`,
    `CREATE INDEX IF NOT EXISTS idx_admin_usuario ON admin(usuario);`,
    `CREATE INDEX IF NOT EXISTS idx_visita_usuario ON visita_admin(usuario);`,
    `CREATE INDEX IF NOT EXISTS idx_consulta_cert ON consulta(certificado_id);`
  ];

  for (const sql of createTableStatements) {
    await db.execute(sql);
  }
  console.log('✅ Esquema y tablas creados exitosamente en Turso');

  // Insertar configuraciones iniciales
  console.log('\n--- Insertando Configuración del Sistema (Super Admin) ---');
  const configInit = [
    { clave: 'INSTITUCION_NOMBRE', valor: 'Universidad Politécnica Territorial de Puerto Cabello', descripcion: 'Nombre oficial de la institución', categoria: 'INSTITUCION' },
    { clave: 'INSTITUCION_SIGLAS', valor: 'UPTPC', descripcion: 'Siglas de la institución', categoria: 'INSTITUCION' },
    { clave: 'UNIDAD_PRINCIPAL', valor: 'Unidad de Ciencia y Tecnología (CYT)', descripcion: 'Unidad rectora del sistema', categoria: 'INSTITUCION' },
    { clave: 'WEBSITE_OFICIAL', valor: 'https://www.uptpc.edu.ve', descripcion: 'Sitio web oficial universitario', categoria: 'SISTEMA' },
    { clave: 'LOGO_PRINCIPAL_URL', valor: `${process.env.R2_PUBLIC_URL}/img/logos/LOGO_UPTPC.png`, descripcion: 'URL CDN del logo oficial', categoria: 'APARIENCIA' },
    { clave: 'URL_CONSULTA_PUBLICA', valor: '/consulta.html', descripcion: 'Ruta relativa del validador público', categoria: 'SISTEMA' },
    { clave: 'FORMATO_CODIGO_CERTIFICADO', valor: 'AAA1234AAA', descripcion: 'Máscara del código de certificado', categoria: 'CERTIFICADOS' },
    { clave: 'LIMITE_CERTIFICADOS_FOLIO', valor: '15', descripcion: 'Cantidad máxima de alumnos por folio', categoria: 'CERTIFICADOS' },
    { clave: 'REGISTRO_PAGOS_HABILITADO', valor: 'true', descripcion: 'Habilita o deshabilita recepción de pagos', categoria: 'PAGOS' },
    { clave: 'TASA_DOLAR_AUTOMATICA', valor: 'true', descripcion: 'Actualización automática con BCV', categoria: 'PAGOS' }
  ];

  for (const cfg of configInit) {
    await db.execute({
      sql: `INSERT INTO configuracion (id, clave, valor, descripcion, categoria, updated_at)
            VALUES (?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(clave) DO UPDATE SET
              valor = excluded.valor,
              descripcion = excluded.descripcion,
              categoria = excluded.categoria,
              updated_at = datetime('now');`,
      args: [cfg.clave.toLowerCase(), cfg.clave, cfg.valor, cfg.descripcion, cfg.categoria]
    });
  }
  console.log('✅ Configuraciones maestras inicializadas');

  // Insertar datos migrados del backup
  const backupPath = path.join(__dirname, '../data/google_sheets_live_backup.json');
  if (!fs.existsSync(backupPath)) {
    console.log('No hay backup para migrar.');
    return;
  }

  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  const d = backup.data;

  // 1. Admin
  console.log('\n--- Migrando Administradores Autorizados ---');
  const admins = [
    { id: 'admin-super-01', usuario: 'CIENCIA_TECNOLOGIA', clave: 'CYT_01012023', tipo: 'SUPER_ADMIN', status: 'ACTIVO', permisos: '*' },
    { id: 'admin-ext-02', usuario: 'COORDINADOR_EXT', clave: 'ALFAROMEO101P', tipo: 'ADMIN', status: 'ACTIVO', permisos: '["secDashboard","secCursos","secCertificados"]' }
  ];
  if (Array.isArray(d.admin)) {
    for (const a of d.admin) {
      if (a.usuario && !admins.some(x => x.usuario.toUpperCase() === a.usuario.toUpperCase())) {
        admins.push({
          id: 'admin-' + Math.random().toString(36).substr(2, 9),
          usuario: a.usuario,
          clave: a.clave,
          tipo: a.tipo || 'ADMIN',
          status: a.status || 'ACTIVO',
          permisos: a.permisos || '*'
        });
      }
    }
  }
  for (const adm of admins) {
    await db.execute({
      sql: `INSERT INTO admin (id, usuario, clave, tipo, status, permisos, created_at)
            VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
            ON CONFLICT(usuario) DO UPDATE SET
              clave = excluded.clave,
              tipo = excluded.tipo,
              status = excluded.status,
              permisos = excluded.permisos;`,
      args: [adm.id, adm.usuario, adm.clave, adm.tipo, adm.status, adm.permisos]
    });
  }
  console.log(`✅ ${admins.length} administradores autorizados migrados y verificados`);

  // Helper para insertar en lotes
  async function insertBatch(table, items, mapFn) {
    if (!items || items.length === 0) return;
    const chunkSize = 50;
    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      const stmts = chunk.map(mapFn).filter(Boolean);
      if (stmts.length > 0) {
        await db.batch(stmts, 'write');
      }
    }
    console.log(`✅ ${items.length} registros insertados en ${table}`);
  }

  // 2. Unidades
  await insertBatch('unidades', d.unidades, u => ({
    sql: `INSERT INTO unidades (id, codigo, nombre, logo_url, created_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(codigo) DO UPDATE SET nombre=excluded.nombre, logo_url=excluded.logo_url;`,
    args: [String(u.id), String(u.codigo), String(u.nombre), String(u.logo_url || ''), String(u.created_at || new Date().toISOString())]
  }));

  // 3. Firmas
  await insertBatch('firmas', d.firmas, f => ({
    sql: `INSERT INTO firmas (id, nombre, cargo, firma, sello, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET nombre=excluded.nombre, cargo=excluded.cargo, firma=excluded.firma, sello=excluded.sello;`,
    args: [String(f.id), String(f.nombre), String(f.cargo), String(f.firma || ''), String(f.sello || ''), String(f.created_at || new Date().toISOString())]
  }));

  // 4. Tipo
  await insertBatch('tipo', d.tipo, t => ({
    sql: `INSERT INTO tipo (id, tipo, created_at)
          VALUES (?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET tipo=excluded.tipo;`,
    args: [Number(t.id), String(t.tipo), String(t.created_at || new Date().toISOString())]
  }));

  // 5. Cursos
  await insertBatch('cursos', d.cursos, c => ({
    sql: `INSERT INTO cursos (id, codigo_relacionado, nombre, contenido, tipo_curso, idtipo_curso, unidad_id, horas, motivo, ponencias, idfirma1, idfirma2, idfirma3, matricula_prefijo, diseno, fecha_curso, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            nombre=excluded.nombre, contenido=excluded.contenido, tipo_curso=excluded.tipo_curso,
            unidad_id=excluded.unidad_id, horas=excluded.horas, motivo=excluded.motivo, ponencias=excluded.ponencias,
            idfirma1=excluded.idfirma1, idfirma2=excluded.idfirma2, idfirma3=excluded.idfirma3,
            matricula_prefijo=excluded.matricula_prefijo, diseno=excluded.diseno;`,
    args: [
      String(c.id), String(c.codigo_relacionado || ''), String(c.nombre), String(c.contenido || ''),
      String(c.tipo_curso || ''), String(c.idtipo_curso || ''), String(c.unidad_id || ''),
      Number(c.horas) || 0, String(c.motivo || ''), String(c.ponencias || ''),
      String(c.idfirma1 || ''), String(c.idfirma2 || ''), String(c.idfirma3 || ''),
      String(c.matricula_prefijo || ''), String(c.diseno || ''), String(c.fecha_curso || ''),
      String(c.created_at || new Date().toISOString())
    ]
  }));

  // 6. Diseños
  await insertBatch('disenos', d.disenos, ds => {
    let tiro = ds.diseno || ds.tiro || '';
    if (typeof tiro === 'object') tiro = JSON.stringify(tiro);
    let retiro = ds.retiro || '';
    if (typeof retiro === 'object') retiro = JSON.stringify(retiro);
    return {
      sql: `INSERT INTO disenos (id, nombre, descripcion, tiro, retiro, tiro_retiro, activo, ancho, alto, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              nombre=excluded.nombre, descripcion=excluded.descripcion, tiro=excluded.tiro, retiro=excluded.retiro,
              activo=excluded.activo, ancho=excluded.ancho, alto=excluded.alto, updated_at=datetime('now');`,
      args: [
        String(ds.id), String(ds.nombre || 'Diseño'), String(ds.descripcion || ''),
        tiro, retiro, String(ds.tiro_retiro || 'FALSE'), String(ds.activo || 'FALSE'),
        Number(ds.ancho) || 1123, Number(ds.alto) || 794,
        String(ds.created_at || new Date().toISOString()), String(ds.updated_at || new Date().toISOString())
      ]
    };
  });

  // 7. Bancos
  await insertBatch('banco', d.banco, b => ({
    sql: `INSERT INTO banco (id, banco, created_at)
          VALUES (?, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET banco=excluded.banco;`,
    args: [Number(b.id), String(b.banco)]
  }));

  // 8. Cursos Ofertados
  await insertBatch('curso_ofertado', d.curso_ofertado, co => ({
    sql: `INSERT INTO curso_ofertado (id, taller, descripcion, valor_estudiante, valor_foraneo, flayer, created_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
          ON CONFLICT(id) DO UPDATE SET
            taller=excluded.taller, descripcion=excluded.descripcion,
            valor_estudiante=excluded.valor_estudiante, valor_foraneo=excluded.valor_foraneo, flayer=excluded.flayer;`,
    args: [Number(co.id), String(co.taller), String(co.descripcion || ''), Number(co.valor_estudiante) || 0, Number(co.valor_foraneo) || 0, String(co.flayer || '')]
  }));

  // 9. Usuarios (915 usuarios)
  await insertBatch('usuarios', d.usuarios, u => ({
    sql: `INSERT INTO usuarios (id, cedula, nombre_completo, correo, telefono, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(cedula) DO UPDATE SET
            nombre_completo=excluded.nombre_completo, correo=excluded.correo, telefono=excluded.telefono;`,
    args: [String(u.id), String(u.cedula).trim().toUpperCase(), String(u.nombre_completo).trim(), String(u.correo || ''), String(u.telefono || ''), String(u.created_at || new Date().toISOString())]
  }));

  // 10. Certificados (1306 certificados)
  await insertBatch('certificados', d.certificados, cert => ({
    sql: `INSERT INTO certificados (id, usuario_id, curso_id, codigo, fecha_curso, lugar, tomo, folio, matricula, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(codigo) DO UPDATE SET
            usuario_id=excluded.usuario_id, curso_id=excluded.curso_id, fecha_curso=excluded.fecha_curso,
            lugar=excluded.lugar, tomo=excluded.tomo, folio=excluded.folio, matricula=excluded.matricula;`,
    args: [
      String(cert.id), String(cert.usuario_id), String(cert.curso_id), String(cert.codigo).trim().toUpperCase(),
      String(cert.fecha_curso || ''), String(cert.lugar || ''), String(cert.tomo || ''), String(cert.folio || ''),
      String(cert.matricula || ''), String(cert.created_at || new Date().toISOString())
    ]
  }));

  // 11. Certificados Eliminados
  if (Array.isArray(d.certificados_eliminados) && d.certificados_eliminados.length > 0) {
    await insertBatch('certificados_eliminados', d.certificados_eliminados, ce => ({
      sql: `INSERT INTO certificados_eliminados (id, certificado_id, codigo, cedula, nombre_completo, curso_id, nombre_curso, motivo_eliminacion, eliminado_por, fecha_eliminacion)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO NOTHING;`,
      args: [
        String(ce.id), String(ce.certificado_id || ''), String(ce.codigo || ''), String(ce.cedula || ''),
        String(ce.nombre_completo || ''), String(ce.curso_id || ''), String(ce.nombre_curso || ''),
        String(ce.motivo_eliminacion || ''), String(ce.eliminado_por || ''), String(ce.fecha_elimacion || ce.fecha_eliminacion || new Date().toISOString())
      ]
    }));
  }

  console.log('\n🎉 ¡MIGRACIÓN DE DATOS A TURSO COMPLETADA CON ÉXITO AL 100%!');
}

run().catch(console.error);
