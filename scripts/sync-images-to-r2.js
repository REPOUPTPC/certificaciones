require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const mime = require('mime-types');

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

const BUCKET = process.env.R2_BUCKET_NAME;
const PUBLIC_URL = process.env.R2_PUBLIC_URL.replace(/\/+$/, '');

async function uploadBufferToR2(key, buffer, contentType) {
  const cleanKey = key.replace(/^\/+/, '');
  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: cleanKey,
    Body: buffer,
    ContentType: contentType || 'application/octet-stream'
  });
  await s3.send(cmd);
  const finalUrl = `${PUBLIC_URL}/${cleanKey}`;
  console.log(`[R2] Subido: ${cleanKey} -> ${finalUrl}`);
  return finalUrl;
}

async function downloadAndUpload(url, targetKey, fallbackContentType = 'image/png') {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[WARN] No se pudo descargar ${url}: HTTP ${res.status}`);
      return null;
    }
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = res.headers.get('content-type') || fallbackContentType;
    return await uploadBufferToR2(targetKey, buffer, contentType);
  } catch (err) {
    console.error(`[ERROR] Descargando/Subiendo ${url}:`, err.message);
    return null;
  }
}

async function main() {
  console.log('=== INICIANDO SINCRONIZACIÓN Y ORGANIZACIÓN DE IMÁGENES EN CLOUDFLARE R2 ===');

  // 1. Subir archivos locales de la carpeta /img
  const localImgDir = path.join(__dirname, '../img');
  if (fs.existsSync(localImgDir)) {
    const files = fs.readdirSync(localImgDir);
    for (const f of files) {
      const fullPath = path.join(localImgDir, f);
      if (fs.statSync(fullPath).isFile()) {
        const buffer = fs.readFileSync(fullPath);
        const cType = mime.lookup(fullPath) || 'image/png';
        await uploadBufferToR2(`img/logos/${f}`, buffer, cType);
      }
    }
  }

  // 2. Cargar backup de Google Sheets
  const backupPath = path.join(__dirname, '../data/google_sheets_live_backup.json');
  if (!fs.existsSync(backupPath)) {
    console.error('No se encontró el archivo de backup en data/google_sheets_live_backup.json');
    return;
  }

  const backup = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  const data = backup.data;

  // 3. Sincronizar logos de unidades
  console.log('\n--- Sincronizando Logos de Unidades ---');
  if (Array.isArray(data.unidades)) {
    for (const u of data.unidades) {
      if (u.logo_url && u.logo_url.startsWith('http')) {
        const ext = u.logo_url.includes('.png') ? 'png' : 'png';
        const key = `img/logos/logo_${(u.codigo || u.id).toLowerCase()}.${ext}`;
        const newUrl = await downloadAndUpload(u.logo_url, key);
        if (newUrl) u.logo_url = newUrl;
      }
    }
  }

  // 4. Sincronizar firmas y sellos
  console.log('\n--- Sincronizando Firmas y Sellos ---');
  if (Array.isArray(data.firmas)) {
    for (const f of data.firmas) {
      const safeName = (f.nombre || f.id).toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
      if (f.firma && f.firma.startsWith('http')) {
        const key = `img/firmas_sellos/firma_${safeName}.png`;
        const newUrl = await downloadAndUpload(f.firma, key);
        if (newUrl) f.firma = newUrl;
      }
      if (f.sello && f.sello.startsWith('http')) {
        const key = `img/firmas_sellos/sello_${safeName}.png`;
        const newUrl = await downloadAndUpload(f.sello, key);
        if (newUrl) f.sello = newUrl;
      }
    }
  }

  // 5. Sincronizar flyers de cursos ofertados
  console.log('\n--- Sincronizando Flyers de Cursos Ofertados ---');
  if (Array.isArray(data.curso_ofertado)) {
    for (const c of data.curso_ofertado) {
      if (c.flayer && c.flayer.startsWith('http')) {
        const key = `img/flyers/flyer_curso_${c.id}.png`;
        const newUrl = await downloadAndUpload(c.flayer, key);
        if (newUrl) c.flayer = newUrl;
      }
    }
  }

  // Guardar backup actualizado con las URLs de Cloudflare R2
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));
  console.log('\n✅ Todas las imágenes sincronizadas y backup actualizado con URLs de Cloudflare R2!');
}

main().catch(console.error);
