type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  module: string;
  [key: string]: unknown;
}

class Logger {
  private module: string;

  constructor(module: string) {
    this.module = module;
  }

  private log(level: LogLevel, message: string, context?: LogContext): void {
    const timestamp = new Date().toISOString();
    const contextStr = context
      ? ` ${JSON.stringify({ ...context, module: this.module })}`
      : ` {module: "${this.module}"}`;

    switch (level) {
      case "debug":
        console.debug(`[${timestamp}] [DEBUG] ${message}${contextStr}`);
        break;
      case "info":
        console.info(`[${timestamp}] [INFO] ${message}${contextStr}`);
        break;
      case "warn":
        console.warn(`[${timestamp}] [WARN] ${message}${contextStr}`);
        break;
      case "error":
        console.error(`[${timestamp}] [ERROR] ${message}${contextStr}`);
        break;
    }
  }

  debug(message: string, context?: Omit<LogContext, "module">): void {
    this.log("debug", message, context as LogContext);
  }

  info(message: string, context?: Omit<LogContext, "module">): void {
    this.log("info", message, context as LogContext);
  }

  warn(message: string, context?: Omit<LogContext, "module">): void {
    this.log("warn", message, context as LogContext);
  }

  error(message: string, context?: Omit<LogContext, "module">): void {
    this.log("error", message, context as LogContext);
  }
}

export function createLogger(module: string): Logger {
  return new Logger(module);
}

export const planningLogger = createLogger("planning");