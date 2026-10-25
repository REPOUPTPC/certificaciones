require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
const apiHandler = require('../api/index');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = path.join(__dirname, '..');

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(parsedUrl.pathname);

  // Endpoint API Serverless
  if (pathname.startsWith('/api')) {
    // Simular métodos helper de express/vercel en res
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (data) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(data));
      return res;
    };

    return apiHandler(req, res);
  }

  // Servir archivos estáticos del frontend
  let relativePath = pathname === '/' ? '/index.html' : pathname;
  let filePath = path.join(ROOT_DIR, relativePath);

  // Seguridad contra path traversal
  if (!filePath.startsWith(ROOT_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Prohibido');
    return;
  }

  // Si es un directorio, buscar index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const contentType = mime.lookup(filePath) || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': `${contentType}; charset=utf-8`,
      'Cache-Control': 'no-cache'
    });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<h1>404 No Encontrado</h1><p>El archivo <code>${pathname}</code> no existe.</p>`);
  }
});

server.listen(PORT, () => {
  console.log(`🚀 Servidor de desarrollo UPTPC activo en: http://localhost:${PORT}`);
  console.log(`📡 Endpoints API disponibles en: http://localhost:${PORT}/api`);
});
