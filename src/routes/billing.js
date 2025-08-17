const express = require('express');
const { authenticateToken, requireNetworkAdmin } = require('../middleware/auth');
const Network = require('../models/Network');
const NetworkMember = require('../models/NetworkMember');
const Subscription = require('../models/Subscription');

const router = express.Router();

// Get billing plans
router.get('/plans', (req, res) => {
  const plans = [
    {
      id: 'free',
      name: 'Free',
      price: 0,
      maxMembers: 10,
      features: [
        'Up to 10 members',
        'Basic messaging',
        'File sharing',
        'Community support'
      ]
    },
    {
      id: 'premium',
      name: 'Premium',
      price: 4.99,
      maxMembers: 50,
      features: [
        'Up to 50 members',
        'Priority support',
        'Advanced admin tools',
        'Message history',
        'Custom network branding'
      ]
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      price: 9.99,
      maxMembers: 100,
      features: [
        'Up to 100 members',
        'Analytics dashboard',
        'API access',
        'Custom integrations',
        'Dedicated support',
        'Everything in Premium'
      ]
    }
  ];

  res.json({ plans });
});

// Get network subscription status
router.get('/network/:networkId/subscription', authenticateToken, requireNetworkAdmin, async (req, res) => {
  const { networkId } = req.params;

  try {
    const result = await Network.aggregate([
      {
        $match: { networkId }
      },
      {
        $lookup: {
          from: 'subscriptions',
          localField: 'networkId',
          foreignField: 'networkId',
          as: 'subscription'
        }
      },
      {
        $project: {
          memberCount: 1,
          maxMembers: 1,
          billingTier: 1,
          subscription: { $arrayElemAt: ['$subscription', 0] }
        }
      }
    ]);

    if (result.length === 0) {
      return res.status(404).json({ error: 'Network not found' });
    }

    const networkData = result[0];
    const subscription = networkData.subscription;

    const subscriptionInfo = {
      networkId,
      currentPlan: subscription?.planTier || 'free',
      status: subscription?.status || 'active',
      memberCount: networkData.memberCount,
      maxMembers: networkData.maxMembers,
      billingTier: networkData.billingTier,
      stripeSubscriptionId: subscription?.stripeSubscriptionId,
      currentPeriodEnd: subscription?.currentPeriodEnd,
      createdAt: subscription?.createdAt,
      updatedAt: subscription?.updatedAt
    };

    res.json({ subscription: subscriptionInfo });
  } catch (error) {
    console.error('Get subscription error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Check if network needs upgrade
router.get('/network/:networkId/upgrade-required', authenticateToken, async (req, res) => {
  const { networkId } = req.params;
  const { username } = req.user;
  
  try {
    // Verify user is member of this network and get network info
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
          memberCount: '$network.memberCount',
          maxMembers: '$network.maxMembers',
          billingTier: '$network.billingTier',
          userRole: '$role'
        }
      }
    ]);

    if (result.length === 0) {
      return res.status(404).json({ error: 'Network not found or access denied' });
    }

    const networkData = result[0];
    const upgradeRequired = networkData.memberCount >= networkData.maxMembers;
    const canAddMembers = networkData.memberCount < networkData.maxMembers;

    res.json({
      networkId,
      upgradeRequired,
      canAddMembers,
      currentTier: networkData.billingTier,
      memberCount: networkData.memberCount,
      maxMembers: networkData.maxMembers,
      userRole: networkData.userRole
    });
  } catch (error) {
    console.error('Check upgrade error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Simulate payment processing (replace with actual Stripe integration)
router.post('/network/:networkId/upgrade', authenticateToken, requireNetworkAdmin, async (req, res) => {
  const { networkId } = req.params;
  const { planId, paymentMethodId } = req.body;

  if (!planId || !paymentMethodId) {
    return res.status(400).json({ error: 'planId and paymentMethodId are required' });
  }

  // Validate plan
  const validPlans = {
    'premium': { maxMembers: 50, price: 4.99 },
    'enterprise': { maxMembers: 100, price: 9.99 }
  };

  if (!validPlans[planId]) {
    return res.status(400).json({ error: 'Invalid plan ID' });
  }

  const plan = validPlans[planId];

  try {
    // In a real implementation, you would:
    // 1. Create Stripe customer if not exists
    // 2. Create Stripe subscription
    // 3. Handle webhook for payment confirmation
    // For now, we'll simulate success

    const fakeStripeSubscriptionId = `sub_${Math.random().toString(36).substring(2)}`;
    const currentPeriodEnd = new Date();
    currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

    // Update network limits
    await Network.updateOne(
      { networkId },
      {
        $set: {
          maxMembers: plan.maxMembers,
          billingTier: planId
        }
      }
    );

    // Create or update subscription record
    await Subscription.findOneAndUpdate(
      { networkId },
      {
        networkId,
        stripeSubscriptionId: fakeStripeSubscriptionId,
        planTier: planId,
        status: 'active',
        currentPeriodEnd: currentPeriodEnd
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      subscription: {
        networkId,
        planId,
        stripeSubscriptionId: fakeStripeSubscriptionId,
        maxMembers: plan.maxMembers,
        price: plan.price,
        currentPeriodEnd: currentPeriodEnd.toISOString(),
        status: 'active'
      }
    });
  } catch (error) {
    console.error('Upgrade error:', error);
    res.status(500).json({ error: 'Failed to upgrade network' });
  }
});

// Cancel subscription
router.post('/network/:networkId/cancel', authenticateToken, requireNetworkAdmin, async (req, res) => {
  const { networkId } = req.params;

  try {
    // In a real implementation, you would cancel the Stripe subscription
    const result = await Subscription.updateOne(
      { networkId },
      { $set: { status: 'cancelled' } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Subscription not found' });
    }

    res.json({
      success: true,
      message: 'Subscription cancelled successfully',
      networkId
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Webhook endpoint for Stripe (placeholder)
router.post('/webhook/stripe', (req, res) => {
  // In a real implementation, you would:
  // 1. Verify webhook signature
  // 2. Handle different event types (payment_succeeded, payment_failed, etc.)
  // 3. Update subscription status in database
  
  console.log('Stripe webhook received:', req.body);
  
  res.json({ received: true });
});

module.exports = router;