import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import PDFViewer from '@/components/pdf/PDFViewer'
import { fileApi } from '@/lib/file-api'

const mockSetPDFText = jest.fn()
const mockSetExtracting = jest.fn()
const mockSetPDFError = jest.fn()

jest.mock('@/lib/file-api', () => ({
  fileApi: {
    getPdfBlob: jest.fn(),
  },
}))

jest.mock('@/stores/pdf-text-store', () => ({
  usePDFTextStore: () => ({
    setPDFText: mockSetPDFText,
    setExtracting: mockSetExtracting,
    setError: mockSetPDFError,
  }),
}))

type RenderTask = {
  promise: Promise<void>
  resolve: () => void
  reject: (error: unknown) => void
  cancel: jest.Mock
}

class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('PDFViewer render stability', () => {
  let renderTasks: RenderTask[]
  let mockPage: {
    getViewport: jest.Mock
    getTextContent: jest.Mock
    render: jest.Mock
  }
  let getContextSpy: jest.SpyInstance

  beforeEach(() => {
    renderTasks = []
    mockSetPDFText.mockClear()
    mockSetExtracting.mockClear()
    mockSetPDFError.mockClear()
    ;(fileApi.getPdfBlob as jest.Mock).mockResolvedValue('blob:pdf-file')

    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: 2,
    })

    Object.defineProperty(window, 'IntersectionObserver', {
      configurable: true,
      writable: true,
      value: MockIntersectionObserver,
    })

    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      writable: true,
      value: jest.fn(),
    })

    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
      configurable: true,
      get: () => 32,
    })

    getContextSpy = jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      clearRect: jest.fn(),
      setTransform: jest.fn(),
    } as unknown as CanvasRenderingContext2D))

    mockPage = {
      getViewport: jest.fn(({ scale }: { scale: number }) => ({
        width: 600 * scale,
        height: 800 * scale,
        scale,
        transform: [scale, 0, 0, -scale, 0, 800 * scale],
      })),
      getTextContent: jest.fn().mockResolvedValue({ items: [] }),
      render: jest.fn(() => {
        let resolve!: () => void
        let reject!: (error: unknown) => void
        const promise = new Promise<void>((res, rej) => {
          resolve = res
          reject = rej
        })
        const task: RenderTask = {
          promise,
          resolve,
          reject,
          cancel: jest.fn(() => {
            const error = new Error('Rendering cancelled')
            error.name = 'RenderingCancelledException'
            reject(error)
          }),
        }
        renderTasks.push(task)
        return task
      }),
    }

    const mockPdf = {
      numPages: 1,
      getPage: jest.fn().mockResolvedValue(mockPage),
      destroy: jest.fn(),
    }

    Object.defineProperty(window, 'pdfjsLib', {
      configurable: true,
      writable: true,
      value: {
        GlobalWorkerOptions: {},
        Util: {
          transform: jest.fn(),
        },
        getDocument: jest.fn(() => ({
          promise: Promise.resolve(mockPdf),
        })),
      },
    })
  })

  afterEach(() => {
    renderTasks.forEach((task) => task.resolve())
    getContextSpy.mockRestore()
    delete (window as Partial<Window>).pdfjsLib
  })

  it('cancels an in-flight page render before zoom redraws the same canvas', async () => {
    const user = userEvent.setup()

    render(<PDFViewer fileId="file-123" />)

    await waitFor(() => {
      expect(mockPage.render).toHaveBeenCalledTimes(1)
    })

    await user.click(screen.getByTitle('Zoom in'))

    await waitFor(() => {
      expect(renderTasks[0].cancel).toHaveBeenCalledTimes(1)
      expect(mockPage.render).toHaveBeenCalledTimes(2)
    })

    const canvas = document.querySelector('canvas')
    expect(canvas).toHaveAttribute('width', '1320')
    expect(canvas).toHaveAttribute('height', '1760')
    expect(canvas).toHaveStyle({ width: '660px', height: '880px' })
    expect(mockPage.render).toHaveBeenLastCalledWith(expect.objectContaining({
      transform: [2, 0, 0, 2, 0, 0],
    }))
  })

  it('uses view-only file access without extracting client-side PDF text', async () => {
    render(<PDFViewer fileId="file-123" documentId="doc-1" viewOnly />)

    await waitFor(() => {
      expect(fileApi.getPdfBlob).toHaveBeenCalledWith('file-123', { viewOnly: true })
    })

    await waitFor(() => {
      expect(screen.getByText('View-only')).toBeInTheDocument()
    })

    expect(screen.queryByTitle('Search (Ctrl+F)')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /download pdf/i })).not.toBeInTheDocument()
    expect(mockSetPDFText).not.toHaveBeenCalled()
  })

  it('shows a download affordance for downloadable PDFs', async () => {
    const user = userEvent.setup()
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    render(<PDFViewer fileId="file-123" documentId="doc-1" />)

    const downloadButton = await screen.findByRole('button', { name: /download pdf/i })
    expect(downloadButton).toBeEnabled()
    expect(screen.queryByText('View-only')).not.toBeInTheDocument()

    await user.click(downloadButton)

    expect(clickSpy).toHaveBeenCalledTimes(1)
    clickSpy.mockRestore()
  })
})
