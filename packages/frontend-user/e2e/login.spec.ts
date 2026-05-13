import { test, expect } from '@playwright/test';
import { mockDocumentsApi, mockLoginFlow } from './helpers/mock-api';

test('logs in and lands on the documents page', async ({ page }) => {
  await mockLoginFlow(page);
  await mockDocumentsApi(page);

  await page.goto('/login');
  await page.getByLabel(/email address/i).fill('alice@example.com');
  await page.getByLabel(/^password$/i).fill('password123');
  await page.getByRole('button', { name: /sign in/i }).click();

  await expect(page).toHaveURL(/\/documents$/);
  await expect(page.getByRole('heading', { name: /my documents/i, level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: /new document/i })).toBeVisible();
});
