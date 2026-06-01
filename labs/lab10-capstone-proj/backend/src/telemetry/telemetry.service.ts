import { Injectable, Logger } from '@nestjs/common';
import * as appInsights from 'applicationinsights';

@Injectable()
export class TelemetryService {
  private readonly logger = new Logger(TelemetryService.name);

  trackEvent(name: string, properties?: Record<string, unknown>): void {
    try {
      // `defaultClient` is undefined when the AI SDK was not initialised
      // at boot (i.e., no APPLICATIONINSIGHTS_CONNECTION_STRING — local
      // dev). The optional chain makes this a no-op in that case.
      appInsights.defaultClient?.trackEvent({
        name,
        properties: properties,
      });
    } catch (err) {
      this.logger.warn(
        `Failed to track event "${name}": ${(err as Error).message}`,
      );
    }
  }
}
