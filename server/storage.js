require('dotenv').config();
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const mime = require('mime-types');

const s3 = new S3Client({
  region: 'auto',
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

const BUCKET = process.env.R2_BUCKET_NAME || 'certificaciones';
const PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, '');

/**
 * Sube una imagen base64 a Cloudflare R2 organizándola por carpetas
 * @param {string} base64Data Cadena base64 completa (ej: data:image/png;base64,...)
 * @param {string} filename Nombre del archivo sugerido
 * @param {string} folder Carpeta destino (ej: 'firmas_sellos', 'logos', 'comprobantes', 'flyers', 'fondos')
 */
async function uploadBase64Image(base64Data, filename, folder = 'general') {
  if (!base64Data) {
    throw new Error('No se enviaron datos de imagen en base64');
  }

  let contentType = 'image/png';
  let cleanBase64 = base64Data;

  if (base64Data.includes(';base64,')) {
    const parts = base64Data.split(';base64,');
    contentType = parts[0].replace('data:', '') || 'image/png';
    cleanBase64 = parts[1];
  }

  const buffer = Buffer.from(cleanBase64, 'base64');
  const ext = mime.extension(contentType) || 'png';
  
  // Limpiar y estandarizar carpeta
  let cleanFolder = String(folder || 'general').trim().toLowerCase().replace(/^\/+|\/+$/g, '');
  if (cleanFolder === 'comprobantes') cleanFolder = 'pagos';
  let targetFolder = cleanFolder.startsWith('img/') ? cleanFolder : `img/${cleanFolder}`;

  // Nombre de archivo seguro y único
  const timestamp = Date.now();
  const safeFilename = filename
    ? filename.replace(/[^a-zA-Z0-9._-]/g, '_')
    : `archivo_${timestamp}.${ext}`;
  
  const finalFilename = safeFilename.includes('.') ? safeFilename : `${safeFilename}.${ext}`;
  const key = `${targetFolder}/${timestamp}_${finalFilename}`;

  const cmd = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType
  });

  await s3.send(cmd);
  const fileUrl = `${PUBLIC_URL}/${key}`;

  return {
    status: 'success',
    message: 'Archivo subido a Cloudflare R2 exitosamente',
    url: fileUrl,
    key: key,
    folder: targetFolder,
    size: buffer.length,
    contentType: contentType
  };
}

/**
 * Elimina un objeto de Cloudflare R2
 */
async function deleteObjectFromR2(key) {
  const cleanKey = key.replace(PUBLIC_URL + '/', '').replace(/^\/+/, '');
  const cmd = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: cleanKey
  });
  await s3.send(cmd);
  return { status: 'success', message: 'Archivo eliminado de Cloudflare R2' };
}

module.exports = {
  s3,
  uploadBase64Image,
  deleteObjectFromR2,
  PUBLIC_URL,
  BUCKET
};
