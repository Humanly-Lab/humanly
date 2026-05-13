// Shared TypeScript types for the peer review system

export interface Paper {
  id: string
  taskId: string
  uploadedBy: string

  // Metadata
  title: string
  authors: string[] // Hidden from reviewers (blind review)
  abstract: string
  keywords: string[]
  submissionDate: Date

  // File info
  pdfStoragePath: string
  pdfFileSize: number
  pdfPageCount: number
  pdfChecksum: string

  // Review metadata
  reviewDeadline?: Date
  status: PaperStatus

  // Timestamps
  createdAt: Date
  updatedAt: Date
}

export type PaperStatus =
  | 'pending_review'
  | 'under_review'
  | 'review_complete'
  | 'accepted'
  | 'rejected'

export interface PaperReviewer {
  id: string
  paperId: string
  reviewerId: string
  assignedBy: string
  assignedAt: Date

  // Permissions
  canViewPaper: boolean
  canWriteReview: boolean
  canAccessAI: boolean

  // Progress
  reviewStatus: ReviewerStatus
  reviewStartedAt?: Date
  reviewSubmittedAt?: Date

  // Reading time
  totalReadingTimeSeconds: number
  paperOpenedCount: number
}

export type ReviewerStatus =
  | 'assigned'
  | 'in_progress'
  | 'submitted'

export interface Review {
  id: string
  paperId: string
  reviewerId: string
  paperReviewerId: string

  // Content (Lexical JSON)
  content: Record<string, any>
  plainText: string
  wordCount: number
  characterCount: number

  // Metadata
  status: ReviewStatus
  version: number

  // Scores (optional)
  scores?: Record<string, number>
  recommendation?: string
  confidenceLevel?: number

  // Timestamps
  createdAt: Date
  updatedAt: Date
  submittedAt?: Date
}

export type ReviewStatus = 'draft' | 'submitted'

export interface ReviewEvent {
  id: string
  reviewId: string
  reviewerId: string

  // Event data
  eventType: string
  eventData: Record<string, any>
  timestamp: Date

  // Context
  selectionText?: string
  cursorPosition?: number
}

export interface ReviewComment {
  id: string
  reviewId: string
  reviewerId: string
  paperId: string

  // PDF location
  pageNumber: number
  positionX?: number
  positionY?: number
  selectedText?: string

  // Content
  commentText: string
  commentType?: string

  // Status
  isResolved: boolean

  // Timestamps
  createdAt: Date
  updatedAt: Date
}

export interface ReviewAISession {
  id: string
  reviewId: string
  reviewerId: string
  paperId: string

  sessionName?: string
  contextSnapshot?: Record<string, any>

  createdAt: Date
  updatedAt: Date
}

export interface ReviewAIMessage {
  id: string
  sessionId: string
  role: 'user' | 'assistant' | 'system'
  content: string

  paperExcerpt?: string
  reviewExcerpt?: string

  createdAt: Date
}

export interface ReviewAIInteractionLog {
  id: string
  sessionId?: string
  reviewId: string
  reviewerId: string

  // Query details
  queryType: string
  queryText: string
  responseText: string

  // Metrics
  responseTimeMs?: number
  tokensUsed?: number
  modelUsed?: string

  // Context
  paperContext?: string
  reviewContext?: string

  // Feedback
  suggestionApplied: boolean
  userModifiedText?: string

  createdAt: Date
}

export interface ReviewRecording {
  id: string
  paperReviewerId: string
  reviewId?: string
  reviewerId: string
  paperId: string

  // Recording type
  recordingType: 'screen' | 'camera' | 'both'

  // Consent
  consentGiven: boolean
  consentTimestamp?: Date

  // Metadata
  startedAt: Date
  endedAt?: Date
  durationSeconds?: number

  // Storage
  storagePath?: string
  fileSize?: number
  format?: string

  // Status
  status: RecordingStatus

  // 24-hour retention
  expiresAt?: Date
}

export type RecordingStatus =
  | 'recording'
  | 'stopped'
  | 'processing'
  | 'available'
  | 'failed'
  | 'deleted'

export interface PaperAccessLog {
  id: string
  paperId: string
  reviewerId: string

  accessType: 'open' | 'page_view' | 'zoom' | 'search' | 'close'
  pageNumber?: number
  durationSeconds?: number

  timestamp: Date
}

// Insert types (for creating new records)
export interface InsertPaper {
  taskId: string
  uploadedBy: string
  title: string
  authors: string[]
  abstract: string
  keywords: string[]
  pdfStoragePath: string
  pdfFileSize: number
  pdfPageCount?: number
  pdfChecksum: string
  reviewDeadline?: Date
  status?: PaperStatus
}

export interface InsertPaperReviewer {
  paperId: string
  reviewerId: string
  assignedBy: string
  canViewPaper?: boolean
  canWriteReview?: boolean
  canAccessAI?: boolean
}

export interface InsertReview {
  paperId: string
  reviewerId: string
  paperReviewerId: string
  content?: Record<string, any>
}

export interface InsertReviewComment {
  reviewId: string
  reviewerId: string
  paperId: string
  pageNumber: number
  positionX?: number
  positionY?: number
  selectedText?: string
  commentText: string
  commentType?: string
}

export interface InsertReviewEvent {
  reviewId: string
  reviewerId: string
  eventType: string
  eventData: Record<string, any>
  selectionText?: string
  cursorPosition?: number
}

export interface InsertReviewAISession {
  reviewId: string
  reviewerId: string
  paperId: string
  sessionName?: string
  contextSnapshot?: Record<string, any>
}

export interface InsertReviewRecording {
  paperReviewerId: string
  reviewId?: string
  reviewerId: string
  paperId: string
  recordingType: 'screen' | 'camera' | 'both'
}

export interface InsertPaperAccessLog {
  paperId: string
  reviewerId: string
  accessType: 'open' | 'page_view' | 'zoom' | 'search' | 'close'
  pageNumber?: number
  durationSeconds?: number
}

// Update types (for updating existing records)
export interface UpdatePaper {
  title?: string
  abstract?: string
  keywords?: string[]
  reviewDeadline?: Date
  status?: PaperStatus
  pdfPageCount?: number
}

export interface UpdatePaperReviewer {
  canViewPaper?: boolean
  canWriteReview?: boolean
  canAccessAI?: boolean
  reviewStatus?: ReviewerStatus
  reviewStartedAt?: Date
  reviewSubmittedAt?: Date
  totalReadingTimeSeconds?: number
  paperOpenedCount?: number
}

export interface UpdateReview {
  content?: Record<string, any>
  plainText?: string
  wordCount?: number
  characterCount?: number
  status?: ReviewStatus
  scores?: Record<string, number>
  recommendation?: string
  confidenceLevel?: number
  submittedAt?: Date
}

export interface UpdateReviewComment {
  commentText?: string
  commentType?: string
  isResolved?: boolean
}

export interface UpdateReviewRecording {
  consentGiven?: boolean
  consentTimestamp?: Date
  endedAt?: Date
  durationSeconds?: number
  storagePath?: string
  fileSize?: number
  format?: string
  status?: RecordingStatus
}

// Filter types (for querying)
export interface PaperFilter {
  taskId?: string
  uploadedBy?: string
  status?: PaperStatus
  submissionDateFrom?: Date
  submissionDateTo?: Date
}

export interface ReviewFilter {
  paperId?: string
  reviewerId?: string
  status?: ReviewStatus
}

export interface ReviewCommentFilter {
  reviewId?: string
  paperId?: string
  pageNumber?: number
  isResolved?: boolean
}

// API response types (for blind review - hide author names from reviewers)
export interface PaperForReviewer {
  id: string
  taskId: string
  title: string
  // authors: HIDDEN for blind review
  abstract: string
  keywords: string[]
  submissionDate: Date
  pdfPageCount: number
  reviewDeadline?: Date
  status: PaperStatus
  createdAt: Date
}

// API response for review list (anonymous reviewers)
export interface AnonymousReview {
  id: string
  paperId: string
  reviewerAlias: string // e.g., "Reviewer 1", "Reviewer 2"
  plainText: string
  wordCount: number
  status: ReviewStatus
  scores?: Record<string, number>
  recommendation?: string
  confidenceLevel?: number
  submittedAt?: Date
  createdAt: Date
}

// Statistics types
export interface ReviewStatistics {
  reviewId: string
  totalEvents: number
  keystrokeCount: number
  pasteCount: number
  deleteCount: number
  typingSpeed: number // words per minute
  activeTimeSeconds: number
  pastePercentage: number
}

export interface PaperReadingStatistics {
  paperId: string
  totalReadingTime: number
  pageViewDistribution: Array<{
    page: number
    timeSpent: number
  }>
  reviewerProgress: Array<{
    reviewerId: string
    reviewerAlias: string
    progress: number // percentage
    readingTime: number
  }>
}
