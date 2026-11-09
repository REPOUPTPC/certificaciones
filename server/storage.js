require('dotenv').config();
const { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
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
 * Sube o sustituye el PDF del Brochure en Cloudflare R2
 * Ubicación fija: brochure/brochure.pdf (y espejo brochure/Brochure.pdf)
 * @param {string|Buffer} pdfData Base64 o Buffer del documento PDF
 * @param {string} originalFilename Nombre original (informativo)
 */
async function uploadBrochurePdf(pdfData, originalFilename = 'brochure.pdf') {
  if (!pdfData) {
    throw new Error('No se enviaron datos del PDF para el Brochure');
  }

  let buffer;
  if (Buffer.isBuffer(pdfData)) {
    buffer = pdfData;
  } else if (typeof pdfData === 'string') {
    let cleanBase64 = pdfData;
    if (pdfData.includes(';base64,')) {
      cleanBase64 = pdfData.split(';base64,')[1];
    }
    buffer = Buffer.from(cleanBase64, 'base64');
  } else {
    throw new Error('Formato de datos no soportado para PDF');
  }

  // Clave fija requerida: carpeta 'brochure', nombre 'brochure.pdf' y 'Brochure.pdf'
  const primaryKey = 'brochure/brochure.pdf';
  const capitalKey = 'brochure/Brochure.pdf';

  const cmdPrimary = new PutObjectCommand({
    Bucket: BUCKET,
    Key: primaryKey,
    Body: buffer,
    ContentType: 'application/pdf',
    CacheControl: 'no-cache, no-store, must-revalidate',
    ContentDisposition: 'inline; filename="brochure.pdf"'
  });

  await s3.send(cmdPrimary);

  // Subir copia sincronizada con Brochure.pdf para evitar fallos por mayúsculas
  try {
    const cmdCapital = new PutObjectCommand({
      Bucket: BUCKET,
      Key: capitalKey,
      Body: buffer,
      ContentType: 'application/pdf',
      CacheControl: 'no-cache, no-store, must-revalidate',
      ContentDisposition: 'inline; filename="Brochure.pdf"'
    });
    await s3.send(cmdCapital);
  } catch (errCap) {
    console.warn('Aviso: no se pudo sincronizar Brochure.pdf alternativo:', errCap.message);
  }

  const fileUrl = `${PUBLIC_URL}/${primaryKey}`;

  return {
    status: 'success',
    message: 'Brochure PDF actualizado y sustituido en Cloudflare R2 exitosamente',
    url: fileUrl,
    key: primaryKey,
    folder: 'brochure',
    filename: 'brochure.pdf',
    originalFilename: originalFilename || 'brochure.pdf',
    size: buffer.length,
    timestamp: Date.now()
  };
}

/**
 * Consulta el estado y metadatos del PDF del Brochure en Cloudflare R2
 */
async function getBrochureStatus() {
  const primaryKey = 'brochure/brochure.pdf';
  try {
    const cmd = new HeadObjectCommand({
      Bucket: BUCKET,
      Key: primaryKey
    });
    const res = await s3.send(cmd);
    return {
      status: 'success',
      exists: true,
      url: `${PUBLIC_URL}/${primaryKey}`,
      key: primaryKey,
      size: res.ContentLength || 0,
      lastModified: res.LastModified || null,
      contentType: res.ContentType || 'application/pdf',
      publicUrl: PUBLIC_URL
    };
  } catch (err) {
    const is404 = err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404;
    return {
      status: is404 ? 'success' : 'warning',
      exists: false,
      url: `${PUBLIC_URL}/${primaryKey}`,
      key: primaryKey,
      publicUrl: PUBLIC_URL,
      message: is404 ? 'No existe aún el archivo brochure.pdf en Cloudflare R2' : err.message
    };
  }
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
  uploadBrochurePdf,
  getBrochureStatus,
  deleteObjectFromR2,
  PUBLIC_URL,
  BUCKET
};
