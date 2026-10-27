const mongoose = require('mongoose');
const dns = require('dns');
const env = require('./env');
const seedDefaults = require('./seedDefaults');

try {
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {}

mongoose.set('strictQuery', true);

async function connectDB() {
  mongoose.connection.on('error', (err) => console.error('[mongo] error:', err.message));
  mongoose.connection.on('disconnected', () => console.warn('[mongo] disconnected'));

  // 1. Try external MONGODB_URI if provided and not localhost
  const uri = process.env.MONGODB_URI;
  if (uri && !uri.includes('127.0.0.1') && !uri.includes('localhost')) {
    try {
      console.log('[mongo] Connecting to provided MONGODB_URI...');
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000,
        maxPoolSize: 20,
        autoIndex: !env.isProd || process.env.AUTO_INDEX === 'true',
      });
      console.log('[mongo] Connected to MongoDB');
      await seedDefaults();
      return;
    } catch (err) {
      console.warn('[mongo] Remote MongoDB connection failed:', err.message);
    }
  }

  // 2. Try in-memory MongoDB server via mongodb-memory-server
  try {
    console.log('[mongo] Initializing in-memory MongoMemoryServer...');
    const { MongoMemoryServer } = require('mongodb-memory-server');
    const mongod = await MongoMemoryServer.create({
      instance: { dbName: 'quizmaster' },
    });
    const memoryUri = mongod.getUri();
    await mongoose.connect(memoryUri, {
      serverSelectionTimeoutMS: 5000,
      autoIndex: true,
    });
    console.log('[mongo] Connected to MongoMemoryServer at', memoryUri);
    await seedDefaults();
    return;
  } catch (memErr) {
    console.warn('[mongo] MongoMemoryServer not available:', memErr.message);
  }

  // 3. Try local MongoDB if running
  try {
    const localUri = uri || 'mongodb://127.0.0.1:27017/quizmaster';
    await mongoose.connect(localUri, {
      serverSelectionTimeoutMS: 2000,
      autoIndex: true,
    });
    console.log('[mongo] Connected to local MongoDB');
    await seedDefaults();
    return;
  } catch (localErr) {
    console.warn('[mongo] Local MongoDB not reachable:', localErr.message);
  }

  // 4. Fail-fast mode if no database is connected
  mongoose.set('bufferCommands', false);
  console.warn('[mongo] Database offline — route-level fallbacks active');
}

module.exports = connectDB;
