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

// Get network details by invite code
router.get('/invite/:inviteCode', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { inviteCode } = req.params;

    // Find the invite code
    const invite = await InviteCode.findOne({
      code: inviteCode.toUpperCase(),
      isActive: true
    });

    if (!invite) {
      return res.status(404).json({ error: 'Invalid or expired invite code' });
    }

    // Check if invite code has expired
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      return res.status(410).json({ error: 'Invite code has expired' });
    }

    // Check if invite code has uses remaining
    if (invite.usesRemaining === 0) {
      return res.status(410).json({ error: 'Invite code has no remaining uses' });
    }

    // Get network details
    const network = await Network.findOne({
      networkId: invite.networkId,
      isActive: true
    });

    if (!network) {
      return res.status(404).json({ error: 'Network not found or inactive' });
    }

    // Get member count
    const memberCount = await NetworkMember.countDocuments({
      networkId: invite.networkId,
      isActive: true
    });

    res.json({
      success: true,
      network: {
        networkId: network.networkId,
        name: network.name,
        description: network.description,
        tier: network.billingTier,
        memberCount,
        maxMembers: network.maxMembers,
        createdAt: network.createdAt,
        creator: network.creatorUsername
      },
      invite: {
        code: invite.code,
        usesRemaining: invite.usesRemaining === -1 ? 'unlimited' : invite.usesRemaining,
        expiresAt: invite.expiresAt,
        createdBy: invite.createdBy
      }
    });
  } catch (error) {
    console.error('Invite code lookup error:', error);
    res.status(500).json({ error: 'Failed to lookup invite code' });
  }
});

// Request to join a network
router.post('/request-join', authenticateToken, [
  body('networkId').notEmpty().trim(),
  body('displayName').isLength({ min: 1, max: 50 }).trim(),
  body('message').optional().isLength({ max: 200 }).trim()
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { networkId, displayName, message } = req.body;
    const { username } = req.user;

    // Check if network exists and is active
    const network = await Network.findOne({
      networkId,
      isActive: true
    });
console.log('a');

    if (!network) {
      return res.status(404).json({ error: 'Network not found or inactive' });
    }

console.log('b');
    // Check if user is already a member
    const existingMember = await NetworkMember.findOne({
      networkId,
      username,
      isActive: true
    });
console.log('c');

    if (existingMember) {
      return res.status(409).json({ error: 'You are already a member of this network' });
    }
console.log('d');

    // Check if user already has a pending request
    const existingRequest = await JoinRequest.findOne({
      networkId,
      username,
      status: 'pending'
    });
console.log('e');
    if (existingRequest) {
      return res.status(409).json({ error: 'You already have a pending join request for this network' });
    }

console.log('f');
    // Check if network has reached member limit
    const memberCount = await NetworkMember.countDocuments({
      networkId,
      isActive: true
    });
console.log('3g');

    if (memberCount >= network.maxMembers) {
      return res.status(403).json({ error: 'Network has reached maximum member capacity' });
    }

    // Create join request
    const requestId = generateRequestId();
    const joinRequest = new JoinRequest({
      requestId,
      networkId,
      username,
      displayName,
      message,
      status: 'pending'
    });

    await joinRequest.save();

    res.status(201).json({
      success: true,
      requestId,
      message: 'Join request submitted successfully',
      networkName: network.name,
      status: 'pending'
    });
  } catch (error) {
    console.error('Join request error:', error);
    res.status(500).json({ error: 'Failed to submit join request' });
  }
});

// Get pending join requests for a network (admin only)
router.get('/:networkId/requests', authenticateToken, requireNetworkAdmin, async (req: Request, res: Response) => {
  try {
    const { networkId } = req.params;
    const { status } = req.query;

    // Build query filter
    const filter: any = { networkId };
    if (status && ['pending', 'approved', 'denied'].includes(status as string)) {
      filter.status = status;
    } else {
      filter.status = 'pending'; // Default to pending requests
    }

    // Get join requests
    const requests = await JoinRequest.find(filter)
      .sort({ createdAt: -1 })
      .limit(50);

    res.json({
      success: true,
      networkId,
      requestCount: requests.length,
      requests: requests.map(request => ({
        requestId: request.requestId,
        username: request.username,
        displayName: request.displayName,
        message: request.message,
        status: request.status,
        createdAt: request.createdAt,
        reviewedBy: request.reviewedBy,
        reviewedAt: request.reviewedAt
      }))
    });
  } catch (error) {
    console.error('Get join requests error:', error);
    res.status(500).json({ error: 'Failed to fetch join requests' });
  }
});

// Approve or deny a join request (admin only)
router.post('/:networkId/approve', authenticateToken, requireNetworkAdmin, [
  body('requestId').notEmpty().trim(),
  body('action').isIn(['approve', 'deny']),
  body('displayName').optional().isLength({ min: 1, max: 50 }).trim()
], async (req: Request, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const session = await mongoose.startSession();

  try {
    const { networkId } = req.params;
    const { requestId, action, displayName } = req.body;
    const { username: adminUsername } = req.user;

    await session.withTransaction(async () => {
      // Find the join request
      const joinRequest = await JoinRequest.findOne({
        requestId,
        networkId,
        status: 'pending'
      }).session(session);

      if (!joinRequest) {
        throw new Error('Join request not found or already processed');
      }

      // Update request status
      joinRequest.status = action === 'approve' ? 'approved' : 'denied';
      joinRequest.reviewedBy = adminUsername;
      joinRequest.reviewedAt = new Date();

      await joinRequest.save({ session });

      // If approving, create network member
      if (action === 'approve') {
        // Check network capacity again (in case it changed)
        const network = await Network.findOne({ networkId }).session(session);
        const memberCount = await NetworkMember.countDocuments({
          networkId,
          isActive: true
        }).session(session);

        if (memberCount >= network!.maxMembers) {
          throw new Error('Network has reached maximum member capacity');
        }

        // Create network member
        const member = new NetworkMember({
          networkId,
          username: joinRequest.username,
          role: 'member',
          displayName: displayName || joinRequest.displayName,
          isActive: true
        });

        await member.save({ session });

        // Update network member count
        await Network.updateOne(
          { networkId },
          { $inc: { memberCount: 1 } }
        ).session(session);
      }
    });

    res.json({
      success: true,
      message: `Join request ${action === 'approve' ? 'approved' : 'denied'} successfully`,
      requestId,
      action,
      reviewedBy: adminUsername
    });
  } catch (error) {
    console.error('Approve/deny request error:', error);
    
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({ error: error.message });
    } else if (error instanceof Error && error.message.includes('maximum member capacity')) {
      res.status(403).json({ error: error.message });
    } else {
      res.status(500).json({ error: 'Failed to process join request' });
    }
  } finally {
    await session.endSession();
  }
});

export default router;