import { create } from 'zustand';

export interface PDFTextData {
  documentId: string;
  fileId: string;
  numPages: number;
  pages: string[]; // text per page
  fullText: string; // all pages concatenated
  summary?: string; // optional cached summary (first 2 pages trimmed)
  extractedAt: number;
  isExtracting: boolean;
  error?: string;
}

interface PDFTextStore {
  // Map of documentId -> PDFTextData
  pdfTexts: Map<string, PDFTextData>;

  // Actions
  setPDFText: (documentId: string, data: Omit<PDFTextData, 'documentId' | 'extractedAt'>) => void;
  getPDFText: (documentId: string) => PDFTextData | undefined;
  setExtracting: (documentId: string, isExtracting: boolean) => void;
  setError: (documentId: string, error: string) => void;
  clearPDFText: (documentId: string) => void;
}

export const usePDFTextStore = create<PDFTextStore>((set, get) => ({
  pdfTexts: new Map(),

  setPDFText: (documentId, data) => {
    set((state) => {
      const newMap = new Map(state.pdfTexts);
      newMap.set(documentId, {
        ...data,
        documentId,
        extractedAt: Date.now(),
      });
      return { pdfTexts: newMap };
    });
  },

  getPDFText: (documentId) => {
    return get().pdfTexts.get(documentId);
  },

  setExtracting: (documentId, isExtracting) => {
    set((state) => {
      const existing = state.pdfTexts.get(documentId);
      if (!existing) return state;

      const newMap = new Map(state.pdfTexts);
      newMap.set(documentId, { ...existing, isExtracting });
      return { pdfTexts: newMap };
    });
  },

  setError: (documentId, error) => {
    set((state) => {
      const existing = state.pdfTexts.get(documentId);
      if (!existing) return state;

      const newMap = new Map(state.pdfTexts);
      newMap.set(documentId, { ...existing, error, isExtracting: false });
      return { pdfTexts: newMap };
    });
  },

  clearPDFText: (documentId) => {
    set((state) => {
      const newMap = new Map(state.pdfTexts);
      newMap.delete(documentId);
      return { pdfTexts: newMap };
    });
  },
}));
