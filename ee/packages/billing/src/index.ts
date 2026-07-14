import type { Express, Request, Response } from 'express';

export interface BillingPlanResponse {
  plan: 'free';
}

export function registerBillingRoutes(app: Express): void {
  app.get('/api/v1/billing/plan', (_req: Request, res: Response) => {
    const response: BillingPlanResponse = { plan: 'free' };
    res.json(response);
  });
}
