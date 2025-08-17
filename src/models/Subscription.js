const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  networkId: {
    type: String,
    required: true,
    unique: true,
    ref: 'Network'
  },
  stripeSubscriptionId: {
    type: String,
    sparse: true
  },
  planTier: {
    type: String,
    enum: ['free', 'premium', 'enterprise'],
    required: true,
    default: 'free'
  },
  status: {
    type: String,
    enum: ['active', 'cancelled', 'past_due', 'incomplete'],
    default: 'active'
  },
  currentPeriodEnd: {
    type: Date
  }
}, {
  timestamps: true,
  collection: 'subscriptions'
});

// Indexes
subscriptionSchema.index({ networkId: 1 });
subscriptionSchema.index({ stripeSubscriptionId: 1 });
subscriptionSchema.index({ status: 1 });

module.exports = mongoose.model('Subscription', subscriptionSchema);