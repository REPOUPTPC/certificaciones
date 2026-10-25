const services = require('../server/services');

// Helper para parsear body en caso de entornos donde no viene pre-parseado
async function getParsedBody(req) {
  if (req.body) {
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body);
      } catch (e) {
        return {};
      }
    }
    return req.body;
  }
  return new Promise((resolve) => {
    let bodyStr = '';
    req.on('data', chunk => { bodyStr += chunk; });
    req.on('end', () => {
      try {
        resolve(JSON.parse(bodyStr || '{}'));
      } catch (e) {
        resolve({});
      }
    });
  });
}

module.exports = async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const query = Object.fromEntries(url.searchParams.entries());
    const action = query.action || (req.body ? req.body.action : null);

    if (req.method === 'GET') {
      let result = {};

      switch (action) {
        case 'ping':
          result = await services.ping();
          break;

        case 'getAll':
          result = await services.getAll(query.tabla || query.table);
          break;

        case 'getAllData':
          result = await services.getAllData();
          break;

        case 'getById':
          result = await services.getById(query.tabla || query.table, query.id);
          break;

        case 'searchCertificado':
          result = await services.searchCertificado(query.termino);
          break;

        case 'getDisenoActivo':
          result = await services.getDisenoActivo();
          break;

        case 'getDashboardStats':
          result = await services.getDashboardStats();
          break;

        case 'getVistaCertificados':
          result = await services.getVistaCertificados();
          break;

        case 'backup':
          result = await services.backupDatabase();
          break;

        case 'getConfiguraciones':
          result = await services.getConfiguraciones();
          break;

        case 'verifyAdmin':
          result = await services.verifyAdmin(query.usuario, query.clave);
          break;

        default:
          result = { status: 'error', message: `Acción GET no reconocida: ${action}` };
      }

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.status(200).json(result);
      return;
    }

    if (req.method === 'POST') {
      const body = await getParsedBody(req);
      const postAction = body.action || action;
      const userRole = String(req.headers['x-user-role'] || body._userRole || body.userRole || '').toUpperCase();

      // Validación estricta para perfil AUDITOR: no puede crear, modificar ni eliminar registros
      const mutationActions = ['create', 'update', 'delete', 'bulkCreateUsuarios', 'bulkCertificar', 'saveDiseno', 'setDisenoActivo', 'updateConfiguracion'];
      if (userRole === 'AUDITOR' && mutationActions.includes(postAction)) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.status(403).json({
          status: 'error',
          message: 'Acceso denegado: El perfil de AUDITOR cuenta exclusivamente con permisos de lectura y fiscalización.'
        });
        return;
      }

      let result = {};

      switch (postAction) {
        case 'create':
          result = await services.createRecord(body.tabla || body.table, body.data || body.item);
          break;

        case 'update':
          result = await services.updateRecord(body.tabla || body.table, body.id, body.data || body.item);
          break;

        case 'delete':
          result = await services.deleteRecord(body.tabla || body.table, body.id);
          break;

        case 'bulkCreateUsuarios':
          result = await services.bulkCreateUsuarios(body.usuarios || []);
          break;

        case 'bulkCertificar':
          result = await services.bulkCertificar(body.curso_id, body.usuarios || [], body.datos_generales || {});
          break;

        case 'saveDiseno':
          result = await services.saveDiseno(body.diseno_data);
          break;

        case 'setDisenoActivo':
          result = await services.setDisenoActivo(body.id, body.estado);
          break;

        case 'logConsulta':
          result = await services.logConsulta(body.certificado_id, body.direccion_ip);
          break;

        case 'uploadImage':
          result = await services.uploadImage(body.base64Data, body.filename, body.folder || body.carpeta);
          break;

        case 'verifyAdmin':
          result = await services.verifyAdmin(body.usuario, body.clave);
          break;

        case 'updateConfiguracion':
          result = await services.updateConfiguracion(body.clave, body.valor);
          break;

        default:
          result = { status: 'error', message: `Acción POST no reconocida: ${postAction}` };
      }

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.status(200).json(result);
      return;
    }

    res.status(405).json({ status: 'error', message: `Método ${req.method} no permitido` });
  } catch (err) {
    console.error('[API Error]:', err);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).json({ status: 'error', message: err.message, stack: err.stack });
  }
};
