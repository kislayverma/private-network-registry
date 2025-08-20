import mongoose, { Schema } from 'mongoose';
import { IDevice } from '../types/models';

const deviceSchema = new Schema<IDevice>({
  deviceId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    match: /^peer_[a-zA-Z0-9_]+$/
  },
  userId: {
    type: String,
    required: true,
    ref: 'User'
  },
  networkId: {
    type: String,
    required: true,
    ref: 'Network'
  },
  signalAddress: {
    type: String,
    required: true,
    trim: true,
    validate: {
      validator: function(v: string) {
        return /^wss?:\/\/.+/.test(v);
      },
      message: 'signalAddress must be a valid WebSocket URL'
    }
  },
  capabilities: {
    type: [String],
    enum: ['relay', 'store', 'coordinator'],
    default: []
  },
  isCoordinator: {
    type: Boolean,
    default: false
  },
  lastSeen: {
    type: Date,
    default: Date.now
  },
  isOnline: {
    type: Boolean,
    default: true
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 10 * 60 * 1000), // 10 minutes TTL
    index: { expireAfterSeconds: 0 }
  }
}, {
  timestamps: true,
  collection: 'devices'
});

// Indexes for performance
deviceSchema.index({ deviceId: 1 }, { unique: true });
deviceSchema.index({ networkId: 1, isOnline: 1 });
deviceSchema.index({ userId: 1, networkId: 1 });
deviceSchema.index({ lastSeen: 1 });
deviceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
deviceSchema.index({ networkId: 1, isCoordinator: 1, isOnline: 1 });

// Auto-update expiresAt on lastSeen updates
deviceSchema.pre('save', function() {
  if (this.isModified('lastSeen')) {
    this.expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  }
});

export default mongoose.model<IDevice>('Device', deviceSchema);