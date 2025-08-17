const nacl = require('tweetnacl');
const naclUtil = require('tweetnacl-util');

/**
 * Verify Ed25519 signature
 * @param {string} message - The original message
 * @param {string} signature - Base64 encoded signature
 * @param {string} publicKey - Base64 encoded public key
 * @returns {boolean} - True if signature is valid
 */
function verifySignature(message, signature, publicKey) {
  try {
    const messageBytes = naclUtil.decodeUTF8(message);
    const signatureBytes = naclUtil.decodeBase64(signature);
    const publicKeyBytes = naclUtil.decodeBase64(publicKey);
    
    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

/**
 * Generate a random invite code
 * @returns {string} - Formatted invite code (e.g., "FAMILY-A7K9-2024")
 */
function generateInviteCode(networkName = 'NET') {
  const prefix = networkName.toUpperCase().substring(0, 6);
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  const year = new Date().getFullYear();
  return `${prefix}-${random}-${year}`;
}

/**
 * Generate a unique network ID
 * @param {string} networkName 
 * @returns {string}
 */
function generateNetworkId(networkName) {
  const sanitized = networkName.toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  
  const timestamp = Date.now().toString(36);
  return `${sanitized}-${timestamp}`;
}

/**
 * Generate a unique request ID
 * @returns {string}
 */
function generateRequestId() {
  return 'req_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
}

module.exports = {
  verifySignature,
  generateInviteCode,
  generateNetworkId,
  generateRequestId
};