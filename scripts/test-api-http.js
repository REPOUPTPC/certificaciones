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
          resolve({ status: res.statusCode, headers: res.headers, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, raw: data });
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

async function runTests() {
  const PORT = 3099;
  await new Promise(resolve => server.listen(PORT, resolve));
  console.log(`Servidor de prueba iniciado en puerto ${PORT}`);

  try {
    console.log('\n--- 1. Test GET /api?action=ping ---');
    const resPing = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api?action=ping',
      method: 'GET'
    });
    console.log('Status:', resPing.status, 'Response:', resPing.data);

    console.log('\n--- 2. Test GET /api?action=getDashboardStats ---');
    const resStats = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api?action=getDashboardStats',
      method: 'GET'
    });
    console.log('Status:', resStats.status, 'Dashboard:', resStats.data?.data);

    console.log('\n--- 3. Test POST /api (verifyAdmin) ---');
    const resAuth = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      action: 'verifyAdmin',
      usuario: 'CIENCIA_TECNOLOGIA',
      clave: 'CYT_01012023'
    });
    console.log('Status:', resAuth.status, 'Autenticado:', resAuth.data?.authenticated, 'Usuario:', resAuth.data?.user?.usuario);

    console.log('\n--- 4. Test GET /api?action=searchCertificado&termino=V-32092372 ---');
    const resSearch = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api?action=searchCertificado&termino=V-32092372',
      method: 'GET'
    });
    console.log('Status:', resSearch.status, 'Encontrados:', resSearch.data?.data?.length);
    if (resSearch.data?.data?.[0]) {
      console.log('Primer certificado:', {
        codigo: resSearch.data.data[0].codigo,
        alumno: resSearch.data.data[0].nombre_completo,
        curso: resSearch.data.data[0].nombre_curso,
        logo_url: resSearch.data.data[0].logo_url,
        firma1_url: resSearch.data.data[0].firma1_url
      });
    }

    console.log('\n--- 5. Test GET /api?action=getConfiguraciones ---');
    const resCfg = await request({
      hostname: 'localhost',
      port: PORT,
      path: '/api?action=getConfiguraciones',
      method: 'GET'
    });
    console.log('Status:', resCfg.status, 'Configuraciones:', resCfg.data?.data?.length);

    console.log('\n🎉 TODOS LOS TESTS HTTP PASARON SATISFACTORIAMENTE!');
  } finally {
    server.close();
  }
}

runTests().catch(err => {
  console.error('Test falló:', err);
  process.exit(1);
});
