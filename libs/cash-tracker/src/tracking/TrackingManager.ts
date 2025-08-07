import { ethers } from 'ethers';
import {
  SDKConfig,
  TrackingOptions,
  TrackingSession,
  TrackingState,
  TokenBalance,
  TokenAllowance,
} from '../types';
import { SDKError } from '../core/SDKError';
import { EventManager } from './EventManager';

/**
 * Tracking Manager for real-time monitoring
 * Based on patterns from tracker.ts
 */
export class TrackingManager {
  private provider: ethers.Provider | null = null;
  private cashTokenContract: ethers.Contract | null = null;
  private config: SDKConfig | null = null;
  private sessions: Map<string, TrackingSession> = new Map();
  private eventManager: EventManager;

  constructor() {
    this.eventManager = new EventManager();
  }

  /**
   * Initialize the tracking manager
   */
  async initialize(
    provider: ethers.Provider,
    cashTokenContract: ethers.Contract,
    config: SDKConfig
  ): Promise<void> {
    this.provider = provider;
    this.cashTokenContract = cashTokenContract;
    this.config = config;
  }

  /**
   * Start real-time tracking
   * Based on the tracking patterns from tracker.ts
   */
  async startTracking(options: TrackingOptions): Promise<TrackingSession> {
    if (!this.cashTokenContract) {
      throw SDKError.configError('Tracking manager not initialized');
    }

    const sessionId = this.generateSessionId();
    let isActive = true;
    let intervalId: NodeJS.Timeout | null = null;

    const session: TrackingSession = {
      id: sessionId,
      isActive,
      startTime: Date.now(),
      options,
      stop: () => {
        isActive = false;
        if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
        this.sessions.delete(sessionId);
      },
      on: (event: string, callback: (event: any) => void) => {
        this.eventManager.subscribe(event, callback);
      },
      off: (event: string, callback: (event: any) => void) => {
        // This would unsubscribe the specific callback
        this.eventManager.unsubscribe(event);
      },
    };

    this.sessions.set(sessionId, session);

    // Start tracking loop
    const trackBalances = async () => {
      if (!isActive) return;

      try {
        const state = await this.getCurrentState();

        // Emit update event
        this.eventManager.emit({
          id: this.generateEventId(),
          type: 'tracking_update',
          timestamp: Date.now(),
        });

        // Call onUpdate callback if provided
        if (options.onUpdate) {
          options.onUpdate(state);
        }
      } catch (error) {
        console.error('Tracking error:', error);
        this.eventManager.emit({
          id: this.generateEventId(),
          type: 'tracking_error',
          timestamp: Date.now(),
        });
      }
    };

    // Initial tracking
    await trackBalances();

    // Set up interval
    const interval = options.interval || 5000;
    intervalId = setInterval(trackBalances, interval);

    // Emit tracking started event
    this.eventManager.emit({
      id: this.generateEventId(),
      type: 'tracking_started',
      timestamp: Date.now(),
    });

    return session;
  }

  /**
   * Get current tracking state
   * Based on the state tracking patterns from tracker.ts
   */
  async getCurrentState(): Promise<TrackingState> {
    if (!this.cashTokenContract || !this.config) {
      throw SDKError.configError('Tracking manager not initialized');
    }

    const balances: TokenBalance[] = [];
    const allowances: TokenAllowance[] = [];

    try {
      // Get entities from config
      const entities = this.config.entities || [];

      // Track balances
      for (const entityConfig of entities) {
        try {
          const balance = await this.cashTokenContract.balanceOf(
            entityConfig.smartAccount
          );
          const decimals = await this.cashTokenContract.decimals();
          const symbol = await this.cashTokenContract.symbol();

          balances.push({
            entityId: entityConfig.address, // Using address as entity ID for now
            balance,
            formatted: ethers.formatUnits(balance, decimals),
            decimals,
            symbol,
          });
        } catch (error) {
          console.warn(
            `Failed to get balance for ${entityConfig.smartAccount}:`,
            error
          );
        }
      }

      // Track allowances
      for (const owner of entities) {
        for (const spender of entities) {
          if (owner.smartAccount !== spender.smartAccount) {
            try {
              const allowance = await this.cashTokenContract.allowance(
                owner.smartAccount,
                spender.smartAccount
              );

              if (allowance > 0n) {
                const decimals = await this.cashTokenContract.decimals();
                allowances.push({
                  ownerId: owner.address,
                  spenderId: spender.address,
                  allowance,
                  formatted: ethers.formatUnits(allowance, decimals),
                });
              }
            } catch (error) {
              console.warn(
                `Failed to get allowance from ${owner.smartAccount} to ${spender.smartAccount}:`,
                error
              );
            }
          }
        }
      }

      return {
        balances,
        allowances,
        timestamp: Date.now(),
        lastUpdate: Date.now(),
      };
    } catch (error) {
      throw SDKError.trackingError('Failed to get current tracking state', {
        error,
      });
    }
  }

  /**
   * Track balances for all entities
   * Based on the trackBalances function from tracker.ts
   */
  async trackBalances(): Promise<TokenBalance[]> {
    if (!this.cashTokenContract || !this.config) {
      throw SDKError.configError('Tracking manager not initialized');
    }

    const balances: TokenBalance[] = [];
    const entities = this.config.entities || [];

    console.log('\n=== Token Balances ===');

    for (const entity of entities) {
      try {
        const balance = await this.cashTokenContract.balanceOf(
          entity.smartAccount
        );
        const decimals = await this.cashTokenContract.decimals();
        const symbol = await this.cashTokenContract.symbol();

        const tokenBalance: TokenBalance = {
          entityId: entity.address,
          balance,
          formatted: ethers.formatUnits(balance, decimals),
          decimals,
          symbol,
        };

        balances.push(tokenBalance);
        console.log(
          `${entity.smartAccount}: ${tokenBalance.formatted} ${symbol}`
        );
      } catch (error) {
        console.error(
          `Failed to track balance for ${entity.smartAccount}:`,
          error
        );
      }
    }

    return balances;
  }

  /**
   * Track allowances between all entities
   * Based on the trackAllowances function from tracker.ts
   */
  async trackAllowances(): Promise<TokenAllowance[]> {
    if (!this.cashTokenContract || !this.config) {
      throw SDKError.configError('Tracking manager not initialized');
    }

    const allowances: TokenAllowance[] = [];
    const entities = this.config.entities || [];

    console.log('\n=== Token Allowances ===');

    for (const owner of entities) {
      console.log(`\nAllowances granted by ${owner.smartAccount}:`);

      for (const spender of entities) {
        if (owner.smartAccount !== spender.smartAccount) {
          try {
            const allowance = await this.cashTokenContract.allowance(
              owner.smartAccount,
              spender.smartAccount
            );

            if (allowance > 0n) {
              const decimals = await this.cashTokenContract.decimals();
              const tokenAllowance: TokenAllowance = {
                ownerId: owner.address,
                spenderId: spender.address,
                allowance,
                formatted: ethers.formatUnits(allowance, decimals),
              };

              allowances.push(tokenAllowance);
              console.log(
                `  → To ${spender.smartAccount}: ${tokenAllowance.formatted} CASH`
              );
            }
          } catch (error) {
            console.error(
              `Failed to track allowance from ${owner.smartAccount} to ${spender.smartAccount}:`,
              error
            );
          }
        }
      }
    }

    return allowances;
  }

  /**
   * Display current status
   * Based on the displayStatus function from tracker.ts
   */
  async displayStatus(): Promise<void> {
    if (!this.cashTokenContract || !this.config) {
      throw SDKError.configError('Tracking manager not initialized');
    }

    this.clearConsole();
    console.log('\n=== CashToken Tracker ===');
    console.log('Press Ctrl+C to stop tracking\n');

    // Display balances
    console.log('=== Token Balances ===');
    const entities = this.config.entities || [];

    for (const entity of entities) {
      try {
        const balance = await this.cashTokenContract.balanceOf(
          entity.smartAccount
        );
        console.log(
          `${entity.smartAccount}: ${ethers.formatEther(balance)} CASH`
        );
      } catch (error) {
        console.error(
          `Failed to get balance for ${entity.smartAccount}:`,
          error
        );
      }
    }

    // Display allowances
    console.log('\n=== Token Allowances ===');
    for (const owner of entities) {
      let hasAllowance = false;

      for (const spender of entities) {
        if (owner.smartAccount !== spender.smartAccount) {
          try {
            const allowance = await this.cashTokenContract.allowance(
              owner.smartAccount,
              spender.smartAccount
            );

            if (allowance > 0n) {
              if (!hasAllowance) {
                console.log(`\nAllowances granted by ${owner.smartAccount}:`);
                hasAllowance = true;
              }
              console.log(
                `  → To ${spender.smartAccount}: ${ethers.formatEther(
                  allowance
                )} CASH`
              );
            }
          } catch (error) {
            console.error(
              `Failed to get allowance from ${owner.smartAccount} to ${spender.smartAccount}:`,
              error
            );
          }
        }
      }
    }
  }

  /**
   * Stop all tracking sessions
   */
  async stopAllSessions(): Promise<void> {
    for (const session of this.sessions.values()) {
      session.stop();
    }
    this.sessions.clear();
  }

  /**
   * Get active sessions
   */
  getActiveSessions(): TrackingSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Clear console (platform-specific)
   */
  private clearConsole(): void {
    console.clear();
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
