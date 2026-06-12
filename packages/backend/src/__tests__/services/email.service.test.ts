import {
  buildPasswordResetEmailHtml,
  buildPasswordResetUrl,
  buildWelcomeEmailHtml,
  buildWelcomeUrl,
} from '../../services/email.service';
import { PASSWORD_RESET_TOKEN_TTL_MINUTES } from '../../constants/auth';

describe('password reset email helpers', () => {
  it('builds a frontend reset-password link with the token in the query string', () => {
    expect(buildPasswordResetUrl('abc123')).toBe(
      'http://localhost:3002/reset-password?token=abc123'
    );
  });

  it('renders a password reset link email, not the verification-code flow', () => {
    const resetUrl = 'https://app.writehumanly.net/reset-password?token=token-123';
    const html = buildPasswordResetEmailHtml(resetUrl);

    expect(html).toContain('Reset Your Password');
    expect(html).toContain(`href="${resetUrl}"`);
    expect(html).toContain(resetUrl);
    expect(html).toContain('secure link');
    expect(html).toContain(`expire in ${PASSWORD_RESET_TOKEN_TTL_MINUTES} minutes`);
    expect(html).not.toContain('expire in 1 hour');
    expect(html).not.toContain('Enter this code on the verification page');
    expect(html).not.toContain('Verify Your Email Address');
  });
});

describe('welcome email helpers', () => {
  it('routes verified accounts to the user portal documents page', () => {
    expect(buildWelcomeUrl()).toBe('http://localhost:3002/documents');
  });

  it('renders a concrete welcome destination without the stale dashboard route', () => {
    const url = 'https://admin.writehumanly.net/tasks';
    const html = buildWelcomeEmailHtml(url);

    expect(html).toContain(`href="${url}"`);
    expect(html).toContain('Open Humanly');
    expect(html).not.toContain('/dashboard');
  });
});
