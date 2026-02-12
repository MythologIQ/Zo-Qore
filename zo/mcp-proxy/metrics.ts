export interface ProxyMetricsSnapshot {
  totalRequests: number;
  allowed: number;
  blocked: number;
  unauthorized: number;
  rateLimited: number;
  upstreamTimeouts: number;
  upstreamRejected: number;
  upstreamProtocolErrors: number;
  internalErrors: number;
  sinkPublishFailures: number;
}

export class ProxyMetrics {
  private totalRequests = 0;
  private allowed = 0;
  private blocked = 0;
  private unauthorized = 0;
  private rateLimited = 0;
  private upstreamTimeouts = 0;
  private upstreamRejected = 0;
  private upstreamProtocolErrors = 0;
  private internalErrors = 0;
  private sinkPublishFailures = 0;

  incTotal(): void {
    this.totalRequests += 1;
  }
  incAllowed(): void {
    this.allowed += 1;
  }
  incBlocked(): void {
    this.blocked += 1;
  }
  incUnauthorized(): void {
    this.unauthorized += 1;
  }
  incRateLimited(): void {
    this.rateLimited += 1;
  }
  incUpstreamTimeout(): void {
    this.upstreamTimeouts += 1;
  }
  incUpstreamRejected(): void {
    this.upstreamRejected += 1;
  }
  incUpstreamProtocolError(): void {
    this.upstreamProtocolErrors += 1;
  }
  incInternalError(): void {
    this.internalErrors += 1;
  }
  incSinkPublishFailure(): void {
    this.sinkPublishFailures += 1;
  }

  snapshot(): ProxyMetricsSnapshot {
    return {
      totalRequests: this.totalRequests,
      allowed: this.allowed,
      blocked: this.blocked,
      unauthorized: this.unauthorized,
      rateLimited: this.rateLimited,
      upstreamTimeouts: this.upstreamTimeouts,
      upstreamRejected: this.upstreamRejected,
      upstreamProtocolErrors: this.upstreamProtocolErrors,
      internalErrors: this.internalErrors,
      sinkPublishFailures: this.sinkPublishFailures,
    };
  }
}
