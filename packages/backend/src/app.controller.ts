import { Controller, Get } from '@nestjs/common';

/**
 * Root application controller providing the health check endpoint
 */
@Controller()
export class AppController {
  /**
   * Health check endpoint for Cloud Run and load balancers
   */
  @Get('healthz')
  healthCheck(): { status: string; timestamp: string } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
