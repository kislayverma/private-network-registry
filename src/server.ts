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

import { initDatabase } from './database/init';
import { errorHandler } from './middleware/errorHandler';

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize database
initDatabase();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? 
    ['https://yourapp.com', 'https://app.yourapp.com'] : 
    ['http://localhost:3000', 'http://localhost:19006']
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

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/network', networkRoutes);
app.use('/api/bootstrap', bootstrapRoutes);
app.use('/api/billing', billingRoutes);

// Error handling
app.use(errorHandler);

// 404 handler
app.use('*', (req: Request, res: Response) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`Registry server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});