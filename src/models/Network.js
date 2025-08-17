const mongoose = require('mongoose');

const networkSettingsSchema = new mongoose.Schema({
  requireApproval: {
    type: Boolean,
    default: true
  },
  autoApprove: {
    type: Boolean,
    default: false
  },
  membersCanInvite: {
    type: Boolean,
    default: false
  },
  dataRetentionDays: {
    type: Number,
    default: 30,
    min: 1
  }
}, { _id: false });

const networkSchema = new mongoose.Schema({
  networkId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  creatorUsername: {
    type: String,
    required: true,
    ref: 'User'
  },
  settings: {
    type: networkSettingsSchema,
    default: {}
  },
  billingTier: {
    type: String,
    enum: ['free', 'premium', 'enterprise'],
    default: 'free'
  },
  memberCount: {
    type: Number,
    default: 1,
    min: 0
  },
  maxMembers: {
    type: Number,
    default: 10,
    min: 1
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  collection: 'networks'
});

// Indexes
networkSchema.index({ networkId: 1 });
networkSchema.index({ creatorUsername: 1 });
networkSchema.index({ isActive: 1 });

module.exports = mongoose.model('Network', networkSchema);