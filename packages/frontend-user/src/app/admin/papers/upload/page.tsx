'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Upload, FileText, X, Calendar, AlertCircle } from 'lucide-react'
import { paperApi } from '@/lib/api/review-api'
import { useToast } from '@/hooks/use-toast'

export default function PaperUploadPage() {
  const router = useRouter()
  const { toast } = useToast()

  const [uploading, setUploading] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [formData, setFormData] = useState({
    taskId: '',
    title: '',
    authors: [] as string[],
    authorInput: '',
    abstract: '',
    keywords: [] as string[],
    keywordInput: '',
    reviewDeadline: '',
  })

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      if (selectedFile.type !== 'application/pdf') {
        toast({
          variant: 'destructive',
          title: 'Invalid file type',
          description: 'Please select a PDF file.',
        })
        return
      }

      if (selectedFile.size > 50 * 1024 * 1024) {
        toast({
          variant: 'destructive',
          title: 'File too large',
          description: 'PDF file must be smaller than 50MB.',
        })
        return
      }

      setFile(selectedFile)
    }
  }

  const handleAddAuthor = () => {
    if (formData.authorInput.trim()) {
      setFormData({
        ...formData,
        authors: [...formData.authors, formData.authorInput.trim()],
        authorInput: '',
      })
    }
  }

  const handleRemoveAuthor = (index: number) => {
    setFormData({
      ...formData,
      authors: formData.authors.filter((_, i) => i !== index),
    })
  }

  const handleAddKeyword = () => {
    if (formData.keywordInput.trim()) {
      setFormData({
        ...formData,
        keywords: [...formData.keywords, formData.keywordInput.trim()],
        keywordInput: '',
      })
    }
  }

  const handleRemoveKeyword = (index: number) => {
    setFormData({
      ...formData,
      keywords: formData.keywords.filter((_, i) => i !== index),
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!file) {
      toast({
        variant: 'destructive',
        title: 'No file selected',
        description: 'Please select a PDF file to upload.',
      })
      return
    }

    if (!formData.taskId || !formData.title || !formData.abstract) {
      toast({
        variant: 'destructive',
        title: 'Missing required fields',
        description: 'Please fill in all required fields.',
      })
      return
    }

    if (formData.authors.length === 0) {
      toast({
        variant: 'destructive',
        title: 'No authors',
        description: 'Please add at least one author.',
      })
      return
    }

    try {
      setUploading(true)

      const uploadFormData = new FormData()
      uploadFormData.append('pdf', file)
      uploadFormData.append('taskId', formData.taskId)
      uploadFormData.append('title', formData.title)
      uploadFormData.append('authors', JSON.stringify(formData.authors))
      uploadFormData.append('abstract', formData.abstract)
      uploadFormData.append('keywords', JSON.stringify(formData.keywords))

      if (formData.reviewDeadline) {
        uploadFormData.append('reviewDeadline', formData.reviewDeadline)
      }

      const paper = await paperApi.upload(formData.taskId, uploadFormData)

      toast({
        title: 'Paper uploaded',
        description: 'The paper has been successfully uploaded.',
      })

      router.push(`/admin/papers/${paper.id}`)
    } catch (error: any) {
      console.error('Failed to upload paper:', error)
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: error.message || 'Failed to upload paper. Please try again.',
      })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold">Upload Paper for Review</h1>
          <p className="text-gray-600 mt-1">
            Upload a paper and assign reviewers to start the peer review process
          </p>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <form onSubmit={handleSubmit}>
          <div className="space-y-6">
            {/* PDF File Upload */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-4">PDF Document</h2>

              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                {file ? (
                  <div className="space-y-4">
                    <FileText className="h-12 w-12 text-green-600 mx-auto" />
                    <div>
                      <p className="font-semibold">{file.name}</p>
                      <p className="text-sm text-gray-600">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setFile(null)}
                    >
                      <X className="h-4 w-4 mr-2" />
                      Remove File
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Upload className="h-12 w-12 text-gray-400 mx-auto" />
                    <div>
                      <label
                        htmlFor="pdf-upload"
                        className="cursor-pointer text-blue-600 hover:text-blue-700 font-semibold"
                      >
                        Click to upload
                      </label>
                      <span className="text-gray-600"> or drag and drop</span>
                      <p className="text-sm text-gray-500 mt-1">PDF up to 50MB</p>
                    </div>
                    <input
                      id="pdf-upload"
                      type="file"
                      accept="application/pdf"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </div>
                )}
              </div>
            </Card>

            {/* Paper Metadata */}
            <Card className="p-6">
              <h2 className="text-lg font-semibold mb-4">Paper Information</h2>

              <div className="space-y-4">
                {/* Task ID */}
                <div>
                  <Label htmlFor="taskId">
                    Task ID <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="taskId"
                    type="text"
                    placeholder="Enter task ID"
                    value={formData.taskId}
                    onChange={(e) =>
                      setFormData({ ...formData, taskId: e.target.value })
                    }
                    required
                  />
                </div>

                {/* Title */}
                <div>
                  <Label htmlFor="title">
                    Title <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="title"
                    type="text"
                    placeholder="Enter paper title"
                    value={formData.title}
                    onChange={(e) =>
                      setFormData({ ...formData, title: e.target.value })
                    }
                    required
                  />
                </div>

                {/* Authors */}
                <div>
                  <Label htmlFor="author">
                    Authors <span className="text-red-500">*</span>
                  </Label>
                  <div className="flex gap-2 mb-2">
                    <Input
                      id="author"
                      type="text"
                      placeholder="Enter author name and press Add"
                      value={formData.authorInput}
                      onChange={(e) =>
                        setFormData({ ...formData, authorInput: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleAddAuthor()
                        }
                      }}
                    />
                    <Button type="button" onClick={handleAddAuthor} variant="outline">
                      Add
                    </Button>
                  </div>

                  {formData.authors.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {formData.authors.map((author, index) => (
                        <Badge key={index} variant="secondary" className="pr-1">
                          {author}
                          <button
                            type="button"
                            onClick={() => handleRemoveAuthor(index)}
                            className="ml-1 hover:text-red-600"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Abstract */}
                <div>
                  <Label htmlFor="abstract">
                    Abstract <span className="text-red-500">*</span>
                  </Label>
                  <Textarea
                    id="abstract"
                    placeholder="Enter paper abstract"
                    value={formData.abstract}
                    onChange={(e) =>
                      setFormData({ ...formData, abstract: e.target.value })
                    }
                    rows={6}
                    required
                  />
                </div>

                {/* Keywords */}
                <div>
                  <Label htmlFor="keyword">Keywords</Label>
                  <div className="flex gap-2 mb-2">
                    <Input
                      id="keyword"
                      type="text"
                      placeholder="Enter keyword and press Add"
                      value={formData.keywordInput}
                      onChange={(e) =>
                        setFormData({ ...formData, keywordInput: e.target.value })
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          handleAddKeyword()
                        }
                      }}
                    />
                    <Button type="button" onClick={handleAddKeyword} variant="outline">
                      Add
                    </Button>
                  </div>

                  {formData.keywords.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {formData.keywords.map((keyword, index) => (
                        <Badge key={index} variant="outline" className="pr-1">
                          {keyword}
                          <button
                            type="button"
                            onClick={() => handleRemoveKeyword(index)}
                            className="ml-1 hover:text-red-600"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                {/* Review Deadline */}
                <div>
                  <Label htmlFor="reviewDeadline">
                    <Calendar className="h-4 w-4 inline mr-1" />
                    Review Deadline
                  </Label>
                  <Input
                    id="reviewDeadline"
                    type="date"
                    value={formData.reviewDeadline}
                    onChange={(e) =>
                      setFormData({ ...formData, reviewDeadline: e.target.value })
                    }
                  />
                </div>
              </div>
            </Card>

            {/* Submit Actions */}
            <div className="flex items-center justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
                disabled={uploading}
              >
                Cancel
              </Button>

              <Button type="submit" disabled={uploading || !file}>
                {uploading ? (
                  <>Uploading...</>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload Paper
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
