const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const publicDir = path.join(rootDir, 'public');

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Copiar archivos html y assets
const files = ['index.html', 'consulta.html', 'gestion.html', 'cursos.html', 'favicon.svg'];
files.forEach(file => {
  const src = path.join(rootDir, file);
  const dest = path.join(publicDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
  }
});

// Copiar carpetas estáticas
const dirs = ['css', 'js', 'img'];
dirs.forEach(dir => {
  const src = path.join(rootDir, dir);
  const dest = path.join(publicDir, dir);
  if (fs.existsSync(src)) {
    fs.cpSync(src, dest, { recursive: true, force: true });
  }
});

console.log('✅ Archivos estáticos preparados en /public exitosamente para Vercel.');
