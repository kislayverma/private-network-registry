import * as nacl from 'tweetnacl';
import * as naclUtil from 'tweetnacl-util';

/**
 * Verify Ed25519 signature
 * @param message - The original message
 * @param signature - Base64 encoded signature
 * @param publicKey - Base64 encoded public key
 * @returns True if signature is valid
 */
export function verifySignature(message: string, signature: string, publicKey: string): boolean {
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
 * @param networkName - Network name prefix for the code
 * @returns Formatted invite code (e.g., "FAMILY-A7K9-2024")
 */
export function generateInviteCode(networkName: string = 'NET'): string {
  const prefix = networkName.toUpperCase().substring(0, 6);
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  const year = new Date().getFullYear();
  return `${prefix}-${random}-${year}`;
}

/**
 * Generate a unique network ID
 * @param networkName - The network name to base the ID on
 * @returns Unique network identifier
 */
export function generateNetworkId(networkName: string): string {
  const sanitized = networkName.toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  
  const timestamp = Date.now().toString(36);
  return `${sanitized}-${timestamp}`;
}

/**
 * Generate a unique request ID
 * @returns Unique request identifier
 */
export function generateRequestId(): string {
  return 'req_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
}