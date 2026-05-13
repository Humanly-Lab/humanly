'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  Download,
  FileJson,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  RefreshCcw,
  Info,
  X,
} from 'lucide-react';
import { EventType } from '@humanly/shared';
import api, { ApiError, apiClient } from '@/lib/api-client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';

// Export format types
type ExportFormat = 'json' | 'csv';
type TimestampFormat = 'iso8601' | 'unix' | 'human';
type CsvDelimiter = ',' | ';' | '\t';
type DatePreset = 'last7days' | 'last30days' | 'last90days' | 'alltime' | 'custom';

// Event types for filtering
const EVENT_TYPES: EventType[] = [
  'keydown',
  'keyup',
  'paste',
  'copy',
  'cut',
  'focus',
  'blur',
  'input',
];

// Export filters interface
interface ExportFilters {
  startDate: string;
  endDate: string;
  sessionIds: string[];
  userIds: string[];
  eventTypes: EventType[];
  submittedOnly: boolean;
  includeMetadata: boolean;
}

// Export options interface
interface ExportOptions {
  format: ExportFormat;
  prettyPrint: boolean;
  includeHeaders: boolean;
  timestampFormat: TimestampFormat;
  csvDelimiter: CsvDelimiter;
  compress: boolean;
}

// Export preview data
interface ExportPreview {
  estimatedRecordCount: number;
  estimatedFileSize: string;
  sampleData: any[];
}

export default function ExportPage() {
  const params = useParams();
  const taskId = params.id as string;

  // Date preset state
  const [datePreset, setDatePreset] = useState<DatePreset>('last30days');

  // Filter state
  const [filters, setFilters] = useState<ExportFilters>({
    startDate: '',
    endDate: '',
    sessionIds: [],
    userIds: [],
    eventTypes: [],
    submittedOnly: false,
    includeMetadata: true,
  });

  // Options state
  const [options, setOptions] = useState<ExportOptions>({
    format: 'json',
    prettyPrint: true,
    includeHeaders: true,
    timestampFormat: 'iso8601',
    csvDelimiter: ',',
    compress: false,
  });

  // UI state
  const [sessionIdInput, setSessionIdInput] = useState('');
  const [userIdInput, setUserIdInput] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState(false);

  // Preview state
  const [preview, setPreview] = useState<ExportPreview | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Initialize date range based on preset
  useEffect(() => {
    const endDate = new Date();
    const startDate = new Date();

    switch (datePreset) {
      case 'last7days':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case 'last30days':
        startDate.setDate(endDate.getDate() - 30);
        break;
      case 'last90days':
        startDate.setDate(endDate.getDate() - 90);
        break;
      case 'alltime':
        startDate.setFullYear(2000); // Set to a very early date
        break;
      case 'custom':
        // Don't auto-set dates for custom
        return;
    }

    setFilters((prev) => ({
      ...prev,
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
    }));
  }, [datePreset]);

  // Fetch export preview
  const fetchPreview = useCallback(async () => {
    if (!filters.startDate || !filters.endDate) {
      return;
    }

    try {
      setIsLoadingPreview(true);
      setPreviewError(null);

      const params: any = {
        startDate: filters.startDate,
        endDate: filters.endDate,
      };

      if (filters.sessionIds.length > 0) {
        params.sessionIds = filters.sessionIds.join(',');
      }
      if (filters.userIds.length > 0) {
        params.userIds = filters.userIds.join(',');
      }
      if (filters.eventTypes.length > 0) {
        params.eventTypes = filters.eventTypes.join(',');
      }
      if (filters.submittedOnly) {
        params.submittedOnly = 'true';
      }

      const response = await api.get<{
        success: boolean;
        data: ExportPreview;
      }>(`/api/v1/tasks/${taskId}/export/preview`, { params });

      setPreview(response.data);
    } catch (err) {
      const apiError = err as ApiError;
      setPreviewError(apiError.message || 'Failed to load preview');
      setPreview(null);
    } finally {
      setIsLoadingPreview(false);
    }
  }, [taskId, filters]);

  // Fetch preview when filters change
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      fetchPreview();
    }, 500);

    return () => clearTimeout(debounceTimer);
  }, [fetchPreview]);

  // Handle session ID addition
  const handleAddSessionId = () => {
    const trimmed = sessionIdInput.trim();
    if (trimmed && !filters.sessionIds.includes(trimmed)) {
      setFilters((prev) => ({
        ...prev,
        sessionIds: [...prev.sessionIds, trimmed],
      }));
      setSessionIdInput('');
    }
  };

  // Handle user ID addition
  const handleAddUserId = () => {
    const trimmed = userIdInput.trim();
    if (trimmed && !filters.userIds.includes(trimmed)) {
      setFilters((prev) => ({
        ...prev,
        userIds: [...prev.userIds, trimmed],
      }));
      setUserIdInput('');
    }
  };

  // Remove session ID
  const removeSessionId = (id: string) => {
    setFilters((prev) => ({
      ...prev,
      sessionIds: prev.sessionIds.filter((sid) => sid !== id),
    }));
  };

  // Remove user ID
  const removeUserId = (id: string) => {
    setFilters((prev) => ({
      ...prev,
      userIds: prev.userIds.filter((uid) => uid !== id),
    }));
  };

  // Toggle event type
  const toggleEventType = (eventType: EventType) => {
    setFilters((prev) => {
      const hasType = prev.eventTypes.includes(eventType);
      return {
        ...prev,
        eventTypes: hasType
          ? prev.eventTypes.filter((t) => t !== eventType)
          : [...prev.eventTypes, eventType],
      };
    });
  };

  // Clear all filters
  const clearAllFilters = () => {
    setFilters({
      startDate: '',
      endDate: '',
      sessionIds: [],
      userIds: [],
      eventTypes: [],
      submittedOnly: false,
      includeMetadata: true,
    });
    setDatePreset('last30days');
  };

  // Validate export
  const validateExport = (): string | null => {
    if (!filters.startDate) {
      return 'Please select a start date';
    }
    if (!filters.endDate) {
      return 'Please select an end date';
    }
    if (new Date(filters.startDate) > new Date(filters.endDate)) {
      return 'End date must be after start date';
    }
    if (preview && preview.estimatedRecordCount === 0) {
      return 'No data available for the selected filters';
    }
    return null;
  };

  // Handle export
  const handleExport = async () => {
    const validationError = validateExport();
    if (validationError) {
      setExportError(validationError);
      return;
    }

    try {
      setIsExporting(true);
      setExportProgress(10);
      setExportError(null);
      setExportSuccess(false);

      // Build query parameters
      const params: any = {
        startDate: filters.startDate,
        endDate: filters.endDate,
        timestampFormat: options.timestampFormat,
      };

      if (filters.sessionIds.length > 0) {
        params.sessionIds = filters.sessionIds.join(',');
      }
      if (filters.userIds.length > 0) {
        params.userIds = filters.userIds.join(',');
      }
      if (filters.eventTypes.length > 0) {
        params.eventTypes = filters.eventTypes.join(',');
      }
      if (filters.submittedOnly) {
        params.submittedOnly = 'true';
      }
      if (!filters.includeMetadata) {
        params.excludeMetadata = 'true';
      }
      if (options.compress) {
        params.compress = 'true';
      }

      // Format-specific options
      if (options.format === 'json') {
        params.prettyPrint = options.prettyPrint ? 'true' : 'false';
      } else if (options.format === 'csv') {
        params.includeHeaders = options.includeHeaders ? 'true' : 'false';
        params.delimiter = options.csvDelimiter;
      }

      setExportProgress(30);

      // Make API request
      const endpoint = `/api/v1/tasks/${taskId}/export/${options.format}`;
      const response = await apiClient.get(endpoint, {
        params,
        responseType: 'blob',
        onDownloadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round(
              30 + (progressEvent.loaded / progressEvent.total) * 60
            );
            setExportProgress(percentCompleted);
          }
        },
      });

      setExportProgress(95);

      // Create download link
      const blob = new Blob([response.data], {
        type:
          options.format === 'json'
            ? 'application/json'
            : 'text/csv',
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;

      // Generate filename
      const timestamp = new Date().toISOString().split('T')[0];
      const extension = options.compress
        ? `${options.format}.zip`
        : options.format;
      link.download = `export-${taskId}-${timestamp}.${extension}`;

      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      setExportProgress(100);
      setExportSuccess(true);

      // Reset after 3 seconds
      setTimeout(() => {
        setExportSuccess(false);
        setExportProgress(0);
      }, 3000);
    } catch (err) {
      const apiError = err as ApiError;
      setExportError(
        apiError.message || 'Failed to export data. Please try again.'
      );
      setExportProgress(0);
    } finally {
      setIsExporting(false);
    }
  };

  // Get format description
  const getFormatDescription = (format: ExportFormat): string => {
    switch (format) {
      case 'json':
        return 'Export data in JSON format with full structure and nested objects';
      case 'csv':
        return 'Export data in CSV format with flattened structure for spreadsheet applications';
      default:
        return '';
    }
  };

  // Get delimiter label
  const getDelimiterLabel = (delimiter: CsvDelimiter): string => {
    switch (delimiter) {
      case ',':
        return 'Comma (,)';
      case ';':
        return 'Semicolon (;)';
      case '\t':
        return 'Tab';
      default:
        return '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Export Data</h1>
        <p className="text-muted-foreground mt-2">
          Export your tracking data with customizable filters and format options
        </p>
      </div>

      {/* Export Format Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Export Format</CardTitle>
          <CardDescription>
            Choose the format for your exported data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs
            value={options.format}
            onValueChange={(value) =>
              setOptions((prev) => ({ ...prev, format: value as ExportFormat }))
            }
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="json" className="gap-2">
                <FileJson className="h-4 w-4" />
                JSON
              </TabsTrigger>
              <TabsTrigger value="csv" className="gap-2">
                <FileText className="h-4 w-4" />
                CSV
              </TabsTrigger>
            </TabsList>

            <TabsContent value="json" className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-4">
                <p className="text-sm text-muted-foreground">
                  {getFormatDescription('json')}
                </p>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="prettyPrint"
                  checked={options.prettyPrint}
                  onCheckedChange={(checked) =>
                    setOptions((prev) => ({
                      ...prev,
                      prettyPrint: checked as boolean,
                    }))
                  }
                />
                <Label
                  htmlFor="prettyPrint"
                  className="text-sm font-normal cursor-pointer"
                >
                  Pretty print (formatted with indentation)
                </Label>
              </div>

              <div className="rounded-lg border bg-muted/20 p-4">
                <p className="text-xs font-medium mb-2">JSON Structure Preview:</p>
                <pre className="text-xs text-muted-foreground overflow-x-auto">
{`{
  "events": [
    {
      "id": "evt_123",
      "sessionId": "sess_456",
      "eventType": "keydown",
      "timestamp": "2025-12-18T10:30:00Z",
      "keyChar": "a",
      "metadata": { ... }
    }
  ],
  "totalCount": 1234,
  "exportedAt": "2025-12-18T12:00:00Z"
}`}
                </pre>
              </div>
            </TabsContent>

            <TabsContent value="csv" className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-4">
                <p className="text-sm text-muted-foreground">
                  {getFormatDescription('csv')}
                </p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="includeHeaders"
                    checked={options.includeHeaders}
                    onCheckedChange={(checked) =>
                      setOptions((prev) => ({
                        ...prev,
                        includeHeaders: checked as boolean,
                      }))
                    }
                  />
                  <Label
                    htmlFor="includeHeaders"
                    className="text-sm font-normal cursor-pointer"
                  >
                    Include column headers
                  </Label>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="delimiter">Field Delimiter</Label>
                  <Select
                    value={options.csvDelimiter}
                    onValueChange={(value) =>
                      setOptions((prev) => ({
                        ...prev,
                        csvDelimiter: value as CsvDelimiter,
                      }))
                    }
                  >
                    <SelectTrigger id="delimiter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value=",">{getDelimiterLabel(',')}</SelectItem>
                      <SelectItem value=";">{getDelimiterLabel(';')}</SelectItem>
                      <SelectItem value="\t">{getDelimiterLabel('\t')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="rounded-lg border bg-muted/20 p-4">
                <p className="text-xs font-medium mb-2">CSV Structure Preview:</p>
                <pre className="text-xs text-muted-foreground overflow-x-auto">
{`id,sessionId,eventType,timestamp,keyChar,targetElement
evt_123,sess_456,keydown,2025-12-18T10:30:00Z,a,input#email
evt_124,sess_456,input,2025-12-18T10:30:01Z,,input#email`}
                </pre>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Date Range Filter */}
      <Card>
        <CardHeader>
          <CardTitle>Date Range</CardTitle>
          <CardDescription>
            Select the time period for your export
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Date Presets */}
          <div className="space-y-2">
            <Label>Quick Presets</Label>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              <Button
                variant={datePreset === 'last7days' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDatePreset('last7days')}
              >
                Last 7 days
              </Button>
              <Button
                variant={datePreset === 'last30days' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDatePreset('last30days')}
              >
                Last 30 days
              </Button>
              <Button
                variant={datePreset === 'last90days' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDatePreset('last90days')}
              >
                Last 90 days
              </Button>
              <Button
                variant={datePreset === 'alltime' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDatePreset('alltime')}
              >
                All time
              </Button>
              <Button
                variant={datePreset === 'custom' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDatePreset('custom')}
              >
                Custom
              </Button>
            </div>
          </div>

          {/* Date Inputs */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={filters.startDate}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, startDate: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="endDate">End Date</Label>
              <Input
                id="endDate"
                type="date"
                value={filters.endDate}
                onChange={(e) =>
                  setFilters((prev) => ({ ...prev, endDate: e.target.value }))
                }
                min={filters.startDate}
              />
            </div>
          </div>

          {/* Date validation error */}
          {filters.startDate &&
            filters.endDate &&
            new Date(filters.startDate) > new Date(filters.endDate) && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  End date must be after start date
                </AlertDescription>
              </Alert>
            )}
        </CardContent>
      </Card>

      {/* Additional Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Additional Filters</CardTitle>
          <CardDescription>
            Narrow down your export with specific filters
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Session ID Filter */}
          <div className="space-y-2">
            <Label htmlFor="sessionId">Session IDs</Label>
            <div className="flex gap-2">
              <Input
                id="sessionId"
                placeholder="Enter session ID"
                value={sessionIdInput}
                onChange={(e) => setSessionIdInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddSessionId();
                  }
                }}
              />
              <Button onClick={handleAddSessionId} variant="outline">
                Add
              </Button>
            </div>
            {filters.sessionIds.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {filters.sessionIds.map((id) => (
                  <Badge key={id} variant="secondary" className="gap-1">
                    {id}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => removeSessionId(id)}
                    />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* User ID Filter */}
          <div className="space-y-2">
            <Label htmlFor="userId">User IDs</Label>
            <div className="flex gap-2">
              <Input
                id="userId"
                placeholder="Enter user ID"
                value={userIdInput}
                onChange={(e) => setUserIdInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddUserId();
                  }
                }}
              />
              <Button onClick={handleAddUserId} variant="outline">
                Add
              </Button>
            </div>
            {filters.userIds.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {filters.userIds.map((id) => (
                  <Badge key={id} variant="secondary" className="gap-1">
                    {id}
                    <X
                      className="h-3 w-3 cursor-pointer"
                      onClick={() => removeUserId(id)}
                    />
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Event Type Filter */}
          <div className="space-y-2">
            <Label>Event Types</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {EVENT_TYPES.map((eventType) => (
                <div key={eventType} className="flex items-center space-x-2">
                  <Checkbox
                    id={eventType}
                    checked={filters.eventTypes.includes(eventType)}
                    onCheckedChange={() => toggleEventType(eventType)}
                  />
                  <Label
                    htmlFor={eventType}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {eventType}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Submitted Sessions Only */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="submittedOnly"
              checked={filters.submittedOnly}
              onCheckedChange={(checked) =>
                setFilters((prev) => ({
                  ...prev,
                  submittedOnly: checked as boolean,
                }))
              }
            />
            <Label
              htmlFor="submittedOnly"
              className="text-sm font-normal cursor-pointer"
            >
              Include only submitted sessions
            </Label>
          </div>

          {/* Include Metadata */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="includeMetadata"
              checked={filters.includeMetadata}
              onCheckedChange={(checked) =>
                setFilters((prev) => ({
                  ...prev,
                  includeMetadata: checked as boolean,
                }))
              }
            />
            <Label
              htmlFor="includeMetadata"
              className="text-sm font-normal cursor-pointer"
            >
              Include metadata (IP address, user agent, etc.)
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* Export Options */}
      <Card>
        <CardHeader>
          <CardTitle>Export Options</CardTitle>
          <CardDescription>
            Configure additional export settings
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="timestampFormat">Timestamp Format</Label>
            <Select
              value={options.timestampFormat}
              onValueChange={(value) =>
                setOptions((prev) => ({
                  ...prev,
                  timestampFormat: value as TimestampFormat,
                }))
              }
            >
              <SelectTrigger id="timestampFormat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="iso8601">
                  ISO 8601 (2025-12-18T10:30:00Z)
                </SelectItem>
                <SelectItem value="unix">Unix Timestamp (1734520200)</SelectItem>
                <SelectItem value="human">
                  Human Readable (Dec 18, 2025 10:30 AM)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="compress"
              checked={options.compress}
              onCheckedChange={(checked) =>
                setOptions((prev) => ({ ...prev, compress: checked as boolean }))
              }
            />
            <Label
              htmlFor="compress"
              className="text-sm font-normal cursor-pointer"
            >
              Compress as ZIP file (recommended for large exports)
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* Export Preview */}
      <Card>
        <CardHeader>
          <CardTitle>Export Preview</CardTitle>
          <CardDescription>
            Estimated export information based on your filters
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingPreview ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : previewError ? (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Preview Error</AlertTitle>
              <AlertDescription>{previewError}</AlertDescription>
            </Alert>
          ) : !preview ? (
            <div className="text-center py-8 text-muted-foreground">
              <Info className="h-8 w-8 mx-auto mb-2" />
              <p>Select date range to see preview</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground mb-1">
                    Estimated Record Count
                  </p>
                  <p className="text-2xl font-bold">
                    {preview.estimatedRecordCount.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-sm text-muted-foreground mb-1">
                    Estimated File Size
                  </p>
                  <p className="text-2xl font-bold">{preview.estimatedFileSize}</p>
                </div>
              </div>

              {/* Large export warning */}
              {preview.estimatedRecordCount > 10000 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Large Export</AlertTitle>
                  <AlertDescription>
                    This export contains over 10,000 records. Consider enabling
                    compression or narrowing your filters to reduce file size.
                  </AlertDescription>
                </Alert>
              )}

              {/* No data warning */}
              {preview.estimatedRecordCount === 0 && (
                <Alert>
                  <Info className="h-4 w-4" />
                  <AlertTitle>No Data</AlertTitle>
                  <AlertDescription>
                    No data matches your current filters. Try adjusting your date
                    range or removing some filters.
                  </AlertDescription>
                </Alert>
              )}

              {/* Sample data preview */}
              {preview.sampleData && preview.sampleData.length > 0 && (
                <div className="space-y-2">
                  <Label>Sample Data (First 5 Records)</Label>
                  <div className="rounded-lg border bg-muted/20 p-4 overflow-x-auto">
                    <pre className="text-xs">
                      {JSON.stringify(preview.sampleData, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Export Actions */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {/* Export progress */}
            {isExporting && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Exporting data...</span>
                  <span>{exportProgress}%</span>
                </div>
                <Progress value={exportProgress} />
              </div>
            )}

            {/* Export error */}
            {exportError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Export Failed</AlertTitle>
                <AlertDescription>{exportError}</AlertDescription>
              </Alert>
            )}

            {/* Export success */}
            {exportSuccess && (
              <Alert variant="success">
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Export Complete</AlertTitle>
                <AlertDescription>
                  Your data has been exported successfully and should download
                  automatically.
                </AlertDescription>
              </Alert>
            )}

            {/* Action buttons */}
            <div className="flex gap-2">
              <Button
                onClick={handleExport}
                disabled={isExporting || !preview || preview.estimatedRecordCount === 0}
                className="flex-1"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Export Data
                  </>
                )}
              </Button>
              <Button
                onClick={clearAllFilters}
                variant="outline"
                disabled={isExporting}
              >
                Clear All Filters
              </Button>
              <Button
                onClick={fetchPreview}
                variant="outline"
                disabled={isExporting || isLoadingPreview}
              >
                <RefreshCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
