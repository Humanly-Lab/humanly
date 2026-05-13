import { pool } from '../config/database'
import {
  Paper,
  InsertPaper,
  UpdatePaper,
  PaperFilter,
  PaperForReviewer
} from '@humanly/shared'
import { AppError } from '../middleware/error-handler'

export class PaperModel {
  // Create a new paper
  static async create(data: InsertPaper): Promise<Paper> {
    const query = `
      INSERT INTO papers (
        task_id, uploaded_by, title, authors, abstract, keywords,
        pdf_storage_path, pdf_file_size, pdf_page_count, pdf_checksum,
        review_deadline, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *
    `

    const values = [
      data.taskId,
      data.uploadedBy,
      data.title,
      data.authors,
      data.abstract,
      data.keywords,
      data.pdfStoragePath,
      data.pdfFileSize,
      data.pdfPageCount || null,
      data.pdfChecksum,
      data.reviewDeadline || null,
      data.status || 'pending_review'
    ]

    const result = await pool.query(query, values)
    return this.mapToCamelCase(result.rows[0])
  }

  // Find paper by ID
  static async findById(paperId: string): Promise<Paper | null> {
    const query = 'SELECT * FROM papers WHERE id = $1'
    const result = await pool.query(query, [paperId])

    if (result.rows.length === 0) {
      return null
    }

    return this.mapToCamelCase(result.rows[0])
  }

  // Find paper by ID (blind review version - no author names)
  static async findByIdForReviewer(paperId: string): Promise<PaperForReviewer | null> {
    const query = `
      SELECT
        id, task_id, title, abstract, keywords, submission_date,
        pdf_page_count, review_deadline, status, created_at
      FROM papers
      WHERE id = $1
    `
    const result = await pool.query(query, [paperId])

    if (result.rows.length === 0) {
      return null
    }

    return this.mapToCamelCaseBlind(result.rows[0])
  }

  // Find papers by task
  static async findByTask(
    taskId: string,
    filter?: PaperFilter,
    limit: number = 50,
    offset: number = 0
  ): Promise<{ papers: Paper[]; total: number }> {
    let query = 'SELECT * FROM papers WHERE task_id = $1'
    const values: any[] = [taskId]
    let paramIndex = 2

    // Apply filters
    if (filter?.status) {
      query += ` AND status = $${paramIndex}`
      values.push(filter.status)
      paramIndex++
    }

    if (filter?.uploadedBy) {
      query += ` AND uploaded_by = $${paramIndex}`
      values.push(filter.uploadedBy)
      paramIndex++
    }

    if (filter?.submissionDateFrom) {
      query += ` AND submission_date >= $${paramIndex}`
      values.push(filter.submissionDateFrom)
      paramIndex++
    }

    if (filter?.submissionDateTo) {
      query += ` AND submission_date <= $${paramIndex}`
      values.push(filter.submissionDateTo)
      paramIndex++
    }

    // Get total count
    const countQuery = query.replace('SELECT *', 'SELECT COUNT(*)')
    const countResult = await pool.query(countQuery, values)
    const total = parseInt(countResult.rows[0].count)

    // Add sorting and pagination
    query += ` ORDER BY submission_date DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`
    values.push(limit, offset)

    const result = await pool.query(query, values)
    const papers = result.rows.map(row => this.mapToCamelCase(row))

    return { papers, total }
  }

  // Find the newest task instruction PDF.
  static async findInstructionByTask(taskId: string): Promise<Paper | null> {
    const query = `
      SELECT *
      FROM papers
      WHERE task_id = $1
        AND keywords @> ARRAY['instructions']::text[]
      ORDER BY submission_date DESC, created_at DESC
      LIMIT 1
    `
    const result = await pool.query(query, [taskId])

    if (result.rows.length === 0) {
      return null
    }

    return this.mapToCamelCase(result.rows[0])
  }

  // Find all task instruction PDFs.
  static async findInstructionsByTask(taskId: string): Promise<Paper[]> {
    const query = `
      SELECT *
      FROM papers
      WHERE task_id = $1
        AND keywords @> ARRAY['instructions']::text[]
      ORDER BY submission_date DESC, created_at DESC
    `
    const result = await pool.query(query, [taskId])
    return result.rows.map((row: any) => this.mapToCamelCase(row))
  }

  // Update paper
  static async update(paperId: string, data: UpdatePaper): Promise<Paper> {
    const fields: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (data.title !== undefined) {
      fields.push(`title = $${paramIndex}`)
      values.push(data.title)
      paramIndex++
    }

    if (data.abstract !== undefined) {
      fields.push(`abstract = $${paramIndex}`)
      values.push(data.abstract)
      paramIndex++
    }

    if (data.keywords !== undefined) {
      fields.push(`keywords = $${paramIndex}`)
      values.push(data.keywords)
      paramIndex++
    }

    if (data.reviewDeadline !== undefined) {
      fields.push(`review_deadline = $${paramIndex}`)
      values.push(data.reviewDeadline)
      paramIndex++
    }

    if (data.status !== undefined) {
      fields.push(`status = $${paramIndex}`)
      values.push(data.status)
      paramIndex++
    }

    if (data.pdfPageCount !== undefined) {
      fields.push(`pdf_page_count = $${paramIndex}`)
      values.push(data.pdfPageCount)
      paramIndex++
    }

    if (fields.length === 0) {
      throw new AppError(400, 'No fields to update')
    }

    const query = `
      UPDATE papers
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramIndex}
      RETURNING *
    `
    values.push(paperId)

    const result = await pool.query(query, values)

    if (result.rows.length === 0) {
      throw new AppError(404, 'Paper not found')
    }

    return this.mapToCamelCase(result.rows[0])
  }

  // Delete paper
  static async delete(paperId: string): Promise<void> {
    const query = 'DELETE FROM papers WHERE id = $1'
    const result = await pool.query(query, [paperId])

    if (result.rowCount === 0) {
      throw new AppError(404, 'Paper not found')
    }
  }

  // Check if user is the uploader (admin access)
  static async isUploader(paperId: string, userId: string): Promise<boolean> {
    const query = 'SELECT uploaded_by FROM papers WHERE id = $1'
    const result = await pool.query(query, [paperId])

    if (result.rows.length === 0) {
      return false
    }

    return result.rows[0].uploaded_by === userId
  }

  // Check if user has admin access to paper's task
  static async hasTaskAccess(paperId: string, userId: string): Promise<boolean> {
    const query = `
      SELECT p.task_id
      FROM papers p
      JOIN tasks proj ON p.task_id = proj.id
      WHERE p.id = $1 AND proj.user_id = $2
    `
    const result = await pool.query(query, [paperId, userId])
    return result.rows.length > 0
  }

  // Get papers assigned to a reviewer
  static async findByReviewer(
    reviewerId: string,
    status?: string,
    limit: number = 50,
    offset: number = 0
  ): Promise<{ papers: PaperForReviewer[]; total: number }> {
    let query = `
      SELECT
        p.id, p.task_id, p.title, p.abstract, p.keywords, p.submission_date,
        p.pdf_page_count, p.review_deadline, p.status, p.created_at,
        pr.review_status, pr.assigned_at
      FROM papers p
      JOIN paper_reviewers pr ON p.id = pr.paper_id
      WHERE pr.reviewer_id = $1
    `
    const values: any[] = [reviewerId]
    let paramIndex = 2

    if (status) {
      query += ` AND pr.review_status = $${paramIndex}`
      values.push(status)
      paramIndex++
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM papers p JOIN paper_reviewers pr ON p.id = pr.paper_id WHERE pr.reviewer_id = $1` + (status ? ` AND pr.review_status = $2` : '')
    const countResult = await pool.query(countQuery, status ? [reviewerId, status] : [reviewerId])
    const total = parseInt(countResult.rows[0]?.count || '0')

    // Add sorting and pagination
    query += ` ORDER BY pr.assigned_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`
    values.push(limit, offset)

    const result = await pool.query(query, values)
    const papers = result.rows.map(row => this.mapToCamelCaseBlind(row))

    return { papers, total }
  }

  // Map database row to camelCase (full version with authors)
  static mapToCamelCase(row: any): Paper {
    return {
      id: row.id,
      taskId: row.task_id,
      uploadedBy: row.uploaded_by,
      title: row.title,
      authors: row.authors,
      abstract: row.abstract,
      keywords: row.keywords,
      submissionDate: row.submission_date,
      pdfStoragePath: row.pdf_storage_path,
      pdfFileSize: row.pdf_file_size,
      pdfPageCount: row.pdf_page_count,
      pdfChecksum: row.pdf_checksum,
      reviewDeadline: row.review_deadline,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  // Map database row to camelCase (blind review - no authors)
  private static mapToCamelCaseBlind(row: any): PaperForReviewer {
    return {
      id: row.id,
      taskId: row.task_id,
      title: row.title,
      abstract: row.abstract,
      keywords: row.keywords,
      submissionDate: row.submission_date,
      pdfPageCount: row.pdf_page_count,
      reviewDeadline: row.review_deadline,
      status: row.status,
      createdAt: row.created_at
    }
  }
}
