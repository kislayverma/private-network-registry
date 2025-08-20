import WebSocket, { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import { IncomingMessage } from 'http';
import Device from '../models/Device';
import SignalingChannel from '../models/SignalingChannel';

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  deviceId?: string;
  isAuthenticated?: boolean;
}

interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'relay-request';
  toPeerId: string;
  data: any;
}

class SignalingServer {
  private wss: WebSocketServer;
  private activeConnections = new Map<string, AuthenticatedWebSocket>();

  constructor(port: number = parseInt(process.env.SIGNALING_PORT || '3005')) {
    console.log('Signalling server constructor...');
    this.wss = new WebSocketServer({ 
      port,
      path: process.env.SIGNALING_PATH || '/signaling'
    });

    this.setupServer();
    console.log(`🚀 WebRTC Signaling Server running on port ${port}`);
  }

  private setupServer(): void {
    console.log('set up signalling server start...');
    this.wss.on('connection', (ws: AuthenticatedWebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    this.wss.on('error', (error) => {
      console.error('WebSocket Server error:', error);
    });
    console.log('set up signalling server end...');
  }

  private handleConnection(ws: AuthenticatedWebSocket, req: IncomingMessage): void {
console.log(JSON.stringify(req));
    const deviceId = this.extractDeviceId(req.url);
    const token = this.extractToken(req);

console.log(deviceId + ' : ' + token);

    // Authenticate WebSocket connection
    const user = this.validateJWT(token);
    if (!user || !deviceId) {
      ws.close(1008, 'Invalid authentication or device ID');
      return;
    }

    // Set connection properties
    ws.userId = user.username;
    ws.deviceId = deviceId;
    ws.isAuthenticated = true;

    // Store active connection
    this.activeConnections.set(deviceId, ws);
    console.log(`📱 Device ${deviceId} connected (user: ${user.username})`);

    // Set up message handlers
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString()) as SignalingMessage;
        await this.handleSignalingMessage(message, deviceId);
      } catch (error) {
        console.error('Signaling message parsing error:', error);
        ws.send(JSON.stringify({ 
          error: 'Invalid message format',
          timestamp: Date.now()
        }));
      }
    });

    ws.on('close', () => {
      this.activeConnections.delete(deviceId);
      console.log(`📱 Device ${deviceId} disconnected`);
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for ${deviceId}:`, error);
      this.activeConnections.delete(deviceId);
    });

    // Send connection confirmation
    ws.send(JSON.stringify({
      type: 'connection_established',
      deviceId,
      timestamp: Date.now()
    }));
  }

  private async handleSignalingMessage(message: SignalingMessage, fromDeviceId: string): Promise<void> {
    const { type, toPeerId, data } = message;

    // Validate message structure
    if (!type || !toPeerId || !data) {
      throw new Error('Invalid signaling message structure');
    }

    // Validate device IDs
    if (!this.isValidDeviceId(fromDeviceId) || !this.isValidDeviceId(toPeerId)) {
      throw new Error('Invalid device ID format');
    }

    try {
      // Verify both devices exist and are in the same network
      const [fromDevice, toDevice] = await Promise.all([
        Device.findOne({ deviceId: fromDeviceId }),
        Device.findOne({ deviceId: toPeerId })
      ]);

      if (!fromDevice || !toDevice) {
        throw new Error('Device not found');
      }

      if (fromDevice.networkId !== toDevice.networkId) {
        throw new Error('Devices not in same network');
      }

      // Store message in database for offline delivery
      const channelId = this.generateChannelId(fromDeviceId, toPeerId);
      
      await SignalingChannel.findOneAndUpdate(
        { channelId },
        {
          $push: {
            messages: {
              type,
              from: fromDeviceId,
              to: toPeerId,
              data,
              timestamp: new Date()
            }
          },
          $setOnInsert: {
            channelId,
            participants: [fromDeviceId, toPeerId],
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour TTL
          }
        },
        { upsert: true, new: true }
      );

      // Attempt direct delivery if target is online
      const targetWebSocket = this.activeConnections.get(toPeerId);
      if (targetWebSocket && targetWebSocket.readyState === WebSocket.OPEN) {
        targetWebSocket.send(JSON.stringify({
          type,
          fromPeerId: fromDeviceId,
          toPeerId,
          data,
          timestamp: Date.now()
        }));
        
        console.log(`📨 Delivered ${type} message from ${fromDeviceId} to ${toPeerId}`);
      } else {
        console.log(`📬 Queued ${type} message for offline device ${toPeerId}`);
      }

    } catch (error) {
      console.error('Signaling message handling error:', error);
      
      // Send error back to sender
      const senderWs = this.activeConnections.get(fromDeviceId);
      if (senderWs && senderWs.readyState === WebSocket.OPEN) {
        senderWs.send(JSON.stringify({
          error: 'Failed to deliver message',
          originalMessage: { type, toPeerId },
          timestamp: Date.now()
        }));
      }
    }
  }

  private extractDeviceId(url?: string): string | null {
    if (!url) return null;
    
    try {
      // Parse the URL to handle query parameters properly
      const parsedUrl = new URL(url, 'http://localhost');
      
      // Extract deviceId from URL path: /signaling/peer_alice_1642684800
      const pathParts = parsedUrl.pathname.split('/').filter(part => part.length > 0);
      
      // Expect path format: /signaling/peer_alice_123
      if (pathParts.length >= 2 && pathParts[0] === 'signaling') {
        const deviceId = pathParts[1];
        return this.isValidDeviceId(deviceId) ? deviceId : null;
      }
      
      return null;
    } catch (error) {
      console.error('Error parsing WebSocket URL:', error);
      return null;
    }
  }

  private extractToken(req: IncomingMessage): string | null {
    // Try Authorization header first
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    
    // Try query parameter as fallback
    if (req.url) {
      const url = new URL(req.url, 'http://localhost');
      return url.searchParams.get('token');
    }
    
    return null;
  }

  private validateJWT(token: string | null): any {
    console.log('JWT token in signal: ' + token);
    if (!token) return null;
    
    try {
      return jwt.verify(token, process.env.JWT_SECRET as string);
    } catch (error) {
      console.error('JWT validation error:', error);
      return null;
    }
  }

  private isValidDeviceId(deviceId: string): boolean {
    return /^peer_[a-zA-Z0-9_]+$/.test(deviceId);
  }

  private generateChannelId(deviceId1: string, deviceId2: string): string {
    // Create consistent channel ID regardless of message direction
    const sorted = [deviceId1, deviceId2].sort();
    return `${sorted[0]}_${sorted[1]}`;
  }

  // Public methods for server management
  public getActiveConnections(): number {
    return this.activeConnections.size;
  }

  public getConnectionsByNetwork(): Map<string, number> {
    const networkCounts = new Map<string, number>();
    
    this.activeConnections.forEach((ws) => {
      if (ws.deviceId) {
        Device.findOne({ deviceId: ws.deviceId }).then(device => {
          if (device) {
            const current = networkCounts.get(device.networkId) || 0;
            networkCounts.set(device.networkId, current + 1);
          }
        });
      }
    });
    
    return networkCounts;
  }

  public close(): void {
    this.wss.close();
    console.log('🛑 Signaling server closed');
  }
}

export default SignalingServer;