import { LexicalEditor, EditorState, $getRoot, $getSelection, $isRangeSelection, COMMAND_PRIORITY_LOW, COMMAND_PRIORITY_HIGH, KEY_DOWN_COMMAND, PASTE_COMMAND, COPY_COMMAND, CUT_COMMAND, SELECTION_CHANGE_COMMAND, FOCUS_COMMAND, BLUR_COMMAND, INDENT_CONTENT_COMMAND, OUTDENT_CONTENT_COMMAND, FORMAT_TEXT_COMMAND, TextFormatType } from 'lexical';
import { buildCopiedTextEventMetadata, EventType } from '@humanly/shared';
import { EditorTrackerConfig, EventMetadata, TrackedEvent } from '../types';
import {
  HEADING_CHANGE_COMMAND,
  FONT_FAMILY_CHANGE_COMMAND,
  FONT_SIZE_CHANGE_COMMAND,
  TEXT_COLOR_CHANGE_COMMAND,
  HIGHLIGHT_COLOR_CHANGE_COMMAND,
  LIST_CREATE_COMMAND,
  LIST_DELETE_COMMAND,
  LIST_ITEM_CHECK_COMMAND,
  ALIGNMENT_CHANGE_COMMAND,
  TRACKING_TEXT_CHANGE_METADATA_COMMAND,
  TRACKING_SUPPRESS_NEXT_TEXT_CHANGE_COMMAND,
} from '../commands/formatting-commands';

type EditorFocusState = 'unknown' | 'focused' | 'blurred';

/**
 * EditorTracker handles keystroke tracking and event batching for Lexical editor
 */
export class EditorTracker {
  private editor: LexicalEditor;
  private config: EditorTrackerConfig;
  private eventBuffer: TrackedEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private listeners: Array<() => void> = [];
  private flushPromise: Promise<void> | null = null;
  private isTracking: boolean = false;
  private lastEventType: EventType | null = null;
  private lastKeyCode: string | null = null;
  private lastKeyChar: string | null = null;
  private lastSelectionStart: number = 0;
  private lastSelectionEnd: number = 0;
  private lastSelectedText: string = '';
  private pendingTextChangeMetadata: EventMetadata | null = null;
  private suppressNextTextChange: boolean = false;
  private lastPageHiddenAt: number | null = null;
  private lastVisibilityState: string | null = null;
  private workspaceVisibilityState: 'visible' | 'hidden' = 'visible';
  private editorFocusState: EditorFocusState = 'unknown';
  private pendingWindowBlurTimer: ReturnType<typeof setTimeout> | null = null;
  private trackingStartedAt: number | null = null;

  private get copyPastePolicy() {
    return this.config.copyPastePolicy === 'blocked' ? 'blocked' : 'allowed';
  }

  private shouldBlockClipboard(): boolean {
    return this.copyPastePolicy === 'blocked';
  }

  private shouldTrackClipboard(): boolean {
    return !this.shouldBlockClipboard();
  }

  private setPendingTextChangeMetadata(metadata: EventMetadata): void {
    this.pendingTextChangeMetadata = {
      ...(this.pendingTextChangeMetadata || {}),
      ...metadata,
    };
  }

  private buildTextChangeMetadata(metadata?: EventMetadata): EventMetadata | undefined {
    const nextMetadata: EventMetadata = {};

    if (metadata) {
      Object.assign(nextMetadata, metadata);
    }

    if (this.pendingTextChangeMetadata) {
      Object.assign(nextMetadata, this.pendingTextChangeMetadata);
      this.pendingTextChangeMetadata = null;
    }

    return Object.keys(nextMetadata).length > 0 ? nextMetadata : undefined;
  }

  constructor(editor: LexicalEditor, config: EditorTrackerConfig) {
    this.editor = editor;
    this.config = {
      batchSize: 20,
      flushInterval: 30000, // 30 seconds
      enabled: true,
      ...config,
    };
  }

  /**
   * Start tracking editor events
   */
  start(): void {
    if (this.isTracking || !this.config.enabled) {
      return;
    }

    this.isTracking = true;
    this.trackingStartedAt = Date.now();

    // Track keydown events
    const removeKeyDownListener = this.editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event: KeyboardEvent) => {
        this.handleKeyDown(event);
        return false; // Don't prevent default
      },
      COMMAND_PRIORITY_LOW
    );

    // Track paste events
    const removePasteListener = this.editor.registerCommand(
      PASTE_COMMAND,
      (event: ClipboardEvent | null) => {
        if (this.shouldBlockClipboard()) {
          this.trackBlockedCopyPasteAttempt('paste', event?.clipboardData?.getData('text/plain')?.length || 0);
          event?.preventDefault();
          return true;
        }

        if (this.shouldTrackClipboard()) {
          this.lastEventType = 'paste';
        }

        return false; // Don't prevent default
      },
      COMMAND_PRIORITY_HIGH
    );

    // Track copy events
    const removeCopyListener = this.editor.registerCommand(
      COPY_COMMAND,
      (event: ClipboardEvent | null) => {
        if (this.shouldBlockClipboard()) {
          this.trackBlockedCopyPasteAttempt('copy');
          event?.preventDefault();
          return true;
        }

        if (this.shouldTrackClipboard()) {
          this.trackCopyOrCut('copy');
        }

        return false;
      },
      COMMAND_PRIORITY_HIGH
    );

    // Track cut events
    const removeCutListener = this.editor.registerCommand(
      CUT_COMMAND,
      (event: ClipboardEvent | null) => {
        if (this.shouldBlockClipboard()) {
          this.trackBlockedCopyPasteAttempt('cut');
          event?.preventDefault();
          return true;
        }

        if (this.shouldTrackClipboard()) {
          this.lastEventType = 'cut';
        }

        return false;
      },
      COMMAND_PRIORITY_HIGH
    );

    // Track selection changes
    const removeSelectionListener = this.editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        this.handleSelectionChange();
        return false;
      },
      COMMAND_PRIORITY_LOW
    );

    // Track focus events
    const removeFocusListener = this.editor.registerCommand(
      FOCUS_COMMAND,
      () => {
        this.recordEditorFocusChange('focus');
        return false;
      },
      COMMAND_PRIORITY_LOW
    );

    // Track blur events
    const removeBlurListener = this.editor.registerCommand(
      BLUR_COMMAND,
      () => {
        this.recordEditorFocusChange('blur');
        return false;
      },
      COMMAND_PRIORITY_LOW
    );

    // Track text format changes (bold, italic, underline, etc.) - HIGH priority
    const removeFormatTextListener = this.editor.registerCommand(
      FORMAT_TEXT_COMMAND,
      (format: TextFormatType) => {
        this.trackTextFormat(format);
        return false;
      },
      COMMAND_PRIORITY_HIGH
    );

    // Track heading changes (HIGH priority to run before command is consumed)
    const removeHeadingListener = this.editor.registerCommand(
      HEADING_CHANGE_COMMAND,
      (payload) => {
        this.trackHeadingChange(payload);
        return false;
      },
      COMMAND_PRIORITY_HIGH
    );

    // Track font family changes (HIGH priority to run before command is consumed)
    const removeFontFamilyListener = this.editor.registerCommand(
      FONT_FAMILY_CHANGE_COMMAND,
      (payload) => {
        this.trackFormattingChange('font-family-change', { fontFamily: payload.fontFamily });
        return false;
      },
      COMMAND_PRIORITY_HIGH
    );

    // Track font size changes (HIGH priority to run before command is consumed)
    const removeFontSizeListener = this.editor.registerCommand(
      FONT_SIZE_CHANGE_COMMAND,
      (payload) => {
        this.trackFormattingChange('font-size-change', { fontSize: payload.fontSize });
        return false;
      },
      COMMAND_PRIORITY_HIGH
    );

    // Track text color changes (HIGH priority to run before command is consumed)
    const removeTextColorListener = this.editor.registerCommand(
      TEXT_COLOR_CHANGE_COMMAND,
      (payload) => {
        this.trackFormattingChange('text-color-change', { textColor: payload.color });
        return false;
      },
      COMMAND_PRIORITY_HIGH
    );

    // Track highlight color changes (HIGH priority to run before command is consumed)
    const removeHighlightColorListener = this.editor.registerCommand(
      HIGHLIGHT_COLOR_CHANGE_COMMAND,
      (payload) => {
        this.trackFormattingChange('highlight-color-change', { highlightColor: payload.color });
        return false;
      },
      COMMAND_PRIORITY_HIGH
    );

    // Track list create (HIGH priority to run before command is consumed)
    const removeListCreateListener = this.editor.registerCommand(
      LIST_CREATE_COMMAND,
      (payload) => {
        this.trackFormattingChange('list-create', { listType: payload.listType });
        return false;
      },
      COMMAND_PRIORITY_HIGH
    );

    // Track list delete (HIGH priority to run before command is consumed)
    const removeListDeleteListener = this.editor.registerCommand(
      LIST_DELETE_COMMAND,
      () => {
        this.trackFormattingChange('list-delete', {});
        return false;
      },
      COMMAND_PRIORITY_HIGH
    );

    // Track content indent (HIGH priority to run before command is consumed)
    const removeListIndentListener = this.editor.registerCommand(
      INDENT_CONTENT_COMMAND,
      () => {
        this.trackFormattingChange('list-indent', {});
        return false;
      },
      COMMAND_PRIORITY_HIGH
    );

    // Track content outdent (HIGH priority to run before command is consumed)
    const removeListOutdentListener = this.editor.registerCommand(
      OUTDENT_CONTENT_COMMAND,
      () => {
        this.trackFormattingChange('list-outdent', {});
        return false;
      },
      COMMAND_PRIORITY_HIGH
    );

    // Track list item check (HIGH priority to run before command is consumed)
    const removeListItemCheckListener = this.editor.registerCommand(
      LIST_ITEM_CHECK_COMMAND,
      (payload) => {
        this.trackFormattingChange('list-item-check', { listItemChecked: payload.checked });
        return false;
      },
      COMMAND_PRIORITY_HIGH
    );

    // Track alignment changes (HIGH priority to run before command is consumed)
    const removeAlignmentListener = this.editor.registerCommand(
      ALIGNMENT_CHANGE_COMMAND,
      (payload) => {
        this.trackFormattingChange('alignment-change', {
          alignment: payload.alignment,
          previousAlignment: payload.previousAlignment
        });
        return false;
      },
      COMMAND_PRIORITY_HIGH
    );

    const removeTrackingTextChangeMetadataListener = this.editor.registerCommand(
      TRACKING_TEXT_CHANGE_METADATA_COMMAND,
      (metadata) => {
        this.setPendingTextChangeMetadata(metadata);
        return false;
      },
      COMMAND_PRIORITY_HIGH
    );

    const removeTrackingSuppressNextTextChangeListener = this.editor.registerCommand(
      TRACKING_SUPPRESS_NEXT_TEXT_CHANGE_COMMAND,
      (suppress = true) => {
        this.suppressNextTextChange = suppress !== false;
        return false;
      },
      COMMAND_PRIORITY_HIGH
    );

    // Track editor updates (text changes)
    const removeUpdateListener = this.editor.registerUpdateListener(
      ({ editorState, prevEditorState, dirtyElements, dirtyLeaves }) => {
        if (dirtyElements.size > 0 || dirtyLeaves.size > 0) {
          this.trackTextChange(prevEditorState, editorState);
        }
      }
    );
    const removePageVisibilityListener = this.registerPageVisibilityListener();
    const removeEditorFocusListener = this.registerEditorFocusListener();

    this.listeners.push(
      removeKeyDownListener,
      removePasteListener,
      removeCopyListener,
      removeCutListener,
      removeSelectionListener,
      removeFocusListener,
      removeBlurListener,
      removeFormatTextListener,
      removeHeadingListener,
      removeFontFamilyListener,
      removeFontSizeListener,
      removeTextColorListener,
      removeHighlightColorListener,
      removeListCreateListener,
      removeListDeleteListener,
      removeListIndentListener,
      removeListOutdentListener,
      removeListItemCheckListener,
      removeAlignmentListener,
      removeTrackingTextChangeMetadataListener,
      removeTrackingSuppressNextTextChangeListener,
      removeUpdateListener
    );
    if (removePageVisibilityListener) {
      this.listeners.push(removePageVisibilityListener);
    }
    if (removeEditorFocusListener) {
      this.listeners.push(removeEditorFocusListener);
    }

    this.restorePendingWorkspaceReturn();

    // Start flush timer
    this.scheduleFlush();
  }

  /**
   * Stop tracking and flush remaining events
   */
  stop(): void {
    if (!this.isTracking) {
      return;
    }

    if (this.shouldTrackStopAsWorkspaceExit()) {
      this.markWorkspaceHidden('tracker_stop');
    }

    this.isTracking = false;
    this.trackingStartedAt = null;
    this.editorFocusState = 'unknown';

    // Remove all listeners
    this.listeners.forEach((remove) => remove());
    this.listeners = [];

    // Clear timer
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.pendingWindowBlurTimer) {
      clearTimeout(this.pendingWindowBlurTimer);
      this.pendingWindowBlurTimer = null;
    }

    // Flush remaining events. React cleanup cannot await this, so failures are
    // retained in the buffer for any explicit retry path that still has access.
    void this.flush().catch(() => undefined);
  }

  async flushPendingEvents(): Promise<void> {
    while (true) {
      if (this.flushPromise) {
        await this.flushPromise;
        continue;
      }

      if (this.eventBuffer.length === 0) {
        return;
      }

      await this.flush();
    }
  }

  async markWorkspaceExit(source: string, metadata?: EventMetadata): Promise<void> {
    const previousBuffer = [...this.eventBuffer];
    const previousWorkspaceVisibilityState = this.workspaceVisibilityState;
    const previousLastPageHiddenAt = this.lastPageHiddenAt;
    const didMarkHidden = this.markWorkspaceHidden(source, metadata);

    try {
      await this.flushPendingEvents();
    } catch (error) {
      if (didMarkHidden) {
        this.eventBuffer = previousBuffer;
        this.workspaceVisibilityState = previousWorkspaceVisibilityState;
        this.lastPageHiddenAt = previousLastPageHiddenAt;
        if (previousWorkspaceVisibilityState === 'visible') {
          this.clearPersistedWorkspaceHidden();
        }
      }
      throw error;
    }
  }

  /**
   * Handle keydown events
   */
  private handleKeyDown(event: KeyboardEvent): void {
    const key = event.key;

    // Capture key information
    this.lastKeyCode = event.code;
    this.lastKeyChar = key.length === 1 ? key : null; // Only single characters

    // Determine event type based on key
    if (key === 'Backspace' || key === 'Delete') {
      this.lastEventType = 'delete';
    } else if (event.ctrlKey || event.metaKey) {
      // Ignore meta/ctrl key combinations (they're handled by other commands)
      return;
    } else {
      this.lastEventType = 'keydown';
    }
  }

  /**
   * Handle selection changes
   */
  private handleSelectionChange(): void {
    this.editor.getEditorState().read(() => {
      const selection = $getSelection();

      if (!selection || !$isRangeSelection(selection)) {
        return;
      }

      const anchor = selection.anchor;
      const focus = selection.focus;
      const selectionStart = Math.min(anchor.offset, focus.offset);
      const selectionEnd = Math.max(anchor.offset, focus.offset);
      const selectedText = selection.getTextContent();

      // Only track if selection actually changed
      if (
        selectionStart !== this.lastSelectionStart ||
        selectionEnd !== this.lastSelectionEnd ||
        selectedText !== this.lastSelectedText
      ) {
        // Only track as 'select' event if there's an actual selection (not just cursor movement)
        if (selectedText) {
          const currentText = this.extractPlainText(this.editor.getEditorState());

          const event: TrackedEvent = {
            eventType: 'select',
            timestamp: new Date(),
            textBefore: currentText,
            textAfter: currentText,
            cursorPosition: anchor.offset,
            selectionStart,
            selectionEnd,
            editorStateAfter: this.editor.getEditorState().toJSON(),
            metadata: {
              selectedText: selectedText || undefined,
            },
          };

          this.addEvent(event);
        }

        this.lastSelectionStart = selectionStart;
        this.lastSelectionEnd = selectionEnd;
        this.lastSelectedText = selectedText;
      }
    });
  }

  /**
   * Track copy or cut events
   */
  private trackCopyOrCut(eventType: 'copy' | 'cut'): void {
    this.editor.getEditorState().read(() => {
      const currentText = this.extractPlainText(this.editor.getEditorState());
      const { cursorPosition, selectionStart, selectionEnd } = this.getSelectionInfo(this.editor.getEditorState());
      const selectedText = this.getSelectedText(this.editor.getEditorState());
      const copyMetadata = eventType === 'copy'
        ? buildCopiedTextEventMetadata(selectedText)
        : undefined;
      const metadata = {
        ...(copyMetadata || {}),
        selectedText: selectedText || undefined,
        selectedCharacterCount: selectedText.length,
      };

      const event: TrackedEvent = {
        eventType,
        timestamp: new Date(),
        textBefore: currentText,
        textAfter: currentText,
        cursorPosition,
        selectionStart,
        selectionEnd,
        editorStateAfter: this.editor.getEditorState().toJSON(),
        metadata,
      };

      this.addEvent(event);
    });
  }

  /**
   * Track copy/cut/paste attempts blocked by the active writing policy.
   */
  private trackBlockedCopyPasteAttempt(action: 'copy' | 'cut' | 'paste', attemptedTextLength = 0): void {
    this.editor.getEditorState().read(() => {
      const currentText = this.extractPlainText(this.editor.getEditorState());
      const { cursorPosition, selectionStart, selectionEnd } = this.getSelectionInfo(this.editor.getEditorState());
      const selectedText = this.getSelectedText(this.editor.getEditorState());

      const event: TrackedEvent = {
        eventType: 'blocked_copy_paste_attempt',
        timestamp: new Date(),
        textBefore: currentText,
        textAfter: currentText,
        cursorPosition,
        selectionStart,
        selectionEnd,
        editorStateAfter: this.editor.getEditorState().toJSON(),
        metadata: {
          action,
          policy: 'blocked',
          selectedCharacterCount: selectedText.length,
          attemptedTextLength: action === 'paste' ? attemptedTextLength : undefined,
        },
      };

      this.addEvent(event);
    });
  }

  /**
   * Track focus or blur events
   */
  private recordEditorFocusChange(eventType: 'focus' | 'blur'): void {
    if (!this.isTracking) {
      return;
    }

    const nextFocusState: EditorFocusState = eventType === 'focus' ? 'focused' : 'blurred';
    if (this.editorFocusState === nextFocusState) {
      return;
    }

    this.editorFocusState = nextFocusState;
    this.trackFocusBlur(eventType);
  }

  private trackFocusBlur(eventType: 'focus' | 'blur'): void {
    const currentText = this.extractPlainText(this.editor.getEditorState());
    const { cursorPosition, selectionStart, selectionEnd } = this.getSelectionInfo(this.editor.getEditorState());

    const event: TrackedEvent = {
      eventType,
      timestamp: new Date(),
      textBefore: currentText,
      textAfter: currentText,
      cursorPosition,
      selectionStart,
      selectionEnd,
      editorStateAfter: this.editor.getEditorState().toJSON(),
    };

    this.addEvent(event);
  }

  private registerEditorFocusListener(): (() => void) | null {
    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') {
      return null;
    }

    const handleRootFocus = () => this.recordEditorFocusChange('focus');
    const handleRootBlur = () => this.recordEditorFocusChange('blur');
    const handleDocumentPointerDown = (event: PointerEvent) => {
      if (!this.isTracking || this.editorFocusState !== 'focused') {
        return;
      }

      const rootElement = this.editor.getRootElement();
      const target = event.target;
      if (!rootElement || !target || rootElement.contains(target as Node)) {
        return;
      }

      if (typeof rootElement.blur === 'function') {
        rootElement.blur();
      }

      // Some non-focusable document surfaces do not naturally blur the
      // contenteditable root, so make the activity log state explicit.
      this.recordEditorFocusChange('blur');
    };

    const removeRootListener = this.editor.registerRootListener((rootElement, prevRootElement) => {
      if (prevRootElement) {
        prevRootElement.removeEventListener('focus', handleRootFocus);
        prevRootElement.removeEventListener('blur', handleRootBlur);
      }

      if (rootElement) {
        rootElement.addEventListener('focus', handleRootFocus);
        rootElement.addEventListener('blur', handleRootBlur);

        if (document.activeElement === rootElement) {
          this.recordEditorFocusChange('focus');
        }
      }
    });

    document.addEventListener('pointerdown', handleDocumentPointerDown, true);

    return () => {
      removeRootListener();
      document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
    };
  }

  private registerPageVisibilityListener(): (() => void) | null {
    if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') {
      return null;
    }

    this.lastVisibilityState = document.visibilityState || null;
    this.workspaceVisibilityState = this.lastVisibilityState === 'hidden' ? 'hidden' : 'visible';
    const handleVisibilityChange = () => this.handlePageVisibilityChange();
    const handlePageHide = () => this.markWorkspaceHidden('pagehide');
    const handlePageShow = () => this.markWorkspaceVisible('pageshow');
    const handleWindowBlur = () => this.handleWindowBlur();
    const handleWindowFocus = () => this.handleWindowFocus();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('pagehide', handlePageHide);
      window.addEventListener('pageshow', handlePageShow);
      window.addEventListener('blur', handleWindowBlur);
      window.addEventListener('focus', handleWindowFocus);
    }

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('pagehide', handlePageHide);
        window.removeEventListener('pageshow', handlePageShow);
        window.removeEventListener('blur', handleWindowBlur);
        window.removeEventListener('focus', handleWindowFocus);
      }
      if (this.pendingWindowBlurTimer) {
        clearTimeout(this.pendingWindowBlurTimer);
        this.pendingWindowBlurTimer = null;
      }
    };
  }

  private handlePageVisibilityChange(): void {
    if (!this.isTracking || typeof document === 'undefined') {
      return;
    }

    const visibilityState = document.visibilityState || 'visible';
    if (visibilityState === this.lastVisibilityState) {
      return;
    }

    this.lastVisibilityState = visibilityState;

    if (visibilityState === 'hidden') {
      this.markWorkspaceHidden('visibilitychange');
      return;
    }

    this.markWorkspaceVisible('visibilitychange');
  }

  private handleWindowBlur(): void {
    if (!this.isTracking || typeof window === 'undefined') {
      return;
    }

    if (this.pendingWindowBlurTimer) {
      clearTimeout(this.pendingWindowBlurTimer);
    }

    this.pendingWindowBlurTimer = setTimeout(() => {
      this.pendingWindowBlurTimer = null;

      if (!this.isTracking) {
        return;
      }

      const hasFocus = typeof document !== 'undefined' && typeof document.hasFocus === 'function'
        ? document.hasFocus()
        : true;

      if (!hasFocus || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) {
        this.markWorkspaceHidden('window_blur');
      }
    }, 100);
  }

  private handleWindowFocus(): void {
    if (this.pendingWindowBlurTimer) {
      clearTimeout(this.pendingWindowBlurTimer);
      this.pendingWindowBlurTimer = null;
    }

    this.markWorkspaceVisible('window_focus');
  }

  private markWorkspaceHidden(source: string, metadata?: EventMetadata): boolean {
    if (!this.isTracking || this.workspaceVisibilityState === 'hidden') {
      return false;
    }

    this.workspaceVisibilityState = 'hidden';
    this.trackPageVisibility('page_hidden', this.getCurrentVisibilityState(), source, metadata);
    void this.flush().catch(() => undefined);
    return true;
  }

  private markWorkspaceVisible(source: string, metadata?: EventMetadata): void {
    if (!this.isTracking || this.workspaceVisibilityState === 'visible') {
      return;
    }

    this.workspaceVisibilityState = 'visible';
    this.trackPageVisibility('page_visible', this.getCurrentVisibilityState(), source, metadata);
    void this.flush().catch(() => undefined);
  }

  private getCurrentVisibilityState(): string {
    return typeof document !== 'undefined' ? document.visibilityState || 'visible' : 'visible';
  }

  private trackPageVisibility(
    eventType: 'page_hidden' | 'page_visible',
    visibilityState: string,
    source: string,
    additionalMetadata?: EventMetadata
  ): void {
    const now = Date.now();
    const currentText = this.extractPlainText(this.editor.getEditorState());
    const { cursorPosition, selectionStart, selectionEnd } = this.getSelectionInfo(this.editor.getEditorState());
    const metadata: EventMetadata = {
      ...(additionalMetadata || {}),
      visibilityState,
      source,
      documentHidden: typeof document !== 'undefined' ? document.hidden : undefined,
      windowFocused: typeof document !== 'undefined' && typeof document.hasFocus === 'function'
        ? document.hasFocus()
        : undefined,
    };

    if (eventType === 'page_hidden') {
      this.lastPageHiddenAt = now;
      this.persistWorkspaceHidden(now, source);
    } else if (this.lastPageHiddenAt !== null) {
      metadata.hiddenDurationMs = Math.max(0, now - this.lastPageHiddenAt);
      this.lastPageHiddenAt = null;
      this.clearPersistedWorkspaceHidden();
    }

    const event: TrackedEvent = {
      eventType,
      timestamp: new Date(now),
      textBefore: currentText,
      textAfter: currentText,
      cursorPosition,
      selectionStart,
      selectionEnd,
      editorStateAfter: this.editor.getEditorState().toJSON(),
      metadata,
    };

    this.addEvent(event);
  }

  private shouldTrackStopAsWorkspaceExit(): boolean {
    if (!this.isTracking || this.workspaceVisibilityState === 'hidden') {
      return false;
    }

    if (this.trackingStartedAt === null) {
      return false;
    }

    // React StrictMode intentionally mounts and unmounts effects once in
    // development. A short guard prevents that probe from creating fake
    // workspace-leave events while still capturing real route exits.
    return Date.now() - this.trackingStartedAt > 1000;
  }

  private restorePendingWorkspaceReturn(): void {
    if (!this.isTracking || this.getCurrentVisibilityState() === 'hidden') {
      return;
    }

    const hidden = this.readPersistedWorkspaceHidden();
    if (hidden === null) {
      return;
    }

    this.lastPageHiddenAt = hidden.hiddenAt;
    this.workspaceVisibilityState = 'hidden';
    this.markWorkspaceVisible('tracker_start', hidden.source ? { hiddenSource: hidden.source } : undefined);
  }

  private getWorkspaceLifecycleStorageKey(): string {
    return `humanly:workspace-lifecycle:${this.config.documentId}`;
  }

  private getWorkspaceLifecycleStorage(): Storage | null {
    if (typeof window === 'undefined') {
      return null;
    }

    try {
      return window.localStorage || null;
    } catch {
      return null;
    }
  }

  private readPersistedWorkspaceHidden(): { hiddenAt: number; source?: string } | null {
    const storage = this.getWorkspaceLifecycleStorage();
    if (!storage) {
      return null;
    }

    try {
      const stored = storage.getItem(this.getWorkspaceLifecycleStorageKey());
      if (!stored) {
        return null;
      }

      const parsed = JSON.parse(stored) as { hiddenAt?: unknown };
      if (typeof parsed.hiddenAt !== 'number' || !Number.isFinite(parsed.hiddenAt)) {
        return null;
      }

      return {
        hiddenAt: parsed.hiddenAt,
        source: typeof (parsed as { source?: unknown }).source === 'string'
          ? (parsed as { source: string }).source
          : undefined,
      };
    } catch {
      return null;
    }
  }

  private persistWorkspaceHidden(hiddenAt: number, source: string): void {
    const storage = this.getWorkspaceLifecycleStorage();
    if (!storage) {
      return;
    }

    try {
      storage.setItem(
        this.getWorkspaceLifecycleStorageKey(),
        JSON.stringify({ hiddenAt, source })
      );
    } catch {
      // Local storage can be unavailable in private or embedded contexts.
    }
  }

  private clearPersistedWorkspaceHidden(): void {
    const storage = this.getWorkspaceLifecycleStorage();
    if (!storage) {
      return;
    }

    try {
      storage.removeItem(this.getWorkspaceLifecycleStorageKey());
    } catch {
      // Local storage can be unavailable in private or embedded contexts.
    }
  }

  /**
   * Track text format changes (bold, italic, underline, etc.)
   */
  private trackTextFormat(format: TextFormatType): void {
    const currentText = this.extractPlainText(this.editor.getEditorState());
    const { cursorPosition, selectionStart, selectionEnd } = this.getSelectionInfo(this.editor.getEditorState());

    const selectedText = this.getSelectedText(this.editor.getEditorState());

    const event: TrackedEvent = {
      eventType: format as EventType,
      timestamp: new Date(),
      textBefore: currentText,
      textAfter: currentText,
      cursorPosition,
      selectionStart,
      selectionEnd,
      editorStateAfter: this.editor.getEditorState().toJSON(),
      metadata: {
        formatType: format,
        selectedText: selectedText || undefined,
      },
    };

    this.addEvent(event);
  }

  /**
   * Track heading changes
   */
  private trackHeadingChange(payload: { level: 1 | 2 | 3 | 4 | 5 | 6 | null; previousLevel?: 1 | 2 | 3 | 4 | 5 | 6 | null }): void {
    const currentText = this.extractPlainText(this.editor.getEditorState());
    const { cursorPosition, selectionStart, selectionEnd } = this.getSelectionInfo(this.editor.getEditorState());

    const event: TrackedEvent = {
      eventType: 'heading-change',
      timestamp: new Date(),
      textBefore: currentText,
      textAfter: currentText,
      cursorPosition,
      selectionStart,
      selectionEnd,
      editorStateAfter: this.editor.getEditorState().toJSON(),
      metadata: {
        headingLevel: payload.level || undefined,
        previousHeadingLevel: payload.previousLevel,
      },
    };

    this.addEvent(event);
  }

  /**
   * Track formatting changes (font, size, color)
   */
  private trackFormattingChange(eventType: EventType, metadata: Record<string, any>): void {
    const currentText = this.extractPlainText(this.editor.getEditorState());
    const { cursorPosition, selectionStart, selectionEnd } = this.getSelectionInfo(this.editor.getEditorState());

    const event: TrackedEvent = {
      eventType,
      timestamp: new Date(),
      textBefore: currentText,
      textAfter: currentText,
      cursorPosition,
      selectionStart,
      selectionEnd,
      editorStateAfter: this.editor.getEditorState().toJSON(),
      metadata,
    };

    this.addEvent(event);
  }

  /**
   * Track a text change in the editor
   */
  private trackTextChange(prevState: EditorState, currentState: EditorState): void {
    const prevText = this.extractPlainText(prevState);
    const currentText = this.extractPlainText(currentState);

    // Only track if text actually changed
    if (prevText === currentText) {
      return;
    }

    if (this.suppressNextTextChange) {
      this.suppressNextTextChange = false;
      this.pendingTextChangeMetadata = null;
      this.lastEventType = null;
      this.lastKeyCode = null;
      this.lastKeyChar = null;
      return;
    }

    const { cursorPosition, selectionStart, selectionEnd } = this.getSelectionInfo(currentState);
    const selectedTextBeforeChange = this.getSelectedText(prevState);

    // Determine the event type based on the last recorded event
    let eventType: EventType = this.lastEventType || 'input';

    // Capture key info before resetting
    const keyCode = this.lastKeyCode;
    const keyChar = this.lastKeyChar;

    // Reset last event type and key info for next change
    this.lastEventType = null;
    this.lastKeyCode = null;
    this.lastKeyChar = null;

    const event: TrackedEvent = {
      eventType,
      timestamp: new Date(),
      keyCode: keyCode || undefined,
      keyChar: keyChar || undefined,
      textBefore: prevText,
      textAfter: currentText,
      cursorPosition,
      selectionStart,
      selectionEnd,
      editorStateBefore: prevState.toJSON(),
      editorStateAfter: currentState.toJSON(),
      metadata: this.buildTextChangeMetadata(
        selectedTextBeforeChange
          ? {
              selectedText: selectedTextBeforeChange,
            }
          : undefined
      ),
    };

    this.addEvent(event);
  }

  /**
   * Add event to buffer and flush if needed
   */
  private addEvent(event: TrackedEvent): void {
    this.eventBuffer.push(event);

    // Notify individual event callback
    if (this.config.onEvent) {
      this.config.onEvent(event);
    }

    if (this.eventBuffer.length >= (this.config.batchSize || 20)) {
      void this.flush().catch(() => undefined);
    }
  }

  /**
   * Flush buffered events
   */
  private flush(): Promise<void> {
    if (this.flushPromise) {
      return this.flushPromise;
    }

    if (this.eventBuffer.length === 0) {
      return Promise.resolve();
    }

    const events = [...this.eventBuffer];
    this.eventBuffer = [];

    this.flushPromise = (async () => {
      try {
        // Notify batch callback
        if (this.config.onEventsBuffer) {
          await this.config.onEventsBuffer(events);
        }
      } catch (error) {
        this.eventBuffer = [...events, ...this.eventBuffer];
        throw error;
      } finally {
        this.flushPromise = null;

        // Reset flush timer
        if (this.flushTimer) {
          clearTimeout(this.flushTimer);
          this.flushTimer = null;
        }

        this.scheduleFlush();
      }
    })();

    return this.flushPromise;
  }

  /**
   * Schedule next flush
   */
  private scheduleFlush(): void {
    if (this.flushTimer || !this.isTracking) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      void this.flush().catch(() => undefined);
    }, this.config.flushInterval || 30000);
  }

  /**
   * Extract plain text from editor state
   */
  private extractPlainText(editorState: EditorState): string {
    return editorState.read(() => {
      const root = $getRoot();
      return root.getTextContent();
    });
  }

  /**
   * Get selection information from editor state
   */
  private getSelectionInfo(editorState: EditorState): {
    cursorPosition: number;
    selectionStart: number;
    selectionEnd: number;
  } {
    return editorState.read(() => {
      const selection = $getSelection();

      if (!selection || !$isRangeSelection(selection)) {
        return {
          cursorPosition: 0,
          selectionStart: 0,
          selectionEnd: 0,
        };
      }

      const anchor = selection.anchor;
      const focus = selection.focus;

      // Calculate text offset for cursor position
      const cursorPosition = anchor.offset;
      const selectionStart = Math.min(anchor.offset, focus.offset);
      const selectionEnd = Math.max(anchor.offset, focus.offset);

      return {
        cursorPosition,
        selectionStart,
        selectionEnd,
      };
    });
  }

  private getSelectedText(editorState: EditorState): string {
    return editorState.read(() => {
      const selection = $getSelection();

      if (!selection || !$isRangeSelection(selection)) {
        return '';
      }

      return selection.getTextContent();
    });
  }

  /**
   * Get current event buffer (for testing)
   */
  getBufferSize(): number {
    return this.eventBuffer.length;
  }

  /**
   * Manually flush events (for testing or forced save)
   */
  forceFlush(): Promise<void> {
    return this.flushPendingEvents();
  }
}
