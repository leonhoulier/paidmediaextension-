/**
 * Governance extension logger
 *
 * All console output is prefixed with [Governance] for easy identification
 * in the browser console. Log levels can be controlled via the LOG_LEVEL
 * constant or by toggling debug mode in the popup.
 */

const PREFIX = '[Governance]';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

/** Current log level. Set to DEBUG in dev, INFO in production. */
let currentLevel: LogLevel = LogLevel.DEBUG;

/**
 * Set the global log level
 */
export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

/**
 * Get the current log level
 */
export function getLogLevel(): LogLevel {
  return currentLevel;
}

/**
 * Log a debug message (only in development)
 */
export function debug(...args: unknown[]): void {
  if (currentLevel <= LogLevel.DEBUG) {
    console.debug(PREFIX, ...args);
  }
}

/**
 * Log an informational message
 */
export function info(...args: unknown[]): void {
  if (currentLevel <= LogLevel.INFO) {
    console.info(PREFIX, ...args);
  }
}

/**
 * Log a warning message
 */
export function warn(...args: unknown[]): void {
  if (currentLevel <= LogLevel.WARN) {
    console.warn(PREFIX, ...args);
  }
}

/**
 * Log an error message
 */
export function error(...args: unknown[]): void {
  if (currentLevel <= LogLevel.ERROR) {
    console.error(PREFIX, ...args);
  }
}

/**
 * Convenience namespace export
 */
export const logger = {
  debug,
  info,
  warn,
  error,
  setLogLevel,
  getLogLevel,
};
