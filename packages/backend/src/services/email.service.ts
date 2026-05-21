import nodemailer, { Transporter } from 'nodemailer';
import { getBrandText } from '@humanly/shared';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export function getEmailConfigurationErrors(): string[] {
  if (env.nodeEnv !== 'production') {
    return [];
  }

  const errors: string[] = [];

  if (env.emailService === 'console') {
    errors.push(
      'EMAIL_SERVICE=console is not allowed in production. Configure sendgrid or smtp for password reset email delivery.'
    );
  }

  if (env.emailService === 'sendgrid' && !env.emailApiKey) {
    errors.push('EMAIL_API_KEY is required when EMAIL_SERVICE=sendgrid');
  }

  if (env.emailService === 'smtp') {
    const missing = [
      !env.emailHost && 'EMAIL_HOST',
      !env.emailUser && 'EMAIL_USER',
      !env.emailPassword && 'EMAIL_PASSWORD',
    ].filter(Boolean);

    if (missing.length > 0) {
      errors.push(`Missing SMTP email configuration: ${missing.join(', ')}`);
    }
  }

  if (env.emailService === 'ses') {
    errors.push('EMAIL_SERVICE=ses is not implemented. Use sendgrid or smtp in production.');
  }

  return errors;
}

export function validateEmailConfiguration(): void {
  const errors = getEmailConfigurationErrors();
  if (errors.length > 0) {
    throw new Error(errors.join(' '));
  }
}

export function buildPasswordResetUrl(token: string): string {
  return `${env.frontendUserUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
}

export function buildPasswordResetEmailHtml(resetUrl: string): string {
  return `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; }
          .content { padding: 30px 20px; background-color: #f9fafb; }
          .button { display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
          .warning { padding: 15px; background-color: #FEF3C7; border-left: 4px solid #F59E0B; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Password Reset Request</h1>
          </div>
          <div class="content">
            <h2>Reset Your Password</h2>
            <p>${getBrandText().passwordResetBody}</p>
            <p style="text-align: center;">
              <a href="${resetUrl}" class="button">Reset Password</a>
            </p>
            <p>Or copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #6b7280;">${resetUrl}</p>
            <div class="warning">
              <p><strong>This link will expire in 1 hour.</strong></p>
            </div>
            <p>This password reset email uses a secure link. A 6-digit verification code is only for account verification and cannot reset your password.</p>
            <p>If you didn't request a password reset, please ignore this email. Your password will remain unchanged.</p>
            <p>For security reasons, we recommend changing your password regularly and never sharing it with anyone.</p>
          </div>
          <div class="footer">
            <p>${getBrandText().copyright}</p>
            <p>This is an automated email. Please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `;
}

class EmailService {
  private transporter: Transporter | null = null;
  private configurationErrors: string[] = [];

  constructor() {
    this.configurationErrors = getEmailConfigurationErrors();
    if (this.configurationErrors.length > 0 && env.emailStrictDelivery) {
      validateEmailConfiguration();
    }
    this.initialize();
  }

  private initialize(): void {
    logger.info('Initializing email service', {
      emailService: env.emailService,
      emailHost: env.emailHost,
      emailPort: env.emailPort,
      emailUser: env.emailUser,
      emailFrom: env.emailFrom,
    });

    if (this.configurationErrors.length > 0) {
      logger.error('Email service is not operational', {
        emailService: env.emailService,
        errors: this.configurationErrors,
      });
      return;
    }

    if (env.emailService === 'console') {
      // For development: log emails to console
      logger.info('Email service: Using console mode');
      this.transporter = nodemailer.createTransport({
        streamTransport: true,
        newline: 'unix',
        buffer: true,
      });
    } else if (env.emailService === 'smtp' && env.emailHost) {
      logger.info('Email service: Using SMTP mode');
      // SMTP configuration
      this.transporter = nodemailer.createTransport({
        host: env.emailHost,
        port: env.emailPort || 587,
        secure: env.emailPort === 465,
        auth: {
          user: env.emailUser,
          pass: env.emailPassword,
        },
      });
    } else if (env.emailService === 'sendgrid' && env.emailApiKey) {
      // SendGrid configuration
      this.transporter = nodemailer.createTransport({
        host: 'smtp.sendgrid.net',
        port: 587,
        auth: {
          user: 'apikey',
          pass: env.emailApiKey,
        },
      });
    } else if (env.emailService === 'ses') {
      // AWS SES would be configured here with AWS SDK
      logger.warn('AWS SES not yet implemented, falling back to console');
      this.transporter = nodemailer.createTransport({
        streamTransport: true,
        newline: 'unix',
        buffer: true,
      });
    }

    if (!this.transporter) {
      logger.error('Email service not configured properly');
    }
  }

  private async send(
    to: string,
    subject: string,
    html: string,
    text?: string
  ): Promise<void> {
    if (!this.transporter) {
      const message = 'Email transporter not initialized';
      logger.error(message, {
        emailService: env.emailService,
        errors: this.configurationErrors,
      });
      throw new Error(message);
    }

    try {
      const info = await this.transporter.sendMail({
        from: env.emailFrom,
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, ''),
      });

      if (env.emailService === 'console') {
        logger.info('Email sent (console mode)', {
          to,
          subject,
          messageId: info.messageId,
          message: info.message.toString(),
        });
      } else {
        logger.info('Email sent', {
          to,
          subject,
          messageId: info.messageId,
        });
      }
    } catch (error) {
      logger.error('Failed to send email', { to, subject, error });
      throw error;
    }
  }

  /**
   * Send email verification
   */
  async sendVerificationEmail(email: string, code: string): Promise<void> {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #4F46E5; color: white; padding: 20px; text-align: center; }
          .content { padding: 30px 20px; background-color: #f9fafb; }
          .code { font-size: 32px; font-weight: bold; letter-spacing: 8px; text-align: center; background-color: #EEF2FF; color: #4F46E5; padding: 20px; margin: 20px 0; border-radius: 8px; font-family: monospace; }
          .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${getBrandText().welcome}</h1>
          </div>
          <div class="content">
            <h2>Verify Your Email Address</h2>
            <p>${getBrandText().registerThankYou}</p>
            <div class="code">${code}</div>
            <p style="text-align: center; color: #6b7280;">Enter this code on the verification page</p>
            <p><strong>This code will expire in 24 hours.</strong></p>
            <p>${getBrandText().registerIgnore}</p>
          </div>
          <div class="footer">
            <p>${getBrandText().copyright}</p>
            <p>This is an automated email. Please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.send(email, getBrandText().emailSubjects.verifyEmail, html);
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(email: string, token: string): Promise<void> {
    const resetUrl = buildPasswordResetUrl(token);
    const html = buildPasswordResetEmailHtml(resetUrl);

    await this.send(email, getBrandText().emailSubjects.resetPassword, html);
  }

  /**
   * Send welcome email after verification
   */
  async sendWelcomeEmail(email: string): Promise<void> {
    const dashboardUrl = `${env.corsOrigin}/dashboard`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #10B981; color: white; padding: 20px; text-align: center; }
          .content { padding: 30px 20px; background-color: #f9fafb; }
          .button { display: inline-block; padding: 12px 24px; background-color: #4F46E5; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { padding: 20px; text-align: center; color: #6b7280; font-size: 14px; }
          .feature { margin: 15px 0; padding-left: 20px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>${getBrandText().welcome}</h1>
          </div>
          <div class="content">
            <h2>Your Account is Ready</h2>
            <p>${getBrandText().welcomeVerified}</p>
            <p>${getBrandText().description}</p>
            <div class="feature">
              <strong>• Create Tasks:</strong> Set up tracking for your forms and surveys
            </div>
            <div class="feature">
              <strong>• Track User Input:</strong> Capture every keystroke, paste, and edit
            </div>
            <div class="feature">
              <strong>• Live Preview:</strong> Watch real-time input activity as it happens
            </div>
            <div class="feature">
              <strong>• Analytics:</strong> Analyze patterns and insights from your data
            </div>
            <div class="feature">
              <strong>• Export Data:</strong> Download your data in JSON or CSV format
            </div>
            <p style="text-align: center;">
              <a href="${dashboardUrl}" class="button">Go to Dashboard</a>
            </p>
            <p>If you have any questions or need help getting started, please don't hesitate to reach out to our support team.</p>
          </div>
          <div class="footer">
            <p>${getBrandText().copyright}</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await this.send(email, getBrandText().emailSubjects.welcome, html);
  }
}

export const emailService = new EmailService();
