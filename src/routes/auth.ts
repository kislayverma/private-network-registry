import express, { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { verifySignature } from '../utils/crypto';
import { authenticateSignature } from '../middleware/auth';
import User from '../models/User';

const router = express.Router();

// Register new user identity
router.post('/register', [
  body('username').isLength({ min: 3, max: 30 }).matches(/^[a-zA-Z0-9_]+$/),
  body('publicKey').isBase64(),
  body('email').optional().isEmail(),
  body('phone').optional().isMobilePhone('any')
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { username, publicKey, email, phone } = req.body;
    // Check if username or public key already exists
    const existingUser = await User.findOne({
      $or: [{ username }, { publicKey }]
    });

    if (existingUser) {
      return res.status(409).json({ error: 'Username or identity already exists' });
    }

    // Create new user
    const user = new User({
      username,
      publicKey,
      email,
      phone
    });

    await user.save();

    res.status(201).json({
      success: true,
      userId: user._id,
      username,
      message: 'Identity created successfully'
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Database error during registration' });
  }
});

// Login with cryptographic signature
router.post('/login', authenticateSignature, async (req: Request, res: Response) => {
  try {
    const { username, publicKey } = req.user;
    
    // Generate JWT token
    const token = jwt.sign(
      { username },
      process.env.JWT_SECRET as string,
      { expiresIn: '24h' }
    );

    res.json({
      success: true,
      token,
      username,
      message: 'Login successful'
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Verify token
router.get('/verify', async (req: Request, res: Response) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any;
    res.json({
      valid: true,
      username: decoded.username,
      expiresAt: new Date(decoded.exp * 1000)
    });
  } catch (error) {
    res.status(403).json({ valid: false, error: 'Invalid or expired token' });
  }
});

export default router;