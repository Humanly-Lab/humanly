'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Upload, FileText, Search, Users, Eye, Calendar, Plus } from 'lucide-react'
import type { Paper } from '@humanly/shared'
import { useToast } from '@/hooks/use-toast'

export default function AdminPapersPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [papers, setPapers] = useState<Paper[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadPapers()
  }, [])

  const loadPapers = async () => {
    try {
      setLoading(true)
      // In production, this would fetch from the API
      // const result = await paperApi.listByTask(taskId)
      // setPapers(result.papers)

      // For now, show empty state
      setPapers([])
    } catch (error) {
      console.error('Failed to load papers:', error)
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Failed to load papers. Please try again.',
      })
    } finally {
      setLoading(false)
    }
  }

  const filteredPapers = papers.filter((paper) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      paper.title.toLowerCase().includes(query) ||
      paper.abstract.toLowerCase().includes(query) ||
      paper.authors.some((author) => author.toLowerCase().includes(query))
    )
  })

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_review':
        return <Badge variant="secondary">Pending Review</Badge>
      case 'under_review':
        return <Badge variant="default">Under Review</Badge>
      case 'reviewed':
        return <Badge variant="outline">Reviewed</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-2xl font-bold">Paper Management</h1>
              <p className="text-gray-600 mt-1">
                Upload papers and manage peer review assignments
              </p>
            </div>

            <Button onClick={() => router.push('/admin/papers/upload')}>
              <Plus className="h-4 w-4 mr-2" />
              Upload Paper
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Card
            className="p-6 cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => router.push('/admin/papers/upload')}
          >
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Upload className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold">Upload Paper</h3>
                <p className="text-sm text-gray-600">Add new paper for review</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-green-100 rounded-lg">
                <FileText className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold">{papers.length}</h3>
                <p className="text-sm text-gray-600">Total Papers</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-purple-100 rounded-lg">
                <Users className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold">Manage Reviews</h3>
                <p className="text-sm text-gray-600">Assign reviewers</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Search */}
        {papers.length > 0 && (
          <div className="mb-6">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search papers by title, authors, or abstract..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        )}

        {/* Papers Table */}
        <Card>
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-4">Papers</h2>

            {loading ? (
              <div className="text-center py-12">
                <p className="text-gray-600">Loading papers...</p>
              </div>
            ) : filteredPapers.length === 0 ? (
              <div className="text-center py-12">
                <Upload className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                <h3 className="font-semibold mb-2">No papers yet</h3>
                <p className="text-gray-600 text-sm mb-4">
                  {searchQuery
                    ? 'No papers match your search criteria'
                    : 'Get started by uploading your first paper for peer review'}
                </p>
                {!searchQuery && (
                  <Button onClick={() => router.push('/admin/papers/upload')}>
                    <Plus className="h-4 w-4 mr-2" />
                    Upload First Paper
                  </Button>
                )}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Authors</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead>Deadline</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPapers.map((paper) => (
                    <TableRow key={paper.id}>
                      <TableCell className="font-medium max-w-md">
                        <div className="line-clamp-2">{paper.title}</div>
                      </TableCell>

                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {paper.authors.slice(0, 2).map((author, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {author}
                            </Badge>
                          ))}
                          {paper.authors.length > 2 && (
                            <Badge variant="outline" className="text-xs">
                              +{paper.authors.length - 2} more
                            </Badge>
                          )}
                        </div>
                      </TableCell>

                      <TableCell>{getStatusBadge(paper.status)}</TableCell>

                      <TableCell className="text-sm text-gray-600">
                        {new Date(paper.createdAt).toLocaleDateString()}
                      </TableCell>

                      <TableCell className="text-sm">
                        {paper.reviewDeadline ? (
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(paper.reviewDeadline).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-gray-400">No deadline</span>
                        )}
                      </TableCell>

                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push(`/admin/papers/${paper.id}`)}
                          >
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => router.push(`/admin/papers/${paper.id}/reviewers`)}
                          >
                            <Users className="h-4 w-4 mr-1" />
                            Reviewers
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
