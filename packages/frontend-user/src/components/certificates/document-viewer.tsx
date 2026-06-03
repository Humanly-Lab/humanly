'use client';

import React, { useMemo } from 'react';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListNode, ListItemNode } from '@lexical/list';
import { ListPlugin } from '@lexical/react/LexicalListPlugin';

interface DocumentViewerProps {
  content: any;
  className?: string;
}

const theme = {
  paragraph: 'mb-1',
  text: {
    bold: 'font-bold',
    italic: 'italic',
    underline: 'underline',
    strikethrough: 'line-through',
    code: 'bg-gray-100 dark:bg-gray-800 px-1 py-0.5 rounded text-sm',
  },
  heading: {
    h1: 'text-3xl font-bold mb-2 mt-4',
    h2: 'text-2xl font-bold mb-2 mt-3',
    h3: 'text-xl font-semibold mb-1 mt-2',
    h4: 'text-lg font-semibold mb-1 mt-2',
    h5: 'text-base font-semibold mb-1 mt-1',
    h6: 'text-sm font-semibold mb-1 mt-1',
  },
  list: {
    ul: 'list-disc list-outside ml-4 mb-2',
    ol: 'list-decimal list-outside ml-4 mb-2',
    listitem: 'mb-0.5',
    nested: {
      listitem: 'list-none',
    },
  },
  quote: 'border-l-4 border-gray-300 pl-4 italic my-2',
};

export function DocumentViewer({ content, className = '' }: DocumentViewerProps) {
  // Generate unique key and parsed content
  const { editorStateJSON, contentKey } = useMemo(() => {
    let json: string | undefined;
    let key = `empty-${Date.now()}`;

    if (content) {
      if (typeof content === 'string') {
        try {
          const parsed = JSON.parse(content);
          if (parsed && parsed.root) {
            json = content;
            key = `str-${content.length}-${JSON.stringify(parsed.root.children).substring(0, 30)}`;
          }
        } catch {
          json = undefined;
        }
      } else if (typeof content === 'object' && 'root' in content) {
        json = JSON.stringify(content);
        key = `obj-${json.length}-${JSON.stringify(content.root.children).substring(0, 30)}`;
      }
    }

    return { editorStateJSON: json, contentKey: key };
  }, [content]);

  // Memoize config to prevent recreating
  const initialConfig = useMemo(() => ({
    namespace: 'DocumentViewer',
    theme,
    nodes: [HeadingNode, QuoteNode, ListNode, ListItemNode],
    editable: false,
    onError: (error: Error) => {
      console.error('Document Viewer Error:', error);
    },
    editorState: editorStateJSON,
  }), [editorStateJSON]);

  return (
    <LexicalComposer key={contentKey} initialConfig={initialConfig}>
      <div className={`document-viewer ${className}`}>
        <style jsx>{`
          /* Support for inline text styles (fonts, colors, alignment) */
          .document-viewer :global(p),
          .document-viewer :global(h1),
          .document-viewer :global(h2),
          .document-viewer :global(h3),
          .document-viewer :global(h4),
          .document-viewer :global(h5),
          .document-viewer :global(h6) {
            /* Allow text-align from inline styles */
            text-align: inherit;
            margin: 0;
          }

          .document-viewer :global(span) {
            /* Preserve inline font and color styles */
            font-family: inherit;
            font-size: inherit;
            color: inherit;
            background-color: inherit;
          }

          /* List indentation support */
          .document-viewer :global(ul),
          .document-viewer :global(ol) {
            margin: 0;
            padding: 0;
          }

          .document-viewer :global(li) {
            margin-left: 24px;
          }

          /* Nested list indentation */
          .document-viewer :global(li li) {
            margin-left: 24px;
          }

          /* Ensure text formatting is visible */
          .document-viewer :global(.font-bold) {
            font-weight: bold;
          }

          .document-viewer :global(.italic) {
            font-style: italic;
          }

          .document-viewer :global(.underline) {
            text-decoration: underline;
          }

          .document-viewer :global(.line-through) {
            text-decoration: line-through;
          }
        `}</style>
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              className="outline-none min-h-[150px] sm:min-h-[200px] p-3 sm:p-4 border rounded-lg bg-white dark:bg-gray-950"
              style={{
                fontFamily: 'system-ui, -apple-system, sans-serif',
                fontSize: '13px',
                lineHeight: '1.6',
                borderColor: 'hsl(var(--border))',
              }}
            />
          }
          placeholder={
            <div className="absolute top-3 sm:top-4 left-3 sm:left-4 text-xs sm:text-sm text-muted-foreground pointer-events-none opacity-0">
              {/* Placeholder hidden for replay */}
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <ListPlugin />
      </div>
    </LexicalComposer>
  );
}
