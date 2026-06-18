'use client';

import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

const MARKDOWN_CONTENT_CLASS_NAME =
  'prose prose-sm dark:prose-invert max-w-none break-words overflow-x-auto overflow-wrap-anywhere leading-relaxed min-w-0 [&>p]:my-1 [&>ul]:my-1 [&>ol]:my-1 [&>hr]:my-2 [&>p:first-child]:mt-0 [&>p:last-child]:mb-0 [&>*]:max-w-full [&>*]:min-w-0 [&>pre]:overflow-x-auto [&>pre]:max-w-full [&>pre]:whitespace-pre [&>code]:break-words [&>code]:whitespace-pre-wrap [&_a]:break-all [&_a]:overflow-wrap-anywhere [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_th]:border [&_th]:px-2 [&_th]:py-1 [&_td]:border [&_td]:px-2 [&_td]:py-1';

interface MarkdownContentProps {
  children?: string | null;
  className?: string;
  trailingContent?: ReactNode;
}

export function MarkdownContent({
  children,
  className,
  trailingContent,
}: MarkdownContentProps) {
  return (
    <div className={cn(MARKDOWN_CONTENT_CLASS_NAME, className)}>
      {children && (
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{
            a: (props) => (
              <a
                {...props}
                target="_blank"
                rel="noopener noreferrer"
              />
            ),
          }}
        >
          {children}
        </ReactMarkdown>
      )}
      {trailingContent}
    </div>
  );
}
