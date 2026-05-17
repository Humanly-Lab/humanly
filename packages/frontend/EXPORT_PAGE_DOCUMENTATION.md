# Data Export Page Documentation

## Overview

The data export page is located at `/app/(dashboard)/projects/[id]/export/page.tsx` and provides a comprehensive interface for users to export their tracking data with various filters and format options.

## Location

```
/home/ubuntu/humanly/packages/frontend/src/app/(dashboard)/projects/[id]/export/page.tsx
```

## Features Implemented

### 1. Export Format Selection
- **Tabs Interface**: Users can toggle between JSON and CSV formats
- **Format Descriptions**: Each format includes a helpful description
- **Format-Specific Options**:
  - **JSON**: Pretty print option for formatted output with indentation
  - **CSV**: Include headers option, field delimiter selection (comma, semicolon, tab)
- **Preview**: Shows sample data structure for each format

### 2. Date Range Filter
- **Date Pickers**: Start date and end date inputs (HTML5 date inputs)
- **Quick Presets**:
  - Last 7 days
  - Last 30 days
  - Last 90 days
  - All time
  - Custom (manual date selection)
- **Validation**: Ensures end date is after start date with error alerts

### 3. Additional Filters
- **Session ID Filter**:
  - Text input with "Add" button
  - Multiple session IDs can be added
  - Display as removable badges
  - Press Enter to add
- **User ID Filter**:
  - Text input with "Add" button
  - Multiple user IDs can be added
  - Display as removable badges
  - Press Enter to add
- **Event Type Filter**:
  - Checkboxes for all 8 event types (keydown, keyup, paste, copy, cut, focus, blur, input)
  - Multiple selection allowed
  - Grid layout for easy access
- **Submitted Sessions Only**: Checkbox to include only submitted sessions
- **Include Metadata**: Checkbox to include/exclude IP address, user agent, and other metadata

### 4. Export Preview
- **Estimated Record Count**: Shows how many records will be exported
- **Estimated File Size**: Displays approximate file size
- **Large Export Warning**: Alert when export exceeds 10,000 events
- **No Data Warning**: Alert when filters return no results
- **Sample Data Preview**: Shows first 5 records in JSON format
- **Auto-refresh**: Preview updates 500ms after filter changes (debounced)
- **Loading State**: Shows spinner while fetching preview

### 5. Export Actions
- **Export Button**:
  - Triggers download when clicked
  - Disabled when no data or validation fails
  - Shows loading state during export
- **Progress Indicator**:
  - Progress bar with percentage
  - Shows export stages (request, download, file creation)
- **Success Message**: Green alert when export completes
- **Error Handling**:
  - Network errors
  - File too large errors
  - Invalid date range errors
  - No data errors
  - Retry functionality
- **Clear All Filters**: Button to reset all filters to default

### 6. Export Options
- **Timestamp Format**:
  - ISO 8601 (2025-12-18T10:30:00Z)
  - Unix Timestamp (1734520200)
  - Human Readable (Dec 18, 2025 10:30 AM)
- **Compression**: Option to compress export as ZIP file (recommended for large exports)

## Technical Implementation

### State Management
- Uses React hooks for state management
- Form state managed with local useState
- Debounced preview fetching to avoid excessive API calls
- Progress tracking for export process

### API Endpoints Used

#### Export Endpoints
```
GET /api/v1/tasks/:taskId/export/json
GET /api/v1/tasks/:taskId/export/csv
```

#### Query Parameters
- `startDate`: ISO date string
- `endDate`: ISO date string
- `sessionIds`: Comma-separated list
- `userIds`: Comma-separated list
- `eventTypes`: Comma-separated list of event types
- `submittedOnly`: Boolean flag
- `excludeMetadata`: Boolean flag
- `timestampFormat`: iso8601 | unix | human
- `prettyPrint`: Boolean (JSON only)
- `includeHeaders`: Boolean (CSV only)
- `delimiter`: , | ; | \t (CSV only)
- `compress`: Boolean (ZIP compression)

### File Download Implementation
- Uses Axios with blob response type
- Implements `onDownloadProgress` for progress tracking
- Creates temporary download link using `window.URL.createObjectURL`
- Automatically triggers download via programmatic click
- Cleans up temporary URLs after download
- Generates descriptive filenames: `export-{projectId}-{date}.{format}`

### TypeScript Types
```typescript
type ExportFormat = 'json' | 'csv';
type TimestampFormat = 'iso8601' | 'unix' | 'human';
type CsvDelimiter = ',' | ';' | '\t';
type DatePreset = 'last7days' | 'last30days' | 'last90days' | 'alltime' | 'custom';

interface ExportFilters {
  startDate: string;
  endDate: string;
  sessionIds: string[];
  userIds: string[];
  eventTypes: EventType[];
  submittedOnly: boolean;
  includeMetadata: boolean;
}

interface ExportOptions {
  format: ExportFormat;
  prettyPrint: boolean;
  includeHeaders: boolean;
  timestampFormat: TimestampFormat;
  csvDelimiter: CsvDelimiter;
  compress: boolean;
}

interface ExportPreview {
  estimatedRecordCount: number;
  estimatedFileSize: string;
  sampleData: any[];
}
```

### Form Validation
- Start date required
- End date required
- End date must be after start date
- At least 1 record must be available for export
- Validates before allowing export

### Error Handling
- Network errors caught and displayed
- API errors formatted with user-friendly messages
- Validation errors shown as alerts
- Retry buttons for failed operations
- Loading states prevent duplicate requests

## UI Components Used

### shadcn/ui Components
- `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`
- `Button` (default, outline variants)
- `Alert`, `AlertTitle`, `AlertDescription` (default, destructive, success variants)
- `Input` (text, date types)
- `Label`
- `Checkbox`
- `Select`, `SelectTrigger`, `SelectContent`, `SelectItem`, `SelectValue`
- `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`
- `RadioGroup`, `RadioGroupItem`
- `Progress`
- `Badge` (secondary variant with removable X button)

### Icons (lucide-react)
- `Download`, `FileJson`, `FileText`, `Calendar`, `Filter`
- `AlertTriangle`, `CheckCircle2`, `Loader2`, `RefreshCcw`, `Info`, `X`

## New Components Created

The following UI components were created to support this page:

1. **Radio Group** (`/components/ui/radio-group.tsx`)
   - Radix UI based radio button group
   - Used for mutually exclusive selections

2. **Tabs** (`/components/ui/tabs.tsx`)
   - Radix UI based tabs component
   - Used for format selection (JSON/CSV)

3. **Progress** (`/components/ui/progress.tsx`)
   - Radix UI based progress bar
   - Used for export progress indicator

## Responsive Design
- Mobile-friendly layout
- Grid layouts adjust for smaller screens
- Buttons stack vertically on mobile
- Cards maintain readability on all screen sizes

## User Experience Features
- Clear section headers and descriptions
- Helpful tooltips and descriptions for each option
- Visual feedback for all actions (loading, success, error)
- Automatic file download after successful export
- Sample data preview before exporting
- Estimated metrics to help users understand export size
- Quick preset buttons for common date ranges
- Keyboard shortcuts (Enter key to add IDs)
- Removable badges for multi-select filters

## Installation Requirements

### New Dependencies Added
The following dependencies were added to `package.json`:

```json
"@radix-ui/react-progress": "^1.0.3",
"@radix-ui/react-radio-group": "^1.1.3",
"@radix-ui/react-tabs": "^1.0.4"
```

### Installation Command
```bash
npm install
# or
pnpm install
# or
yarn install
```

## Usage Example

1. Navigate to `/projects/{id}/export`
2. Select export format (JSON or CSV)
3. Choose date range using presets or custom dates
4. (Optional) Add specific session IDs or user IDs
5. (Optional) Filter by event types
6. (Optional) Configure timestamp format and compression
7. Review the preview (record count, file size, sample data)
8. Click "Export Data" button
9. Wait for progress to complete
10. File downloads automatically

## Backend Requirements

The backend must implement the following endpoints:

### Export Preview

Not currently implemented. The task analytics placeholder route is
`GET /api/v1/tasks/:taskId/analytics/export`, but it does not return preview
counts or sample rows yet.

### JSON Export
```
GET /api/v1/tasks/:taskId/export/json
Response: Blob (application/json or application/zip)
Headers: Content-Disposition: attachment; filename="export-{id}-{date}.json"
```

### CSV Export
```
GET /api/v1/tasks/:taskId/export/csv
Response: Blob (text/csv or application/zip)
Headers: Content-Disposition: attachment; filename="export-{id}-{date}.csv"
```

## Future Enhancements (Not Implemented)

The following features were marked as "nice to have" but not implemented:

### Export History
- Show recent exports
- Allow re-download of previous exports
- Display export date, filters used, and file size
- Store export records in database

To implement this, you would need:
1. New database table for export history
2. API endpoints to fetch and retrieve past exports
3. Additional UI section showing export history table
4. File storage for generated exports (S3, local filesystem, etc.)

## File Structure

```
/home/ubuntu/humanly/packages/frontend/src/
├── app/(dashboard)/projects/[id]/export/
│   └── page.tsx (1025 lines)
├── components/ui/
│   ├── radio-group.tsx (new)
│   ├── tabs.tsx (new)
│   ├── progress.tsx (new)
│   ├── badge.tsx (existing)
│   ├── button.tsx (existing)
│   ├── card.tsx (existing)
│   ├── checkbox.tsx (existing)
│   ├── input.tsx (existing)
│   ├── label.tsx (existing)
│   ├── alert.tsx (existing)
│   └── select.tsx (existing)
└── lib/
    └── api-client.ts (existing)
```

## Testing Checklist

- [ ] Format selection (JSON/CSV) works correctly
- [ ] Date range presets populate correct dates
- [ ] Custom date selection works
- [ ] Date validation shows error for invalid ranges
- [ ] Session ID filter allows adding/removing IDs
- [ ] User ID filter allows adding/removing IDs
- [ ] Event type checkboxes toggle correctly
- [ ] Export preview updates after filter changes
- [ ] Large export warning appears for >10k records
- [ ] No data warning appears when appropriate
- [ ] Export button disabled when validation fails
- [ ] Export progress bar shows during download
- [ ] Success message appears after export
- [ ] Error messages display for failed exports
- [ ] File downloads automatically
- [ ] Filename includes project ID and date
- [ ] Clear filters button resets all fields
- [ ] Compression option includes ZIP in filename
- [ ] Timestamp format affects export data
- [ ] CSV delimiter option works correctly
- [ ] Pretty print affects JSON formatting
- [ ] Responsive design works on mobile

## Support

For issues or questions about the export page:
1. Check the browser console for errors
2. Verify API endpoints are implemented correctly
3. Ensure all dependencies are installed
4. Check that date formats match API expectations
5. Verify CORS settings allow blob downloads
