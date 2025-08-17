# P2P Registry Server

Registry server for managing private P2P networks with user identity, network discovery, and payment processing.

## Features

- **User Identity Management**: Ed25519-based cryptographic identities
- **Network Registry**: Create and manage private networks
- **Join Request System**: Admin approval workflow for new members
- **Payment Integration**: Tiered pricing for larger networks
- **P2P Bootstrap**: Coordinator discovery for direct connections
- **RESTful API**: Complete API for mobile app integration

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Setup Environment**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Run Development Server**
   ```bash
   npm run dev
   ```

4. **Run Production Server**
   ```bash
   npm start
   ```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create user identity
- `POST /api/auth/login` - Login with signature verification
- `GET /api/auth/verify` - Verify JWT token
- `GET /api/auth/check-username/:username` - Check username availability

### User Management
- `GET /api/user/profile` - Get user profile and networks
- `PUT /api/user/profile` - Update user profile
- `GET /api/user/join-requests` - Get user's join requests

### Network Management
- `POST /api/network/create` - Create new network
- `GET /api/network/:networkId` - Get network details
- `POST /api/network/:networkId/join` - Submit join request
- `GET /api/network/:networkId/requests` - Get pending requests (admin)
- `POST /api/network/:networkId/requests/:requestId/review` - Approve/deny request (admin)
- `GET /api/network/lookup/:inviteCode` - Look up network by invite code
- `PUT /api/network/:networkId/settings` - Update network settings (admin)

### Invite Codes
- `GET /api/network/:networkId/invite-codes` - Get invite codes (admin)
- `POST /api/network/:networkId/invite-codes` - Create invite code (admin)

### P2P Bootstrap
- `POST /api/bootstrap/coordinator` - Register as coordinator
- `POST /api/bootstrap/heartbeat` - Send coordinator heartbeat
- `GET /api/bootstrap/network/:networkId` - Get active coordinators
- `DELETE /api/bootstrap/coordinator` - Unregister coordinator

### Billing
- `GET /api/billing/plans` - Get available plans
- `GET /api/billing/network/:networkId/subscription` - Get subscription status
- `POST /api/billing/network/:networkId/upgrade` - Upgrade network plan
- `POST /api/billing/network/:networkId/cancel` - Cancel subscription

## Database Schema

The server uses SQLite with the following tables:

- `users` - User accounts and public keys
- `networks` - Network registry
- `network_members` - Network membership
- `join_requests` - Pending join requests
- `invite_codes` - Network invite codes
- `network_coordinators` - P2P coordinators
- `subscriptions` - Payment subscriptions

## Security

- Ed25519 signature verification for authentication
- JWT tokens for session management
- Rate limiting and CORS protection
- Input validation and sanitization
- Secure password-less authentication

## Development

### Testing
```bash
npm test
```

### Database
The SQLite database is automatically initialized on first run. Database file is stored in `./data/registry.db`.

### Environment Variables
See `.env.example` for all configuration options.

## Production Deployment

1. Set `NODE_ENV=production`
2. Configure secure JWT secret
3. Set up proper CORS origins
4. Configure Stripe for payments
5. Set up SSL/HTTPS
6. Configure email service for notifications