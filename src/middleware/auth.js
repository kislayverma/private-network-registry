const jwt = require('jsonwebtoken');
const { verifySignature } = require('../utils/crypto');
const User = require('../models/User');
const NetworkMember = require('../models/NetworkMember');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

async function authenticateSignature(req, res, next) {
  const { username, signature, timestamp, publicKey } = req.body;

  if (!username || !signature || !timestamp || !publicKey) {
    return res.status(400).json({ 
      error: 'Missing required fields: username, signature, timestamp, publicKey' 
    });
  }

  // Check timestamp to prevent replay attacks (5 minute window)
  const now = Date.now();
  const requestTime = parseInt(timestamp);
  const timeDiff = Math.abs(now - requestTime);
  
  if (timeDiff > 5 * 60 * 1000) { // 5 minutes
    return res.status(401).json({ error: 'Request timestamp too old' });
  }

  try {
    // Verify user exists and public key matches
    const user = await User.findOne({ username, isActive: true });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (user.publicKey !== publicKey) {
      return res.status(401).json({ error: 'Public key mismatch' });
    }

    // Create message to verify signature
    const message = `${username}:${timestamp}:${req.method}:${req.path}`;
    
    if (!verifySignature(message, signature, publicKey)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    req.user = { username, publicKey };
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({ error: 'Database error' });
  }
}

async function requireNetworkAdmin(req, res, next) {
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
      return res.status(403).json({ error: 'Admin access required' });
    }

    next();
  } catch (error) {
    console.error('Admin check error:', error);
    res.status(500).json({ error: 'Database error' });
  }
}

module.exports = {
  authenticateToken,
  authenticateSignature,
  requireNetworkAdmin
};