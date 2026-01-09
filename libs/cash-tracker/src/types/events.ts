// Event system types for the SDK

export interface BaseEvent {
  id: string;
  type: string;
  timestamp: number;
  entityId?: string;
  transactionHash?: string;
  blockNumber?: number;
}

// SDK Events
export interface SDKEvent extends BaseEvent {
  type: "sdk_initialized" | "sdk_error" | "config_loaded" | "entity_switched";
  data?: any;
}

// Entity Events
export interface EntityEvent extends BaseEvent {
  type:
    | "entity_created"
    | "entity_updated"
    | "entity_deleted"
    | "entity_switched";
  entityId: string;
  data: {
    address: string;
    smartAccount: string;
    previousData?: any;
  };
}

// Operation Events
export interface OperationEvent extends BaseEvent {
  type: "operation_started" | "operation_completed" | "operation_failed";
  operationType: string;
  entityId: string;
  params: any;
  result?: any;
  error?: string;
}

// Transaction Events
export interface TransactionEvent extends BaseEvent {
  type: "transaction_sent" | "transaction_confirmed" | "transaction_failed";
  transactionHash: string;
  gasUsed?: bigint;
  gasPrice?: bigint;
  status: "pending" | "confirmed" | "failed";
  error?: string;
}

// Tracking Events
export interface TrackingEvent extends BaseEvent {
  type: "tracking_started" | "tracking_stopped" | "tracking_error";
  sessionId: string;
  options: any;
  error?: string;
}

// Flow Tracking Events
export interface FlowTrackingEvent extends BaseEvent {
  type:
    | "flow_tracking_started"
    | "flow_tracking_stopped"
    | "flow_tracking_error"
    | "flow_update";
  sessionId?: string;
  smartAddresses?: string[];
  data?: any;
  error?: string;
}

// Balance Events
export interface BalanceChangeEvent extends BaseEvent {
  type: "balance_changed";
  entityId: string;
  previousBalance: bigint;
  newBalance: bigint;
  change: bigint;
  formatted: {
    previous: string;
    new: string;
    change: string;
  };
}

// Allowance Events
export interface AllowanceChangeEvent extends BaseEvent {
  type: "allowance_changed";
  ownerId: string;
  spenderId: string;
  previousAllowance: bigint;
  newAllowance: bigint;
  change: bigint;
  formatted: {
    previous: string;
    new: string;
    change: string;
  };
}

// Event Callback Types
export type EventCallback<T extends BaseEvent = BaseEvent> = (event: T) => void;

export interface EventSubscription {
  id: string;
  eventType: string;
  callback: EventCallback;
  filter?: EventFilter;
  active: boolean;
}

// Event Filter Types
export interface EventFilter {
  entityIds?: string[];
  eventTypes?: string[];
  fromTimestamp?: number;
  toTimestamp?: number;
  transactionHash?: string;
  blockNumber?: number;
}

// Event Manager Types
export interface EventManager {
  subscribe<T extends BaseEvent>(
    eventType: string,
    callback: EventCallback<T>,
    filter?: EventFilter
  ): string;

  unsubscribe(subscriptionId: string): boolean;

  emit(event: BaseEvent): void;

  getSubscriptions(): EventSubscription[];

  clearSubscriptions(): void;
}

// Event History
export interface EventHistory {
  events: BaseEvent[];
  maxSize: number;
  add(event: BaseEvent): void;
  get(filter?: EventFilter): BaseEvent[];
  clear(): void;
}

// Event Types Union
export type SDKEventTypes =
  | SDKEvent
  | EntityEvent
  | OperationEvent
  | TransactionEvent
  | TrackingEvent
  | FlowTrackingEvent
  | BalanceChangeEvent
  | AllowanceChangeEvent;

// Event Type Guards
export const isEntityEvent = (event: BaseEvent): event is EntityEvent => {
  return event.type.startsWith("entity_");
};

export const isOperationEvent = (event: BaseEvent): event is OperationEvent => {
  return event.type.startsWith("operation_");
};

export const isTransactionEvent = (
  event: BaseEvent
): event is TransactionEvent => {
  return event.type.startsWith("transaction_");
};

export const isTrackingEvent = (event: BaseEvent): event is TrackingEvent => {
  return event.type.startsWith("tracking_");
};

export const isBalanceChangeEvent = (
  event: BaseEvent
): event is BalanceChangeEvent => {
  return event.type === "balance_changed";
};

export const isAllowanceChangeEvent = (
  event: BaseEvent
): event is AllowanceChangeEvent => {
  return event.type === "allowance_changed";
};
