/**
 * Centralized Brand Configuration
 *
 * This file contains all branding information for the application.
 * To rebrand in the future, simply update the values here.
 */

export const BRAND = {
  // Core brand identity
  name: 'Humanly',
  legalName: 'Humanly',
  taglineAdmin: 'Track and Analyze Text Input Provenance',
  taglineUser: 'Write with AI. Prove your process.',

  // Email branding
  email: {
    from: 'noreply@writehumanly.net',
    supportEmail: 'support@writehumanly.net',
    copyrightYear: 2024,
  },

  // URLs
  urls: {
    website: 'https://writehumanly.net',
    app: 'https://app.writehumanly.net',
    developer: 'https://developer.writehumanly.net',
    api: 'https://api.writehumanly.net',
  },

  // Tracker branding (for JavaScript integration)
  tracker: {
    namespace: 'Humanly',
    globalVar: 'humanly',
    consolePrefix: '[Humanly]',
    eventType: 'humanly-event',
    scriptFilename: 'humanly-tracker.min.js',
    // Legacy support - keep old names for backward compatibility
    legacyGlobalVar: 'humanly',
    legacyEventType: 'humanly-event',
  },

  // Database & technical (for future use, not changing existing DB names)
  technical: {
    dbPrefix: 'humanly', // Keep existing for now
    serviceNames: {
      backend: 'humanly-backend', // Keep existing for now
      frontend: 'humanly-frontend', // Keep existing for now
    },
    exportPrefix: 'humanly-export', // Keep existing for now
  },
} as const;

/**
 * Helper functions for common text patterns
 */
export const getBrandText = () => ({
  // Welcome messages
  welcome: `Welcome to ${BRAND.name}!`,
  welcomeHtml: `Welcome to <span class="text-primary">${BRAND.name}</span>`,

  // Account management
  createAccount: `create your ${BRAND.name} account`,
  yourAccount: `your ${BRAND.name} account`,

  // Copyright
  copyright: `© ${BRAND.email.copyrightYear} ${BRAND.legalName}. All rights reserved.`,

  // Email subjects
  emailSubjects: {
    verifyEmail: `Verify Your Email - ${BRAND.name}`,
    resetPassword: `Reset Your Password - ${BRAND.name}`,
    welcome: `Welcome to ${BRAND.name}!`,
  },

  // Page titles
  pageTitles: {
    admin: `${BRAND.name} - ${BRAND.taglineAdmin}`,
    user: `${BRAND.name} - ${BRAND.taglineUser}`,
  },

  // Integration & tracking
  integration: {
    integrate: `Integrate ${BRAND.name} into your application`,
    consoleSuccess: `${BRAND.tracker.consolePrefix} ✓ Tracker initialized successfully`,
    consoleMessages: `${BRAND.tracker.consolePrefix} ✓ messages`,
    dashboard: `Check your ${BRAND.name} dashboard`,
  },

  // Service description
  description: `${BRAND.name} helps you track and analyze text input provenance in surveys, forms, and other applications. Here's what you can do:`,

  // Registration
  registerThankYou: `Thank you for registering with ${BRAND.name}. Please use the verification code below to activate your account.`,
  registerIgnore: `If you didn't create an account with ${BRAND.name}, you can safely ignore this email.`,

  // Password reset
  passwordResetBody: `We received a request to reset your password for your ${BRAND.name} account. Click the button below to reset your password.`,

  // Welcome email
  welcomeVerified: `Congratulations! Your email has been verified and your ${BRAND.name} account is now active.`,
});

/**
 * Get tracker console message with branding
 */
export const getTrackerMessage = (message: string, emoji?: string): string => {
  const prefix = emoji ? `${emoji} ` : '';
  return `${prefix}${BRAND.tracker.consolePrefix} ${message}`;
};

/**
 * Get tracker comment for code snippets
 */
export const getTrackerComment = (): string => {
  return `<!-- ${BRAND.name} Tracking Script -->`;
};

/**
 * Get iframe integration comment
 */
export const getIframeComment = (): string => {
  return `<!-- ${BRAND.name} Iframe Integration -->`;
};
