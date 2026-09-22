/** Cloudflare Workers Logs向けの構造化ログ出力。 */

type LogContext = Record<string, unknown>;

export function logInfo(message: string, context: LogContext = {}): void {
  console.log(JSON.stringify({ severity: "INFO", message, ...context }));
}

export function logError(message: string, context: LogContext = {}): void {
  console.error(JSON.stringify({ severity: "ERROR", message, ...context }));
}
