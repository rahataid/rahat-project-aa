import { BaseEvent, EventSubscription, EventFilter } from "../types/events";

/**
 * Event Manager for handling event subscriptions and emissions
 */
export class EventManager {
  private subscriptions: Map<string, EventSubscription> = new Map();
  private eventHistory: BaseEvent[] = [];
  private maxHistorySize = 1000;

  /**
   * Subscribe to an event type
   */
  subscribe<T extends BaseEvent>(
    eventType: string,
    callback: (event: T) => void,
    filter?: EventFilter
  ): string {
    const subscriptionId = this.generateSubscriptionId();

    const subscription: EventSubscription = {
      id: subscriptionId,
      eventType,
      callback: callback as any,
      filter,
      active: true,
    };

    this.subscriptions.set(subscriptionId, subscription);
    return subscriptionId;
  }

  /**
   * Unsubscribe from an event
   */
  unsubscribe(subscriptionId: string): boolean {
    const subscription = this.subscriptions.get(subscriptionId);
    if (subscription) {
      subscription.active = false;
      this.subscriptions.delete(subscriptionId);
      return true;
    }
    return false;
  }

  /**
   * Emit an event to all subscribers
   */
  emit(event: BaseEvent): void {
    // Add to history
    this.addToHistory(event);

    // Find matching subscriptions
    for (const subscription of this.subscriptions.values()) {
      if (!subscription.active) continue;

      // Check if event type matches
      if (subscription.eventType !== event.type) continue;

      // Check if filter matches
      if (
        subscription.filter &&
        !this.matchesFilter(event, subscription.filter)
      ) {
        continue;
      }

      // Call callback
      try {
        subscription.callback(event);
      } catch (error) {
        console.error(`Error in event callback for ${event.type}:`, error);
      }
    }
  }

  /**
   * Get all subscriptions
   */
  getSubscriptions(): EventSubscription[] {
    return Array.from(this.subscriptions.values());
  }

  /**
   * Clear all subscriptions
   */
  clearSubscriptions(): void {
    this.subscriptions.clear();
  }

  /**
   * Get event history
   */
  getEventHistory(filter?: EventFilter): BaseEvent[] {
    if (!filter) {
      return [...this.eventHistory];
    }

    return this.eventHistory.filter((event) =>
      this.matchesFilter(event, filter)
    );
  }

  /**
   * Clear event history
   */
  clearEventHistory(): void {
    this.eventHistory = [];
  }

  /**
   * Check if event matches filter
   */
  private matchesFilter(event: BaseEvent, filter: EventFilter): boolean {
    // Check entity IDs
    if (filter.entityIds && event.entityId) {
      if (!filter.entityIds.includes(event.entityId)) {
        return false;
      }
    }

    // Check event types
    if (filter.eventTypes) {
      if (!filter.eventTypes.includes(event.type)) {
        return false;
      }
    }

    // Check timestamp range
    if (filter.fromTimestamp && event.timestamp < filter.fromTimestamp) {
      return false;
    }

    if (filter.toTimestamp && event.timestamp > filter.toTimestamp) {
      return false;
    }

    // Check transaction hash
    if (
      filter.transactionHash &&
      event.transactionHash !== filter.transactionHash
    ) {
      return false;
    }

    // Check block number
    if (filter.blockNumber && event.blockNumber !== filter.blockNumber) {
      return false;
    }

    return true;
  }

  /**
   * Add event to history
   */
  private addToHistory(event: BaseEvent): void {
    this.eventHistory.push(event);

    // Maintain history size
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Generate unique subscription ID
   */
  private generateSubscriptionId(): string {
    return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
