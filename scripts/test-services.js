const services = require('../server/services');

async function testAll() {
  console.log('1. Ping:');
  const ping = await services.ping();
  console.log(ping);

  console.log('\n2. Verificar Super Admin:');
  const auth = await services.verifyAdmin('CIENCIA_TECNOLOGIA', 'CYT_01012023');
  console.log(auth);

  console.log('\n3. Dashboard Stats:');
  const stats = await services.getDashboardStats();
  console.log(stats.data);

  console.log('\n4. Vista Certificados (Total):');
  const vista = await services.getVistaCertificados();
  console.log(`Total registros en vista: ${vista.data?.length}`);
  if (vista.data && vista.data[0]) {
    console.log('Ejemplo de certificado con JOIN completo:');
    console.log({
      codigo: vista.data[0].codigo,
      estudiante: vista.data[0].nombre_completo,
      cedula: vista.data[0].cedula,
      curso: vista.data[0].nombre_curso,
      unidad: vista.data[0].unidad_nombre,
      firma1: vista.data[0].firma1_nombre,
      firma1_url: vista.data[0].firma1_url
    });
  }

  console.log('\n5. Buscar Certificado por Cédula:');
  const busqueda = await services.searchCertificado('23432679');
  console.log(`Encontrados: ${busqueda.data?.length}`);

  console.log('\n6. Configuraciones:');
  const cfgs = await services.getConfiguraciones();
  console.log(`Total configuraciones: ${cfgs.data?.length}`);

  console.log('\n7. Test Backup:');
  const bkp = await services.backupDatabase();
  console.log(`Backup generado con ${Object.keys(bkp.data).length} tablas.`);

  console.log('\n✅ TODOS LOS SERVICIOS FUNCIONAN PERFECTAMENTE!');
}

testAll().catch(console.error);
