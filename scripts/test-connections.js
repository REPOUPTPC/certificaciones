require('dotenv').config();
const { createClient } = require('@libsql/client');
const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');

async function testConnections() {
  console.log('--- Probando conexión con Turso (LibSQL) ---');
  try {
    const db = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN
    });

    const res = await db.execute("SELECT 1 as connected, datetime('now') as db_time;");
    console.log('✅ Conexión a Turso exitosa:', res.rows[0]);
  } catch (err) {
    console.error('❌ Error conectando a Turso:', err.message);
  }

  console.log('\n--- Probando conexión con Cloudflare R2 ---');
  try {
    const s3 = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
      }
    });

    const listCmd = new ListObjectsV2Command({
      Bucket: process.env.R2_BUCKET_NAME,
      MaxKeys: 10
    });

    const resS3 = await s3.send(listCmd);
    console.log('✅ Conexión a Cloudflare R2 exitosa. Objetos en bucket:', resS3.KeyCount || 0);
  } catch (err) {
    console.error('❌ Error conectando a Cloudflare R2:', err.message);
  }
}

testConnections();
