import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { verifySignature } from '../utils/crypto';
import User from '../models/User';
import NetworkMember from '../models/NetworkMember';

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

export function authenticateToken(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
console.log('1: ' + token);
  if (!token) {
    res.status(401).json({ error: 'Access token required' });
    return;
  }
  jwt.verify(token, process.env.JWT_SECRET as string, (err, user) => {
    if (err) {
      res.status(403).json({ error: 'Invalid or expired token' });
      return;
    }
    req.user = user;
    next();
  });
console.log('4');
}

export async function authenticateSignature(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { username, signature, timestamp, message } = req.body;
  console.log('1');
  
  if (!username || !signature || !timestamp || !message) {
    res.status(400).json({ 
      error: 'Missing required fields: username, signature, timestamp, publicKey' 
    });
    return;
  }
  console.log('2');

  // Check timestamp to prevent replay attacks (5 minute window)
  const now = Date.now();
  const requestTime = parseInt(timestamp);
  const timeDiff = Math.abs(now - requestTime);
  
  if (timeDiff > 5 * 60 * 1000) { // 5 minutes
    res.status(401).json({ error: 'Request timestamp too old' });
    return;
  }
  console.log('3');

  try {
    // Verify user exists and public key matches
    const user = await User.findOne({ username, isActive: true });
    console.log('4');

    if (!user) {
      res.status(401).json({ error: 'User not found' });
      return;
    }
    console.log('5');
    console.log(JSON.stringify(user));

    // if (user.publicKey !== publicKey) {
    //   return res.status(401).json({ error: 'Public key mismatch' });
    // }

    // Create message to verify signature
    // const message = `${username}:${timestamp}:${req.method}:${req.path}`;
    console.log('6');

    if (!verifySignature(message, signature, user.publicKey)) {
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }
    console.log('7');

    req.user = { username: user.username, publicKey: user.publicKey };
    console.log('8');
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Database error' });
  }
}

export async function requireNetworkAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { networkId } = req.params;
  const username = req.user.username;

  try {
    const member = await NetworkMember.findOne({
      networkId,
      username,
      role: 'admin',
      isActive: true
    });

    if (!member) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    next();
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({ error: 'Database error' });
  }
}