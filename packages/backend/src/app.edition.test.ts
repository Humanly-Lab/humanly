import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import type { Express } from 'express';
import { createApp } from './app';

async function listen(app: Express): Promise<{ server: Server; origin: string }> {
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address() as AddressInfo;
  return { server, origin: `http://127.0.0.1:${address.port}` };
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function run(): Promise<void> {
  let communityLoaderCalled = false;
  const communityApp = await createApp({
    edition: 'community',
    loadBillingModule: async () => {
      communityLoaderCalled = true;
      throw new Error('Community must not load the billing module');
    },
  });
  const community = await listen(communityApp);

  try {
    const healthResponse = await fetch(`${community.origin}/health`);
    const health = await healthResponse.json() as { edition: string };
    assert.equal(health.edition, 'community');
    assert.equal(communityLoaderCalled, false);

    const billingResponse = await fetch(`${community.origin}/api/v1/billing/plan`);
    assert.equal(billingResponse.status, 404);
  } finally {
    await close(community.server);
  }

  const cloudApp = await createApp({
    edition: 'cloud',
    loadBillingModule: async () => ({
      registerBillingRoutes(app) {
        app.get('/api/v1/billing/plan', (_req, res) => {
          res.json({ plan: 'free' });
        });
      },
    }),
  });
  const cloud = await listen(cloudApp);

  try {
    const healthResponse = await fetch(`${cloud.origin}/health`);
    const health = await healthResponse.json() as { edition: string };
    assert.equal(health.edition, 'cloud');

    const billingResponse = await fetch(`${cloud.origin}/api/v1/billing/plan`);
    assert.equal(billingResponse.status, 200);
    assert.deepEqual(await billingResponse.json(), { plan: 'free' });
  } finally {
    await close(cloud.server);
  }

  console.log('backend edition gating tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
