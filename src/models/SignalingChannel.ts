import mongoose, { Schema } from 'mongoose';
import { ISignalingChannel, ISignalingMessage } from '../types/models';

const signalingMessageSchema = new Schema<ISignalingMessage>({
  type: {
    type: String,
    enum: ['offer', 'answer', 'ice-candidate', 'relay-request'],
    required: true
  },
  from: {
    type: String,
    required: true,
    match: /^peer_[a-zA-Z0-9_]+$/
  },
  to: {
    type: String,
    required: true,
    match: /^peer_[a-zA-Z0-9_]+$/
  },
  data: {
    type: Schema.Types.Mixed,
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const signalingChannelSchema = new Schema<ISignalingChannel>({
  channelId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  participants: {
    type: [String],
    required: true,
    validate: {
      validator: function(v: string[]) {
        return v.length === 2 && v.every(p => /^peer_[a-zA-Z0-9_]+$/.test(p));
      },
      message: 'participants must contain exactly 2 valid device IDs'
    }
  },
  messages: {
    type: [signalingMessageSchema],
    default: []
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 60 * 60 * 1000), // 1 hour TTL
    index: { expireAfterSeconds: 0 }
  }
}, {
  timestamps: true,
  collection: 'signaling_channels'
});

// Indexes for performance
signalingChannelSchema.index({ channelId: 1 }, { unique: true });
signalingChannelSchema.index({ participants: 1 });
signalingChannelSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
signalingChannelSchema.index({ 'messages.to': 1 });

// Limit messages array size to prevent unbounded growth
signalingChannelSchema.pre('save', function() {
  if (this.messages && this.messages.length > 50) {
    this.messages = this.messages.slice(-25); // Keep only last 25 messages
  }
});

export default mongoose.model<ISignalingChannel>('SignalingChannel', signalingChannelSchema);