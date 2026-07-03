# Authentication System Implementation

This document provides an overview of the complete authentication system implemented for the humanly backend.

## Overview

The authentication system provides secure user registration, email verification, login/logout, token refresh, and password reset functionality. It uses JWT (JSON Web Tokens) for authentication with both access tokens and refresh tokens stored securely.

## Architecture

### Components

1. **Models**: Database operations for users and refresh tokens
   - `/src/models/user.model.ts` - User database operations
   - `/src/models/refresh-token.model.ts` - Refresh token database operations

2. **Services**: Business logic layer
   - `/src/services/auth.service.ts` - Authentication business logic
   - `/src/services/email.service.ts` - Email sending (verification, password reset, welcome)

3. **Controllers**: Request handlers
   - `/src/controllers/auth.controller.ts` - HTTP request handlers for auth endpoints

4. **Routes**: API endpoints
   - `/src/routes/auth.routes.ts` - Auth route definitions

5. **Middleware**:
   - `/src/middleware/auth.middleware.ts` - JWT authentication middleware
   - `/src/middleware/rate-limit.ts` - Rate limiting middleware
   - `/src/middleware/error-handler.ts` - Error handling

6. **Utilities**:
   - `/src/utils/jwt.ts` - JWT token generation and verification
   - `/src/utils/crypto.ts` - Password hashing and token generation

## API Endpoints

All auth endpoints are prefixed with `/api/v1/auth`

### POST /register
Register a new user account.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Registration successful. Please check your email to verify your account.",
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "emailVerified": false,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

**Rate Limit:** 3 requests per hour per IP

### POST /verify-email
Verify email address using verification token.

**Request Body:**
```json
{
  "token": "verification-token-from-email"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Email verified successfully. You can now log in.",
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "emailVerified": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

**Rate Limit:** 5 requests per hour per IP

### POST /login
Login with email and password.

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "emailVerified": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    },
    "accessToken": "jwt-access-token"
  }
}
```

**Cookies Set:**
- `accessToken` (httpOnly, 15 minutes)
- `refreshToken` (httpOnly, 7 days)

**Rate Limit:** 10 requests per 15 minutes per IP (only failed attempts count)

### POST /logout
Logout current user and invalidate refresh token.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response:**
```json
{
  "success": true,
  "message": "Logout successful"
}
```

**Cookies Cleared:** `accessToken`, `refreshToken`

### POST /refresh
Refresh access token using refresh token.

**Cookies:** Must include `refreshToken` cookie, or:

**Request Body (alternative):**
```json
{
  "refreshToken": "refresh-token"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "accessToken": "new-jwt-access-token"
  }
}
```

**Cookies Set:**
- New `accessToken` (httpOnly, 15 minutes)
- New `refreshToken` (httpOnly, 7 days)

**Rate Limit:** 20 requests per 15 minutes per IP

### POST /forgot-password
Request password reset email.

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "If an account with that email exists, a password reset link has been sent."
}
```

Note: Response is the same whether the email exists or not (prevents email enumeration).

**Rate Limit:** 3 requests per hour per IP

### POST /reset-password
Reset password using reset token from email.

**Request Body:**
```json
{
  "token": "reset-token-from-email",
  "newPassword": "NewSecurePassword123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password reset successful. You can now log in with your new password."
}
```

**Side Effects:** All refresh tokens for the user are invalidated (logout from all devices).

**Rate Limit:** 3 requests per hour per IP

### GET /me
Get current authenticated user.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "emailVerified": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

### PATCH /me
Update the current user's basic profile.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Request Body:**
```json
{
  "name": "Alice Writer"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "email": "user@example.com",
      "name": "Alice Writer",
      "profileCompleted": true,
      "emailVerified": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  }
}
```

### DELETE /me
Delete the current authenticated user account.

**Headers:**
```
Authorization: Bearer <access-token>
```

**Response:**
```json
{
  "success": true,
  "message": "Account deleted successfully"
}
```

**Side Effects:** All refresh tokens are revoked, auth cookies are cleared, physical file objects owned by the account are removed best-effort, and the user row is deleted with current account-owned data using existing cascades plus explicit cleanup for non-cascading peer-review references.

## Security Features

### Password Security
- Passwords are hashed using bcrypt with 12 rounds
- Minimum password length: 8 characters (configurable via shared validators)
- Passwords are never stored in plain text or logged

### Token Security
- **Access Tokens**: Short-lived (15 minutes), used for API authentication
- **Refresh Tokens**: Long-lived (7 days), used only to generate new access tokens
- Refresh tokens are hashed before storage in database
- Tokens are stored in httpOnly cookies (not accessible to JavaScript)
- Cookies are marked as secure in production (HTTPS only)
- sameSite=strict to prevent CSRF attacks

### Email Verification
- Verification tokens are random 64-character hex strings
- Tokens expire after 24 hours
- Users must verify email before logging in

### Password Reset
- Reset tokens are random 64-character hex strings
- Tokens expire after 1 hour
- All refresh tokens are invalidated after password reset
- Email enumeration is prevented (same response for existing/non-existing emails)

### Rate Limiting
Rate limiting is implemented using Redis (with memory fallback) to prevent abuse:

- **Registration**: 3 attempts per hour per IP
- **Login**: 10 attempts per 15 minutes per IP (failed attempts only)
- **Email Verification**: 5 attempts per hour per IP
- **Password Reset Request**: 3 attempts per hour per IP
- **Password Reset**: 3 attempts per hour per IP
- **Token Refresh**: 20 attempts per 15 minutes per IP

### Additional Security
- CORS configured with credentials support
- Helmet.js for security headers
- Request logging for audit trail
- Error messages don't reveal sensitive information
- SQL injection prevention via parameterized queries

## Database Schema

### users table
```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    email_verification_token VARCHAR(255),
    email_verification_expires TIMESTAMP,
    password_reset_token VARCHAR(255),
    password_reset_expires TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### refresh_tokens table
```sql
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
```

## Authentication Flow

### Registration Flow
1. User submits email and password
2. System checks if email already exists
3. Password is hashed using bcrypt
4. Email verification token is generated
5. User record is created in database
6. Verification email is sent (async, non-blocking)
7. User receives confirmation

### Email Verification Flow
1. User clicks verification link from email
2. Token is validated and checked for expiration
3. User's email_verified flag is set to true
4. Verification token is cleared
5. Welcome email is sent (async, non-blocking)

### Login Flow
1. User submits email and password
2. User is retrieved from database
3. Password is verified using bcrypt
4. Email verification status is checked
5. Access token (15 min) and refresh token (7 days) are generated
6. Refresh token hash is stored in database
7. Tokens are set as httpOnly cookies
8. Access token is also returned in response body

### Token Refresh Flow
1. Client sends refresh token (from cookie or body)
2. Refresh token is verified (JWT signature and expiration)
3. Token hash is checked against database
4. User existence and verification status are confirmed
5. New access token and refresh token are generated
6. Old refresh token is deleted from database
7. New refresh token hash is stored in database
8. New tokens are set as httpOnly cookies

### Logout Flow
1. Authenticated user requests logout
2. Refresh token is retrieved from cookie or body
3. Specific refresh token is deleted from database (or all tokens if none provided)
4. Cookies are cleared
5. User is logged out

### Password Reset Flow
1. User requests password reset with email
2. User is retrieved from database
3. Reset token is generated
4. Token and expiration are stored in user record
5. Reset email is sent (async, non-blocking)
6. User clicks reset link and submits new password
7. Token is validated and checked for expiration
8. New password is hashed
9. Password is updated and reset token is cleared
10. All refresh tokens are invalidated (logout from all devices)

## Environment Variables

Required environment variables for authentication:

```env
# JWT Configuration
JWT_SECRET=your-secret-key-min-32-chars
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d

# Email Configuration
EMAIL_SERVICE=console|smtp|sendgrid|ses
EMAIL_FROM=noreply@humanly.app
EMAIL_HOST=smtp.example.com (if using SMTP)
EMAIL_PORT=587 (if using SMTP)
EMAIL_USER=username (if using SMTP)
EMAIL_PASSWORD=password (if using SMTP)
EMAIL_API_KEY=your-api-key (if using SendGrid)

# Rate Limiting
RATE_LIMIT_ENABLED=true
REDIS_URL=redis://localhost:6379

# CORS
CORS_ORIGIN=http://localhost:3000

# Server
NODE_ENV=development|production
```

## Usage Examples

### Using with fetch (JavaScript)

```javascript
// Register
const registerResponse = await fetch('http://localhost:3001/api/v1/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'SecurePassword123'
  })
});

// Login
const loginResponse = await fetch('http://localhost:3001/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include', // Important for cookies
  body: JSON.stringify({
    email: 'user@example.com',
    password: 'SecurePassword123'
  })
});
const { data } = await loginResponse.json();
const accessToken = data.accessToken;

// Authenticated request
const meResponse = await fetch('http://localhost:3001/api/v1/auth/me', {
  headers: {
    'Authorization': `Bearer ${accessToken}`
  },
  credentials: 'include'
});

// Refresh token
const refreshResponse = await fetch('http://localhost:3001/api/v1/auth/refresh', {
  method: 'POST',
  credentials: 'include' // Sends refresh token cookie
});

// Logout
await fetch('http://localhost:3001/api/v1/auth/logout', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`
  },
  credentials: 'include'
});
```

### Using with Axios (JavaScript)

```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3001/api/v1',
  withCredentials: true // Important for cookies
});

// Register
await api.post('/auth/register', {
  email: 'user@example.com',
  password: 'SecurePassword123'
});

// Login
const loginRes = await api.post('/auth/login', {
  email: 'user@example.com',
  password: 'SecurePassword123'
});
const accessToken = loginRes.data.data.accessToken;

// Set default authorization header
api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;

// Authenticated request
const meRes = await api.get('/auth/me');

// Refresh token
const refreshRes = await api.post('/auth/refresh');
api.defaults.headers.common['Authorization'] = `Bearer ${refreshRes.data.data.accessToken}`;

// Logout
await api.post('/auth/logout');
```

## Testing

### Manual Testing with cURL

```bash
# Register
curl -X POST http://localhost:3001/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPassword123"}'

# Verify email (get token from email or logs)
curl -X POST http://localhost:3001/api/v1/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{"token":"verification-token-here"}'

# Login
curl -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -c cookies.txt \
  -d '{"email":"test@example.com","password":"TestPassword123"}'

# Get current user (using access token from login response)
curl http://localhost:3001/api/v1/auth/me \
  -H "Authorization: Bearer ACCESS_TOKEN_HERE" \
  -b cookies.txt

# Refresh token
curl -X POST http://localhost:3001/api/v1/auth/refresh \
  -b cookies.txt \
  -c cookies.txt

# Logout
curl -X POST http://localhost:3001/api/v1/auth/logout \
  -H "Authorization: Bearer ACCESS_TOKEN_HERE" \
  -b cookies.txt
```

## Error Handling

All errors follow a consistent format:

```json
{
  "success": false,
  "error": "Error type",
  "message": "Human-readable error message"
}
```

Common error responses:

- **400 Bad Request**: Validation error or invalid token
- **401 Unauthorized**: Authentication required or invalid credentials
- **403 Forbidden**: Email not verified
- **409 Conflict**: Email already registered
- **429 Too Many Requests**: Rate limit exceeded
- **500 Internal Server Error**: Unexpected server error

## Maintenance

### Cleanup Tasks

The system includes automatic cleanup:

1. **Expired Refresh Tokens**: Deleted during login (see `AuthService.login`)
2. Manual cleanup can be triggered:
   ```javascript
   await RefreshTokenModel.deleteExpired();
   ```

Recommended: Set up a cron job to periodically clean expired tokens:

```javascript
// Example cron job (using node-cron)
import cron from 'node-cron';
import { RefreshTokenModel } from './models/refresh-token.model';

// Run every day at 2 AM
cron.schedule('0 2 * * *', async () => {
  await RefreshTokenModel.deleteExpired();
  console.log('Cleaned up expired refresh tokens');
});
```

## Future Enhancements

Potential improvements for the authentication system:

1. **Two-Factor Authentication (2FA)**: Add TOTP or SMS-based 2FA
2. **OAuth Integration**: Support Google, GitHub, etc. login
3. **Session Management**: View and manage active sessions
4. **Account Lockout**: Lock account after too many failed login attempts
5. **Password Strength Meter**: Client-side password strength indicator
6. **Remember Me**: Longer-lived refresh tokens for trusted devices
7. **Email Change Flow**: Verify new email before updating
8. **Audit Logs**: Track all authentication events
9. **Suspicious Activity Detection**: Alert on unusual login patterns

## Troubleshooting

### Common Issues

1. **"Email already registered"**: User already exists, try logging in or password reset
2. **"Invalid email or password"**: Check credentials, case-sensitive
3. **"Please verify your email"**: Check spam folder for verification email
4. **"Invalid or expired token"**: Token may have expired, request a new one
5. **"Too many requests"**: Wait for rate limit to reset (see specific endpoint limits)
6. **Cookies not being set**: Ensure `credentials: 'include'` in client requests
7. **CORS errors**: Check CORS_ORIGIN environment variable matches client origin

### Debug Mode

To enable detailed logging, set:
```env
LOG_LEVEL=debug
```

This will log all queries, auth attempts, and token operations.
