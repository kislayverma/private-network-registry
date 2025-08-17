const mongoose = require('mongoose');

const networkMemberSchema = new mongoose.Schema({
  networkId: {
    type: String,
    required: true,
    ref: 'Network'
  },
  username: {
    type: String,
    required: true,
    ref: 'User'
  },
  role: {
    type: String,
    enum: ['admin', 'member', 'read-only'],
    default: 'member'
  },
  displayName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  collection: 'network_members'
});

// Compound indexes
networkMemberSchema.index({ networkId: 1, username: 1 }, { unique: true });
networkMemberSchema.index({ networkId: 1, isActive: 1 });
networkMemberSchema.index({ username: 1, isActive: 1 });

module.exports = mongoose.model('NetworkMember', networkMemberSchema);