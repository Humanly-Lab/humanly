'use client';

import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, FileText, Clock, Award, PanelLeftClose, PanelLeft, Upload, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { LexicalEditor, type EditorAIBridgeAPI, type SelectionReplacementResult } from '@humanly/editor';
import { useDocument } from '@/hooks/use-document';
import { useCertificates } from '@/hooks/use-certificates';
import { useAuthStore } from '@/stores/auth-store';
import { useToast } from '@/components/ui/use-toast';
import { validatePdfFile } from '@/lib/document-pdf';
import {
  CertificateGenerationDialog,
  type CertificateGenerationOptions,
} from '@/components/certificates/certificate-generation-dialog';
import { AIAssistantButton, AIAssistantPanel, AISelectionMenu, type ActionType } from '@/components/ai';
import { useAI } from '@/hooks/use-ai';
import { useAIStore } from '@/stores/ai-store';
import type { TrackedEvent } from '@humanly/editor';
import { useState, useEffect, useCallback, useRef, type ChangeEvent } from 'react';
import dynamic from 'next/dynamic';
import { apiClient, TokenManager } from '@/lib/api-client';

// ✅ Overleaf-style: resizable panels
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';

// Dynamically import PDFViewer with SSR disabled (PDF.js loaded from CDN)
const PDFViewer = dynamic(() => import('@/components/review/SimplePDFViewer'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-gray-100">
      <p className="text-gray-600">Loading PDF viewer...</p>
    </div>
  ),
});

interface ProjectEnrollment {
  id: string;
  name: string;
  inviteCode: string;
  documentId: string;
  joinedAt: string;
  description?: string;
}

interface ProjectInstructionPaper {
  id: string;
  title: string;
  pdfStoragePath?: string;
}

const PROJECT_ENROLLMENTS_KEY = 'humanly.projectEnrollments';
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

interface EditorAIBridgeCaptureProps {
  insertAtCursor: EditorAIBridgeAPI['insertAtCursor'];
  onInsertAtCursorChange: (insertAtCursor: EditorAIBridgeAPI['insertAtCursor'] | null) => void;
}

function EditorAIBridgeCapture({
  insertAtCursor,
  onInsertAtCursorChange,
}: EditorAIBridgeCaptureProps): null {
  useEffect(() => {
    onInsertAtCursorChange(insertAtCursor);
    return () => onInsertAtCursorChange(null);
  }, [insertAtCursor, onInsertAtCursorChange]);

  return null;
}

const readProjectEnrollmentForDocument = (documentId: string): ProjectEnrollment | null => {
  if (typeof window === 'undefined') return null;
  try {
    const enrollments = JSON.parse(localStorage.getItem(PROJECT_ENROLLMENTS_KEY) || '[]') as ProjectEnrollment[];
    return enrollments.find((project) => project.documentId === documentId) || null;
  } catch {
    return null;
  }
};

export default function DocumentEditorPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const documentId = params.id as string;
  const { user } = useAuthStore();
  const {
    document,
    linkedPaper,
    isLoading,
    error,
    isSaving,
    updateDocument,
    trackEvents,
    uploadPdf,
  } = useDocument(documentId);
  const [showPdfPanel, setShowPdfPanel] = useState(true);
  const { generateCertificate } = useCertificates();

  const [title, setTitle] = useState('');
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [isGeneratingCertificate, setIsGeneratingCertificate] = useState(false);
  const [showCertificateDialog, setShowCertificateDialog] = useState(false);
  const [isUploadingPdf, setIsUploadingPdf] = useState(false);
  const [projectInstructionPaper, setProjectInstructionPaper] = useState<ProjectInstructionPaper | null>(null);
  const [submissionSessionId, setSubmissionSessionId] = useState<string | null>(null);
  const [editorInsertAtCursor, setEditorInsertAtCursor] = useState<EditorAIBridgeAPI['insertAtCursor'] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const submissionSessionRef = useRef<{ projectId: string; sessionId: string } | null>(null);
  // Holds AISelectionMenu's current dispatcher when a selection is active.
  // Set / cleared by the menu's registerActionTrigger prop. Used by the
  // global keyboard shortcut effect (Cmd/Ctrl+Shift+1..4).
  const quickActionTriggerRef = useRef<((type: ActionType) => void) | null>(null);

  // AI Assistant
  const {
    isPanelOpen: isAIPanelOpen,
    togglePanel: toggleAIPanel,
    closePanel: closeAIPanel,
  } = useAI(documentId);

  // Store document metrics for the editor UI. AI full-document retrieval happens server-side.
  const [wordCount, setWordCount] = useState<number>(0);

  const calculateWordCount = useCallback((text: string): number => {
    if (!text || typeof text !== 'string') return 0;
    const words = text.trim().replace(/\s+/g, ' ').split(' ').filter((w) => w.length > 0);
    return words.length;
  }, []);

  useEffect(() => {
    if (document) {
      setTitle(document.title || '');
      setWordCount(document.wordCount || 0);
    }
  }, [document]);

  // Cmd/Ctrl+Shift+1..4 fire the four selection-menu quick actions when a
  // selection is active. Cmd+1..4 alone are reserved for browser tab
  // switching, so we require Shift. The trigger ref is only populated
  // while AISelectionMenu is mounted, which happens exactly when the
  // editor has an active selection — so the shortcut is implicitly
  // gated on having a selection.
  useEffect(() => {
    const QUICK_ACTION_BY_KEY: Record<string, ActionType> = {
      '1': 'grammar',
      '2': 'improve',
      '3': 'simplify',
      '4': 'formal',
    };
    const handler = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !event.shiftKey) return;
      const actionType = QUICK_ACTION_BY_KEY[event.key];
      if (!actionType) return;
      const trigger = quickActionTriggerRef.current;
      if (!trigger) return;
      event.preventDefault();
      trigger(actionType);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Keyboard shortcut for AI Assistant (Cmd/Ctrl + J)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'j') {
        e.preventDefault();
        toggleAIPanel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleAIPanel]);

  useEffect(() => {
    if (linkedPaper) {
      setShowPdfPanel(true);
    }
  }, [linkedPaper]);

  useEffect(() => {
    let cancelled = false;

    const fetchProjectInstructionPaper = async () => {
      const enrollment = readProjectEnrollmentForDocument(documentId);
      if (!enrollment) {
        setProjectInstructionPaper(null);
        return;
      }

      try {
        await apiClient.put(`/projects/enrollments/${enrollment.id}/submission-document`, {
          documentId,
        });
        const response = await apiClient.get(`/projects/enrollments/${enrollment.id}/instruction-paper`);
        if (cancelled) return;
        const paper = response.data.data?.paper || null;
        setProjectInstructionPaper(paper);
        if (paper) setShowPdfPanel(true);
      } catch {
        if (!cancelled) setProjectInstructionPaper(null);
      }
    };

    fetchProjectInstructionPaper();

    return () => {
      cancelled = true;
    };
  }, [documentId]);

  useEffect(() => {
    const enrollment = readProjectEnrollmentForDocument(documentId);
    if (!enrollment) {
      setSubmissionSessionId(null);
      submissionSessionRef.current = null;
      return;
    }

    let cancelled = false;

    const endSubmissionSession = () => {
      const activeSession = submissionSessionRef.current;
      if (!activeSession) return;

      submissionSessionRef.current = null;
      setSubmissionSessionId(null);

      const token = TokenManager.getAccessToken();
      void fetch(
        `${API_URL}/projects/enrollments/${activeSession.projectId}/submission-sessions/${activeSession.sessionId}/end`,
        {
          method: 'PUT',
          keepalive: true,
          credentials: 'include',
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      ).catch(() => {});
    };

    const startSubmissionSession = async () => {
      try {
        const response = await apiClient.post(`/projects/enrollments/${enrollment.id}/submission-sessions`, {
          documentId,
        });

        if (cancelled) {
          const sessionId = response.data.data?.sessionId;
          if (sessionId) {
            const token = TokenManager.getAccessToken();
            await fetch(`${API_URL}/projects/enrollments/${enrollment.id}/submission-sessions/${sessionId}/end`, {
              method: 'PUT',
              keepalive: true,
              credentials: 'include',
              headers: {
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
            }).catch(() => {});
          }
          return;
        }

        const sessionId = response.data.data?.sessionId;
        if (!sessionId) return;

        submissionSessionRef.current = {
          projectId: enrollment.id,
          sessionId,
        };
        setSubmissionSessionId(sessionId);
      } catch (err) {
        console.error('Failed to start submission session:', err);
        setSubmissionSessionId(null);
        submissionSessionRef.current = null;
      }
    };

    startSubmissionSession();
    window.addEventListener('pagehide', endSubmissionSession);
    window.addEventListener('beforeunload', endSubmissionSession);

    return () => {
      cancelled = true;
      window.removeEventListener('pagehide', endSubmissionSession);
      window.removeEventListener('beforeunload', endSubmissionSession);
      endSubmissionSession();
    };
  }, [documentId]);

  const handleTitleSave = async () => {
    if (!document) return;
    try {
      await updateDocument(document.content, document.plainText || '', title);
      setIsTitleEditing(false);
      toast({ title: 'Success', description: 'Document title updated' });
    } catch {
      toast({ title: 'Error', description: 'Failed to update title', variant: 'destructive' });
    }
  };

  const handleContentChange = async (_content: Record<string, any>, plainText: string) => {
    setWordCount(calculateWordCount(plainText));
  };

  const handleAutoSave = async (content: Record<string, any>, plainText: string) => {
    try {
      await updateDocument(content, plainText);
    } catch (err) {
      console.error('Auto-save failed:', err);
    }
  };

  const handleEventsBuffer = async (events: TrackedEvent[]) => {
    const mappedEvents = events.map((event) => ({
      eventType: event.eventType,
      timestamp: event.timestamp,
      keyCode: event.keyCode,
      keyChar: event.keyChar,
      textBefore: event.textBefore,
      textAfter: event.textAfter,
      cursorPosition: event.cursorPosition,
      selectionStart: event.selectionStart,
      selectionEnd: event.selectionEnd,
      editorStateBefore: event.editorStateBefore,
      editorStateAfter: event.editorStateAfter,
      metadata: event.metadata,
    }));
    await trackEvents(mappedEvents, submissionSessionRef.current?.sessionId || submissionSessionId);
  };

  const openPanelWithQuote = useAIStore((state) => state.openPanelWithQuote);
  const handleAskAI = useCallback((selectedText: string) => openPanelWithQuote(selectedText), [openPanelWithQuote]);

  const handleEditorInsertAtCursorChange = useCallback(
    (insertAtCursor: EditorAIBridgeAPI['insertAtCursor'] | null) => {
      setEditorInsertAtCursor(() => insertAtCursor);
    },
    []
  );

  const handleInsertAssistantMessage = useCallback(
    async (
      text: string,
      source: { messageId: string; logId?: string }
    ) => {
      if (!editorInsertAtCursor) {
        toast({
          title: 'Editor unavailable',
          description: 'Open this document in the editor to insert AI text.',
          variant: 'destructive',
        });
        return;
      }

      const insertion = editorInsertAtCursor(text);
      const event = {
        eventType: 'ai_insert_from_chat',
        timestamp: new Date(),
        textAfter: text,
        cursorPosition: insertion.cursorPosition,
        selectionStart: insertion.selectionStart,
        selectionEnd: insertion.selectionEnd,
        editorStateBefore: insertion.editorStateBefore,
        editorStateAfter: insertion.editorStateAfter,
        metadata: {
          messageId: source.messageId,
          logId: source.logId,
          insertedTextLength: text.length,
        },
      };

      await trackEvents([event as any], submissionSessionRef.current?.sessionId || submissionSessionId);
      toast({ title: 'Inserted into document' });
    },
    [editorInsertAtCursor, submissionSessionId, toast, trackEvents]
  );

  const handleAISelectionAction = useCallback(
    async (
      actionType: ActionType,
      originalText: string,
      newText: string,
      replacementResult?: SelectionReplacementResult
    ) => {
      const event = {
        eventType: 'ai_selection_action',
        timestamp: new Date(),
        textBefore: originalText,
        textAfter: newText,
        cursorPosition: replacementResult?.cursorPosition,
        selectionStart: replacementResult?.selectionStart,
        selectionEnd: replacementResult?.selectionEnd,
        editorStateBefore: replacementResult?.editorStateBefore,
        editorStateAfter: replacementResult?.editorStateAfter,
        metadata: { actionType, originalText, newText },
      };
      await trackEvents([event as any], submissionSessionRef.current?.sessionId || submissionSessionId);
    },
    [submissionSessionId, trackEvents]
  );

  const handleGenerateCertificate = async (options: CertificateGenerationOptions) => {
    try {
      setIsGeneratingCertificate(true);
      const certificate = await generateCertificate(documentId, {
        certificateType: 'full_authorship',
        ...options,
      });

      toast({ title: 'Success', description: 'Certificate generated successfully' });
      setShowCertificateDialog(false);
      router.push(`/certificates/${certificate.id}`);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to generate certificate',
        variant: 'destructive',
      });
    } finally {
      setIsGeneratingCertificate(false);
    }
  };

  const handlePdfSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      validatePdfFile(file);
      setIsUploadingPdf(true);
      await uploadPdf(file, title);
      toast({
        title: 'Success',
        description: 'PDF uploaded and linked to this document.',
      });
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to upload PDF',
        variant: 'destructive',
      });
    } finally {
      setIsUploadingPdf(false);
      event.target.value = '';
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
          <p className="mt-4 text-muted-foreground">Loading document...</p>
        </div>
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-destructive">{error || 'Document not found'}</p>
          <Button onClick={() => router.push('/documents')} className="mt-4">
            Back to Documents
          </Button>
        </div>
      </div>
    );
  }

  // ✅ Overleaf-style canvas: nearly full-width with minimal padding
  // px-2 gives a tiny gutter on edges for a more spacious panel layout
  const CANVAS = 'mx-auto w-full max-w-[2400px] px-3';
  const displayPaper = projectInstructionPaper || linkedPaper;

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b bg-background shrink-0">
        <div className={`${CANVAS} py-4`}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <Button variant="ghost" size="icon" onClick={() => router.push('/documents')}>
                <ArrowLeft className="h-4 w-4" />
              </Button>

              <div className="flex-1 min-w-0">
                {isTitleEditing ? (
                  <div className="flex items-center gap-2">
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="text-lg font-semibold"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleTitleSave();
                        else if (e.key === 'Escape') {
                          setTitle(document.title || '');
                          setIsTitleEditing(false);
                        }
                      }}
                      autoFocus
                    />
                    <Button size="sm" onClick={handleTitleSave}>
                      Save
                    </Button>
                  </div>
                ) : (
                  <h1
                    className="cursor-pointer text-lg font-semibold hover:text-muted-foreground truncate"
                    onClick={() => setIsTitleEditing(true)}
                    title={title || 'Untitled Document'}
                  >
                    {title || 'Untitled Document'}
                  </h1>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
              {!displayPaper && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/pdf"
                    onChange={handlePdfSelect}
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingPdf}
                    className="sm:size-default"
                  >
                    {isUploadingPdf ? (
                      <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 sm:mr-2" />
                    )}
                    <span className="hidden sm:inline">{isUploadingPdf ? 'Uploading...' : 'Upload PDF'}</span>
                  </Button>
                </>
              )}

              {displayPaper && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPdfPanel(!showPdfPanel)}
                  title={showPdfPanel ? 'Hide PDF' : 'Show PDF'}
                >
                  {showPdfPanel ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
                  <span className="hidden sm:inline ml-1">PDF</span>
                </Button>
              )}

              {isSaving && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Clock className="h-3 w-3 animate-spin" />
                  <span className="hidden sm:inline">Saving...</span>
                </Badge>
              )}

              <div className="hidden sm:block text-sm text-muted-foreground">{wordCount} words</div>

              <AIAssistantButton isOpen={isAIPanelOpen} onClick={toggleAIPanel} />

              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/logs/${documentId}`)}
                className="sm:size-default"
              >
                <FileText className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">View Logs</span>
              </Button>

              <Button
                size="sm"
                onClick={() => setShowCertificateDialog(true)}
                disabled={isGeneratingCertificate}
                className="sm:size-default"
              >
                {isGeneratingCertificate ? (
                  <>
                    <Clock className="h-4 w-4 sm:mr-2 animate-spin" />
                    <span className="hidden sm:inline">Generating...</span>
                  </>
                ) : (
                  <>
                    <Award className="h-4 w-4 sm:mr-2" />
                    <span className="hidden sm:inline">Generate Certificate</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        <div className={`${CANVAS} h-full py-3`}>
          {/* ✅ Resizable like Overleaf */}
          <ResizablePanelGroup direction="horizontal" className="h-full w-full rounded-md border bg-background">
            {/* PDF */}
            {displayPaper && showPdfPanel ? (
              <ResizablePanel defaultSize={38} minSize={22}>
                <div className="h-full border-r bg-background overflow-hidden">
                  <PDFViewer paperId={displayPaper.id} documentId={documentId} onCommentAdd={() => {}} comments={[]} />
                </div>
              </ResizablePanel>
            ) : null}

            {displayPaper && showPdfPanel ? <ResizableHandle withHandle /> : null}

            {/* Editor */}
            <ResizablePanel
              defaultSize={displayPaper && showPdfPanel ? (isAIPanelOpen ? 37 : 62) : (isAIPanelOpen ? 70 : 100)}
              minSize={30}
            >
              <div className="h-full overflow-auto">
                <div className={`${displayPaper || isAIPanelOpen ? 'px-4 py-4' : 'px-6 py-6'} h-full`}>
                  {!displayPaper && (
                    <div className="mb-4 rounded-lg border border-dashed border-border bg-muted/30 p-4">
                      <div>
                        <div>
                          <h2 className="text-sm font-semibold">No PDF linked</h2>
                          <p className="text-sm text-muted-foreground">
                            You can keep writing here and upload the source PDF later for side-by-side review.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  <LexicalEditor
                    documentId={documentId}
                    userId={user?.id}
                    initialContent={document.content}
                    placeholder={displayPaper ? 'Write your review here...' : 'Start typing your document...'}
                    trackingEnabled={true}
                    autoSaveEnabled={true}
                    autoSaveInterval={30000}
                    onContentChange={handleContentChange}
                    onEventsBuffer={handleEventsBuffer}
                    onAutoSave={handleAutoSave}
                    className="h-full"
                    renderSelectionPopup={({ selection, onClose, replaceSelection, cancelAIAction, undoLastAction }) => (
                      <AISelectionMenu
                        documentId={documentId}
                        selection={selection}
                        onClose={onClose}
                        replaceSelection={replaceSelection}
                        cancelAIAction={cancelAIAction}
                        undoLastAction={undoLastAction}
                        onActionApplied={handleAISelectionAction}
                        onAskAI={(text) => {
                          onClose();
                          handleAskAI(text);
                        }}
                        getDocumentPlainText={() => document?.plainText || ''}
                        documentTitle={document?.title || ''}
                        registerActionTrigger={(trigger) => {
                          quickActionTriggerRef.current = trigger;
                        }}
                      />
                    )}
                    renderAIBridge={({ insertAtCursor }) => (
                      <EditorAIBridgeCapture
                        insertAtCursor={insertAtCursor}
                        onInsertAtCursorChange={handleEditorInsertAtCursorChange}
                      />
                    )}
                  />
                </div>
              </div>
            </ResizablePanel>

            {/* AI */}
            {isAIPanelOpen ? (
              <>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={25} minSize={18}>
                  <div className="h-full border-l bg-background overflow-hidden">
                    <AIAssistantPanel
                      documentId={documentId}
                      onClose={closeAIPanel}
                      insertAtCursor={editorInsertAtCursor ? handleInsertAssistantMessage : null}
                    />
                  </div>
                </ResizablePanel>
              </>
            ) : null}
          </ResizablePanelGroup>
        </div>
      </div>

      <CertificateGenerationDialog
        open={showCertificateDialog}
        onOpenChange={setShowCertificateDialog}
        onGenerate={handleGenerateCertificate}
        isGenerating={isGeneratingCertificate}
      />
    </div>
  );
}
