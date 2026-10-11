import mongoose from 'mongoose';

async function connectDatabase() {
  const { MONGODB_URI } = process.env;

  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is required to connect to MongoDB');
  }

  await mongoose.connect(MONGODB_URI);
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'info',
    event: 'database.connected'
  }));
}

export default connectDatabase;
