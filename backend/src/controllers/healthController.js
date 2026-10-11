import mongoose from 'mongoose';

function healthController(_req, res) {
  res.json({ status: 'ok' });
}

export function readinessController(_req, res) {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ status: 'not_ready' });
  }
  return res.json({ status: 'ready' });
}

export default healthController;
