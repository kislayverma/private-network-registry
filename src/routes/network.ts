import express, { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateToken, requireNetworkAdmin } from '../middleware/auth';
import { generateNetworkId, generateInviteCode, generateRequestId } from '../utils/crypto';
import Network from '../models/Network';
import NetworkMember from '../models/NetworkMember';
import JoinRequest from '../models/JoinRequest';
import InviteCode from '../models/InviteCode';
import mongoose from 'mongoose';

const router = express.Router();

// Create new network
router.post('/create', authenticateToken, [
  body('networkName').isLength({ min: 1, max: 100 }),
  body('description').optional().isLength({ max: 500 }),
  body('settings').optional().isObject()
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
    console.log(JSON.stringify(errors));
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const session = await mongoose.startSession();
  
  try {
    const { networkName, description, settings = {} } = req.body;
    const { username } = req.user;
    const networkId = generateNetworkId(networkName);
    const inviteCode = generateInviteCode(networkName);

    await session.withTransaction(async () => {
      // Create network
      const network = new Network({
        networkId,
        name: networkName,
        description,
        creatorUsername: username,
        settings
      });

      await network.save({ session });

      // Add creator as admin member
      const member = new NetworkMember({
        networkId,
        username,
        role: 'admin',
        displayName: username
      });

      await member.save({ session });

      // Create initial invite code
      const invite = new InviteCode({
        code: inviteCode,
        networkId,
        createdBy: username,
        usesRemaining: 10
      });

      await invite.save({ session });
    });

    res.status(201).json({
      success: true,
      networkId,
      inviteCode,
      message: 'Network created successfully'
    });
  } catch (error) {
    console.error('Network creation error:', error);
    res.status(500).json({ error: 'Failed to create network' });
  } finally {
    await session.endSession();
  }
});

export default router;