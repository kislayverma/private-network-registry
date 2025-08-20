import express, { Request, Response } from 'express';
import { body, param, validationResult } from 'express-validator';
import rateLimit from 'express-rate-limit';
import { authenticateToken } from '../middleware/auth';
import Device from '../models/Device';
import SignalingChannel from '../models/SignalingChannel';
import NetworkMember from '../models/NetworkMember';

const router = express.Router();

// Rate limiting for presence announcements
const announceRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 12, // Max 12 announcements per minute (every 5 seconds)
  message: { error: 'Too many presence announcements' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Validation middleware for presence announcement
const validatePresenceAnnouncement = [
  param('networkId').isAlphanumeric().isLength({ min: 1, max: 50 }),
  body('peerId').matches(/^peer_[a-zA-Z0-9_]+$/).isLength({ max: 100 }),
  body('signalAddress').isURL({ protocols: ['ws', 'wss'] }),
  body('capabilities').isArray().optional(),
  body('capabilities.*').isIn(['relay', 'store', 'coordinator']),
  
  (req: Request, res: Response, next: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];

// Device Presence Announcement
router.post('/network/:networkId/announce', 
  announceRateLimit,
  validatePresenceAnnouncement,
  authenticateToken,
  async (req: Request, res: Response) => {
    const { networkId } = req.params;
    const { peerId, signalAddress, capabilities = [] } = req.body;
    const { username } = req.user;

    try {
      // Verify user is a member of this network
      const membership = await NetworkMember.findOne({
        networkId,
        username,
        isActive: true
      });

      if (!membership) {
        return res.status(403).json({ error: 'Access denied to this network' });
      }

      // Update or create device presence
      await Device.findOneAndUpdate(
        { deviceId: peerId },
        {
          $set: {
            userId: username,
            networkId,
            signalAddress,
            capabilities,
            isCoordinator: capabilities.includes('coordinator'),
            lastSeen: new Date(),
            isOnline: true,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes TTL
          },
          $setOnInsert: {
            deviceId: peerId,
            createdAt: new Date()
          }
        },
        { upsert: true, new: true }
      );

      res.status(200).json({ 
        success: true,
        message: 'Presence announced successfully'
      });
    } catch (error) {
      console.error('Presence announcement error:', error);
      res.status(500).json({ error: 'Failed to announce presence' });
    }
  }
);

// Get Network Peers
router.get('/network/:networkId/peers', authenticateToken, async (req: Request, res: Response) => {
  const { networkId } = req.params;
  const { username } = req.user;
  
  try {
    // Verify user is a member of this network
    const membership = await NetworkMember.findOne({
      networkId,
      username,
      isActive: true
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied to this network' });
    }

    // Get active devices in the network
    const devices = await Device.find({
      networkId,
      isOnline: true,
      lastSeen: { $gte: new Date(Date.now() - 10 * 60 * 1000) } // Active in last 10 minutes
    }).sort({ lastSeen: -1 }).limit(100);

    const peers = devices.map(device => ({
      userId: device.userId,
      deviceId: device.deviceId,
      signalAddress: device.signalAddress,
      capabilities: device.capabilities,
      isCoordinator: device.isCoordinator,
      lastSeen: device.lastSeen
    }));

    res.json({ 
      success: true,
      networkId,
      peerCount: peers.length,
      peers 
    });
  } catch (error) {
    console.error('Get peers error:', error);
    res.status(500).json({ error: 'Failed to get network peers' });
  }
});

// Get Specific Peer (Fallback Discovery)
router.get('/network/:networkId/peer/:userId', authenticateToken, async (req: Request, res: Response) => {
  const { networkId, userId } = req.params;
  const { username } = req.user;
  
  try {
    // Verify user is a member of this network
    const membership = await NetworkMember.findOne({
      networkId,
      username,
      isActive: true
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied to this network' });
    }

    // Look for the specific user's device
    const device = await Device.findOne({
      userId,
      networkId,
      isOnline: true
    });

    if (!device) {
      // Return last known coordinators for fallback routing
      const coordinators = await Device.find({
        networkId,
        isCoordinator: true,
        lastSeen: { $gte: new Date(Date.now() - 60 * 60 * 1000) } // Last hour
      }).limit(5);

      return res.json({
        success: true,
        online: false,
        lastSeen: null,
        lastCoordinators: coordinators.map(c => ({
          deviceId: c.deviceId,
          signalAddress: c.signalAddress,
          lastSeen: c.lastSeen
        }))
      });
    }

    res.json({
      success: true,
      online: true,
      deviceId: device.deviceId,
      signalAddress: device.signalAddress,
      capabilities: device.capabilities,
      lastSeen: device.lastSeen
    });
  } catch (error) {
    console.error('Get specific peer error:', error);
    res.status(500).json({ error: 'Failed to get peer info' });
  }
});

router.post('/signaling/:devideId', 
  announceRateLimit,
  // validatePresenceAnnouncement,
  authenticateToken,
  async (req: Request, res: Response) => {
    console.log('Signalling API: ' + JSON.stringify(req));
    const { networkId } = req.params;
    const { peerId, signalAddress, capabilities = [] } = req.body;
    const { username } = req.user;

    try {
      // Verify user is a member of this network
      const membership = await NetworkMember.findOne({
        networkId,
        username,
        isActive: true
      });

      if (!membership) {
        return res.status(403).json({ error: 'Access denied to this network' });
      }

      // Update or create device presence
      await Device.findOneAndUpdate(
        { deviceId: peerId },
        {
          $set: {
            userId: username,
            networkId,
            signalAddress,
            capabilities,
            isCoordinator: capabilities.includes('coordinator'),
            lastSeen: new Date(),
            isOnline: true,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes TTL
          },
          $setOnInsert: {
            deviceId: peerId,
            createdAt: new Date()
          }
        },
        { upsert: true, new: true }
      );

      res.status(200).json({ 
        success: true,
        message: 'Presence announced successfully'
      });
    } catch (error) {
      console.error('Presence announcement error:', error);
      res.status(500).json({ error: 'Failed to announce presence' });
    }
  }
);

// Get Pending Signaling Messages
router.get('/signaling/messages/:deviceId', authenticateToken, async (req: Request, res: Response) => {
  const { deviceId } = req.params;
  const { username } = req.user;
  
  try {
    // Verify the device belongs to the authenticated user
    const device = await Device.findOne({ deviceId, userId: username });
    if (!device) {
      return res.status(403).json({ error: 'Access denied to this device' });
    }

    // Find signaling channels with messages for this device
    const channels = await SignalingChannel.find({
      participants: deviceId,
      'messages.to': deviceId
    });

    const messages = [];
    const channelUpdates = [];

    for (const channel of channels) {
      const deviceMessages = channel.messages.filter(msg => msg.to === deviceId);
      messages.push(...deviceMessages);
      
      // Prepare to remove delivered messages
      if (deviceMessages.length > 0) {
        channelUpdates.push({
          updateOne: {
            filter: { _id: channel._id },
            update: { $pull: { messages: { to: deviceId } } }
          }
        });
      }
    }

    // Clear delivered messages to prevent redelivery
    if (channelUpdates.length > 0) {
      await SignalingChannel.bulkWrite(channelUpdates);
    }

    res.json({ 
      success: true,
      messageCount: messages.length,
      messages 
    });
  } catch (error) {
    console.error('Get signaling messages error:', error);
    res.status(500).json({ error: 'Failed to get pending messages' });
  }
});

export default router;