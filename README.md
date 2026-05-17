# Humanly - Text Provenance Service

A comprehensive text provenance service that tracks user typing activities in external forms and surveys with real-time monitoring, analytics, and certificate generation.

## 🎯 Features

- **Complete Authentication System** - Register, login, email verification, password reset
- **Project Management** - Create projects with unique tokens and tracking snippets
- **Event Tracking** - Capture every keystroke, paste, copy, and cursor movement
- **Real-time Live Preview** - WebSocket-based live event monitoring
- **Analytics Dashboard** - Statistics, timelines, event distributions, and user activity
- **Certificate Generation** - Generate verifiable certificates of authenticity for documents
- **Document Management** - User portal for documents and certificate verification
- **Rich Text Editor** - Lexical-based editor with formatting and tracking capabilities
- **Data Export** - Export events to JSON or CSV with filtering
- **Tracking Library** - Lightweight JavaScript library (<15KB) for embedding in external forms

## 📦 Project Structure

```text
humanly/
├── packages/
│   ├── shared/          # Shared TypeScript types and validators
│   ├── backend/         # Express.js API server with Socket.IO
│   ├── frontend/        # Next.js 14 admin dashboard
│   ├── frontend-user/   # Next.js 14 user portal for documents
│   ├── editor/          # Lexical-based rich text editor with tracking
│   └── tracker/         # JavaScript tracking library for external forms
├── docker/              # Docker configurations
├── docker-compose.yml   # Local development environment
├── package.json         # Root scripts and package manager configuration
├── pnpm-lock.yaml       # pnpm lockfile
├── pnpm-workspace.yaml  # pnpm workspace configuration
└── Documentation:
    ├── HTTPS_SETUP.md              # HTTPS configuration for production
    ├── QUALTRICS_INTEGRATION.md    # Qualtrics integration guide
    ├── CERTIFICATE_QUICK_REFERENCE.md
    ├── DOMAIN_CONFIGURATION.md
    ├── EXPORT_PAGE_SETUP.md
    ├── TESTING_GUIDE.md
    └── IMPLEMENTATION_STATUS.md
```

## 🚀 Quick Start

### Prerequisites

- **Node.js** 20.19+ and pnpm 9+
- **Docker** and Docker Compose

This repository uses pnpm workspaces. Enable pnpm through Corepack if it is not already available:

```bash
corepack enable
corepack prepare pnpm@9.0.0 --activate
```

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/ShenzheZhu/humanly.git
   cd humanly
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Set up environment variables**

   ```bash
   bash scripts/setup-env.sh
   # Edit packages/backend/.env and set your values (especially JWT_SECRET)
   ```

4. **Start Docker services** (PostgreSQL + Redis)

   ```bash
   pnpm docker:up
   ```

5. **Build shared packages** (required before running frontend)

   ```bash
   pnpm build:shared
   pnpm build:editor
   ```

6. **Start the backend** (runs DB migrations automatically on startup)

   ```bash
   pnpm dev:backend
   ```

7. **Start the frontends** (each in a new terminal)

   ```bash
   pnpm dev:frontend       # Admin dashboard
   pnpm dev:frontend-user  # User portal
   ```

8. **Access the application**

   - User Portal: <http://localhost:3002>
   - Admin Dashboard: <http://localhost:3000>
   - Backend API: <http://localhost:3001>
   - API Health: <http://localhost:3001/health>

## 🏗️ Development

### Running Individual Services

```bash
# Backend only
pnpm dev:backend

# Admin frontend only
pnpm dev:frontend

# User frontend only
pnpm dev:frontend-user

# Tracker library (watch mode)
pnpm dev:tracker

# Backend and admin frontend
pnpm dev:backend & pnpm dev:frontend
```

### Building for Production

```bash
# Build individually
pnpm build:backend
pnpm build:frontend
pnpm build:frontend-user
pnpm build:tracker

# Build everything
pnpm build:all
```

### Production QA

Full production regression uses a reusable Phase 0 baseline plus 14-phase
playbook:

- Guide: [docs/PRODUCTION_QA_PLAYBOOK.md](docs/PRODUCTION_QA_PLAYBOOK.md)
- Architecture/performance backlog:
  [docs/ARCHITECTURE_OPTIMIZATION_BACKLOG.md](docs/ARCHITECTURE_OPTIMIZATION_BACKLOG.md)

Create a new traceable QA control issue with:

```bash
pnpm qa:create-issue
```

### Docker Development

```bash
# Start all services (including backend)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down

# Rebuild backend
docker-compose up -d --build backend
```

## 📚 API Documentation

### Base URL

- Development: `http://localhost:3001/api/v1`
- Production: `https://your-domain.com/api/v1`

**Important for Qualtrics Integration:** Qualtrics requires HTTPS for external scripts. See [HTTPS_SETUP.md](./HTTPS_SETUP.md) for configuration instructions.

### Authentication Endpoints (`/auth`)

- `POST /register` - Register new user
- `POST /verify-email` - Verify email with token
- `POST /login` - Login and get tokens
- `POST /logout` - Logout and invalidate tokens
- `POST /refresh` - Refresh access token
- `POST /forgot-password` - Request password reset
- `POST /reset-password` - Reset password with token
- `GET /me` - Get current user

### Project Endpoints (`/projects`)

- `GET /` - List projects (paginated)
- `POST /` - Create project
- `GET /:id` - Get project details
- `PUT /:id` - Update project
- `DELETE /:id` - Delete project
- `POST /:id/regenerate-token` - Regenerate project token
- `GET /:id/snippet` - Get tracking snippets

### Tracking Endpoints (`/track`)

- `POST /init` - Initialize tracking session
- `POST /events` - Batch event ingestion
- `POST /submit` - Submit session

### Analytics Endpoints (`/projects/:id/analytics`)

- `GET /summary` - Summary statistics
- `GET /events-timeline` - Events over time
- `GET /event-types` - Event type distribution
- `GET /users` - User activity list
- `GET /sessions/:sessionId` - Session details

### Export Endpoints (`/projects/:id/export`)

- `GET /json` - Export as JSON
- `GET /csv` - Export as CSV

### Document Endpoints (`/documents`)

- `GET /` - List user documents
- `GET /:id` - Get document details
- `GET /:id/events` - Get document events

### Certificate Endpoints (`/certificates`)

- `POST /` - Generate certificate for document
- `GET /` - List user certificates
- `GET /:id` - Get certificate details
- `GET /:id/verify` - Verify certificate with access code
- `PUT /:id/access-code` - Update access code
- `DELETE /:id/access-code` - Remove access code

For detailed API documentation with examples, see:

- `packages/backend/AUTH_IMPLEMENTATION.md`
- `packages/backend/ANALYTICS.md`
- `packages/backend/WEBSOCKET.md`

## 🔌 Using the Tracking Library

### Installation

Include the tracker script in your HTML:

```html
<script src="https://your-domain.com/tracker/humanly-tracker.min.js"></script>
```

### Usage

```javascript
// Initialize tracker
const tracker = new HumanlyTracker({
  projectToken: 'your-project-token-here',
  apiUrl: 'https://api.humanly.com',
  userIdSelector: '#respondentId',  // CSS selector for user ID
  debug: false
});

// Start tracking all inputs
await tracker.init();

// Or track specific elements
tracker.attach('.survey-form input, .survey-form textarea');

// Mark session as submitted
await tracker.markSubmitted();

// Clean up
await tracker.destroy();
```

For complete documentation, see `packages/tracker/README.md`.

## 🐳 Production Deployment

Production runs on a single GCP VM with Docker Compose. GitHub Actions builds
the `backend`, `frontend-user`, and `frontend` Docker images, pushes immutable
commit-SHA tags to GCP Artifact Registry, then SSHes into the VM to pull and run
those exact images.

Production hostnames:

- `app.writehumanly.net`: user portal (`frontend-user`)
- `admin.writehumanly.net`: admin dashboard (`frontend`)

See [Production Deployment](./docs/PRODUCTION_DEPLOYMENT.md) for setup,
required GitHub secrets, Artifact Registry permissions, manual deploys, and
rollback commands.

## 🧪 Testing

```bash
# Backend tests
pnpm test:backend

# Frontend-user tests
pnpm test:frontend-user

# All tests
pnpm test
```

## 📊 Database Schema

The database uses PostgreSQL with TimescaleDB for efficient time-series data storage:

- **users** - User accounts with authentication
- **projects** - User projects with tracking tokens
- **sessions** - External user tracking sessions
- **events** - TimescaleDB hypertable for event data (auto-partitioned by day)
- **documents** - User-created documents with content and metadata
- **document_events** - Link table between documents and events
- **certificates** - Document authenticity certificates with access codes
- **refresh_tokens** - JWT refresh tokens

For complete schema, see `packages/backend/src/db/migrations/` directory.

## 🔐 Security Features

- bcrypt password hashing (12 rounds)
- JWT access tokens (15 min) and refresh tokens (7 days)
- httpOnly cookies with secure and sameSite flags
- Rate limiting on all sensitive endpoints
- Email verification required
- CSRF protection via sameSite cookies
- SQL injection prevention via parameterized queries
- Project ownership verification

## 🎨 Technology Stack

### Backend

- Express.js - Web framework
- Socket.IO - Real-time WebSocket communication
- PostgreSQL + TimescaleDB - Time-series database
- Redis - Caching and rate limiting
- JWT - Authentication
- Nodemailer - Email service
- Zod - Schema validation

### Frontend (Admin Dashboard)

- Next.js 14 - React framework with App Router
- Tailwind CSS - Utility-first styling
- shadcn/ui - Component library
- Zustand - State management
- Axios - HTTP client
- Socket.IO Client - Real-time updates
- Recharts - Data visualization

### Frontend User Portal

- Next.js 14 - React framework with App Router
- Tailwind CSS - Utility-first styling
- shadcn/ui - Component library
- Zustand - State management
- Document viewer and certificate management

### Editor

- Lexical - Extensible text editor framework
- React - UI library
- TypeScript - Type-safe JavaScript
- Rich text formatting (fonts, colors, alignment, lists)
- Built-in tracking integration

### Tracker

- TypeScript - Type-safe JavaScript
- Rollup - Module bundler
- Terser - Code minification

## 📝 Environment Variables

### Backend (`packages/backend/.env`)

```bash
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://humanly_user:humanly_password@localhost:5432/humanly_dev
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key-here
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d
CORS_ORIGIN=http://localhost:3000,http://localhost:3002
EMAIL_SERVICE=console
EMAIL_FROM=noreply@humanly.dev
```

### Frontend-User (`packages/frontend-user/.env`)

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1
```

### Frontend Admin (`packages/frontend/.env`)

```bash
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=http://localhost:3001
```

## 🐛 Troubleshooting

### Database Connection Issues

```bash
# Check if PostgreSQL is running
docker-compose ps postgres

# View PostgreSQL logs
docker-compose logs postgres

# Test connection
docker-compose exec postgres psql -U humanly_user -d humanly_dev -c "SELECT 1;"
```

### Redis Connection Issues

```bash
# Check if Redis is running
docker-compose ps redis

# Test connection
docker-compose exec redis redis-cli ping
```

### Port Already in Use

```bash
# Find process using port 3001
lsof -i :3001

# Kill process
kill -9 <PID>
```

## 📖 Additional Documentation

### Backend Documentation

- **Authentication**: `packages/backend/AUTH_IMPLEMENTATION.md`
- **WebSocket**: `packages/backend/WEBSOCKET.md`
- **Analytics**: `packages/backend/ANALYTICS.md`

### Frontend Documentation

- **Admin Dashboard Setup**: `packages/frontend/SETUP.md`
- **Admin Dashboard Quick Start**: `packages/frontend/QUICK-START.md`
- **Export Page**: `packages/frontend/EXPORT_PAGE_DOCUMENTATION.md`
- **Live Preview Features**: `packages/frontend/src/app/projects/[id]/live-preview/README.md`

### Integration & Deployment

- **Tracker Library**: `packages/tracker/README.md`
- **Qualtrics Integration**: `QUALTRICS_INTEGRATION.md`
- **HTTPS Setup**: `HTTPS_SETUP.md`
- **Domain Configuration**: `DOMAIN_CONFIGURATION.md`

### Certificate Documentation

- **Certificate Quick Reference**: `CERTIFICATE_QUICK_REFERENCE.md`
- **Certificate Types**: `CERTIFICATE_TYPES_SUMMARY.md`
- **Badge Possibilities**: `CERTIFICATE_BADGE_POSSIBILITIES.md`

### Testing & Status

- **Testing Guide**: `TESTING_GUIDE.md`
- **Implementation Status**: `IMPLEMENTATION_STATUS.md`

## 🤝 Contributing

This is a comprehensive full-stack application. Key areas for contribution:

- Additional analytics visualizations
- More export formats (Excel, Parquet)
- Enhanced tracking library features
- Certificate customization and badge options
- Performance optimizations
- Additional authentication methods (OAuth, 2FA)
- Rich text editor enhancements

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

Built with modern web technologies:

- TimescaleDB for efficient time-series data
- Socket.IO for real-time communication
- Lexical for extensible text editing
- shadcn/ui for beautiful components
- Next.js for excellent developer experience

---

**Status**: ✅ Full-Stack Application Complete

**Features**:

- ✅ Backend API with authentication and tracking
- ✅ Admin dashboard with analytics and live preview
- ✅ User portal with document and certificate management
- ✅ Rich text editor with tracking integration
- ✅ External form tracking library
- ✅ WebSocket real-time communication
- ✅ Certificate generation and verification system

For questions or issues, please check the documentation in each package directory.
