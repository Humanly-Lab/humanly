'use client';

import * as React from 'react';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { cn } from '@/lib/utils';

interface ResizablePanelGroupProps extends React.ComponentPropsWithoutRef<typeof PanelGroup> {
  className?: string;
  direction?: 'horizontal' | 'vertical';
}

function ResizablePanelGroup({ className, ...props }: ResizablePanelGroupProps) {
  return (
    <PanelGroup
      className={cn(
        'flex h-full w-full data-[panel-group-direction=vertical]:flex-col',
        className
      )}
      {...props}
    />
  );
}

const ResizablePanel = Panel;

interface ResizableHandleProps extends React.ComponentPropsWithoutRef<typeof PanelResizeHandle> {
  withHandle?: boolean;
  className?: string;
}

function ResizableHandle({ className, withHandle, ...props }: ResizableHandleProps) {
  return (
    <PanelResizeHandle
      className={cn(
        'relative flex w-px items-center justify-center bg-border',
        'after:absolute after:inset-y-0 after:left-[-6px] after:right-[-6px]',
        'hover:bg-muted data-[resize-handle-active]:bg-muted',
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="z-10 flex h-4 w-3 items-center justify-center rounded-sm border bg-background">
          <div className="h-2 w-0.5 rounded-full bg-muted-foreground" />
          <div className="ml-1 h-2 w-0.5 rounded-full bg-muted-foreground" />
        </div>
      )}
    </PanelResizeHandle>
  );
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };
