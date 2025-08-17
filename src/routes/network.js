const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken, requireNetworkAdmin } = require('../middleware/auth');
const { generateNetworkId, generateInviteCode, generateRequestId } = require('../utils/crypto');
const Network = require('../models/Network');
const NetworkMember = require('../models/NetworkMember');
const JoinRequest = require('../models/JoinRequest');
const InviteCode = require('../models/InviteCode');
const mongoose = require('mongoose');

const router = express.Router();

// Create new network
router.post('/create', authenticateToken, [
  body('name').isLength({ min: 1, max: 100 }),
  body('description').optional().isLength({ max: 500 }),
  body('settings').optional().isObject()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const session = await mongoose.startSession();
  
  try {
    const { name, description, settings = {} } = req.body;
    const { username } = req.user;
    const networkId = generateNetworkId(name);
    const inviteCode = generateInviteCode(name);

    const defaultSettings = {
      requireApproval: true,
      autoApprove: false,
      membersCanInvite: false,
      dataRetentionDays: 30,
      ...settings
    };

    await session.withTransaction(async () => {
      // Create network
      const network = new Network({
        networkId,
        name,
        description,
        creatorUsername: username,
        settings: defaultSettings,
        maxMembers: 10
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
        createdBy: username
      });
      await invite.save({ session });
    });

    res.status(201).json({
      success: true,
      network: {
        networkId,
        name,
        description,
        inviteCode,
        settings: defaultSettings,
        memberCount: 1,
        maxMembers: 10,
        role: 'admin'
      }
    });
  } catch (error) {
    console.error('Network creation error:', error);
    res.status(500).json({ error: 'Failed to create network' });
  } finally {
    await session.endSession();
  }
});

// Submit join request
router.post('/:networkId/join', authenticateToken, [
  body('displayName').isLength({ min: 1, max: 50 }),
  body('message').optional().isLength({ max: 200 }),
  body('inviteCode').isLength({ min: 1 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { networkId } = req.params;
  const { displayName, message, inviteCode } = req.body;
  const { username } = req.user;
  const requestId = generateRequestId();

  const session = await mongoose.startSession();

  try {
    // Verify invite code and network
    const network = await Network.findOne({ networkId, isActive: true });
    if (!network) {
      return res.status(404).json({ error: 'Network not found' });
    }

    const invite = await InviteCode.findOne({
      code: inviteCode,
      networkId,
      isActive: true
    });

    if (!invite) {
      return res.status(404).json({ error: 'Invalid invite code' });
    }

    // Check if code has expired
    if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
      return res.status(410).json({ error: 'Invite code has expired' });
    }

    // Check if code has uses remaining
    if (invite.usesRemaining === 0) {
      return res.status(410).json({ error: 'Invite code has no uses remaining' });
    }

    // Check if network is at capacity
    if (network.memberCount >= network.maxMembers) {
      return res.status(409).json({ error: 'Network is at maximum capacity' });
    }

    // Check if user is already a member
    const existingMember = await NetworkMember.findOne({
      networkId,
      username,
      isActive: true
    });

    if (existingMember) {
      return res.status(409).json({ error: 'Already a member of this network' });
    }

    // Check if there's already a pending request
    const existingRequest = await JoinRequest.findOne({
      networkId,
      username,
      status: 'pending'
    });

    if (existingRequest) {
      return res.status(409).json({ error: 'Join request already pending' });
    }

    // Auto-approve if settings allow it
    if (!network.settings.requireApproval || network.settings.autoApprove) {
      await session.withTransaction(async () => {
        // Add member directly
        const member = new NetworkMember({
          networkId,
          username,
          role: 'member',
          displayName
        });
        await member.save({ session });

        // Update member count
        await Network.updateOne(
          { networkId },
          { $inc: { memberCount: 1 } },
          { session }
        );

        // Decrement invite code uses if applicable
        if (invite.usesRemaining > 0) {
          await InviteCode.updateOne(
            { code: inviteCode, networkId },
            { $inc: { usesRemaining: -1 } },
            { session }
          );
        }
      });

      res.status(201).json({
        success: true,
        status: 'approved',
        message: 'Automatically approved and added to network'
      });
    } else {
      // Create join request for manual approval
      const joinRequest = new JoinRequest({
        requestId,
        networkId,
        username,
        displayName,
        message
      });
      await joinRequest.save();

      res.status(201).json({
        success: true,
        requestId,
        status: 'pending',
        message: 'Join request submitted for approval'
      });
    }
  } catch (error) {
    console.error('Join network error:', error);
    res.status(500).json({ error: 'Failed to process join request' });
  } finally {
    await session.endSession();
  }
});

// Get pending join requests (admin only)
router.get('/:networkId/requests', authenticateToken, requireNetworkAdmin, async (req, res) => {
  const { networkId } = req.params;

  try {
    const requests = await JoinRequest.find({ networkId })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      requests: requests
    });
  } catch (error) {
    console.error('Get requests error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Approve/deny join request (admin only)
router.post('/:networkId/requests/:requestId/review', authenticateToken, requireNetworkAdmin, [
  body('action').isIn(['approve', 'deny']),
  body('role').optional().isIn(['admin', 'member', 'read-only'])
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { networkId, requestId } = req.params;
  const { action, role = 'member' } = req.body;
  const reviewedBy = req.user.username;

  const session = await mongoose.startSession();

  try {
    // Get the join request
    const request = await JoinRequest.findOne({ requestId, networkId });

    if (!request) {
      return res.status(404).json({ error: 'Join request not found' });
    }

    if (request.status !== 'pending') {
      return res.status(409).json({ error: 'Request already reviewed' });
    }

    if (action === 'approve') {
      // Check network capacity
      const network = await Network.findOne({ networkId });
      if (network.memberCount >= network.maxMembers) {
        return res.status(409).json({ error: 'Network is at maximum capacity' });
      }

      await session.withTransaction(async () => {
        // Add member
        const member = new NetworkMember({
          networkId,
          username: request.username,
          role,
          displayName: request.displayName
        });
        await member.save({ session });

        // Update join request status
        await JoinRequest.updateOne(
          { requestId },
          {
            $set: {
              status: 'approved',
              reviewedAt: new Date(),
              reviewedBy
            }
          },
          { session }
        );

        // Update member count
        await Network.updateOne(
          { networkId },
          { $inc: { memberCount: 1 } },
          { session }
        );
      });

      res.json({
        success: true,
        action: 'approved',
        username: request.username,
        role
      });
    } else {
      // Deny request
      await JoinRequest.updateOne(
        { requestId },
        {
          $set: {
            status: 'denied',
            reviewedAt: new Date(),
            reviewedBy
          }
        }
      );

      res.json({
        success: true,
        action: 'denied',
        username: request.username
      });
    }
  } catch (error) {
    console.error('Review request error:', error);
    res.status(500).json({ error: 'Failed to review request' });
  } finally {
    await session.endSession();
  }
});

// Get network details
router.get('/:networkId', authenticateToken, async (req, res) => {
  const { networkId } = req.params;
  const { username } = req.user;

  try {
    // Get network with user's membership info
    const result = await NetworkMember.aggregate([
      {
        $match: { networkId, username, isActive: true }
      },
      {
        $lookup: {
          from: 'networks',
          localField: 'networkId',
          foreignField: 'networkId',
          as: 'network'
        }
      },
      {
        $unwind: '$network'
      },
      {
        $match: { 'network.isActive': true }
      },
      {
        $project: {
          networkId: '$network.networkId',
          name: '$network.name',
          description: '$network.description',
          creator: '$network.creatorUsername',
          settings: '$network.settings',
          memberCount: '$network.memberCount',
          maxMembers: '$network.maxMembers',
          billingTier: '$network.billingTier',
          createdAt: '$network.createdAt',
          userRole: '$role',
          userDisplayName: '$displayName',
          joinedAt: '$createdAt'
        }
      }
    ]);

    if (result.length === 0) {
      return res.status(404).json({ error: 'Network not found or access denied' });
    }

    const networkData = result[0];

    // Get network members
    const members = await NetworkMember.find(
      { networkId, isActive: true },
      { username: 1, role: 1, displayName: 1, createdAt: 1 }
    ).sort({ createdAt: 1 }).lean();

    res.json({
      network: {
        ...networkData,
        joinedAt: networkData.joinedAt,
        members: members.map(m => ({
          username: m.username,
          role: m.role,
          displayName: m.displayName,
          joinedAt: m.createdAt
        }))
      }
    });
  } catch (error) {
    console.error('Get network error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get network invite codes (admin only)
router.get('/:networkId/invite-codes', authenticateToken, requireNetworkAdmin, async (req, res) => {
  const { networkId } = req.params;

  try {
    const codes = await InviteCode.find({ networkId })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      inviteCodes: codes.map(code => ({
        code: code.code,
        created_by: code.createdBy,
        uses_remaining: code.usesRemaining,
        expires_at: code.expiresAt,
        created_at: code.createdAt,
        is_active: code.isActive
      }))
    });
  } catch (error) {
    console.error('Get invite codes error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Create new invite code (admin only)
router.post('/:networkId/invite-codes', authenticateToken, requireNetworkAdmin, async (req, res) => {
  const { networkId } = req.params;
  const { username } = req.user;
  const { usesRemaining = -1, expiresAt } = req.body;

  try {
    // Get network name for code generation
    const network = await Network.findOne({ networkId }, { name: 1 });
    if (!network) {
      return res.status(404).json({ error: 'Network not found' });
    }

    const inviteCode = generateInviteCode(network.name);

    const invite = new InviteCode({
      code: inviteCode,
      networkId,
      createdBy: username,
      usesRemaining,
      expiresAt
    });

    await invite.save();

    res.status(201).json({
      success: true,
      inviteCode: {
        code: inviteCode,
        usesRemaining,
        expiresAt,
        createdAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Create invite code error:', error);
    res.status(500).json({ error: 'Failed to create invite code' });
  }
});

// Look up network by invite code (public endpoint)
router.get('/lookup/:inviteCode', async (req, res) => {
  const { inviteCode } = req.params;

  try {
    const result = await InviteCode.aggregate([
      {
        $match: { code: inviteCode, isActive: true }
      },
      {
        $lookup: {
          from: 'networks',
          localField: 'networkId',
          foreignField: 'networkId',
          as: 'network'
        }
      },
      {
        $unwind: '$network'
      },
      {
        $match: { 'network.isActive': true }
      },
      {
        $project: {
          networkId: '$network.networkId',
          name: '$network.name',
          description: '$network.description',
          creator: '$network.creatorUsername',
          memberCount: '$network.memberCount',
          maxMembers: '$network.maxMembers',
          usesRemaining: '$usesRemaining',
          expiresAt: '$expiresAt'
        }
      }
    ]);

    if (result.length === 0) {
      return res.status(404).json({ error: 'Invalid or expired invite code' });
    }

    const networkInfo = result[0];

    // Check if code has expired
    if (networkInfo.expiresAt && new Date(networkInfo.expiresAt) < new Date()) {
      return res.status(410).json({ error: 'Invite code has expired' });
    }

    // Check if code has uses remaining
    if (networkInfo.usesRemaining === 0) {
      return res.status(410).json({ error: 'Invite code has no uses remaining' });
    }

    res.json({
      network: {
        networkId: networkInfo.networkId,
        name: networkInfo.name,
        description: networkInfo.description,
        creator: networkInfo.creator,
        memberCount: networkInfo.memberCount,
        maxMembers: networkInfo.maxMembers,
        inviteCode
      }
    });
  } catch (error) {
    console.error('Lookup network error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Update network settings (admin only)
router.put('/:networkId/settings', authenticateToken, requireNetworkAdmin, async (req, res) => {
  const { networkId } = req.params;
  const { settings } = req.body;

  if (!settings || typeof settings !== 'object') {
    return res.status(400).json({ error: 'Invalid settings object' });
  }

  try {
    // Get current network
    const network = await Network.findOne({ networkId });
    if (!network) {
      return res.status(404).json({ error: 'Network not found' });
    }

    const updatedSettings = { ...network.settings.toObject(), ...settings };

    await Network.updateOne(
      { networkId },
      { $set: { settings: updatedSettings } }
    );

    res.json({
      success: true,
      settings: updatedSettings
    });
  } catch (error) {
    console.error('Update settings error:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

module.exports = router;