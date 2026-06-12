'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  ZoomIn,
  ZoomOut,
  Search,
  ChevronUp,
  ChevronDown,
  Maximize2,
  AlertCircle,
  X,
  Loader2,
} from 'lucide-react'
import { fileApi } from '@/lib/file-api'
import { usePDFTextStore } from '@/stores/pdf-text-store'

interface PDFViewerProps {
  fileId: string
  documentId?: string
  viewOnly?: boolean
}

interface SearchMatch {
  pageNumber: number
  matchIndex: number
  text: string
}

function isRenderCancelledError(err: unknown) {
  return Boolean(
    err &&
    typeof err === 'object' &&
    'name' in err &&
    err.name === 'RenderingCancelledException'
  )
}

function toCssPixelValue(value: number) {
  return `${Number(value.toFixed(3))}px`
}

function getTextItemHighlightRect(item: any, matchStart: number, matchLength: number, viewport: any) {
  const transform = window.pdfjsLib.Util.transform(viewport.transform, item.transform)
  const textLength = Math.max(item.str.length, 1)
  const itemWidth = Math.max((item.width || 0) * viewport.scale, 1)
  const itemHeight = Math.max(Math.hypot(transform[2], transform[3]), (item.height || 12) * viewport.scale)
  const charWidth = itemWidth / textLength

  return {
    left: transform[4] + charWidth * matchStart,
    top: transform[5] - itemHeight,
    width: charWidth * matchLength,
    height: itemHeight,
  }
}

export default function PDFViewer({ fileId, documentId, viewOnly = false }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0)
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [textExtractionError, setTextExtractionError] = useState<string | null>(null)
  const { setPDFText, setExtracting, setError: setPDFError } = usePDFTextStore()

  const [scale, setScale] = useState<number>(1.0)
  const [fitToWidth, setFitToWidth] = useState<boolean>(true)
  const [searchText, setSearchText] = useState<string>('')
  const [searchMatches, setSearchMatches] = useState<SearchMatch[]>([])
  const [currentMatchIndex, setCurrentMatchIndex] = useState<number>(-1)
  const [isSearching, setIsSearching] = useState<boolean>(false)
  const [showSearch, setShowSearch] = useState<boolean>(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const containerRef = useRef<HTMLDivElement>(null)
  const pdfDocRef = useRef<any>(null)
  const textContentCache = useRef<Map<number, any>>(new Map())
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([])
  const highlightRefs = useRef<(HTMLDivElement | null)[]>([])
  const pageContainerRefs = useRef<(HTMLDivElement | null)[]>([])
  const searchInputRef = useRef<HTMLInputElement>(null)
  const scaleRef = useRef<number>(1.0)
  const renderTasksRef = useRef<Map<number, any>>(new Map())
  const renderGenerationRef = useRef<number>(0)

  // Keep scaleRef in sync
  useEffect(() => {
    scaleRef.current = scale
  }, [scale])

  // Extract PDF text in background for AI context
  const extractPDFTextInBackground = useCallback(async (pdf: any, docId: string, extractedFileId: string) => {
    try {
      setExtracting(docId, true)
      setTextExtractionError(null)
      const pages: string[] = []
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const textContent = await page.getTextContent()
        pages.push(textContent.items.map((item: any) => item.str).join(' '))
      }
      const fullText = pages.join('\n\n')
      const summary = pages.slice(0, 2).join('\n\n').substring(0, 2500)
      setPDFText(docId, { fileId: extractedFileId, numPages: pdf.numPages, pages, fullText, summary, isExtracting: false })
    } catch (err: any) {
      const msg = err.message || 'Failed to extract PDF text'
      setTextExtractionError(msg)
      setPDFError(docId, msg)
    }
  }, [setPDFText, setExtracting, setPDFError])

  const cancelActiveRenderTasks = useCallback(() => {
    renderTasksRef.current.forEach((task) => {
      try {
        task?.cancel?.()
      } catch {
        // PDF.js render cancellation can race with normal teardown.
      }
    })
    renderTasksRef.current.clear()
  }, [])

  const cancelCurrentRenderGeneration = useCallback(() => {
    renderGenerationRef.current += 1
    cancelActiveRenderTasks()
  }, [cancelActiveRenderTasks])

  const startRenderGeneration = useCallback(() => {
    renderGenerationRef.current += 1
    cancelActiveRenderTasks()
    return renderGenerationRef.current
  }, [cancelActiveRenderTasks])

  const cancelPageRenderTask = useCallback((pageNum: number) => {
    const task = renderTasksRef.current.get(pageNum)
    if (!task) return
    try {
      task.cancel?.()
    } catch {
      // Ignore cancellation races; the superseding render owns the canvas.
    }
    renderTasksRef.current.delete(pageNum)
  }, [])

  // Load PDF.js from CDN
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
    script.async = true
    script.onload = () => {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js'
      }
    }
    script.onerror = () => {
      setError('Failed to load PDF library')
      setLoading(false)
    }
    document.head.appendChild(script)
    return () => { if (document.head.contains(script)) document.head.removeChild(script) }
  }, [])

  // Render a single page to its canvas
  const renderPage = useCallback(async (pageNum: number, currentScale: number, generation: number) => {
    if (!pdfDocRef.current || generation !== renderGenerationRef.current) return
    const canvas = canvasRefs.current[pageNum - 1]
    if (!canvas) return
    let renderTask: any = null
    try {
      cancelPageRenderTask(pageNum)
      const page = await pdfDocRef.current.getPage(pageNum)
      if (generation !== renderGenerationRef.current) return
      const context = canvas.getContext('2d')
      if (!context) return
      const outputScale = Math.max(window.devicePixelRatio || 1, 1)
      const viewport = page.getViewport({ scale: currentScale, rotation: 0 })
      canvas.height = Math.floor(viewport.height * outputScale)
      canvas.width = Math.floor(viewport.width * outputScale)
      canvas.style.height = toCssPixelValue(viewport.height)
      canvas.style.width = toCssPixelValue(viewport.width)
      const hl = highlightRefs.current[pageNum - 1]
      if (hl) {
        hl.style.width = canvas.style.width
        hl.style.height = canvas.style.height
      }
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, canvas.width, canvas.height)
      renderTask = page.render({
        canvasContext: context,
        viewport,
        transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
      })
      renderTasksRef.current.set(pageNum, renderTask)
      await renderTask.promise
    } catch (err) {
      if (isRenderCancelledError(err)) return
      console.error(`Error rendering page ${pageNum}:`, err)
    } finally {
      if (renderTask && renderTasksRef.current.get(pageNum) === renderTask) {
        renderTasksRef.current.delete(pageNum)
      }
    }
  }, [cancelPageRenderTask])

  // Render all pages
  const renderAllPages = useCallback(async (currentScale: number) => {
    if (!pdfDocRef.current) return
    const generation = startRenderGeneration()
    const total = pdfDocRef.current.numPages
    for (let i = 1; i <= total; i++) {
      if (generation !== renderGenerationRef.current) return
      await renderPage(i, currentScale, generation)
    }
  }, [renderPage, startRenderGeneration])

  // Load PDF document
  useEffect(() => {
    let blobUrl: string | null = null
    let cancelled = false

    const loadPDF = async () => {
      try {
        cancelCurrentRenderGeneration()
        pdfDocRef.current = null
        textContentCache.current.clear()
        canvasRefs.current = []
        highlightRefs.current = []
        pageContainerRefs.current = []
        setNumPages(0)
        setCurrentPage(1)
        setScale(1.0)
        setFitToWidth(true)
        setSearchText('')
        setSearchMatches([])
        setCurrentMatchIndex(-1)
        setShowSearch(false)
        setTextExtractionError(null)
        setLoading(true)
        setError(null)
        let attempts = 0
        while (!window.pdfjsLib && attempts < 50) {
          await new Promise(resolve => setTimeout(resolve, 100))
          attempts++
        }
        if (!window.pdfjsLib) throw new Error('PDF.js failed to load')

        const url = await fileApi.getPdfBlob(fileId, { viewOnly })
        if (cancelled) return
        blobUrl = url

        const pdf = await window.pdfjsLib.getDocument(url).promise
        if (cancelled) return
        pdfDocRef.current = pdf
        setNumPages(pdf.numPages)
        setFitToWidth(true)
        setLoading(false)

        if (documentId && !viewOnly && !cancelled) {
          extractPDFTextInBackground(pdf, documentId, fileId)
        }
      } catch (err: any) {
        if (cancelled) return
        setError(err.message || 'Failed to load PDF')
        setLoading(false)
      }
    }

    loadPDF()
    return () => {
      cancelled = true
      cancelCurrentRenderGeneration()
      if (blobUrl) URL.revokeObjectURL(blobUrl)
      if (pdfDocRef.current) {
        try {
          pdfDocRef.current.destroy()
        } catch {
          // Ignore cleanup errors from interrupted renders.
        }
      }
      pdfDocRef.current = null
    }
  }, [fileId, documentId, viewOnly, extractPDFTextInBackground, cancelCurrentRenderGeneration])

  // Re-render all pages on scale change
  useEffect(() => {
    if (numPages === 0) return
    void renderAllPages(scale)
  }, [scale, numPages, renderAllPages])

  // IntersectionObserver to track current visible page
  useEffect(() => {
    if (numPages === 0 || !containerRef.current) return
    const ratios = new Map<number, number>()
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const pg = parseInt(entry.target.getAttribute('data-page') || '1', 10)
          ratios.set(pg, entry.intersectionRatio)
        })
        let best = 1
        let bestRatio = -1
        ratios.forEach((ratio, pg) => {
          if (ratio > bestRatio) { bestRatio = ratio; best = pg }
        })
        setCurrentPage(best)
      },
      { root: containerRef.current, threshold: [0, 0.25, 0.5, 0.75, 1.0] }
    )
    pageContainerRefs.current.forEach(el => { if (el) observer.observe(el) })
    return () => observer.disconnect()
  }, [numPages])

  // Fit-to-width: recalculate when container resizes
  const handleFitToWidth = useCallback(async () => {
    if (!pdfDocRef.current || !containerRef.current) return
    try {
      const page = await pdfDocRef.current.getPage(1)
      const containerWidth = containerRef.current.offsetWidth - 32
      const viewport = page.getViewport({ scale: 1.0, rotation: 0 })
      if (containerWidth <= 0 || viewport.width <= 0) return
      const nextScale = Math.max(0.5, Math.min(3.0, containerWidth / viewport.width))
      if (Math.abs(scaleRef.current - nextScale) < 0.001) {
        void renderAllPages(nextScale)
        return
      }
      setScale(nextScale)
    } catch (err) {
      console.error('Error calculating fit-to-width:', err)
    }
  }, [renderAllPages])

  useEffect(() => {
    if (!fitToWidth || numPages === 0 || !containerRef.current) return
    let timeout: NodeJS.Timeout
    const observer = new ResizeObserver(() => {
      clearTimeout(timeout)
      timeout = setTimeout(handleFitToWidth, 150)
    })
    observer.observe(containerRef.current)
    handleFitToWidth()
    return () => { clearTimeout(timeout); observer.disconnect() }
  }, [fitToWidth, numPages, handleFitToWidth])

  // Extract text from a page (cached)
  const getPageTextContent = useCallback(async (pageNum: number) => {
    if (textContentCache.current.has(pageNum)) return textContentCache.current.get(pageNum)
    try {
      const page = await pdfDocRef.current.getPage(pageNum)
      const textContent = await page.getTextContent()
      textContentCache.current.set(pageNum, textContent)
      return textContent
    } catch {
      return null
    }
  }, [])

  // Render highlights for a single page
  const renderHighlightsForPage = useCallback(async (pageNum: number, matches: SearchMatch[], query: string, currentScale: number) => {
    const hl = highlightRefs.current[pageNum - 1]
    if (!hl || !pdfDocRef.current) return
    hl.innerHTML = ''
    if (matches.filter(m => m.pageNumber === pageNum).length === 0) return

    try {
      const page = await pdfDocRef.current.getPage(pageNum)
      const textContent = await getPageTextContent(pageNum)
      if (!textContent) return
      const viewport = page.getViewport({ scale: currentScale })
      const lowerQuery = query.toLowerCase()

      textContent.items.forEach((item: any) => {
        const itemLower = item.str.toLowerCase()
        for (let i = 0; i < item.str.length; i++) {
          if (itemLower.substring(i, i + lowerQuery.length) === lowerQuery) {
            const rect = getTextItemHighlightRect(item, i, lowerQuery.length, viewport)
            const div = document.createElement('div')
            div.style.cssText = `position:absolute;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;background:rgba(255,255,0,0.4);pointer-events:none;`
            hl.appendChild(div)
          }
        }
      })
    } catch (err) {
      console.error(`Error rendering highlights for page ${pageNum}:`, err)
    }
  }, [getPageTextContent])

  // Re-render highlights when matches or scale changes
  useEffect(() => {
    if (numPages === 0) return
    if (searchMatches.length === 0) {
      highlightRefs.current.forEach(el => { if (el) el.innerHTML = '' })
      return
    }
    for (let i = 1; i <= numPages; i++) {
      renderHighlightsForPage(i, searchMatches, searchText, scale)
    }
  }, [searchMatches, scale, numPages, searchText, renderHighlightsForPage])

  // Scroll to a page
  const jumpToPage = useCallback((page: number) => {
    if (page < 1 || page > numPages) return
    const el = pageContainerRefs.current[page - 1]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setCurrentPage(page)
  }, [numPages])

  // Full-text search
  const handleSearch = useCallback(async () => {
    if (!searchText.trim() || !pdfDocRef.current) {
      setSearchMatches([])
      setCurrentMatchIndex(-1)
      return
    }
    setIsSearching(true)
    const matches: SearchMatch[] = []
    const query = searchText.toLowerCase()
    try {
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        const textContent = await getPageTextContent(pageNum)
        if (!textContent) continue
        const pageText = textContent.items.map((item: any) => item.str).join(' ').toLowerCase()
        let start = 0
        while (true) {
          const idx = pageText.indexOf(query, start)
          if (idx === -1) break
          matches.push({ pageNumber: pageNum, matchIndex: idx, text: searchText })
          start = idx + 1
        }
      }
      setSearchMatches(matches)
      const firstIdx = matches.length > 0 ? 0 : -1
      setCurrentMatchIndex(firstIdx)
      if (matches.length > 0) jumpToPage(matches[0].pageNumber)
    } catch (err) {
      console.error('Error searching PDF:', err)
    } finally {
      setIsSearching(false)
    }
  }, [searchText, numPages, getPageTextContent, jumpToPage])

  const goToNextMatch = useCallback(() => {
    if (searchMatches.length === 0) return
    const next = (currentMatchIndex + 1) % searchMatches.length
    setCurrentMatchIndex(next)
    jumpToPage(searchMatches[next].pageNumber)
  }, [searchMatches, currentMatchIndex, jumpToPage])

  const goToPreviousMatch = useCallback(() => {
    if (searchMatches.length === 0) return
    const prev = (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length
    setCurrentMatchIndex(prev)
    jumpToPage(searchMatches[prev].pageNumber)
  }, [searchMatches, currentMatchIndex, jumpToPage])

  const openSearch = useCallback(() => {
    setShowSearch(true)
    setTimeout(() => searchInputRef.current?.focus(), 50)
  }, [])

  const closeSearch = useCallback(() => {
    setShowSearch(false)
    setSearchText('')
    setSearchMatches([])
    setCurrentMatchIndex(-1)
    highlightRefs.current.forEach(el => { if (el) el.innerHTML = '' })
  }, [])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!viewOnly && (e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault()
        openSearch()
      }
      if (e.key === 'Escape' && showSearch) {
        closeSearch()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showSearch, viewOnly, openSearch, closeSearch])

  // Ctrl+scroll zoom
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        setFitToWidth(false)
        setScale(prev => Math.max(0.5, Math.min(3.0, prev * (1 + -e.deltaY * 0.01))))
      }
    }
    const container = containerRef.current
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false })
      return () => container.removeEventListener('wheel', handleWheel)
    }
    return undefined
  }, [])

  // Disable right-click / Ctrl+S / Ctrl+P
  useEffect(() => {
    const noContext = (e: MouseEvent) => e.preventDefault()
    const noSave = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'p')) e.preventDefault()
    }
    const container = containerRef.current
    container?.addEventListener('contextmenu', noContext)
    window.addEventListener('keydown', noSave)
    return () => {
      container?.removeEventListener('contextmenu', noContext)
      window.removeEventListener('keydown', noSave)
    }
  }, [])

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-100">
        <p className="text-gray-600">Loading PDF...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <p className="text-red-600 mb-2">Failed to load PDF</p>
          <p className="text-sm text-gray-600">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col bg-gray-100">
      {/* Toolbar */}
      <div className="border-b bg-white px-2 py-1.5 flex items-center gap-1 flex-wrap">
        {/* Page indicator */}
        {!showSearch && (
          <span className="text-sm text-muted-foreground px-1 tabular-nums">
            {currentPage} / {numPages}
          </span>
        )}

        {viewOnly && !showSearch && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            View-only
          </span>
        )}

        {!showSearch && <div className="border-l h-5 mx-1" />}

        {/* Zoom Controls */}
        {!showSearch && (
          <div className="flex items-center gap-0.5">
            <Button variant="ghost" size="icon" onClick={() => { setFitToWidth(false); setScale(p => Math.max(0.5, p - 0.1)) }} disabled={scale <= 0.5} title="Zoom out">
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-sm px-1 min-w-[52px] text-center tabular-nums">
              {Math.round(scale * 100)}%
            </span>
            <Button variant="ghost" size="icon" onClick={() => { setFitToWidth(false); setScale(p => Math.min(3.0, p + 0.1)) }} disabled={scale >= 3.0} title="Zoom in">
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant={fitToWidth ? 'default' : 'ghost'} size="icon" onClick={() => { setFitToWidth(true); handleFitToWidth() }} title="Fit to width">
              <Maximize2 className="h-4 w-4" />
            </Button>
          </div>
        )}

        {!showSearch && <div className="border-l h-5 mx-1" />}

        {/* Search — inline */}
        {!viewOnly && showSearch ? (
          <div className="flex items-center gap-1 flex-1">
            <Input
              ref={searchInputRef}
              type="text"
              placeholder="Search in document..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleSearch()
                if (e.key === 'Escape') closeSearch()
              }}
              className="h-7 text-sm"
            />
            <Button variant="ghost" size="icon" onClick={handleSearch} disabled={isSearching} title="Search" className="h-7 w-7 shrink-0">
              {isSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            </Button>
            {searchMatches.length > 0 && (
              <>
                <span className="text-xs text-muted-foreground whitespace-nowrap tabular-nums">
                  {currentMatchIndex + 1}/{searchMatches.length}
                </span>
                <Button variant="ghost" size="icon" onClick={goToPreviousMatch} title="Previous match" className="h-7 w-7 shrink-0">
                  <ChevronUp className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" onClick={goToNextMatch} title="Next match" className="h-7 w-7 shrink-0">
                  <ChevronDown className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
            <Button variant="ghost" size="icon" onClick={closeSearch} title="Close search" className="h-7 w-7 shrink-0">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : !viewOnly ? (
          <Button variant="ghost" size="icon" onClick={openSearch} title="Search (Ctrl+F)" className="h-7 w-7">
            <Search className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      {/* PDF text extraction error */}
      {documentId && textExtractionError && (
        <div className="border-b bg-amber-50 border-amber-200 p-2 flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
          <span className="text-xs text-amber-800">
            PDF text extraction failed: {textExtractionError}. AI Assistant will not have access to PDF content.
          </span>
        </div>
      )}

      {/* Continuous scroll canvas area */}
      <div ref={containerRef} className="flex-1 overflow-auto py-4">
        {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => (
          <div
            key={pageNum}
            ref={el => { pageContainerRefs.current[pageNum - 1] = el }}
            className="flex justify-center mb-4"
            data-page={pageNum}
          >
            <div className="relative">
              <canvas
                ref={el => { canvasRefs.current[pageNum - 1] = el }}
                className="shadow-lg block"
              />
              <div
                ref={el => { highlightRefs.current[pageNum - 1] = el }}
                className="absolute top-0 left-0 pointer-events-none"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

declare global {
  interface Window {
    pdfjsLib: any
  }
}
