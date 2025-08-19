import mongoose, { Schema } from 'mongoose';
import { INetworkCoordinator } from '../types/models';

const networkCoordinatorSchema = new Schema<INetworkCoordinator>({
  networkId: {
    type: String,
    required: true,
    ref: 'Network'
  },
  peerId: {
    type: String,
    required: true
  },
  username: {
    type: String,
    required: true,
    ref: 'User'
  },
  endpoint: {
    type: String,
    trim: true
  },
  lastHeartbeat: {
    type: Date,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  collection: 'network_coordinators'
});

// Compound indexes
networkCoordinatorSchema.index({ networkId: 1, peerId: 1 }, { unique: true });
networkCoordinatorSchema.index({ networkId: 1, isActive: 1, lastHeartbeat: 1 });
networkCoordinatorSchema.index({ username: 1 });

export default mongoose.model<INetworkCoordinator>('NetworkCoordinator', networkCoordinatorSchema);