const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const User = require('../models/User');
const Network = require('../models/Network');
const NetworkMember = require('../models/NetworkMember');
const JoinRequest = require('../models/JoinRequest');

const router = express.Router();

// Get user profile and networks
router.get('/profile', authenticateToken, async (req, res) => {
  const { username } = req.user;

  try {
    // Get user info
    const user = await User.findOne({ username }, {
      username: 1,
      email: 1,
      phone: 1,
      createdAt: 1,
      subscriptionTier: 1
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get user's networks with populated details
    const membershipData = await NetworkMember.aggregate([
      {
        $match: { username, isActive: true }
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
          memberCount: '$network.memberCount',
          maxMembers: '$network.maxMembers',
          role: '$role',
          joinedAt: '$createdAt'
        }
      },
      {
        $sort: { joinedAt: -1 }
      }
    ]);

    res.json({
      user: {
        username: user.username,
        email: user.email,
        phone: user.phone,
        createdAt: user.createdAt,
        subscriptionTier: user.subscriptionTier
      },
      networks: membershipData
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get user's join requests
router.get('/join-requests', authenticateToken, async (req, res) => {
  const { username } = req.user;

  try {
    const requests = await JoinRequest.aggregate([
      {
        $match: { username }
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
        $project: {
          requestId: 1,
          networkId: 1,
          networkName: '$network.name',
          displayName: 1,
          message: 1,
          status: 1,
          createdAt: 1,
          reviewedAt: 1,
          reviewedBy: 1
        }
      },
      {
        $sort: { createdAt: -1 }
      }
    ]);

    res.json({
      requests: requests
    });
  } catch (error) {
    console.error('Join requests error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Update user profile
router.put('/profile', authenticateToken, async (req, res) => {
  const { username } = req.user;
  const { email, phone } = req.body;

  // Validate inputs
  if (email && !/\S+@\S+\.\S+/.test(email)) {
    return res.status(400).json({ error: 'Invalid email format' });
  }

  try {
    const updateFields = {};
    
    if (email !== undefined) {
      updateFields.email = email;
    }
    
    if (phone !== undefined) {
      updateFields.phone = phone;
    }

    if (Object.keys(updateFields).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const result = await User.updateOne(
      { username },
      { $set: updateFields }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      success: true,
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

module.exports = router;