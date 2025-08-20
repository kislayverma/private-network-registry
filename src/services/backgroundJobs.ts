import Device from '../models/Device';
import SignalingChannel from '../models/SignalingChannel';

class BackgroundJobs {
  private presenceCleanupInterval: NodeJS.Timeout | null = null;
  private coordinatorCheckInterval: NodeJS.Timeout | null = null;
  private signalingCleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.start();
  }

  public start(): void {
    console.log('🔄 Starting background jobs...');

    // Presence cleanup job - every 5 minutes
    this.presenceCleanupInterval = setInterval(
      () => this.cleanupStalePresence(),
      parseInt(process.env.PRESENCE_CLEANUP_INTERVAL || '300000')
    );

    // Coordinator selection job - every 10 minutes
    this.coordinatorCheckInterval = setInterval(
      () => this.ensureCoordinators(),
      parseInt(process.env.COORDINATOR_CHECK_INTERVAL || '600000')
    );

    // Signaling channels cleanup - every 30 minutes
    this.signalingCleanupInterval = setInterval(
      () => this.cleanupSignalingChannels(),
      30 * 60 * 1000
    );

    console.log('✅ Background jobs started successfully');
  }

  public stop(): void {
    console.log('🛑 Stopping background jobs...');

    if (this.presenceCleanupInterval) {
      clearInterval(this.presenceCleanupInterval);
      this.presenceCleanupInterval = null;
    }

    if (this.coordinatorCheckInterval) {
      clearInterval(this.coordinatorCheckInterval);
      this.coordinatorCheckInterval = null;
    }

    if (this.signalingCleanupInterval) {
      clearInterval(this.signalingCleanupInterval);
      this.signalingCleanupInterval = null;
    }

    console.log('✅ Background jobs stopped');
  }

  /**
   * Mark stale devices as offline
   */
  private async cleanupStalePresence(): Promise<void> {
    try {
      const staleThreshold = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
      
      const result = await Device.updateMany(
        { 
          lastSeen: { $lt: staleThreshold },
          isOnline: true 
        },
        { $set: { isOnline: false } }
      );
      
      if (result.modifiedCount > 0) {
        console.log(`🧹 Marked ${result.modifiedCount} devices as offline (stale presence)`);
      }

      // Also remove very old offline devices (24 hours)
      const veryOldThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const deleteResult = await Device.deleteMany({
        lastSeen: { $lt: veryOldThreshold },
        isOnline: false
      });

      if (deleteResult.deletedCount > 0) {
        console.log(`🗑️ Removed ${deleteResult.deletedCount} very old device records`);
      }
    } catch (error) {
      console.error('❌ Presence cleanup job error:', error);
    }
  }

  /**
   * Ensure each network has sufficient coordinator devices
   */
  private async ensureCoordinators(): Promise<void> {
    try {
      // Get all networks with online devices
      const networks = await Device.distinct('networkId', { isOnline: true });
      
      const minCoordinators = parseInt(process.env.MIN_COORDINATORS_PER_NETWORK || '2');
      let totalPromotions = 0;
      
      for (const networkId of networks) {
        const coordinatorCount = await Device.countDocuments({
          networkId,
          isCoordinator: true,
          isOnline: true
        });

        if (coordinatorCount < minCoordinators) {
          const devicesToPromote = minCoordinators - coordinatorCount;
          
          // Find suitable devices to promote (those with store/relay capabilities)
          const candidates = await Device.find({
            networkId,
            isOnline: true,
            isCoordinator: false,
            capabilities: { $in: ['store', 'relay'] }
          }).limit(devicesToPromote);

          // Promote candidates to coordinators
          const deviceIds = candidates.map(d => d.deviceId);
          
          const result = await Device.updateMany(
            { deviceId: { $in: deviceIds } },
            { 
              $set: { isCoordinator: true },
              $addToSet: { capabilities: 'coordinator' }
            }
          );
          
          if (result.modifiedCount > 0) {
            console.log(`👑 Promoted ${result.modifiedCount} devices to coordinator in network ${networkId}`);
            totalPromotions += result.modifiedCount;
          }

          // If still not enough coordinators, promote any available device
          const remainingNeeded = devicesToPromote - result.modifiedCount;
          if (remainingNeeded > 0) {
            const additionalCandidates = await Device.find({
              networkId,
              isOnline: true,
              isCoordinator: false
            }).limit(remainingNeeded);

            if (additionalCandidates.length > 0) {
              const additionalIds = additionalCandidates.map(d => d.deviceId);
              
              const additionalResult = await Device.updateMany(
                { deviceId: { $in: additionalIds } },
                { 
                  $set: { isCoordinator: true },
                  $addToSet: { capabilities: { $each: ['coordinator', 'relay'] } }
                }
              );

              if (additionalResult.modifiedCount > 0) {
                console.log(`👑 Emergency promoted ${additionalResult.modifiedCount} additional devices in network ${networkId}`);
                totalPromotions += additionalResult.modifiedCount;
              }
            }
          }
        }

        // Demote excess coordinators if we have too many (more than 5)
        const maxCoordinators = 5;
        if (coordinatorCount > maxCoordinators) {
          const excessCount = coordinatorCount - maxCoordinators;
          
          // Find coordinators that were auto-promoted (have coordinator capability)
          const excessCoordinators = await Device.find({
            networkId,
            isCoordinator: true,
            isOnline: true,
            capabilities: 'coordinator'
          })
          .sort({ lastSeen: 1 }) // Demote least recently seen first
          .limit(excessCount);

          if (excessCoordinators.length > 0) {
            const demoteIds = excessCoordinators.map(d => d.deviceId);
            
            await Device.updateMany(
              { deviceId: { $in: demoteIds } },
              { 
                $set: { isCoordinator: false },
                $pull: { capabilities: 'coordinator' }
              }
            );

            console.log(`👤 Demoted ${excessCoordinators.length} excess coordinators in network ${networkId}`);
          }
        }
      }

      if (totalPromotions > 0) {
        console.log(`👑 Total coordinator promotions: ${totalPromotions}`);
      }
    } catch (error) {
      console.error('❌ Coordinator selection job error:', error);
    }
  }

  /**
   * Clean up old signaling channels and messages
   */
  private async cleanupSignalingChannels(): Promise<void> {
    try {
      // Remove channels with no messages
      const emptyChannelsResult = await SignalingChannel.deleteMany({
        $or: [
          { messages: { $size: 0 } },
          { messages: { $exists: false } }
        ]
      });

      if (emptyChannelsResult.deletedCount > 0) {
        console.log(`🗑️ Removed ${emptyChannelsResult.deletedCount} empty signaling channels`);
      }

      // Clean old messages from active channels (keep only last 10 messages per channel)
      const activeChannels = await SignalingChannel.find({
        'messages.10': { $exists: true } // Channels with more than 10 messages
      });

      let totalMessagesRemoved = 0;
      for (const channel of activeChannels) {
        const oldMessageCount = channel.messages.length;
        channel.messages = channel.messages.slice(-10); // Keep only last 10
        await channel.save();
        
        totalMessagesRemoved += oldMessageCount - channel.messages.length;
      }

      if (totalMessagesRemoved > 0) {
        console.log(`🧹 Cleaned ${totalMessagesRemoved} old signaling messages`);
      }
    } catch (error) {
      console.error('❌ Signaling cleanup job error:', error);
    }
  }

  /**
   * Get statistics about background job operations
   */
  public async getStats(): Promise<{
    onlineDevices: number;
    totalDevices: number;
    activeNetworks: number;
    coordinatorsPerNetwork: Map<string, number>;
    signalingChannels: number;
  }> {
    try {
      const [onlineDevices, totalDevices, activeNetworks, signalingChannels] = await Promise.all([
        Device.countDocuments({ isOnline: true }),
        Device.countDocuments(),
        Device.distinct('networkId', { isOnline: true }).then(networks => networks.length),
        SignalingChannel.countDocuments()
      ]);

      // Get coordinator count per network
      const coordinatorAggregation = await Device.aggregate([
        { $match: { isCoordinator: true, isOnline: true } },
        { $group: { _id: '$networkId', count: { $sum: 1 } } }
      ]);

      const coordinatorsPerNetwork = new Map(
        coordinatorAggregation.map(item => [item._id, item.count])
      );

      return {
        onlineDevices,
        totalDevices,
        activeNetworks,
        coordinatorsPerNetwork,
        signalingChannels
      };
    } catch (error) {
      console.error('❌ Error getting background job stats:', error);
      return {
        onlineDevices: 0,
        totalDevices: 0,
        activeNetworks: 0,
        coordinatorsPerNetwork: new Map(),
        signalingChannels: 0
      };
    }
  }
}

export default BackgroundJobs;