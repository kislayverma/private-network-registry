const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const NetworkMember = require('../models/NetworkMember');
const NetworkCoordinator = require('../models/NetworkCoordinator');

const router = express.Router();

// Register as coordinator for a network
router.post('/coordinator', authenticateToken, async (req, res) => {
  const { networkId, peerId, endpoint } = req.body;
  const { username } = req.user;

  if (!networkId || !peerId) {
    return res.status(400).json({ error: 'networkId and peerId are required' });
  }

  try {
    // Verify user is member of this network
    const member = await NetworkMember.findOne({
      networkId,
      username,
      isActive: true
    });

    if (!member) {
      return res.status(403).json({ error: 'Not a member of this network' });
    }

    // Insert or update coordinator record
    await NetworkCoordinator.findOneAndUpdate(
      { networkId, peerId },
      {
        networkId,
        peerId,
        username,
        endpoint,
        lastHeartbeat: new Date(),
        isActive: true
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: 'Registered as coordinator',
      peerId,
      networkId
    });
  } catch (error) {
    console.error('Register coordinator error:', error);
    res.status(500).json({ error: 'Failed to register coordinator' });
  }
});

// Heartbeat to keep coordinator active
router.post('/heartbeat', authenticateToken, async (req, res) => {
  const { networkId, peerId, endpoint } = req.body;
  const { username } = req.user;

  if (!networkId || !peerId) {
    return res.status(400).json({ error: 'networkId and peerId are required' });
  }

  try {
    const result = await NetworkCoordinator.updateOne(
      { networkId, peerId, username },
      {
        $set: {
          lastHeartbeat: new Date(),
          endpoint,
          isActive: true
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Coordinator registration not found' });
    }

    res.json({
      success: true,
      lastHeartbeat: new Date().toISOString()
    });
  } catch (error) {
    console.error('Heartbeat error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get active coordinators for a network (for P2P bootstrap)
router.get('/network/:networkId', authenticateToken, async (req, res) => {
  const { networkId } = req.params;
  const { username } = req.user;

  try {
    // Verify user is member of this network
    const member = await NetworkMember.findOne({
      networkId,
      username,
      isActive: true
    });

    if (!member) {
      return res.status(403).json({ error: 'Not a member of this network' });
    }

    // Get active coordinators (heartbeat within last 5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    const coordinators = await NetworkCoordinator.find({
      networkId,
      isActive: true,
      lastHeartbeat: { $gt: fiveMinutesAgo }
    }, {
      peerId: 1,
      username: 1,
      endpoint: 1,
      lastHeartbeat: 1
    }).sort({ lastHeartbeat: -1 }).lean();

    res.json({
      networkId,
      coordinators: coordinators,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Get coordinators error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Unregister coordinator
router.delete('/coordinator', authenticateToken, async (req, res) => {
  const { networkId, peerId } = req.body;
  const { username } = req.user;

  if (!networkId || !peerId) {
    return res.status(400).json({ error: 'networkId and peerId are required' });
  }

  try {
    await NetworkCoordinator.updateOne(
      { networkId, peerId, username },
      { $set: { isActive: false } }
    );

    res.json({
      success: true,
      message: 'Coordinator unregistered'
    });
  } catch (error) {
    console.error('Unregister coordinator error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Cleanup inactive coordinators (internal endpoint)
router.post('/cleanup', async (req, res) => {
  try {
    // This could be called by a cron job
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const result = await NetworkCoordinator.updateMany(
      { lastHeartbeat: { $lt: oneHourAgo } },
      { $set: { isActive: false } }
    );

    res.json({
      success: true,
      cleanedUp: result.modifiedCount,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;