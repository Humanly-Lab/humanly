# humanly Analytics Backend

This document provides comprehensive information about the analytics backend implementation for humanly.

## Overview

The analytics backend provides comprehensive insights into user interactions, session activities, and event tracking across projects. It leverages TimescaleDB's hypertables and continuous aggregates for optimized time-series data queries, with Redis caching for improved performance.

## Architecture

### Components

1. **Service Layer** (`src/services/analytics.service.ts`)
   - Core business logic for analytics calculations
   - Database query optimization using TimescaleDB features
   - Redis caching with 5-minute TTL for expensive queries
   - Project ownership verification

2. **Controller Layer** (`src/controllers/analytics.controller.ts`)
   - Request handling and validation
   - Zod schema validation for query parameters
   - Error handling and response formatting

3. **Routes Layer** (`src/routes/analytics.routes.ts`)
   - API endpoint definitions
   - Authentication middleware integration
   - Comprehensive API documentation

## API Endpoints

All analytics endpoints are protected with authentication and verify project ownership.

### Base URL
```
/api/v1/projects/:projectId/analytics
```

### 1. Summary Statistics

**Endpoint:** `GET /summary`

**Description:** Get comprehensive summary statistics for a project.

**Query Parameters:**
- `startDate` (optional): ISO 8601 datetime - Filter from this date
- `endDate` (optional): ISO 8601 datetime - Filter to this date
- `externalUserId` (optional): string - Filter by specific user
- `eventType` (optional): string - Filter by event type

**Response:**
```json
{
  "success": true,
  "data": {
    "totalEvents": 15230,
    "totalSessions": 456,
    "uniqueUsers": 123,
    "avgEventsPerSession": 33.40,
    "avgSessionDuration": 245.67,
    "completionRate": 78.50
  }
}
```

**Fields:**
- `totalEvents`: Total number of tracked events
- `totalSessions`: Total number of sessions
- `uniqueUsers`: Count of unique external users
- `avgEventsPerSession`: Average events per session
- `avgSessionDuration`: Average session duration in seconds
- `completionRate`: Percentage of sessions that were submitted

### 2. Events Timeline

**Endpoint:** `GET /events-timeline`

**Description:** Get events over time with configurable grouping intervals.

**Query Parameters:**
- `groupBy` (optional): `'hour' | 'day' | 'week'` (default: 'day')
- `startDate` (optional): ISO 8601 datetime
- `endDate` (optional): ISO 8601 datetime
- `externalUserId` (optional): string
- `eventType` (optional): string

**Response:**
```json
{
  "success": true,
  "data": {
    "groupBy": "day",
    "timeline": [
      {
        "date": "2025-12-01",
        "eventCount": 1234
      },
      {
        "date": "2025-12-02",
        "eventCount": 1567
      }
    ]
  }
}
```

**Optimization:**
- Uses TimescaleDB `events_hourly` continuous aggregate when possible
- Falls back to `time_bucket()` for custom queries
- Date format varies by grouping:
  - Hour: `YYYY-MM-DD HH24:00:00`
  - Day: `YYYY-MM-DD`
  - Week: `IYYY-IW` (ISO year-week)

### 3. Event Type Distribution

**Endpoint:** `GET /event-types`

**Description:** Get breakdown of events by type with counts and percentages.

**Query Parameters:**
- `startDate` (optional): ISO 8601 datetime
- `endDate` (optional): ISO 8601 datetime
- `externalUserId` (optional): string

**Response:**
```json
{
  "success": true,
  "data": {
    "eventTypes": [
      {
        "eventType": "keydown",
        "count": 8500,
        "percentage": 55.80
      },
      {
        "eventType": "input",
        "count": 3200,
        "percentage": 21.00
      },
      {
        "eventType": "paste",
        "count": 1800,
        "percentage": 11.82
      }
    ],
    "total": 15230
  }
}
```

### 4. User Activity

**Endpoint:** `GET /users`

**Description:** Get list of users with their activity statistics, paginated.

**Query Parameters:**
- `page` (optional): number (default: 1)
- `limit` (optional): number (default: 20, max: 100)
- `startDate` (optional): ISO 8601 datetime
- `endDate` (optional): ISO 8601 datetime

**Response:**
```json
{
  "success": true,
  "data": {
    "users": [
      {
        "externalUserId": "user123",
        "sessionCount": 15,
        "eventCount": 450,
        "lastActive": "2025-12-18T10:30:00Z"
      },
      {
        "externalUserId": "user456",
        "sessionCount": 8,
        "eventCount": 234,
        "lastActive": "2025-12-17T14:22:00Z"
      }
    ],
    "total": 123,
    "page": 1,
    "limit": 20,
    "totalPages": 7
  }
}
```

### 5. Session Details

**Endpoint:** `GET /sessions/:sessionId`

**Description:** Get detailed information about a specific session including all events.

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "projectId": "660e8400-e29b-41d4-a716-446655440000",
    "externalUserId": "user123",
    "sessionStart": "2025-12-18T10:00:00Z",
    "sessionEnd": "2025-12-18T10:15:30Z",
    "submitted": true,
    "submissionTime": "2025-12-18T10:15:30Z",
    "durationSeconds": 930,
    "eventCount": 45,
    "events": [
      {
        "id": "1",
        "eventType": "focus",
        "timestamp": "2025-12-18T10:00:05Z",
        "targetElement": "essay-input",
        "keyCode": null,
        "keyChar": null,
        "textBefore": "",
        "textAfter": "",
        "cursorPosition": 0,
        "selectionStart": 0,
        "selectionEnd": 0,
        "metadata": {}
      }
    ]
  }
}
```

## Performance Optimizations

### 1. TimescaleDB Features

#### Continuous Aggregates
- **`events_hourly`**: Pre-aggregated hourly event counts by project and event type
  - Refreshed every 1 hour
  - Used for timeline queries when possible
  - Significantly reduces query time for historical data

- **`session_daily_stats`**: Pre-aggregated daily session statistics
  - Session counts, unique users, submitted sessions, average duration
  - Refreshed daily
  - Used for summary statistics

#### Views
- **`session_summaries`**: Combines session and event data
  - Duration calculations
  - Event counts per session
  - First and last event timestamps

- **`project_statistics`**: Project-level aggregations
  - Total sessions and events
  - Unique user counts
  - Last activity timestamps

### 2. Redis Caching

All analytics queries are cached in Redis with a 5-minute TTL:

**Cache Key Format:**
```
analytics:{projectId}:{type}:{filters}
```

**Examples:**
- `analytics:abc123:summary:{"startDate":"2025-12-01"}`
- `analytics:abc123:timeline:day:{}`
- `analytics:abc123:users:1:20:{}`

**Cache Behavior:**
- Cache hits are logged for monitoring
- Cache misses trigger database queries
- Results are automatically cached for subsequent requests
- Session details have shorter TTL (1 minute) due to potential updates

### 3. Query Optimization

#### Summary Stats
- Uses CTEs (Common Table Expressions) for clarity
- Combines session and event aggregations in single query
- Leverages existing indexes on `project_id` and `timestamp`

#### Timeline
- Automatically uses `events_hourly` continuous aggregate when:
  - Grouping by hour
  - No event type or user filters
  - Significantly faster for historical data
- Uses `time_bucket()` for custom queries
- Proper date formatting for each grouping level

#### Event Type Distribution
- Single query with percentage calculations
- Handles division by zero gracefully
- Ordered by count descending

#### User Activity
- Efficient pagination with OFFSET/LIMIT
- Separate count query for total pages
- Indexed on `external_user_id` for fast filtering
- Sorted by last activity (most recent first)

## Database Schema

### Tables Used

#### `events` (TimescaleDB Hypertable)
- Partitioned by `timestamp` with 1-day chunks
- Compression enabled for data older than 7 days
- Retention policy: 1 year
- Indexes:
  - `(session_id, timestamp DESC)`
  - `(project_id, timestamp DESC)`
  - `(event_type)`
  - `(timestamp DESC)`
  - GIN index on `metadata` JSONB

#### `sessions`
- Standard PostgreSQL table
- Indexes:
  - `(project_id)`
  - `(external_user_id)`
  - `(session_start DESC)`
  - `(project_id, external_user_id)`
  - `(submitted)`

#### `projects`
- Standard PostgreSQL table
- Indexes:
  - `(user_id)`
  - `(project_token)`
  - `(is_active)` (partial)

## Security

### Authentication
All analytics endpoints require JWT authentication via the `authenticate` middleware.

### Authorization
- Every request verifies project ownership using `ProjectModel.verifyOwnership()`
- Users can only access analytics for their own projects
- Session details verify project ownership before returning data

### Input Validation
- All query parameters validated with Zod schemas
- Date ranges validated (start < end)
- UUID formats validated for session IDs
- Pagination limits enforced (max 100 items per page)

## Error Handling

### Standard Error Responses

**400 Bad Request:**
```json
{
  "success": false,
  "error": "Invalid query parameters",
  "message": "Invalid request data",
  "details": [
    {
      "field": "startDate",
      "message": "Invalid datetime string"
    }
  ]
}
```

**403 Forbidden:**
```json
{
  "success": false,
  "error": "You do not have access to this project",
  "message": "You do not have access to this project"
}
```

**404 Not Found:**
```json
{
  "success": false,
  "error": "Session not found",
  "message": "Session not found"
}
```

## Usage Examples

### Get Summary Statistics

```bash
curl -X GET \
  'http://localhost:3000/api/v1/projects/abc-123/analytics/summary?startDate=2025-12-01T00:00:00Z&endDate=2025-12-18T23:59:59Z' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'
```

### Get Daily Timeline

```bash
curl -X GET \
  'http://localhost:3000/api/v1/projects/abc-123/analytics/events-timeline?groupBy=day&startDate=2025-12-01T00:00:00Z' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'
```

### Get Event Types

```bash
curl -X GET \
  'http://localhost:3000/api/v1/projects/abc-123/analytics/event-types' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'
```

### Get User Activity (Page 2)

```bash
curl -X GET \
  'http://localhost:3000/api/v1/projects/abc-123/analytics/users?page=2&limit=50' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'
```

### Get Session Details

```bash
curl -X GET \
  'http://localhost:3000/api/v1/projects/abc-123/analytics/sessions/550e8400-e29b-41d4-a716-446655440000' \
  -H 'Authorization: Bearer YOUR_JWT_TOKEN'
```

## Monitoring and Logging

### Log Events

The analytics service logs the following events:

**Cache Operations:**
```
Cache hit for summary stats { projectId, cacheKey }
Cache miss for summary stats { projectId, cacheKey }
```

**Successful Operations:**
```
Summary stats retrieved { projectId, userId, stats }
Events timeline retrieved { projectId, userId, groupBy, dataPoints }
Event type distribution retrieved { projectId, userId, eventTypes }
User activity retrieved { projectId, userId, page, limit, total }
Session details retrieved { sessionId, userId, projectId, eventCount }
```

**Errors:**
```
Failed to get summary stats { error, projectId, userId }
Failed to get events timeline { error, projectId, userId, groupBy }
Failed to get event type distribution { error, projectId, userId }
Failed to get user activity { error, projectId, userId, page, limit }
Failed to get session details { error, sessionId, userId }
```

## Future Enhancements

### Planned Features

1. **Export Functionality**
   - CSV export for all analytics data
   - Excel export with multiple sheets
   - JSON export for programmatic access
   - Email scheduled reports

2. **Advanced Analytics**
   - Heatmaps of editing activity
   - Writing patterns analysis
   - Peak activity times
   - User cohort analysis

3. **Real-time Analytics**
   - WebSocket streaming for live updates
   - Real-time dashboards
   - Active session monitoring

4. **Custom Metrics**
   - User-defined KPIs
   - Custom event aggregations
   - Configurable alerts and notifications

5. **Comparative Analytics**
   - Period-over-period comparisons
   - Project benchmarking
   - User segment comparisons

## Troubleshooting

### Common Issues

**1. Slow Query Performance**
- Check if continuous aggregates are up to date
- Verify indexes exist on `events` and `sessions` tables
- Monitor cache hit rates in logs
- Consider adding date range filters to reduce data scanned

**2. Cache Misses**
- Verify Redis connection is active
- Check Redis memory limits
- Monitor cache TTL settings
- Review cache key generation

**3. Incorrect Statistics**
- Verify TimescaleDB continuous aggregate refresh policies
- Check for timezone issues in date filters
- Ensure data retention policies haven't dropped relevant data
- Validate event ingestion is working correctly

## Testing

### Manual Testing

Use the provided curl examples above with:
1. Valid JWT token from authentication
2. Existing project ID you own
3. Appropriate date ranges with actual data

### Integration Testing

Test scenarios should cover:
1. All endpoints with valid authentication
2. Project ownership verification
3. Date range filtering
4. Pagination edge cases
5. Cache behavior (hit and miss)
6. Error handling (invalid params, unauthorized access)

## Performance Metrics

Expected performance characteristics:

- **Summary Stats**: < 100ms (cached), < 500ms (uncached)
- **Timeline (hour)**: < 50ms (using continuous aggregate)
- **Timeline (day/week)**: < 200ms
- **Event Types**: < 150ms
- **User Activity**: < 200ms (with pagination)
- **Session Details**: < 100ms (cached), < 300ms (uncached)

These metrics assume:
- Proper database indexes
- Active Redis cache
- Up-to-date continuous aggregates
- Reasonable data volumes (< 1M events per project)
