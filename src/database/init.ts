import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/private-networks';

export async function initDatabase(): Promise<void> {
  try {
    await mongoose.connect(MONGODB_URI, {
      // useNewUrlParser: true,
      // useUnifiedTopology: true,
    });
    
    console.log('Connected to MongoDB');
    
    // Import models to ensure they're registered
    await import('../models/User');
    await import('../models/Network');
    await import('../models/NetworkMember');
    await import('../models/JoinRequest');
    await import('../models/NetworkCoordinator');
    await import('../models/InviteCode');
    await import('../models/Subscription');
    
    console.log('MongoDB models initialized');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
}

// Handle MongoDB connection events
mongoose.connection.on('error', (error) => {
  console.error('MongoDB connection error:', error);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
});

process.on('SIGINT', async () => {
  try {
    await mongoose.connection.close();
    console.log('MongoDB connection closed through app termination');
    process.exit(0);
  } catch (error) {
    console.error('Error closing MongoDB connection:', error);
    process.exit(1);
  }
});

export { mongoose };