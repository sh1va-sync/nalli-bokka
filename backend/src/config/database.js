import mongoose from 'mongoose';

async function connectDatabase() {
  const { MONGODB_URI } = process.env;

  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is required to connect to MongoDB');
  }

  await mongoose.connect(MONGODB_URI);
  await removeCheckoutTtl(mongoose.connection);
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'info',
    event: 'database.connected'
  }));
}

export async function removeCheckoutTtl(connection) {
  // Removing a schema index does not remove an existing MongoDB TTL index.
  // Drop only the obsolete checkout TTL, preserving all other indexes.
  const collection = connection.collection('checkoutattempts');
  const indexes = await collection.listIndexes().toArray().catch(error => {
    if (error.code === 26) return [];
    throw error;
  });
  for (const index of indexes) {
    if (index.key.createdAt === 1 && Object.keys(index.key).length === 1
      && index.expireAfterSeconds !== undefined) {
      await collection.dropIndex(index.name).catch(error => {
        if (error.code !== 27) throw error;
      });
    }
  }
}

export default connectDatabase;
