import dotenv from 'dotenv';
dotenv.config();

import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import authRoutes from './routes/auth';
import networkRoutes from './routes/network';
import bootstrapRoutes from './routes/bootstrap';
import userRoutes from './routes/user';
import billingRoutes from './routes/billing';
import p2pRoutes from './routes/p2p';

import { initDatabase } from './database/init';
import { errorHandler } from './middleware/errorHandler';
import SignalingServer from './services/signalingServer';
import BackgroundJobs from './services/backgroundJobs';

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize database
initDatabase();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? 
    ['https://yourapp.com', 'https://app.yourapp.com'] : 
    ['http://localhost:3001', 'http://localhost:19006']
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP'
});
app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Enhanced health check with service status
app.get('/health/detailed', async (req: Request, res: Response) => {
  try {
    const stats = backgroundJobs ? await backgroundJobs.getStats() : null;
    const signalingConnections = signalingServer ? signalingServer.getActiveConnections() : 0;
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        signaling: signalingConnections > 0 ? 'active' : 'idle',
        backgroundJobs: backgroundJobs ? 'running' : 'stopped'
      },
      stats: stats ? {
        onlineDevices: stats.onlineDevices,
        totalDevices: stats.totalDevices,
        activeNetworks: stats.activeNetworks,
        signalingConnections,
        signalingChannels: stats.signalingChannels
      } : null
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    });
  }
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/network', networkRoutes);
app.use('/api/bootstrap', bootstrapRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/p2p', p2pRoutes);

// Error handling
app.use(errorHandler);

// 404 handler
app.use('*', (req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

// Initialize services
let signalingServer: SignalingServer;
let backgroundJobs: BackgroundJobs;

app.listen(PORT, () => {
  console.log(`🚀 Registry server running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV}`);
  
  // Start WebRTC signaling server
  try {
    signalingServer = new SignalingServer();
    console.log(`🔗 WebRTC signaling available on port ${process.env.SIGNALING_PORT || 3005}`);
  } catch (error) {
    console.error('❌ Failed to start signaling server:', error);
  }
  
  // Start background jobs
  try {
    backgroundJobs = new BackgroundJobs();
  } catch (error) {
    console.error('❌ Failed to start background jobs:', error);
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  
  if (signalingServer) {
    signalingServer.close();
  }
  
  if (backgroundJobs) {
    backgroundJobs.stop();
  }
  
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  
  if (signalingServer) {
    signalingServer.close();
  }
  
  if (backgroundJobs) {
    backgroundJobs.stop();
  }
  
  process.exit(0);
});