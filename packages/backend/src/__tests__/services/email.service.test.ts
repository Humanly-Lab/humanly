import {
  buildPasswordResetEmailHtml,
  buildPasswordResetUrl,
} from '../../services/email.service';

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
    expect(html).not.toContain('Enter this code on the verification page');
    expect(html).not.toContain('Verify Your Email Address');
  });
});
