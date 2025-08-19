import mongoose, { Schema } from 'mongoose';
import { IInviteCode } from '../types/models';

const inviteCodeSchema = new Schema<IInviteCode>({
  code: {
    type: String,
    required: true,
    unique: true,
    uppercase: true,
    trim: true
  },
  networkId: {
    type: String,
    required: true,
    ref: 'Network'
  },
  createdBy: {
    type: String,
    required: true,
    ref: 'User'
  },
  usesRemaining: {
    type: Number,
    default: -1 // -1 for unlimited
  },
  expiresAt: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  collection: 'invite_codes'
});

// Indexes
inviteCodeSchema.index({ code: 1 });
inviteCodeSchema.index({ networkId: 1, isActive: 1 });
inviteCodeSchema.index({ createdBy: 1 });
inviteCodeSchema.index({ expiresAt: 1 });

export default mongoose.model<IInviteCode>('InviteCode', inviteCodeSchema);