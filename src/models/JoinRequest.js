const mongoose = require('mongoose');

const joinRequestSchema = new mongoose.Schema({
  requestId: {
    type: String,
    required: true,
    unique: true
  },
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
  displayName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  message: {
    type: String,
    trim: true,
    maxlength: 200
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'denied'],
    default: 'pending'
  },
  reviewedAt: {
    type: Date
  },
  reviewedBy: {
    type: String,
    ref: 'User'
  }
}, {
  timestamps: true,
  collection: 'join_requests'
});

// Indexes
joinRequestSchema.index({ requestId: 1 });
joinRequestSchema.index({ networkId: 1, status: 1 });
joinRequestSchema.index({ username: 1 });
joinRequestSchema.index({ networkId: 1, username: 1 });

module.exports = mongoose.model('JoinRequest', joinRequestSchema);