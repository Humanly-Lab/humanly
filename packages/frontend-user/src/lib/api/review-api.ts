/**
 * API client for peer review endpoints
 */

import type {
  Paper,
  PaperForReviewer,
  Review,
  ReviewComment,
  PaperReviewer,
  AnonymousReview
} from '@humanly/shared'

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1'

// Helper function to get auth token
function getAuthToken(): string {
  const token = localStorage.getItem('accessToken')
  if (!token) throw new Error('Not authenticated')
  return token
}

// Helper function for API requests
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken()

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }))
    throw new Error(error.message || `HTTP ${response.status}`)
  }

  const data = await response.json()
  return data.data
}

// Paper APIs
export const paperApi = {
  // Upload a paper (multipart form data)
  async upload(taskId: string, formData: FormData): Promise<Paper> {
    const token = getAuthToken()

    const response = await fetch(`${API_BASE}/tasks/${taskId}/papers`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Upload failed' }))
      throw new Error(error.message || `HTTP ${response.status}`)
    }

    const data = await response.json()
    return data.data
  },

  // Get paper (blind version for reviewers)
  async get(paperId: string): Promise<PaperForReviewer> {
    return apiRequest(`/papers/${paperId}`)
  },

  // List papers in task
  async listByTask(taskId: string, params?: {
    status?: string
    limit?: number
    offset?: number
  }): Promise<{ papers: Paper[]; total: number }> {
    const query = new URLSearchParams(params as any).toString()
    return apiRequest(`/tasks/${taskId}/papers?${query}`)
  },

  // Get my assigned papers (as reviewer)
  async getMyPapers(params?: {
    status?: string
    limit?: number
    offset?: number
  }): Promise<{ papers: PaperForReviewer[]; total: number }> {
    const query = new URLSearchParams(params as any).toString()
    return apiRequest(`/reviewers/me/papers?${query}`)
  },

  // Get PDF as blob URL (fetches with auth headers, returns object URL)
  async getPdfBlob(paperId: string): Promise<string> {
    const token = getAuthToken()
    const response = await fetch(`${API_BASE}/papers/${paperId}/content`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    })
    if (!response.ok) {
      throw new Error(`Failed to load PDF: HTTP ${response.status}`)
    }
    const blob = await response.blob()
    return URL.createObjectURL(blob)
  },

  // Update paper metadata
  async update(paperId: string, data: {
    title?: string
    abstract?: string
    keywords?: string[]
    reviewDeadline?: string
    status?: string
  }): Promise<Paper> {
    return apiRequest(`/papers/${paperId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  // Delete paper
  async delete(paperId: string): Promise<void> {
    return apiRequest(`/papers/${paperId}`, {
      method: 'DELETE',
    })
  },

  // Log access
  async logAccess(paperId: string, data: {
    accessType: string
    pageNumber?: number
    durationSeconds?: number
  }): Promise<void> {
    return apiRequest(`/papers/${paperId}/access-logs`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },
}

// Reviewer APIs
export const reviewerApi = {
  // Assign reviewer
  async assign(paperId: string, data: {
    reviewerId: string
    permissions?: {
      canViewPaper?: boolean
      canWriteReview?: boolean
      canAccessAI?: boolean
    }
  }): Promise<PaperReviewer> {
    return apiRequest(`/papers/${paperId}/reviewers`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  // List reviewers for paper
  async list(paperId: string): Promise<PaperReviewer[]> {
    return apiRequest(`/papers/${paperId}/reviewers`)
  },

  // Update reviewer permissions
  async updatePermissions(paperId: string, reviewerId: string, permissions: {
    canViewPaper?: boolean
    canWriteReview?: boolean
    canAccessAI?: boolean
  }): Promise<PaperReviewer> {
    return apiRequest(`/papers/${paperId}/reviewers/${reviewerId}`, {
      method: 'PATCH',
      body: JSON.stringify(permissions),
    })
  },

  // Remove reviewer
  async remove(paperId: string, reviewerId: string): Promise<void> {
    return apiRequest(`/papers/${paperId}/reviewers/${reviewerId}`, {
      method: 'DELETE',
    })
  },
}

// Review APIs
export const reviewApi = {
  // Get or create review (auto-create on first access)
  async getOrCreate(paperId: string): Promise<Review> {
    return apiRequest(`/papers/${paperId}/reviews`, {
      method: 'POST',
    })
  },

  // Get review
  async get(reviewId: string): Promise<Review> {
    return apiRequest(`/reviews/${reviewId}`)
  },

  // Update review
  async update(reviewId: string, data: {
    content?: any
    scores?: Record<string, number>
    recommendation?: string
    confidenceLevel?: number
  }): Promise<Review> {
    return apiRequest(`/reviews/${reviewId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  // Submit review
  async submit(reviewId: string, data: {
    scores?: Record<string, number>
    recommendation?: string
    confidenceLevel?: number
  }): Promise<Review> {
    return apiRequest(`/reviews/${reviewId}/submit`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  // Track events (keystroke tracking)
  async trackEvents(reviewId: string, events: Array<{
    eventType: string
    eventData: any
    selectionText?: string
    cursorPosition?: number
    timestamp?: Date
  }>): Promise<{ eventsTracked: number }> {
    return apiRequest(`/reviews/${reviewId}/events`, {
      method: 'POST',
      body: JSON.stringify({ events }),
    })
  },

  // Get statistics
  async getStatistics(reviewId: string): Promise<{
    reviewId: string
    totalEvents: number
    keystrokeCount: number
    pasteCount: number
    deleteCount: number
    typingSpeed: number
    activeTimeSeconds: number
    pastePercentage: number
  }> {
    return apiRequest(`/reviews/${reviewId}/stats`)
  },

  // Get anonymous reviews (admin only)
  async getAnonymousReviews(paperId: string): Promise<AnonymousReview[]> {
    return apiRequest(`/papers/${paperId}/reviews`)
  },
}

// Comment APIs
export const commentApi = {
  // Add comment
  async add(reviewId: string, data: {
    paperId: string
    pageNumber: number
    positionX?: number
    positionY?: number
    selectedText?: string
    commentText: string
    commentType?: string
  }): Promise<ReviewComment> {
    return apiRequest(`/reviews/${reviewId}/comments`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  },

  // Get comments
  async list(reviewId: string, pageNumber?: number): Promise<ReviewComment[]> {
    const query = pageNumber ? `?pageNumber=${pageNumber}` : ''
    return apiRequest(`/reviews/${reviewId}/comments${query}`)
  },

  // Update comment
  async update(commentId: string, data: {
    commentText?: string
    commentType?: string
    isResolved?: boolean
  }): Promise<ReviewComment> {
    return apiRequest(`/comments/${commentId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  },

  // Delete comment
  async delete(commentId: string): Promise<void> {
    return apiRequest(`/comments/${commentId}`, {
      method: 'DELETE',
    })
  },
}
