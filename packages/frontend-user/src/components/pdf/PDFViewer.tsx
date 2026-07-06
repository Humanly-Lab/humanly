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
  Download,
} from 'lucide-react'
import { fileApi } from '@/lib/file-api'
import type { PdfDocumentSource } from '@/lib/file-api'
import {
  api,
  getPublicDocumentAuthConfig,
  waitForDocumentScopedAccessTokenReady,
} from '@/lib/api-client'
import { usePDFTextStore } from '@/stores/pdf-text-store'
import { extractCompatiblePDFTextContent } from './pdf-text-content'

type PDFJSModule = typeof import('pdfjs-dist')

let pdfjsModulePromise: Promise<PDFJSModule> | null = null

function loadPDFJS(): Promise<PDFJSModule> {
  if (!pdfjsModulePromise) {
    pdfjsModulePromise = import('pdfjs-dist').then((pdfjsLib) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
      return pdfjsLib
    })
  }

  return pdfjsModulePromise
}

interface PDFViewerProps {
  fileId?: string
  documentId?: string
  previewUrl?: string
  viewOnly?: boolean
}

interface SearchMatch {
  pageNumber: number
  matchIndex: number
  text: string
}

interface PageLayout {
  pageNumber: number
  width: number
  height: number
  loaded: boolean
}

const PDF_LOAD_TIMEOUT_MS = 30_000
// PDFPageView owns page DOM/text/annotation layers; this queue keeps Humanly's custom highlights and view-only logging.
const MAX_CONCURRENT_PAGE_RENDERS = 2
const PRE_RENDER_RADIUS = 1
const RETAINED_PAGE_RADIUS = 4
const MAX_CANVAS_PIXELS = 16_000_000

export const PDFJS_DOCUMENT_RESOURCE_OPTIONS = {
  cMapUrl: '/pdfjs/cmaps/',
  cMapPacked: true,
  standardFontDataUrl: '/pdfjs/standard_fonts/',
} as const

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

function getPageCssSize(layout: PageLayout | undefined, scale: number) {
  if (!layout) {
    return { width: undefined, height: undefined }
  }

  return {
    width: toCssPixelValue(layout.width * scale),
    height: toCssPixelValue(layout.height * scale),
  }
}

function getBoundedOutputScale(viewport: { width: number; height: number }) {
  const devicePixelRatio = Math.max(window.devicePixelRatio || 1, 1)
  const viewportPixels = Math.max(viewport.width * viewport.height, 1)
  const pixelBoundScale = Math.sqrt(MAX_CANVAS_PIXELS / viewportPixels)
  return Math.max(1, Math.min(devicePixelRatio, pixelBoundScale))
}

function getSafePreviewDownloadUrl(previewUrl: string): string | null {
  try {
    const parsed = new URL(previewUrl, window.location.origin)
    if (parsed.origin !== window.location.origin) {
      return null
    }
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:' || parsed.protocol === 'blob:') {
      return parsed.toString()
    }
    return null
  } catch {
    return null
  }
}

function getTextItemHighlightRect(
  pdfjsLib: PDFJSModule,
  item: any,
  matchStart: number,
  matchLength: number,
  viewport: any
) {
  const transform = pdfjsLib.Util.transform(viewport.transform, item.transform)
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

export default function PDFViewer({ fileId, documentId, previewUrl, viewOnly = false }: PDFViewerProps) {
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
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [isDownloading, setIsDownloading] = useState(false)
  const [pageLayouts, setPageLayouts] = useState<PageLayout[]>([])
  const [renderedPageNumbers, setRenderedPageNumbers] = useState<number[]>([])

  const containerRef = useRef<HTMLDivElement>(null)
  const pdfDocRef = useRef<any>(null)
  const pdfjsLibRef = useRef<PDFJSModule | null>(null)
  const textContentCache = useRef<Map<number, any>>(new Map())
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([])
  const highlightRefs = useRef<(HTMLDivElement | null)[]>([])
  const pageContainerRefs = useRef<(HTMLDivElement | null)[]>([])
  const searchInputRef = useRef<HTMLInputElement>(null)
  const scaleRef = useRef<number>(1.0)
  const numPagesRef = useRef<number>(0)
  const currentPageRef = useRef<number>(1)
  const renderTasksRef = useRef<Map<number, any>>(new Map())
  const renderGenerationRef = useRef<number>(0)
  const pointerInsideViewerRef = useRef<boolean>(false)
  const pageLayoutsRef = useRef<PageLayout[]>([])
  const visiblePagesRef = useRef<Set<number>>(new Set())
  const renderedPagesRef = useRef<Set<number>>(new Set())
  const queuedPagesRef = useRef<Set<number>>(new Set())
  const activePagesRef = useRef<Set<number>>(new Set())
  const renderQueueRef = useRef<number[]>([])
  const activeRenderCountRef = useRef(0)
  const scrollDirectionRef = useRef<'up' | 'down'>('down')
  const lastScrollTopRef = useRef(0)
  const scheduleRafRef = useRef<number | null>(null)

  // Keep scaleRef in sync
  useEffect(() => {
    scaleRef.current = scale
  }, [scale])

  useEffect(() => {
    numPagesRef.current = numPages
  }, [numPages])

  useEffect(() => {
    currentPageRef.current = currentPage
  }, [currentPage])

  useEffect(() => {
    pageLayoutsRef.current = pageLayouts
  }, [pageLayouts])

  const getFitToWidthScale = useCallback((pageWidth: number) => {
    const containerWidth = (containerRef.current?.offsetWidth || 0) - 32
    if (containerWidth <= 0 || pageWidth <= 0) {
      return scaleRef.current
    }
    return Math.max(0.5, Math.min(3.0, containerWidth / pageWidth))
  }, [])

  // Extract PDF text in background for AI context
  const extractPDFTextInBackground = useCallback(async (pdf: any, docId: string, extractedFileId: string) => {
    try {
      setExtracting(docId, true)
      setTextExtractionError(null)
      const pages: string[] = []
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const textContent = await extractCompatiblePDFTextContent(page)
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
    renderQueueRef.current = []
    queuedPagesRef.current.clear()
    activePagesRef.current.clear()
    activeRenderCountRef.current = 0
  }, [])

  const cancelCurrentRenderGeneration = useCallback(() => {
    renderGenerationRef.current += 1
    cancelActiveRenderTasks()
    renderedPagesRef.current.clear()
    setRenderedPageNumbers([])
  }, [cancelActiveRenderTasks])

  const startRenderGeneration = useCallback(() => {
    renderGenerationRef.current += 1
    cancelActiveRenderTasks()
    renderedPagesRef.current.clear()
    setRenderedPageNumbers([])
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

  const publishRenderedPages = useCallback(() => {
    setRenderedPageNumbers([...renderedPagesRef.current].sort((a, b) => a - b))
  }, [])

  const releasePageCanvas = useCallback((pageNum: number) => {
    cancelPageRenderTask(pageNum)
    renderedPagesRef.current.delete(pageNum)
    const canvas = canvasRefs.current[pageNum - 1]
    const layout = pageLayoutsRef.current[pageNum - 1]
    if (!canvas || !layout) return

    const { width, height } = getPageCssSize(layout, scaleRef.current)
    canvas.width = 0
    canvas.height = 0
    if (width) canvas.style.width = width
    if (height) canvas.style.height = height
    const context = canvas.getContext('2d')
    context?.clearRect(0, 0, canvas.width, canvas.height)
  }, [cancelPageRenderTask])

  const releaseFarCanvases = useCallback(() => {
    const visiblePages = visiblePagesRef.current.size > 0
      ? [...visiblePagesRef.current]
      : [currentPageRef.current]
    if (visiblePages.length === 0) return

    const minVisible = Math.min(...visiblePages)
    const maxVisible = Math.max(...visiblePages)
    let changed = false
    renderedPagesRef.current.forEach((pageNum) => {
      const isFarBefore = pageNum < minVisible - RETAINED_PAGE_RADIUS
      const isFarAfter = pageNum > maxVisible + RETAINED_PAGE_RADIUS
      if (isFarBefore || isFarAfter) {
        releasePageCanvas(pageNum)
        changed = true
      }
    })

    if (changed) {
      publishRenderedPages()
    }
  }, [publishRenderedPages, releasePageCanvas])

  // Render a single page to its canvas
  const renderPage = useCallback(async (pageNum: number, currentScale: number, generation: number) => {
    if (!pdfDocRef.current || generation !== renderGenerationRef.current) return false
    const canvas = canvasRefs.current[pageNum - 1]
    if (!canvas) return false
    let renderTask: any = null
    try {
      cancelPageRenderTask(pageNum)
      const page = await pdfDocRef.current.getPage(pageNum)
      if (generation !== renderGenerationRef.current) return false
      const context = canvas.getContext('2d')
      if (!context) return false
      const viewport = page.getViewport({ scale: currentScale, rotation: 0 })
      const outputScale = getBoundedOutputScale(viewport)
      const pageLayout: PageLayout = {
        pageNumber: pageNum,
        width: viewport.width / currentScale,
        height: viewport.height / currentScale,
        loaded: true,
      }
      pageLayoutsRef.current[pageNum - 1] = pageLayout
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
      if (generation !== renderGenerationRef.current) return false
      renderedPagesRef.current.add(pageNum)
      publishRenderedPages()
      return true
    } catch (err) {
      if (isRenderCancelledError(err)) return false
      console.error(`Error rendering page ${pageNum}:`, err)
      return false
    } finally {
      if (renderTask && renderTasksRef.current.get(pageNum) === renderTask) {
        renderTasksRef.current.delete(pageNum)
      }
    }
  }, [cancelPageRenderTask, publishRenderedPages])

  const pumpRenderQueue = useCallback(() => {
    if (!pdfDocRef.current) return
    const generation = renderGenerationRef.current

    while (
      activeRenderCountRef.current < MAX_CONCURRENT_PAGE_RENDERS &&
      renderQueueRef.current.length > 0
    ) {
      const pageNum = renderQueueRef.current.shift()
      if (!pageNum) continue
      queuedPagesRef.current.delete(pageNum)

      if (
        pageNum < 1 ||
        pageNum > numPagesRef.current ||
        renderedPagesRef.current.has(pageNum) ||
        activePagesRef.current.has(pageNum)
      ) {
        continue
      }

      activeRenderCountRef.current += 1
      activePagesRef.current.add(pageNum)
      void renderPage(pageNum, scaleRef.current, generation).finally(() => {
        activeRenderCountRef.current = Math.max(activeRenderCountRef.current - 1, 0)
        activePagesRef.current.delete(pageNum)
        releaseFarCanvases()
        pumpRenderQueue()
      })
    }
  }, [releaseFarCanvases, renderPage])

  const schedulePagesForRendering = useCallback((pages: number[], priority = false) => {
    const totalPages = numPagesRef.current
    if (totalPages === 0) return
    const normalizedPages = [...new Set(pages)]
      .filter(pageNum => pageNum >= 1 && pageNum <= totalPages)
      .filter(pageNum => !renderedPagesRef.current.has(pageNum))
      .filter(pageNum => !queuedPagesRef.current.has(pageNum))
      .filter(pageNum => !activePagesRef.current.has(pageNum))

    if (normalizedPages.length === 0) return

    normalizedPages.forEach(pageNum => queuedPagesRef.current.add(pageNum))
    if (priority) {
      renderQueueRef.current = [...normalizedPages, ...renderQueueRef.current]
    } else {
      renderQueueRef.current.push(...normalizedPages)
    }
    pumpRenderQueue()
  }, [pumpRenderQueue])

  const getRenderPriorityPages = useCallback(() => {
    const totalPages = numPagesRef.current
    const visiblePages = visiblePagesRef.current.size > 0
      ? [...visiblePagesRef.current].sort((a, b) => a - b)
      : [currentPageRef.current || 1]
    const pages: number[] = []

    visiblePages.forEach(pageNum => pages.push(pageNum))
    const edgePage = scrollDirectionRef.current === 'down'
      ? Math.max(...visiblePages) + 1
      : Math.min(...visiblePages) - 1
    pages.push(edgePage)

    visiblePages.forEach(pageNum => {
      for (let offset = 1; offset <= PRE_RENDER_RADIUS; offset++) {
        pages.push(pageNum - offset, pageNum + offset)
      }
    })

    return [...new Set(pages)].filter(pageNum => pageNum >= 1 && pageNum <= totalPages)
  }, [])

  const scheduleVisiblePagesForRendering = useCallback(() => {
    if (scheduleRafRef.current !== null) {
      window.cancelAnimationFrame(scheduleRafRef.current)
    }
    scheduleRafRef.current = window.requestAnimationFrame(() => {
      scheduleRafRef.current = null
      schedulePagesForRendering(getRenderPriorityPages(), true)
    })
  }, [getRenderPriorityPages, schedulePagesForRendering])

  // Load PDF document
  useEffect(() => {
    let cancelled = false
    let source: PdfDocumentSource | null = null
    let loadingTask: any = null
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const loadPDF = async () => {
      try {
        cancelCurrentRenderGeneration()
        pdfDocRef.current = null
        textContentCache.current.clear()
        canvasRefs.current = []
        highlightRefs.current = []
        pageContainerRefs.current = []
        visiblePagesRef.current.clear()
        renderedPagesRef.current.clear()
        queuedPagesRef.current.clear()
        activePagesRef.current.clear()
        renderQueueRef.current = []
        activeRenderCountRef.current = 0
        numPagesRef.current = 0
        currentPageRef.current = 1
        setNumPages(0)
        setCurrentPage(1)
        setScale(1.0)
        setFitToWidth(true)
        setSearchText('')
        setSearchMatches([])
        setCurrentMatchIndex(-1)
        setShowSearch(false)
        setTextExtractionError(null)
        setPageLayouts([])
        setRenderedPageNumbers([])
        setLoading(true)
        setError(null)
        const pdfjsLib = await loadPDFJS()
        pdfjsLibRef.current = pdfjsLib

        if (!previewUrl && !fileId) {
          throw new Error('No PDF file available')
        }

        source = previewUrl
          ? { url: previewUrl }
          : await fileApi.getPdfDocumentSource(fileId!, { viewOnly, documentId })
        if (cancelled) return

        loadingTask = pdfjsLib.getDocument({
          url: source.url,
          httpHeaders: source.httpHeaders,
          withCredentials: source.withCredentials,
          ...PDFJS_DOCUMENT_RESOURCE_OPTIONS,
        })

        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => {
            try {
              loadingTask?.destroy?.()
            } catch {
              // Ignore PDF.js teardown races; the timeout error owns the UI state.
            }
            reject(new Error('PDF loading timed out. Please try again.'))
          }, PDF_LOAD_TIMEOUT_MS)
        })

        const pdf = await Promise.race([loadingTask.promise, timeoutPromise])
        if (timeoutId) {
          clearTimeout(timeoutId)
          timeoutId = null
        }
        if (cancelled) return
        pdfDocRef.current = pdf
        loadingTask = null

        const firstPage = await pdf.getPage(1)
        if (cancelled) return
        const firstViewport = firstPage.getViewport({ scale: 1.0, rotation: 0 })
        const initialScale = getFitToWidthScale(firstViewport.width)
        const initialLayouts: PageLayout[] = Array.from({ length: pdf.numPages }, (_, index) => ({
          pageNumber: index + 1,
          width: firstViewport.width,
          height: firstViewport.height,
          loaded: index === 0,
        }))
        pageLayoutsRef.current = initialLayouts
        scaleRef.current = initialScale
        numPagesRef.current = pdf.numPages
        setPageLayouts(initialLayouts)
        setScale(initialScale)
        setNumPages(pdf.numPages)
        setFitToWidth(true)
        setLoading(false)

        void (async () => {
          const hydratedLayouts = [...initialLayouts]
          for (let pageNum = 2; pageNum <= pdf.numPages; pageNum++) {
            if (cancelled) return
            const page = await pdf.getPage(pageNum)
            const viewport = page.getViewport({ scale: 1.0, rotation: 0 })
            hydratedLayouts[pageNum - 1] = {
              pageNumber: pageNum,
              width: viewport.width,
              height: viewport.height,
              loaded: true,
            }
          }
          if (!cancelled) {
            pageLayoutsRef.current = hydratedLayouts
            setPageLayouts(hydratedLayouts)
          }
        })()

        if (documentId && fileId && !previewUrl && !viewOnly && !cancelled) {
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
      if (timeoutId) clearTimeout(timeoutId)
      try {
        loadingTask?.destroy?.()
      } catch {
        // Ignore cleanup errors from interrupted PDF.js loading tasks.
      }
      source?.cleanup?.()
      cancelCurrentRenderGeneration()
      if (scheduleRafRef.current !== null) {
        window.cancelAnimationFrame(scheduleRafRef.current)
        scheduleRafRef.current = null
      }
      if (pdfDocRef.current) {
        try {
          pdfDocRef.current.destroy()
        } catch {
          // Ignore cleanup errors from interrupted renders.
        }
      }
      pdfDocRef.current = null
    }
  }, [fileId, documentId, previewUrl, viewOnly, loadAttempt, extractPDFTextInBackground, cancelCurrentRenderGeneration, getFitToWidthScale])

  // Re-render only visible and nearby pages on scale/layout changes.
  useEffect(() => {
    if (numPages === 0 || loading || pageLayouts.length === 0) return
    startRenderGeneration()
    pageLayouts.forEach((layout) => {
      const canvas = canvasRefs.current[layout.pageNumber - 1]
      const hl = highlightRefs.current[layout.pageNumber - 1]
      const { width, height } = getPageCssSize(layout, scale)
      if (canvas) {
        canvas.width = 0
        canvas.height = 0
        if (width) canvas.style.width = width
        if (height) canvas.style.height = height
      }
      if (hl) {
        if (width) hl.style.width = width
        if (height) hl.style.height = height
        hl.innerHTML = ''
      }
    })
    scheduleVisiblePagesForRendering()
  }, [loading, numPages, pageLayouts, scale, scheduleVisiblePagesForRendering, startRenderGeneration])

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
        let best = currentPageRef.current || 1
        let bestRatio = -1
        ratios.forEach((ratio, pg) => {
          if (ratio > bestRatio) { bestRatio = ratio; best = pg }
        })
        setCurrentPage(best)
        visiblePagesRef.current = new Set(
          [...ratios.entries()]
            .filter(([, ratio]) => ratio > 0)
            .map(([pg]) => pg)
        )
        scheduleVisiblePagesForRendering()
      },
      { root: containerRef.current, threshold: [0, 0.25, 0.5, 0.75, 1.0] }
    )
    pageContainerRefs.current.forEach(el => { if (el) observer.observe(el) })
    return () => observer.disconnect()
  }, [numPages, scheduleVisiblePagesForRendering])

  // Fit-to-width: recalculate when container resizes
  const handleFitToWidth = useCallback(async () => {
    if (!pdfDocRef.current || !containerRef.current) return
    try {
      const page = await pdfDocRef.current.getPage(1)
      const viewport = page.getViewport({ scale: 1.0, rotation: 0 })
      const nextScale = getFitToWidthScale(viewport.width)
      if (Math.abs(scaleRef.current - nextScale) < 0.001) {
        return
      }
      scaleRef.current = nextScale
      setScale(nextScale)
    } catch (err) {
      console.error('Error calculating fit-to-width:', err)
    }
  }, [getFitToWidthScale])

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
      const textContent = await extractCompatiblePDFTextContent(page)
      textContentCache.current.set(pageNum, textContent)
      return textContent
    } catch {
      return null
    }
  }, [])

  // Render highlights for a single page
  const renderHighlightsForPage = useCallback(async (pageNum: number, matches: SearchMatch[], query: string, currentScale: number) => {
    const hl = highlightRefs.current[pageNum - 1]
    const pdfjsLib = pdfjsLibRef.current
    if (!hl || !pdfDocRef.current || !pdfjsLib) return
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
            const rect = getTextItemHighlightRect(pdfjsLib, item, i, lowerQuery.length, viewport)
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
    renderedPageNumbers.forEach((pageNum) => {
      renderHighlightsForPage(pageNum, searchMatches, searchText, scale)
    })
  }, [searchMatches, scale, numPages, searchText, renderedPageNumbers, renderHighlightsForPage])

  // Scroll to a page
  const jumpToPage = useCallback((page: number) => {
    if (page < 1 || page > numPages) return
    schedulePagesForRendering([page, page + 1, page - 1], true)
    const el = pageContainerRefs.current[page - 1]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setCurrentPage(page)
  }, [numPages, schedulePagesForRendering])

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

  const handleViewerScroll = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const nextScrollTop = container.scrollTop
    scrollDirectionRef.current = nextScrollTop >= lastScrollTopRef.current ? 'down' : 'up'
    lastScrollTopRef.current = nextScrollTop
    scheduleVisiblePagesForRendering()
  }, [scheduleVisiblePagesForRendering])

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

  const handleDownloadPdf = useCallback(async () => {
    if (viewOnly || (!previewUrl && !fileId)) return

    setIsDownloading(true)
    let objectUrl: string | null = null
    try {
      let downloadUrl: string
      if (previewUrl) {
        const safePreviewUrl = getSafePreviewDownloadUrl(previewUrl)
        if (!safePreviewUrl) {
          throw new Error('Invalid preview download URL')
        }
        downloadUrl = safePreviewUrl
      } else if (fileId) {
        const blob = await fileApi.downloadPdf(fileId, { documentId })
        objectUrl = URL.createObjectURL(blob)
        downloadUrl = objectUrl
      } else {
        throw new Error('Download URL is not ready')
      }

      const anchor = document.createElement('a')
      anchor.href = downloadUrl
      anchor.download = `humanly-source-${fileId || 'preview'}.pdf`
      anchor.style.display = 'none'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to download PDF'
      alert(message)
    } finally {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      setIsDownloading(false)
    }
  }, [documentId, fileId, previewUrl, viewOnly])

  const logViewOnlyViewerAttempt = useCallback(async (eventType: 'copy' | 'contextmenu') => {
    if (!viewOnly || !documentId) return

    try {
      await waitForDocumentScopedAccessTokenReady(documentId)

      await api.post(
        `/documents/${documentId}/events`,
        {
          events: [{
            eventType,
            timestamp: new Date().toISOString(),
            targetElement: 'pdf-viewer',
            metadata: {
              source: 'pdf_viewer',
              fileId,
              viewOnly: true,
              action: eventType === 'copy' ? 'copy_attempt' : 'contextmenu_attempt',
            },
          }],
        },
        getPublicDocumentAuthConfig(documentId)
      )
    } catch (err) {
      console.warn('Failed to log view-only PDF viewer attempt:', err)
    }
  }, [documentId, fileId, viewOnly])

  // Disable right-click / Ctrl+S / Ctrl+P for view-only resources only.
  useEffect(() => {
    if (!viewOnly || loading) return

    const noContext = (e: MouseEvent) => {
      e.preventDefault()
      void logViewOnlyViewerAttempt('contextmenu')
    }
    const noCopy = (e: ClipboardEvent) => {
      e.preventDefault()
      void logViewOnlyViewerAttempt('copy')
    }
    const noSave = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && (key === 's' || key === 'p')) {
        e.preventDefault()
      }

      if ((e.ctrlKey || e.metaKey) && key === 'c') {
        const container = containerRef.current
        const activeElement = document.activeElement
        const isViewerTarget = Boolean(
          container && (
            pointerInsideViewerRef.current ||
            (activeElement instanceof Node && container.contains(activeElement))
          )
        )
        if (isViewerTarget) {
          e.preventDefault()
          void logViewOnlyViewerAttempt('copy')
        }
      }
    }
    const container = containerRef.current
    container?.addEventListener('contextmenu', noContext)
    container?.addEventListener('copy', noCopy)
    window.addEventListener('keydown', noSave)
    return () => {
      container?.removeEventListener('contextmenu', noContext)
      container?.removeEventListener('copy', noCopy)
      window.removeEventListener('keydown', noSave)
    }
  }, [loading, logViewOnlyViewerAttempt, viewOnly])

  if (loading) {
    return (
      <div className="h-full flex flex-col bg-gray-100">
        <div ref={containerRef} className="flex-1 overflow-auto py-4 flex items-center justify-center">
          <p className="text-gray-600">Loading PDF...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-100">
        <div className="text-center px-4">
          <p className="text-red-600 mb-2">Failed to load PDF</p>
          <p className="text-sm text-gray-600 mb-4">{error}</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setLoadAttempt((attempt) => attempt + 1)}
          >
            Retry
          </Button>
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

        {!viewOnly && !showSearch && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownloadPdf}
            disabled={isDownloading || (!previewUrl && !fileId)}
            title="Download PDF"
            className="h-7 gap-1.5 px-2 text-xs"
          >
            {isDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            {isDownloading ? 'Downloading...' : 'Download PDF'}
          </Button>
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
      <div
        ref={containerRef}
        className="flex-1 overflow-auto py-4"
        tabIndex={viewOnly ? 0 : undefined}
        onScroll={handleViewerScroll}
        onMouseEnter={() => { pointerInsideViewerRef.current = true }}
        onMouseLeave={() => { pointerInsideViewerRef.current = false }}
      >
        {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNum) => {
          const layout = pageLayouts[pageNum - 1]
          const { width, height } = getPageCssSize(layout, scale)
          const isRendered = renderedPageNumbers.includes(pageNum)

          return (
            <div
              key={pageNum}
              ref={el => { pageContainerRefs.current[pageNum - 1] = el }}
              className="flex justify-center mb-4"
              data-page={pageNum}
              data-rendered={isRendered ? 'true' : 'false'}
            >
              <div
                className="relative bg-white shadow-lg"
                style={{ width, height }}
              >
                <canvas
                  ref={el => { canvasRefs.current[pageNum - 1] = el }}
                  className="block"
                  style={{ width, height }}
                />
                <div
                  ref={el => { highlightRefs.current[pageNum - 1] = el }}
                  className="absolute top-0 left-0 pointer-events-none"
                  style={{ width, height }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
