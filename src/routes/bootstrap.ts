import express, { Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import NetworkCoordinator from '../models/NetworkCoordinator';
import NetworkMember from '../models/NetworkMember';

const router = express.Router();

// Get bootstrap peers for a network
router.get('/:networkId/peers', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { networkId } = req.params;
    const { username } = req.user;

    // Verify user is a member of this network
    const membership = await NetworkMember.findOne({
      networkId,
      username,
      isActive: true
    });

    if (!membership) {
      return res.status(403).json({ error: 'Access denied to this network' });
    }

    // Get active coordinators (bootstrap peers)
    const coordinators = await NetworkCoordinator.find({
      networkId,
      isActive: true,
      lastHeartbeat: { $gte: new Date(Date.now() - 5 * 60 * 1000) } // Last 5 minutes
    }).limit(10);

    res.json({
      networkId,
      peers: coordinators.map(coordinator => ({
        peerId: coordinator.peerId,
        endpoint: coordinator.endpoint,
        lastSeen: coordinator.lastHeartbeat
      }))
    });
  } catch (error) {
    console.error('Bootstrap peers error:', error);
    res.status(500).json({ error: 'Failed to fetch bootstrap peers' });
  }
});

export default router;