import express, { Request, Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import Subscription from '../models/Subscription';
import Network from '../models/Network';

const router = express.Router();

// Get subscription info for a network
router.get('/subscription/:networkId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { networkId } = req.params;
    
    const subscription = await Subscription.findOne({ networkId });
    const network = await Network.findOne({ networkId });

    if (!network) {
      return res.status(404).json({ error: 'Network not found' });
    }

    res.json({
      networkId,
      subscription: subscription || {
        planTier: 'free',
        status: 'active',
        currentPeriodEnd: null
      }
    });
  } catch (error) {
    console.error('Billing info error:', error);
    res.status(500).json({ error: 'Failed to fetch billing information' });
  }
});

export default router;