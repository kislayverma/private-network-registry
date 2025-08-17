const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { verifySignature } = require('../utils/crypto');
const { authenticateSignature } = require('../middleware/auth');
const User = require('../models/User');

const router = express.Router();

// Register new user identity
router.post('/register', [
  body('username').isLength({ min: 3, max: 30 }).matches(/^[a-zA-Z0-9_]+$/),
  body('publicKey').isBase64(),
  body('email').optional().isEmail(),
  body('phone').optional().isMobilePhone()
], async (req, res) => {
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
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Login with signature verification
router.post('/login', authenticateSignature, (req, res) => {
  const { username } = req.user;

  // Generate JWT token
  const token = jwt.sign(
    { username },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  res.json({
    success: true,
    token,
    username,
    expiresIn: '7d'
  });
});

// Verify token (for app to check if token is still valid)
router.get('/verify', (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    res.json({
      valid: true,
      username: decoded.username,
      expiresAt: new Date(decoded.exp * 1000)
    });
  });
});

// Check username availability
router.get('/check-username/:username', async (req, res) => {
  const { username } = req.params;

  if (!/^[a-zA-Z0-9_]{3,30}$/.test(username)) {
    return res.status(400).json({ 
      error: 'Username must be 3-30 characters, alphanumeric and underscore only' 
    });
  }

  try {
    const user = await User.findOne({ username });

    res.json({
      available: !user,
      username
    });
  } catch (error) {
    console.error('Username check error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;