import React from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { TabIndentationPlugin } from '@lexical/react/LexicalTabIndentationPlugin';
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary';
import { EditorState } from 'lexical';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListNode, ListItemNode } from '@lexical/list';
import { TrackingPlugin } from './plugins/tracking-plugin';
import { ToolbarPlugin } from './plugins/toolbar-plugin';
import { AutoSavePlugin } from './plugins/auto-save-plugin';
import { HeadingPlugin } from './plugins/heading-plugin';
import { FormattingPlugin } from './plugins/formatting-plugin';
import { ListPlugin } from './plugins/list-plugin';
import { AlignmentPlugin } from './plugins/alignment-plugin';
import { SelectionPopupPlugin } from './plugins/selection-popup-plugin';
import { LexicalEditorProps, EditorTheme } from './types';

/**
 * Default editor theme
 * Note: These are CSS class names that should be defined in your application's CSS
 */
const defaultTheme: EditorTheme = {
  paragraph: 'mb-2',
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
    autoSaveEnabled = false,
    autoSaveInterval = 30000,
    onContentChange,
    onEventTracked,
    onEventsBuffer,
    onAutoSave,
    className = '',
    renderSelectionPopup,
  } = props;

  // Parse initial content
  let editorStateJSON: string | undefined;
  if (initialContent) {
    if (typeof initialContent === 'string') {
      try {
        const parsed = JSON.parse(initialContent);
        // Check if it's a valid Lexical state with root node
        if (parsed && parsed.root) {
          editorStateJSON = initialContent;
        }
      } catch {
        // If not JSON, treat as plain text
        editorStateJSON = undefined;
      }
    } else {
      // Check if it's a valid Lexical state with root node
      if (initialContent && typeof initialContent === 'object' && 'root' in initialContent) {
        editorStateJSON = JSON.stringify(initialContent);
      } else {
        // Empty or invalid content, let Lexical create default state
        editorStateJSON = undefined;
      }
    }
  }

  const initialConfig = {
    namespace: 'humanlyEditor',
    theme: defaultTheme,
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode],
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
        <ToolbarPlugin />

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
              border-color: #3b82f6;
              background-color: #3b82f6;
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
        </div>

        <HistoryPlugin />
        <OnChangePlugin onChange={handleChange} />
        <TabIndentationPlugin />
        <HeadingPlugin />
        <FormattingPlugin />
        <ListPlugin />
        <AlignmentPlugin />

        {trackingEnabled && (
          <TrackingPlugin
            documentId={documentId}
            userId={userId}
            onEvent={onEventTracked}
            onEventsBuffer={onEventsBuffer}
            enabled={trackingEnabled}
            copyPastePolicy={copyPastePolicy}
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
          <SelectionPopupPlugin renderPopup={renderSelectionPopup} />
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
  },
  placeholder: {
    position: 'absolute' as const,
    top: '16px',
    left: '16px',
    color: '#9ca3af',
    pointerEvents: 'none' as const,
    userSelect: 'none' as const,
  },
};
