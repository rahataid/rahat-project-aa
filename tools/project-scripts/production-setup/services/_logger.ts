/**
 * Structured Logging Service
 * Provides consistent logging throughout deployment scripts
 */
export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  data?: any;
  step?: string;
}

export class Logger {
  private static stepContext: string | null = null;

  static setStep(step: string): void {
    this.stepContext = step;
  }

  static clearStep(): void {
    this.stepContext = null;
  }

  private static log(level: LogLevel, message: string, data?: any): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
      step: this.stepContext || undefined,
    };

    const prefix = this.getPrefix(level);
    console.log(`${prefix} ${message}`);

    if (data && process.env.DEBUG === 'true') {
      console.log(JSON.stringify(entry, null, 2));
    }
  }

  private static getPrefix(level: LogLevel): string {
    const icons = {
      [LogLevel.DEBUG]: '🔍',
      [LogLevel.INFO]: 'ℹ️',
      [LogLevel.WARN]: '⚠️',
      [LogLevel.ERROR]: '❌',
    };
    return icons[level];
  }

  static info(message: string, data?: any): void {
    this.log(LogLevel.INFO, message, data);
  }

  static error(message: string, error?: Error | any): void {
    const errorData =
      error instanceof Error
        ? { message: error.message, stack: error.stack }
        : error;
    this.log(LogLevel.ERROR, message, errorData);
  }

  static warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, message, data);
  }

  static debug(message: string, data?: any): void {
    if (process.env.DEBUG === 'true') {
      this.log(LogLevel.DEBUG, message, data);
    }
  }

  static deployment(action: string, data: any): void {
    this.info(`[DEPLOYMENT] ${action}`, data);
  }

  static success(message: string): void {
    console.log(`✅ ${message}`);
  }
}
