require('dotenv').config();
const http = require('http');
const apiHandler = require('../api/index');

const server = http.createServer((req, res) => {
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(data));
    return res;
  };
  return apiHandler(req, res);
});

function request(options, body = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function run() {
  const PORT = 3088;
  await new Promise(r => server.listen(PORT, r));
  console.log('=== INICIANDO VALIDACIÓN EXHAUSTIVA DE TODAS LAS ACCIONES ===\n');

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      const res = await fn();
      if (res && res.status === 'success') {
        console.log(`✅ [OK] ${name}`);
        passed++;
      } else {
        console.error(`❌ [FAIL] ${name}:`, res);
        failed++;
      }
    } catch (err) {
      console.error(`❌ [ERROR] ${name}:`, err.message);
      failed++;
    }
  }

  // 1. Visita Admin (El que causaba el HTTP 500)
  await test('Registro de Visita Admin (visita_admin create)', async () => {
    const res = await request({
      hostname: 'localhost', port: PORT, path: '/api', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      action: 'create',
      tabla: 'visita_admin',
      data: {
        id: 'test_visita_' + Date.now(),
        usuario: 'CIENCIA_TECNOLOGIA',
        ip: '127.0.0.1',
        sitio: '#dashboard',
        fecha_hora: new Date().toISOString()
      }
    });
    return res.data;
  });

  // 2. Consulta Pública (logConsulta)
  await test('Registro de Consulta Pública (logConsulta)', async () => {
    const res = await request({
      hostname: 'localhost', port: PORT, path: '/api', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      action: 'logConsulta',
      certificado_id: 'test-cert-id',
      direccion_ip: '127.0.0.1'
    });
    return res.data;
  });

  // 3. Crear y Eliminar Usuario de Prueba
  const testUserId = 'test-usr-' + Date.now();
  await test('Crear Usuario en Turso (usuarios create)', async () => {
    const res = await request({
      hostname: 'localhost', port: PORT, path: '/api', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      action: 'create',
      tabla: 'usuarios',
      data: {
        id: testUserId,
        cedula: 'V-99999999',
        nombre_completo: 'USUARIO DE PRUEBA QA',
        correo: 'qa@uptpc.edu.ve',
        telefono: '04120000000'
      }
    });
    return res.data;
  });

  await test('Actualizar Usuario en Turso (usuarios update)', async () => {
    const res = await request({
      hostname: 'localhost', port: PORT, path: '/api', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      action: 'update',
      tabla: 'usuarios',
      id: testUserId,
      data: {
        nombre_completo: 'USUARIO DE PRUEBA QA MODIFICADO'
      }
    });
    return res.data;
  });

  await test('Eliminar Usuario de Prueba (usuarios delete)', async () => {
    const res = await request({
      hostname: 'localhost', port: PORT, path: '/api', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      action: 'delete',
      tabla: 'usuarios',
      id: testUserId
    });
    return res.data;
  });

  // 4. Emisión Masiva (bulkCertificar)
  const testCertUsr = { id: 'usr-bulk-test', cedula: 'V-88888888', nombre_completo: 'PARTICIPANTE BULK' };
  await test('Emisión de Certificado con código único (bulkCertificar)', async () => {
    const res = await request({
      hostname: 'localhost', port: PORT, path: '/api', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      action: 'bulkCertificar',
      curso_id: 'df8e4dd5-6f2f-43df-9649-56cf0c763259',
      usuarios: [testCertUsr],
      datos_generales: {
        fecha_curso: '2026-10-25',
        lugar: 'Puerto Cabello, Venezuela',
        tomo: '1',
        folio: '10'
      }
    });
    if (res.data?.data?.[0]?.id) {
      // Limpiar el certificado creado
      await request({
        hostname: 'localhost', port: PORT, path: '/api', method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, {
        action: 'delete',
        tabla: 'certificados',
        id: res.data.data[0].id
      });
    }
    return res.data;
  });

  // 5. Configuración Global
  await test('Actualizar Configuración Global (updateConfiguracion)', async () => {
    const res = await request({
      hostname: 'localhost', port: PORT, path: '/api', method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      action: 'updateConfiguracion',
      clave: 'INSTITUCION_SIGLAS',
      valor: 'UPTPC'
    });
    return res.data;
  });

  // 6. Obtener Backup
  await test('Generar Respaldo Descargable (backup)', async () => {
    const res = await request({
      hostname: 'localhost', port: PORT, path: '/api?action=backup', method: 'GET'
    });
    return res.data;
  });

  console.log(`\n========================================`);
  console.log(`RESUMEN: ${passed} pruebas superadas, ${failed} fallidas.`);
  console.log(`========================================`);

  server.close();
}

run().catch(console.error);
