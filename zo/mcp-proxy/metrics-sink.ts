import { ProxyMetricsSnapshot } from "./metrics";

export interface MetricsSink {
  publish(snapshot: ProxyMetricsSnapshot): Promise<void>;
}

export interface HttpMetricsSinkOptions {
  url: string;
  apiKey?: string;
  timeoutMs?: number;
}

export class HttpMetricsSink implements MetricsSink {
  constructor(private readonly options: HttpMetricsSinkOptions) {}

  async publish(snapshot: ProxyMetricsSnapshot): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 3000);
    try {
      await fetch(this.options.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(this.options.apiKey ? { "x-qore-api-key": this.options.apiKey } : {}),
        },
        body: JSON.stringify(snapshot),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
