import express, { Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import User from '../models/User';
import NetworkMember from '../models/NetworkMember';

const router = express.Router();

// Get user profile
router.get('/profile', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { username } = req.user;
    const user = await User.findOne({ username, isActive: true });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      username: user.username,
      email: user.email,
      phone: user.phone,
      subscriptionTier: user.subscriptionTier,
      isActive: user.isActive,
      createdAt: user.createdAt
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// Get user's networks
router.get('/networks', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { username } = req.user;
    const memberships = await NetworkMember.find({ username, isActive: true }).populate('networkId');

    res.json({
      networks: memberships.map(membership => ({
        networkId: membership.networkId,
        role: membership.role,
        displayName: membership.displayName,
        joinedAt: membership.createdAt
      }))
    });
  } catch (error) {
    console.error('Networks fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch networks' });
  }
});

export default router;