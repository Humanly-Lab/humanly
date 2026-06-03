import React from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { TabIndentationPlugin } from '@lexical/react/LexicalTabIndentationPlugin';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { MarkdownShortcutPlugin } from '@lexical/react/LexicalMarkdownShortcutPlugin';
import { TablePlugin } from '@lexical/react/LexicalTablePlugin';
import { HorizontalRulePlugin } from '@lexical/react/LexicalHorizontalRulePlugin';
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $insertNodes,
  $isRangeSelection,
  $parseSerializedNode,
  COMMAND_PRIORITY_HIGH,
  COMMAND_PRIORITY_LOW,
  EditorState,
  KEY_DOWN_COMMAND,
  PASTE_COMMAND,
  type LexicalNode,
  type SerializedLexicalNode,
} from 'lexical';
import { TrackingPlugin } from './plugins/tracking-plugin';
import { ToolbarPlugin } from './plugins/toolbar-plugin';
import { AutoSavePlugin } from './plugins/auto-save-plugin';
import { HeadingPlugin } from './plugins/heading-plugin';
import { FormattingPlugin } from './plugins/formatting-plugin';
import { ListPlugin } from './plugins/list-plugin';
import { AlignmentPlugin } from './plugins/alignment-plugin';
import { SelectionPopupPlugin } from './plugins/selection-popup-plugin';
import { LexicalEditorProps, EditorTheme, EditorInsertResult } from './types';
import { TRACKING_TEXT_CHANGE_METADATA_COMMAND } from './commands/formatting-commands';
import {
  createSerializedMarkdownNodes,
  editorNodes,
  looksLikeMarkdown,
  markdownShortcutTransformers,
} from './markdown/common-markdown';

/**
 * Default editor theme
 * Note: These are CSS class names that should be defined in your application's CSS
 */
const defaultTheme: EditorTheme = {
  paragraph: 'mb-2',
  link: 'editor-link',
  code: 'editor-code-block',
  table: 'editor-table',
  tableRow: 'editor-table-row',
  tableCell: 'editor-table-cell',
  tableCellHeader: 'editor-table-cell-header',
  text: {
    bold: 'font-bold',
    italic: 'italic',
    underline: 'underline',
    strikethrough: 'line-through',
    code: 'bg-gray-100 px-1 py-0.5 rounded font-mono text-sm',
  },
  heading: {
    h1: 'text-4xl font-bold mb-3 mt-6',
    h2: 'text-3xl font-bold mb-3 mt-5',
    h3: 'text-2xl font-bold mb-2 mt-4',
    h4: 'text-xl font-semibold mb-2 mt-3',
    h5: 'text-lg font-semibold mb-2 mt-2',
    h6: 'text-base font-semibold mb-1 mt-2',
  },
  list: {
    ul: 'list-disc list-outside ml-6 mb-2',
    ol: 'list-decimal list-outside ml-6 mb-2',
    listitem: 'mb-1',
    listitemChecked: 'editor-checklist-checked',
    listitemUnchecked: 'editor-checklist-unchecked',
    nested: {
      listitem: 'list-none',
    },
  },
  quote: 'border-l-4 border-gray-300 pl-4 italic my-3',
};

function insertSerializedNodesAtSelection(serializedNodes: SerializedLexicalNode[]): void {
  const nodes = serializedNodes
    .map((serializedNode) => $parseSerializedNode(serializedNode))
    .filter((node): node is LexicalNode => Boolean(node));

  if (nodes.length > 0) {
    $insertNodes(nodes);
  }
}

interface MarkdownPastePromptPosition {
  left: number;
  top: number;
}

function getMarkdownPastePromptPosition(rootElement: HTMLElement | null): MarkdownPastePromptPosition {
  if (!rootElement || typeof window === 'undefined') {
    return { left: 16, top: 48 };
  }

  const wrapperElement = rootElement.parentElement || rootElement;
  const wrapperRect = wrapperElement.getBoundingClientRect();
  const rootRect = rootElement.getBoundingClientRect();
  const selection = window.getSelection();
  let selectionRect: DOMRect | null = null;

  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const commonAncestor = range.commonAncestorContainer;
    const selectionNode =
      commonAncestor.nodeType === Node.ELEMENT_NODE
        ? commonAncestor
        : commonAncestor.parentNode;

    if (selectionNode && rootElement.contains(selectionNode)) {
      const firstRect = range.getClientRects()[0];
      const rangeRect = firstRect || range.getBoundingClientRect();
      if (rangeRect && (rangeRect.width > 0 || rangeRect.height > 0)) {
        selectionRect = rangeRect;
      }
    }
  }

  const rawLeft = selectionRect
    ? selectionRect.left - wrapperRect.left + wrapperElement.scrollLeft
    : rootRect.left - wrapperRect.left + wrapperElement.scrollLeft + 16;
  const rawTop = selectionRect
    ? selectionRect.bottom - wrapperRect.top + wrapperElement.scrollTop + 8
    : rootRect.top - wrapperRect.top + wrapperElement.scrollTop + 48;
  const maxLeft = Math.max(16, wrapperRect.width - 376);

  return {
    left: Math.min(Math.max(16, rawLeft), maxLeft),
    top: Math.max(12, rawTop),
  };
}

interface AIBridgePluginProps {
  renderAIBridge: NonNullable<LexicalEditorProps['renderAIBridge']>;
  maxCharacters?: number | null;
  onCharacterLimitReached?: (limit: number) => void;
}

function normalizeCharacterLimit(maxCharacters?: number | null): number | null {
  if (typeof maxCharacters !== 'number' || !Number.isFinite(maxCharacters)) {
    return null;
  }

  const normalized = Math.floor(maxCharacters);
  return normalized > 0 ? normalized : null;
}

function getProjectedTextLength(incomingText: string): { currentLength: number; projectedLength: number } {
  const root = $getRoot();
  const currentLength = root.getTextContent().length;
  const selection = $getSelection();
  const selectedLength = $isRangeSelection(selection) ? selection.getTextContent().length : 0;

  return {
    currentLength,
    projectedLength: currentLength - selectedLength + incomingText.length,
  };
}

function getRemainingCharactersForInsertion(maxCharacters?: number | null): number | null {
  const limit = normalizeCharacterLimit(maxCharacters);
  if (!limit) {
    return null;
  }

  const root = $getRoot();
  const currentLength = root.getTextContent().length;
  const selection = $getSelection();
  const selectedLength = $isRangeSelection(selection) ? selection.getTextContent().length : 0;

  return limit - (currentLength - selectedLength);
}

function shouldBlockTextInsertion(incomingText: string, maxCharacters?: number | null): boolean {
  const limit = normalizeCharacterLimit(maxCharacters);
  if (!limit || incomingText.length === 0) {
    return false;
  }

  const { currentLength, projectedLength } = getProjectedTextLength(incomingText);

  // If a legacy/loaded document is already over the limit, still allow edits that reduce it.
  return projectedLength > limit && projectedLength >= currentLength;
}

function clampTextContentToLimit(limit: number): boolean {
  const root = $getRoot();
  if (root.getTextContent().length <= limit) {
    return false;
  }

  let remainingCharacters = limit;
  let changed = false;

  for (const textNode of root.getAllTextNodes()) {
    const text = textNode.getTextContent();

    if (remainingCharacters <= 0) {
      textNode.remove();
      changed = true;
      continue;
    }

    if (text.length > remainingCharacters) {
      textNode.setTextContent(text.slice(0, remainingCharacters));
      textNode.select(remainingCharacters, remainingCharacters);
      remainingCharacters = 0;
      changed = true;
      continue;
    }

    remainingCharacters -= text.length;
  }

  return changed;
}

function getBeforeInputText(event: InputEvent): string {
  if (
    event.inputType.startsWith('delete') ||
    event.inputType.startsWith('insertFromPaste') ||
    event.inputType.startsWith('history') ||
    event.inputType.startsWith('format')
  ) {
    return '';
  }

  if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') {
    return '\n';
  }

  return event.data || '';
}

interface CharacterLimitPluginProps {
  maxCharacters?: number | null;
  copyPastePolicy?: LexicalEditorProps['copyPastePolicy'];
  onCharacterLimitReached?: (limit: number) => void;
}

function CharacterLimitPlugin({
  maxCharacters,
  copyPastePolicy = 'allowed',
  onCharacterLimitReached,
}: CharacterLimitPluginProps): null {
  const [editor] = useLexicalComposerContext();
  const limit = normalizeCharacterLimit(maxCharacters);
  const isClampingTextRef = React.useRef(false);

  const notifyLimitReached = React.useCallback(() => {
    if (limit) {
      onCharacterLimitReached?.(limit);
    }
  }, [limit, onCharacterLimitReached]);

  React.useEffect(() => {
    if (!limit) {
      return;
    }

    return editor.registerUpdateListener(({ editorState }) => {
      if (isClampingTextRef.current) {
        isClampingTextRef.current = false;
        return;
      }

      let exceedsLimit = false;
      editorState.read(() => {
        exceedsLimit = $getRoot().getTextContent().length > limit;
      });

      if (!exceedsLimit) {
        return;
      }

      isClampingTextRef.current = true;
      editor.update(() => {
        if (clampTextContentToLimit(limit)) {
          notifyLimitReached();
        }
      }, { discrete: true });
    });
  }, [editor, limit, notifyLimitReached]);

  React.useEffect(() => {
    if (!limit) {
      return;
    }

    const rootElement = editor.getRootElement();
    if (!rootElement) {
      return;
    }

    const handleBeforeInput = (event: InputEvent) => {
      const incomingText = getBeforeInputText(event);
      if (!incomingText) {
        return;
      }

      editor.getEditorState().read(() => {
        if (shouldBlockTextInsertion(incomingText, limit)) {
          event.preventDefault();
          notifyLimitReached();
        }
      });
    };

    rootElement.addEventListener('beforeinput', handleBeforeInput);
    return () => {
      rootElement.removeEventListener('beforeinput', handleBeforeInput);
    };
  }, [editor, limit, notifyLimitReached]);

  React.useEffect(() => {
    if (!limit) {
      return;
    }

    const removeKeyDownListener = editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event: KeyboardEvent) => {
        if (event.metaKey || event.ctrlKey || event.altKey) {
          return false;
        }

        const incomingText =
          event.key === 'Enter'
            ? '\n'
            : event.key.length === 1
              ? event.key
              : '';

        if (!incomingText) {
          return false;
        }

        if (shouldBlockTextInsertion(incomingText, limit)) {
          event.preventDefault();
          notifyLimitReached();
          return true;
        }

        return false;
      },
      COMMAND_PRIORITY_HIGH
    );

    const removePasteListener = editor.registerCommand(
      PASTE_COMMAND,
      (event: ClipboardEvent | null) => {
        if (copyPastePolicy === 'blocked') {
          return false;
        }

        const incomingText = event?.clipboardData?.getData('text/plain') || '';
        if (!incomingText) {
          return false;
        }

        const remainingCharacters = getRemainingCharactersForInsertion(limit);
        if (remainingCharacters === null || incomingText.length <= remainingCharacters) {
          return false;
        }

        event?.preventDefault();
        notifyLimitReached();

        if (remainingCharacters <= 0) {
          return true;
        }

        const textToInsert = incomingText.slice(0, remainingCharacters);
        const root = $getRoot();
        const selection = $getSelection();

        if ($isRangeSelection(selection)) {
          selection.insertText(textToInsert);
        } else {
          const paragraph = $createParagraphNode();
          paragraph.append($createTextNode(textToInsert));
          root.append(paragraph);
        }

        return true;
      },
      COMMAND_PRIORITY_HIGH
    );

    return () => {
      removeKeyDownListener();
      removePasteListener();
    };
  }, [copyPastePolicy, editor, limit, notifyLimitReached]);

  return null;
}

interface MarkdownPastePromptPluginProps {
  enabled: boolean;
  copyPastePolicy?: LexicalEditorProps['copyPastePolicy'];
  maxCharacters?: number | null;
  onCharacterLimitReached?: (limit: number) => void;
}

interface PendingMarkdownPaste {
  text: string;
  position: MarkdownPastePromptPosition;
}

function MarkdownPastePromptPlugin({
  enabled,
  copyPastePolicy = 'allowed',
  maxCharacters,
  onCharacterLimitReached,
}: MarkdownPastePromptPluginProps): JSX.Element | null {
  const [editor] = useLexicalComposerContext();
  const [pendingMarkdownPaste, setPendingMarkdownPaste] = React.useState<PendingMarkdownPaste | null>(null);

  const notifyLimitReached = React.useCallback(() => {
    const limit = normalizeCharacterLimit(maxCharacters);
    if (limit) {
      onCharacterLimitReached?.(limit);
    }
  }, [maxCharacters, onCharacterLimitReached]);

  React.useEffect(() => {
    if (!enabled) {
      setPendingMarkdownPaste(null);
      return;
    }

    return editor.registerCommand(
      PASTE_COMMAND,
      (event: ClipboardEvent | null) => {
        if (copyPastePolicy === 'blocked') {
          return false;
        }

        const incomingText = event?.clipboardData?.getData('text/plain') || '';
        if (!incomingText || !looksLikeMarkdown(incomingText)) {
          return false;
        }

        event?.preventDefault();
        setPendingMarkdownPaste({
          text: incomingText,
          position: getMarkdownPastePromptPosition(editor.getRootElement()),
        });
        return true;
      },
      COMMAND_PRIORITY_LOW
    );
  }, [copyPastePolicy, editor, enabled]);

  const insertPlainText = React.useCallback(() => {
    const text = pendingMarkdownPaste?.text;
    if (!text) {
      return;
    }

    editor.update(() => {
      if (shouldBlockTextInsertion(text, maxCharacters)) {
        notifyLimitReached();
        return;
      }

      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        editor.dispatchCommand(TRACKING_TEXT_CHANGE_METADATA_COMMAND, {
          textRenderMode: 'plain',
          sourceText: text,
        });
        selection.insertRawText(text);
        return;
      }

      editor.dispatchCommand(TRACKING_TEXT_CHANGE_METADATA_COMMAND, {
        textRenderMode: 'plain',
        sourceText: text,
      });
      const paragraph = $createParagraphNode();
      paragraph.append($createTextNode(text));
      $getRoot().append(paragraph);
    }, { discrete: true });
    setPendingMarkdownPaste(null);
    editor.focus();
  }, [editor, maxCharacters, notifyLimitReached, pendingMarkdownPaste]);

  const renderMarkdown = React.useCallback(() => {
    const text = pendingMarkdownPaste?.text;
    if (!text) {
      return;
    }

    const serializedNodes = createSerializedMarkdownNodes(text);
    editor.update(() => {
      if (shouldBlockTextInsertion(text, maxCharacters)) {
        notifyLimitReached();
        return;
      }

      insertSerializedNodesAtSelection(serializedNodes);
      editor.dispatchCommand(TRACKING_TEXT_CHANGE_METADATA_COMMAND, {
        textRenderMode: 'markdown',
        sourceText: text,
      });
    }, { discrete: true });
    setPendingMarkdownPaste(null);
    editor.focus();
  }, [editor, maxCharacters, notifyLimitReached, pendingMarkdownPaste]);

  if (!pendingMarkdownPaste) {
    return null;
  }

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Markdown paste options"
      style={{
        ...editorStyles.markdownPastePrompt,
        left: pendingMarkdownPaste.position.left,
        top: pendingMarkdownPaste.position.top,
      }}
      onMouseDown={(event) => event.preventDefault()}
    >
      <span style={editorStyles.markdownPastePromptText}>
        Markdown detected. Render formatting?
      </span>
      <div style={editorStyles.markdownPastePromptActions}>
        <button
          type="button"
          style={editorStyles.markdownPasteSecondaryButton}
          onClick={insertPlainText}
        >
          Plain text
        </button>
        <button
          type="button"
          style={editorStyles.markdownPastePrimaryButton}
          onClick={renderMarkdown}
        >
          Render
        </button>
      </div>
    </div>
  );
}

function AIBridgePlugin({
  renderAIBridge,
  maxCharacters,
  onCharacterLimitReached,
}: AIBridgePluginProps): JSX.Element {
  const [editor] = useLexicalComposerContext();

  const insertAtCursor = React.useCallback((text: string): EditorInsertResult => {
    const editorStateBefore = editor.getEditorState().toJSON();
    let editorStateAfter: Record<string, any> | undefined;
    let selectionStart = 0;
    let selectionEnd = 0;
    let cursorPosition = 0;
    let textBefore = '';
    let textAfter = '';
    let inserted = true;

    editor.update(() => {
      const root = $getRoot();
      textBefore = root.getTextContent();
      const selection = $getSelection();

      if (shouldBlockTextInsertion(text, maxCharacters)) {
        const limit = normalizeCharacterLimit(maxCharacters);
        if (limit) {
          onCharacterLimitReached?.(limit);
        }

        selectionStart = textBefore.length;
        selectionEnd = textBefore.length;
        cursorPosition = textBefore.length;
        inserted = false;
        return;
      }

      if ($isRangeSelection(selection)) {
        selectionStart = Math.min(selection.anchor.offset, selection.focus.offset);
        selectionEnd = Math.max(selection.anchor.offset, selection.focus.offset);
        selection.insertText(text);
        cursorPosition = selectionStart + text.length;
      } else {
        selectionStart = textBefore.length;
        selectionEnd = textBefore.length;
        cursorPosition = textBefore.length + text.length;

        const paragraph = $createParagraphNode();
        paragraph.append($createTextNode(text));
        root.append(paragraph);
      }

      textAfter = root.getTextContent();
    }, { discrete: true });

    editorStateAfter = editor.getEditorState().toJSON();
    editor.focus();

    return {
      selectionStart,
      selectionEnd,
      cursorPosition,
      textBefore,
      textAfter,
      inserted,
      editorStateBefore,
      editorStateAfter,
    };
  }, [editor, maxCharacters, onCharacterLimitReached]);

  return <>{renderAIBridge({ insertAtCursor })}</>;
}

function hasNonEmptyLexicalRoot(content: unknown): boolean {
  if (!content || typeof content !== 'object') {
    return false;
  }

  const root = (content as { root?: { children?: unknown } }).root;
  return !!root && Array.isArray(root.children) && root.children.length > 0;
}

function getInitialEditorStateJSON(initialContent: LexicalEditorProps['initialContent']): string | undefined {
  if (!initialContent) {
    return undefined;
  }

  if (typeof initialContent === 'string') {
    try {
      const parsed = JSON.parse(initialContent);
      return hasNonEmptyLexicalRoot(parsed) ? initialContent : undefined;
    } catch {
      return undefined;
    }
  }

  return hasNonEmptyLexicalRoot(initialContent) ? JSON.stringify(initialContent) : undefined;
}

/**
 * LexicalEditor is a rich text editor with integrated keystroke tracking
 */
export function LexicalEditor(props: LexicalEditorProps): JSX.Element {
  const {
    documentId,
    userId,
    initialContent,
    placeholder = 'Start typing...',
    editable = true,
    trackingEnabled = true,
    copyPastePolicy = 'allowed',
    maxCharacters,
    onCharacterLimitReached,
    autoSaveEnabled = false,
    autoSaveInterval = 2000,
    onContentChange,
    onEventTracked,
    onEventsBuffer,
    onEventFlushReady,
    onAutoSave,
    className = '',
    renderSelectionPopup,
    renderAIBridge,
  } = props;

  const editorStateJSON = getInitialEditorStateJSON(initialContent);
  const [markdownEnabled, setMarkdownEnabled] = React.useState(false);

  const initialConfig = {
    namespace: 'humanlyEditor',
    theme: defaultTheme,
    nodes: editorNodes,
    onError: (error: Error) => {
      console.error('Lexical Editor Error:', error);
    },
    editorState: editorStateJSON,
    editable,
  };

  const handleChange = (editorState: EditorState) => {
    if (onContentChange) {
      editorState.read(() => {
        const content = editorState.toJSON();
        const plainText = editorState.read(() => {
          const root = editorState._nodeMap.get('root') as any;
          return root?.getTextContent() || '';
        });
        onContentChange(content, plainText);
      });
    }
  };

  return (
    <LexicalComposer initialConfig={initialConfig}>
      <div className={`editor-container ${className}`} style={editorStyles.container}>
        <ToolbarPlugin
          markdownEnabled={markdownEnabled}
          onMarkdownEnabledChange={setMarkdownEnabled}
        />

        <div style={editorStyles.editorWrapper}>
          <style>{`
            /* Support for inline text styles (fonts, colors, alignment) */
            .editor-content-editable p,
            .editor-content-editable h1,
            .editor-content-editable h2,
            .editor-content-editable h3,
            .editor-content-editable h4,
            .editor-content-editable h5,
            .editor-content-editable h6 {
              text-align: inherit;
              margin: 0;
            }

            .editor-content-editable span {
              font-family: inherit;
              font-size: inherit;
              color: inherit;
              background-color: inherit;
            }

            .editor-link {
              color: #2563eb;
              text-decoration: underline;
              text-underline-offset: 2px;
            }

            .editor-code-block {
              display: block;
              margin: 8px 0;
              padding: 12px;
              border-radius: 6px;
              background-color: #f3f4f6;
              color: #111827;
              font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
              font-size: 14px;
              line-height: 1.5;
              white-space: pre-wrap;
            }

            .editor-content-editable hr {
              border: 0;
              border-top: 1px solid #d8d9cf;
              margin: 12px 0;
            }

            .editor-table {
              border-collapse: collapse;
              width: max-content;
              min-width: 100%;
              margin: 10px 0;
              table-layout: auto;
            }

            .editor-table-cell,
            .editor-table-cell-header {
              border: 1px solid #d8d9cf;
              min-width: 96px;
              padding: 6px 8px;
              vertical-align: top;
              overflow-wrap: anywhere;
            }

            .editor-table-cell-header {
              background-color: #f7f8f3;
              font-weight: 600;
            }

            .editor-table-cell p,
            .editor-table-cell-header p {
              margin: 0;
            }

            /* List indentation support */
            .editor-content-editable ul,
            .editor-content-editable ol {
              margin: 0;
              padding: 0;
            }

            .editor-content-editable li {
              margin-left: 24px;
            }

            /* Nested list indentation */
            .editor-content-editable li li {
              margin-left: 24px;
            }

            /* Checklist styles */
            .editor-content-editable ul[data-lexical-list-type="check"] {
              list-style: none;
              padding: 0;
            }

            .editor-checklist-unchecked,
            .editor-checklist-checked {
              list-style: none;
              margin-left: 8px;
              padding-left: 28px;
              position: relative;
              outline: none;
            }

            .editor-checklist-unchecked::before,
            .editor-checklist-checked::before {
              content: '';
              position: absolute;
              left: 0;
              top: 50%;
              transform: translateY(-50%);
              width: 16px;
              height: 16px;
              border: 2px solid #9ca3af;
              border-radius: 50%;
              background: transparent;
              cursor: pointer;
              transition: border-color 0.15s, background-color 0.15s;
            }

            .editor-checklist-checked::before {
              border-color: #1a1c20;
              background-color: #1a1c20;
            }

            .editor-checklist-checked::after {
              content: '';
              position: absolute;
              left: 5px;
              top: 50%;
              transform: translateY(-65%) rotate(45deg);
              width: 5px;
              height: 9px;
              border: 2px solid #ffffff;
              border-top: none;
              border-left: none;
              pointer-events: none;
            }

            .editor-checklist-checked > span {
              text-decoration: line-through;
              color: #9ca3af;
            }
          `}</style>
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className="editor-content-editable"
                style={editorStyles.contentEditable}
              />
            }
            placeholder={
              <div className="editor-placeholder" style={editorStyles.placeholder}>
                {placeholder}
              </div>
            }
            ErrorBoundary={LexicalErrorBoundary}
          />
          {markdownEnabled && (
            <MarkdownPastePromptPlugin
              enabled={markdownEnabled}
              copyPastePolicy={copyPastePolicy}
              maxCharacters={maxCharacters}
              onCharacterLimitReached={onCharacterLimitReached}
            />
          )}
        </div>

        <HistoryPlugin />
        <CharacterLimitPlugin
          maxCharacters={maxCharacters}
          copyPastePolicy={copyPastePolicy}
          onCharacterLimitReached={onCharacterLimitReached}
        />
        <OnChangePlugin onChange={handleChange} ignoreSelectionChange />
        <TabIndentationPlugin />
        <TablePlugin
          hasCellMerge={false}
          hasCellBackgroundColor={false}
          hasTabHandler
        />
        <HorizontalRulePlugin />
        <HeadingPlugin />
        <FormattingPlugin />
        <ListPlugin />
        <AlignmentPlugin />
        {markdownEnabled && (
          <MarkdownShortcutPlugin transformers={markdownShortcutTransformers} />
        )}

        {trackingEnabled && (
          <TrackingPlugin
            documentId={documentId}
            userId={userId}
            onEvent={onEventTracked}
            onEventsBuffer={onEventsBuffer}
            onEventFlushReady={onEventFlushReady}
            enabled={trackingEnabled}
            copyPastePolicy={copyPastePolicy}
            textRenderMode={markdownEnabled ? 'markdown' : 'plain'}
          />
        )}

        {autoSaveEnabled && onAutoSave && (
          <AutoSavePlugin
            onSave={onAutoSave}
            interval={autoSaveInterval}
            enabled={autoSaveEnabled}
          />
        )}

        {renderSelectionPopup && (
          <SelectionPopupPlugin
            renderPopup={renderSelectionPopup}
            maxCharacters={maxCharacters}
            onCharacterLimitReached={onCharacterLimitReached}
          />
        )}

        {renderAIBridge && (
          <AIBridgePlugin
            renderAIBridge={renderAIBridge}
            maxCharacters={maxCharacters}
            onCharacterLimitReached={onCharacterLimitReached}
          />
        )}
      </div>
    </LexicalComposer>
  );
}

// Basic inline styles (can be overridden with CSS)
const editorStyles = {
  container: {
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
  },
  editorWrapper: {
    position: 'relative' as const,
    minHeight: 0,
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    overflowY: 'auto' as const,
  },
  contentEditable: {
    minHeight: '200px',
    padding: '16px',
    outline: 'none',
    fontSize: '16px',
    lineHeight: '1.6',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    flex: '1 0 auto',
    overflowX: 'auto' as const,
  },
  placeholder: {
    position: 'absolute' as const,
    top: '16px',
    left: '16px',
    color: '#9ca3af',
    pointerEvents: 'none' as const,
    userSelect: 'none' as const,
  },
  markdownPastePrompt: {
    position: 'absolute' as const,
    zIndex: 10,
    maxWidth: 'min(360px, calc(100% - 32px))',
    padding: '8px 10px',
    border: '1px solid #d8d9cf',
    borderRadius: '8px',
    backgroundColor: '#ffffff',
    boxShadow: '0 8px 20px rgba(26, 28, 32, 0.10)',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap' as const,
    justifyContent: 'space-between',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  markdownPastePromptText: {
    color: '#1a1c20',
    fontSize: '12px',
    lineHeight: 1.4,
  },
  markdownPastePromptActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  markdownPasteSecondaryButton: {
    border: '1px solid #d8d9cf',
    borderRadius: '999px',
    backgroundColor: '#ffffff',
    color: '#1a1c20',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '12px',
    lineHeight: 1,
    padding: '6px 9px',
    whiteSpace: 'nowrap' as const,
  },
  markdownPastePrimaryButton: {
    border: '1px solid #1a1c20',
    borderRadius: '999px',
    backgroundColor: '#1a1c20',
    color: '#ffffff',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '12px',
    lineHeight: 1,
    padding: '6px 9px',
    whiteSpace: 'nowrap' as const,
  },
};
