import './config/loadEnv.js';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { handleRazorpayWebhook } from './controllers/paymentController.js';
import routes from './routes/index.js';
import errorHandler from './middleware/errorHandler.js';
import notFound from './middleware/notFound.js';
import requestLogger from './middleware/requestLogger.js';

const app = express();
app.disable('x-powered-by');
app.use(requestLogger);

const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(helmet());
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(null, false);
  },
  credentials: true
}));

app.post(
  '/api/payments/razorpay/webhook',
  express.raw({ type: 'application/json', limit: '1mb' }),
  handleRazorpayWebhook
);
app.use(express.json({ limit: '1mb' }));
app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

export default app;
