import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const { parsed = {} } = dotenv.config({
  path: fileURLToPath(new URL('../../.env', import.meta.url)),
});

for (const name of ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET']) {
  if (!process.env[name]?.trim() && parsed[name]?.trim()) {
    process.env[name] = parsed[name];
  }
}