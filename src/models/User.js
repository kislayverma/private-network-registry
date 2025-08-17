const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 30,
    match: /^[a-zA-Z0-9_]+$/
  },
  publicKey: {
    type: String,
    required: true,
    unique: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    match: /\S+@\S+\.\S+/
  },
  phone: {
    type: String,
    trim: true
  },
  subscriptionTier: {
    type: String,
    enum: ['free', 'premium', 'enterprise'],
    default: 'free'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  collection: 'users'
});

// Indexes
userSchema.index({ username: 1 });
userSchema.index({ publicKey: 1 });
userSchema.index({ email: 1 });

module.exports = mongoose.model('User', userSchema);