import { Document } from 'mongoose';

export interface IUser extends Document {
  username: string;
  publicKey: string;
  email?: string;
  phone?: string;
  subscriptionTier: 'free' | 'premium' | 'enterprise';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface INetworkSettings {
  requireApproval: boolean;
  autoApprove: boolean;
  membersCanInvite: boolean;
  dataRetentionDays: number;
}

export interface INetwork extends Document {
  networkId: string;
  name: string;
  description?: string;
  creatorUsername: string;
  settings: INetworkSettings;
  billingTier: 'free' | 'premium' | 'enterprise';
  memberCount: number;
  maxMembers: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface INetworkMember extends Document {
  networkId: string;
  username: string;
  role: 'admin' | 'member' | 'read-only';
  displayName: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IJoinRequest extends Document {
  requestId: string;
  networkId: string;
  username: string;
  displayName: string;
  message?: string;
  status: 'pending' | 'approved' | 'denied';
  reviewedBy?: string;
  reviewedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface INetworkCoordinator extends Document {
  networkId: string;
  peerId: string;
  username: string;
  endpoint?: string;
  lastHeartbeat: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IInviteCode extends Document {
  code: string;
  networkId: string;
  createdBy: string;
  usesRemaining: number; // -1 for unlimited
  expiresAt?: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISubscription extends Document {
  networkId: string;
  stripeSubscriptionId?: string;
  planTier: 'free' | 'premium' | 'enterprise';
  status: 'active' | 'cancelled' | 'past_due' | 'incomplete';
  currentPeriodEnd?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IDevice extends Document {
  deviceId: string;
  userId: string;
  networkId: string;
  signalAddress: string;
  capabilities: ('relay' | 'store' | 'coordinator')[];
  isCoordinator: boolean;
  lastSeen: Date;
  isOnline: boolean;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface ISignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'relay-request';
  from: string;
  to: string;
  data: any;
  timestamp: Date;
}

export interface ISignalingChannel extends Document {
  channelId: string;
  participants: string[];
  messages: ISignalingMessage[];
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}