# Registry Backend Implementation Specification
## P2P WebRTC Signaling and Presence Management

**Target Stack:** Node.js + MongoDB  
**Purpose:** Enable WebRTC P2P connections with presence announcements and signaling  
**Priority:** High - Required for P2P messaging functionality

---

## Overview

The existing registry backend needs enhancement to support:
1. **Device Presence Management** - Track online/offline status of peer devices
2. **WebRTC Signaling** - Facilitate initial P2P connection establishment
3. **Peer Discovery** - Enable devices to find each other across networks
4. **Always-On Announcements** - Handle periodic presence updates from mobile apps

## Database Schema Changes

### 1. New Collections Required

#### `devices` Collection
```javascript
{
  _id: ObjectId,
  deviceId: String,           // "peer_alice_1642684800" (unique identifier)
  userId: String,             // User who owns this device
  networkId: String,          // Which private network this device belongs to
  signalAddress: String,      // "wss://signal.yourapp.com/peer_alice_1642684800" 
  capabilities: [String],     // ["relay", "store", "coordinator"]
  isCoordinator: Boolean,     // Can this device help with peer discovery?
  lastSeen: Date,            // Last presence announcement timestamp
  isOnline: Boolean,         // Current online status
  createdAt: Date,           // Device first seen
  expiresAt: Date            // TTL for automatic cleanup
}
```

#### `signaling_channels` Collection
```javascript
{
  _id: ObjectId,
  channelId: String,          // "device1_device2" (unique per peer pair)
  participants: [String],     // [deviceId1, deviceId2]
  messages: [{
    type: String,             // "offer", "answer", "ice-candidate"
    from: String,             // Source deviceId
    to: String,               // Target deviceId  
    data: Object,             // WebRTC SDP or ICE candidate data
    timestamp: Date
  }],
  createdAt: Date,
  expiresAt: Date            // Auto-expire signaling data after 1 hour
}
```

### 2. Required Database Indexes

```javascript
// Performance indexes - CRITICAL for scalability
db.devices.createIndex({ deviceId: 1 }, { unique: true })
db.devices.createIndex({ networkId: 1, isOnline: 1 })
db.devices.createIndex({ userId: 1, networkId: 1 })
db.devices.createIndex({ lastSeen: 1 })
db.devices.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }) // TTL

db.signaling_channels.createIndex({ channelId: 1 })
db.signaling_channels.createIndex({ participants: 1 })
db.signaling_channels.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }) // TTL
```

---

## API Endpoints Implementation

### 1. Device Presence Announcement

**Endpoint:** `POST /network/:networkId/announce`  
**Frequency:** Called every 5 minutes by mobile apps  
**Purpose:** Register/update device presence in network

```javascript
app.post('/network/:networkId/announce', authenticateToken, async (req, res) => {
  const { networkId } = req.params;
  const { peerId, signalAddress, capabilities } = req.body;
  const userId = req.user.id;

  try {
    await db.collection('devices').updateOne(
      { deviceId: peerId },
      {
        $set: {
          userId,
          networkId,
          signalAddress,
          capabilities: capabilities || [],
          isCoordinator: capabilities?.includes('coordinator') || false,
          lastSeen: new Date(),
          isOnline: true,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes TTL
        },
        $setOnInsert: {
          deviceId: peerId,
          createdAt: new Date()
        }
      },
      { upsert: true }
    );

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Presence announcement error:', error);
    res.status(500).json({ error: 'Failed to announce presence' });
  }
});
```

**Request Body:**
```json
{
  "peerId": "peer_alice_1642684800",
  "signalAddress": "wss://signal.yourapp.com/peer_alice_1642684800",
  "capabilities": ["relay", "store"]
}
```

### 2. Get Network Peers

**Endpoint:** `GET /network/:networkId/peers`  
**Purpose:** Discover all active peers in a network

```javascript
app.get('/network/:networkId/peers', authenticateToken, async (req, res) => {
  const { networkId } = req.params;
  
  try {
    const devices = await db.collection('devices').find({
      networkId,
      isOnline: true,
      lastSeen: { $gte: new Date(Date.now() - 10 * 60 * 1000) } // Active in last 10 minutes
    }).toArray();

    const peers = devices.map(device => ({
      userId: device.userId,
      deviceId: device.deviceId,
      signalAddress: device.signalAddress,
      capabilities: device.capabilities,
      isCoordinator: device.isCoordinator,
      lastSeen: device.lastSeen
    }));

    res.json({ peers });
  } catch (error) {
    console.error('Get peers error:', error);
    res.status(500).json({ error: 'Failed to get network peers' });
  }
});
```

### 3. Get Specific Peer (Fallback Discovery)

**Endpoint:** `GET /network/:networkId/peer/:userId`  
**Purpose:** Last-resort peer discovery when P2P methods fail

```javascript
app.get('/network/:networkId/peer/:userId', authenticateToken, async (req, res) => {
  const { networkId, userId } = req.params;
  
  try {
    const device = await db.collection('devices').findOne({
      userId,
      networkId,
      isOnline: true
    });

    if (!device) {
      // Return last known coordinators for fallback routing
      const coordinators = await db.collection('devices').find({
        networkId,
        isCoordinator: true,
        lastSeen: { $gte: new Date(Date.now() - 60 * 60 * 1000) } // Last hour
      }).toArray();

      return res.json({
        online: false,
        lastSeen: null,
        lastCoordinators: coordinators.map(c => c.deviceId)
      });
    }

    res.json({
      online: true,
      deviceId: device.deviceId,
      signalAddress: device.signalAddress,
      capabilities: device.capabilities,
      lastSeen: device.lastSeen
    });
  } catch (error) {
    console.error('Get specific peer error:', error);
    res.status(500).json({ error: 'Failed to get peer info' });
  }
});
```

### 4. Pending Signaling Messages

**Endpoint:** `GET /signaling/messages/:deviceId`  
**Purpose:** Deliver queued WebRTC signaling messages for offline devices

```javascript
app.get('/signaling/messages/:deviceId', authenticateToken, async (req, res) => {
  const { deviceId } = req.params;
  
  try {
    const channels = await db.collection('signaling_channels').find({
      participants: deviceId,
      'messages.to': deviceId
    }).toArray();

    const messages = [];
    for (const channel of channels) {
      for (const msg of channel.messages) {
        if (msg.to === deviceId) {
          messages.push(msg);
        }
      }
    }

    // Clear delivered messages to prevent redelivery
    await db.collection('signaling_channels').updateMany(
      { participants: deviceId },
      { $pull: { messages: { to: deviceId } } }
    );

    res.json({ messages });
  } catch (error) {
    console.error('Get signaling messages error:', error);
    res.status(500).json({ error: 'Failed to get pending messages' });
  }
});
```

---

## WebSocket Signaling Server

### 1. WebSocket Server Setup

**Port:** 8080 (separate from HTTP API)  
**Purpose:** Real-time WebRTC signaling message relay

```javascript
const WebSocket = require('ws');

// Create WebSocket server for signaling
const wss = new WebSocket.Server({ 
  port: process.env.SIGNALING_PORT || 8080,
  path: '/signaling'
});

const activeConnections = new Map(); // deviceId -> WebSocket

wss.on('connection', (ws, req) => {
  const deviceId = extractDeviceId(req.url); // Get deviceId from URL path
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  // Authenticate WebSocket connection
  if (!validateJWT(token)) {
    ws.close(1008, 'Invalid authentication token');
    return;
  }
  
  activeConnections.set(deviceId, ws);
  console.log(`Device ${deviceId} connected to signaling server`);

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      await handleSignalingMessage(message, deviceId);
    } catch (error) {
      console.error('Signaling message parsing error:', error);
      ws.send(JSON.stringify({ error: 'Invalid message format' }));
    }
  });

  ws.on('close', () => {
    activeConnections.delete(deviceId);
    console.log(`Device ${deviceId} disconnected from signaling`);
  });

  ws.on('error', (error) => {
    console.error(`WebSocket error for ${deviceId}:`, error);
    activeConnections.delete(deviceId);
  });
});

function extractDeviceId(url) {
  // Extract deviceId from URL: /signaling/peer_alice_1642684800
  return url.split('/').pop();
}
```

### 2. Signaling Message Handler

```javascript
async function handleSignalingMessage(message, fromDeviceId) {
  const { type, toPeerId, data } = message;

  // Validate message structure
  if (!type || !toPeerId || !data) {
    throw new Error('Invalid signaling message structure');
  }

  // Store message in database for offline delivery
  await db.collection('signaling_channels').updateOne(
    { channelId: `${fromDeviceId}_${toPeerId}` },
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
        channelId: `${fromDeviceId}_${toPeerId}`,
        participants: [fromDeviceId, toPeerId],
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000) // 1 hour TTL
      }
    },
    { upsert: true }
  );

  // Attempt direct delivery if target is online
  const targetWebSocket = activeConnections.get(toPeerId);
  if (targetWebSocket && targetWebSocket.readyState === WebSocket.OPEN) {
    targetWebSocket.send(JSON.stringify({
      type,
      fromPeerId: fromDeviceId,
      toPeerId,
      data,
      timestamp: Date.now()
    }));
    
    console.log(`Delivered ${type} message from ${fromDeviceId} to ${toPeerId}`);
  } else {
    console.log(`Queued ${type} message for offline device ${toPeerId}`);
  }
}
```

---

## Background Jobs

### 1. Presence Cleanup Job

**Purpose:** Mark stale devices as offline  
**Frequency:** Every 5 minutes

```javascript
// Clean up stale presence records
setInterval(async () => {
  try {
    const staleThreshold = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
    
    const result = await db.collection('devices').updateMany(
      { 
        lastSeen: { $lt: staleThreshold },
        isOnline: true 
      },
      { $set: { isOnline: false } }
    );
    
    if (result.modifiedCount > 0) {
      console.log(`Marked ${result.modifiedCount} devices as offline`);
    }
  } catch (error) {
    console.error('Presence cleanup job error:', error);
  }
}, 5 * 60 * 1000); // Run every 5 minutes
```

### 2. Coordinator Selection Job

**Purpose:** Ensure each network has sufficient coordinator devices  
**Frequency:** Every 10 minutes

```javascript
// Automatic coordinator selection for network resilience
setInterval(async () => {
  try {
    const networks = await db.collection('devices').distinct('networkId', { isOnline: true });
    
    for (const networkId of networks) {
      const coordinatorCount = await db.collection('devices').countDocuments({
        networkId,
        isCoordinator: true,
        isOnline: true
      });

      const MIN_COORDINATORS = 2;
      
      // Promote devices to coordinators if needed
      if (coordinatorCount < MIN_COORDINATORS) {
        const devicesToPromote = MIN_COORDINATORS - coordinatorCount;
        
        await db.collection('devices').updateMany(
          {
            networkId,
            isOnline: true,
            isCoordinator: false,
            capabilities: { $in: ['store', 'relay'] } // Only promote capable devices
          },
          { 
            $set: { isCoordinator: true },
            $addToSet: { capabilities: 'coordinator' }
          },
          { limit: devicesToPromote }
        );
        
        console.log(`Promoted ${devicesToPromote} devices to coordinator in network ${networkId}`);
      }
    }
  } catch (error) {
    console.error('Coordinator selection job error:', error);
  }
}, 10 * 60 * 1000); // Run every 10 minutes
```

---

## Security & Rate Limiting

### 1. Rate Limiting for Presence Announcements

```javascript
const rateLimit = require('express-rate-limit');

// Prevent presence announcement spam
const announceRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 12, // Max 12 announcements per minute (every 5 seconds)
  message: { error: 'Too many presence announcements' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/network/:networkId/announce', announceRateLimit);
```

### 2. WebSocket Authentication

```javascript
function validateJWT(token) {
  try {
    const jwt = require('jsonwebtoken');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded;
  } catch (error) {
    return null;
  }
}

// Enhanced WebSocket connection with auth
wss.on('connection', (ws, req) => {
  const deviceId = extractDeviceId(req.url);
  const token = req.headers.authorization?.replace('Bearer ', '') || 
                new URL(req.url, 'http://localhost').searchParams.get('token');
  
  const user = validateJWT(token);
  if (!user) {
    ws.close(1008, 'Authentication required');
    return;
  }
  
  ws.userId = user.id;
  ws.deviceId = deviceId;
  
  // Continue with connection setup...
});
```

### 3. Input Validation

```javascript
const { body, param, validationResult } = require('express-validator');

// Validation middleware for presence announcement
const validatePresenceAnnouncement = [
  param('networkId').isAlphanumeric().isLength({ min: 1, max: 50 }),
  body('peerId').matches(/^peer_[a-zA-Z0-9_]+$/).isLength({ max: 100 }),
  body('signalAddress').isURL({ protocols: ['ws', 'wss'] }),
  body('capabilities').isArray().optional(),
  body('capabilities.*').isIn(['relay', 'store', 'coordinator']),
  
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];

app.post('/network/:networkId/announce', validatePresenceAnnouncement, authenticateToken, async (req, res) => {
  // Implementation here...
});
```

---

## Environment Configuration

### Required Environment Variables

```bash
# MongoDB Configuration
MONGODB_URI=mongodb://localhost:27017/private_networks
MONGODB_DB_NAME=private_networks

# WebSocket Signaling
SIGNALING_PORT=8080
SIGNALING_PATH=/signaling

# TTL Configuration  
DEVICE_TTL_MINUTES=10
SIGNALING_TTL_HOURS=1

# P2P Network Configuration
MIN_COORDINATORS_PER_NETWORK=2
PRESENCE_CLEANUP_INTERVAL=300000
COORDINATOR_CHECK_INTERVAL=600000

# Security
JWT_SECRET=your_jwt_secret_here
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=12
```

### Docker Configuration Updates

```yaml
# docker-compose.yml
services:
  registry:
    ports:
      - "3000:3000"    # HTTP API
      - "8080:8080"    # WebSocket signaling
    environment:
      - SIGNALING_PORT=8080
      - MIN_COORDINATORS_PER_NETWORK=2
    depends_on:
      - mongodb
      
  mongodb:
    image: mongo:5.0
    ports:
      - "27017:27017"
    volumes:
      - mongodb_data:/data/db
      
volumes:
  mongodb_data:
```

---

## Testing Requirements

### 1. Unit Tests Required

- Presence announcement endpoint
- Peer discovery endpoints  
- WebSocket signaling message handling
- Background job functionality
- Rate limiting behavior

### 2. Integration Tests Required

- End-to-end WebRTC signaling flow
- Device presence lifecycle (online/offline)
- Coordinator promotion logic
- Multi-network isolation

### 3. Load Testing

- 1000+ concurrent WebSocket connections
- High-frequency presence announcements
- Large network peer discovery performance

---

## Monitoring & Logging

### Required Metrics

```javascript
// Monitoring points to implement
const metrics = {
  active_devices: () => db.collection('devices').countDocuments({ isOnline: true }),
  active_networks: () => db.collection('devices').distinct('networkId', { isOnline: true }).length,
  websocket_connections: () => activeConnections.size,
  signaling_messages_per_minute: 0, // Counter to increment
  coordinator_count_per_network: {}, // Map of networkId -> count
};

// Log important events
function logEvent(event, data) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    data,
    service: 'p2p-registry'
  }));
}
```

---

## Implementation Priority

### Phase 1 (High Priority)
1. Database schema setup and indexes
2. Presence announcement API endpoint
3. Basic peer discovery endpoints

### Phase 2 (Medium Priority)  
1. WebSocket signaling server
2. Background cleanup jobs
3. Rate limiting and validation

### Phase 3 (Lower Priority)
1. Coordinator selection logic
2. Advanced monitoring
3. Load testing and optimization

---

## Dependencies to Add

```json
{
  "dependencies": {
    "ws": "^8.14.2",
    "express-rate-limit": "^6.10.0",
    "express-validator": "^7.0.1"
  }
}
```

This specification provides complete implementation details for a backend engineering expert to implement the P2P WebRTC signaling and presence management system.