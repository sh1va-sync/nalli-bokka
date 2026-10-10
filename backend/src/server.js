import 'dotenv/config';
import app from './app.js';
import connectDatabase from './config/database.js';

const port = Number(process.env.PORT) || 3000;

try {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be configured with at least 32 characters');
  }
  await connectDatabase();
  app.listen(port, () => {
    console.log(`API server listening on port ${port}`);
  });
} catch (error) {
  console.error('Failed to start API server:', error);
  process.exitCode = 1;
}
