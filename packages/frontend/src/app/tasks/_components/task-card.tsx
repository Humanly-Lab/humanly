'use client';

import type { KeyboardEvent } from 'react';
import { Archive, Calendar, Eye, Loader2, MoreHorizontal, RotateCcw, Settings, Trash2, Users } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDateTime } from '@/lib/utils';

import {
  getTaskActiveStateAction,
  getTaskWindowStatus,
  type TaskDashboardItem,
  type TaskDashboardTab,
  type TaskWindowStatus,
} from './task-dashboard-lifecycle';

interface TaskCardProps {
  task: TaskDashboardItem;
  activeTab: TaskDashboardTab;
  nowMs: number;
  variant?: 'card' | 'list';
  isDeleting: boolean;
  isChangingActiveState: boolean;
  isOptionsOpen: boolean;
  onOptionsOpenChange: (open: boolean) => void;
  onView: (task: TaskDashboardItem) => void;
  onEditSetting: (task: TaskDashboardItem) => void;
  onDelete: (task: TaskDashboardItem) => void;
  onActiveStateChange: (task: TaskDashboardItem, nextIsActive: boolean) => void;
}

const getCompletionCount = (task: TaskDashboardItem) => task.submissionCount ?? 0;

const formatCompletionCount = (task: TaskDashboardItem) => {
  const count = getCompletionCount(task);
  return `${count.toLocaleString()} ${count === 1 ? 'completion' : 'completions'}`;
};

const statusToneClass: Record<TaskWindowStatus['tone'], string> = {
  muted: 'border-border/80 bg-muted/45 text-muted-foreground',
  success: 'border-[#b9c8b8] bg-[#edf2eb] text-[#5d7766]',
  warning: 'border-[#dfc8aa] bg-[#f6efe4] text-[#92714e]',
};

export function TaskCard({
  task,
  activeTab,
  nowMs,
  variant = 'card',
  isDeleting,
  isChangingActiveState,
  isOptionsOpen,
  onOptionsOpenChange,
  onView,
  onEditSetting,
  onDelete,
  onActiveStateChange,
}: TaskCardProps) {
  const nextIsActive = activeTab === 'archived';
  const activeStateAction = getTaskActiveStateAction(nextIsActive);
  const taskWindowStatus = activeTab === 'open' ? getTaskWindowStatus(task, nowMs) : null;

  const handleRowKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onView(task);
    }
  };

  const renderStatusBadge = () => (
    taskWindowStatus ? (
      <Badge variant="outline" className={`${statusToneClass[taskWindowStatus.tone]} shrink-0 whitespace-nowrap`}>
        {taskWindowStatus.label}
      </Badge>
    ) : (
      <Badge variant="outline" className="shrink-0 whitespace-nowrap border-border/80 bg-muted/45 text-muted-foreground">
        Archived
      </Badge>
    )
  );

  const renderOptionsMenu = (layout: 'card' | 'list') => (
    <DropdownMenu
      open={isOptionsOpen}
      onOpenChange={onOptionsOpenChange}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={layout === 'card' ? 'min-w-[120px]' : 'min-w-[112px] shrink-0'}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
            if (event.detail === 0) return;
            onOptionsOpenChange(!isOptionsOpen);
          }}
        >
          <MoreHorizontal className="mr-2 h-4 w-4" />
          Options
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-48"
        onClick={(event) => event.stopPropagation()}
      >
        <DropdownMenuItem onClick={() => onView(task)}>
          <Eye className="mr-2 h-4 w-4" />
          View Details
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onEditSetting(task)}>
          <Settings className="mr-2 h-4 w-4" />
          View Setting
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={isChangingActiveState}
          onClick={() => onActiveStateChange(task, nextIsActive)}
        >
          {isChangingActiveState ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : nextIsActive ? (
            <RotateCcw className="mr-2 h-4 w-4" />
          ) : (
            <Archive className="mr-2 h-4 w-4" />
          )}
          {isChangingActiveState ? activeStateAction.pendingLabel : activeStateAction.label}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          disabled={isDeleting}
          onClick={() => onDelete(task)}
        >
          {isDeleting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="mr-2 h-4 w-4" />
          )}
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const renderActionControls = () => (
    <>
      <Button
        variant="default"
        size="sm"
        className="w-full"
        onClick={() => onView(task)}
      >
        <Eye className="mr-2 h-4 w-4" />
        View
      </Button>
      {renderOptionsMenu('card')}
    </>
  );

  if (variant === 'list') {
    return (
      <div className="border-b border-border/70">
        <div
          role="button"
          tabIndex={0}
          aria-label={`View ${task.name}`}
          className="grid min-h-[5.5rem] cursor-pointer grid-cols-1 gap-3 px-2 py-3 transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:grid-cols-[minmax(0,1.4fr)_8.5rem_10rem_11rem_8rem] md:items-center"
          onClick={() => onView(task)}
          onKeyDown={handleRowKeyDown}
        >
          <div className="min-w-0">
            <div className="flex min-w-0 items-start justify-between gap-3 md:block">
              <h3 className="min-w-0 truncate text-base font-semibold text-foreground" title={task.name}>
                {task.name}
              </h3>
              <div className="md:hidden">
                {renderStatusBadge()}
              </div>
            </div>
            <p className="mt-1 line-clamp-2 break-words [overflow-wrap:anywhere] text-sm text-muted-foreground" title={task.description || undefined}>
              {task.description || 'No description provided.'}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground md:hidden">
              <span>{formatCompletionCount(task)}</span>
              <span>Created {formatDateTime(task.createdAt)}</span>
            </div>
          </div>

          <div className="hidden md:block">
            {renderStatusBadge()}
          </div>
          <div className="hidden text-sm text-muted-foreground md:block">
            {formatCompletionCount(task)}
          </div>
          <div className="hidden text-sm text-muted-foreground md:block">
            Created {formatDateTime(task.createdAt)}
          </div>
          <div className="flex items-center justify-end gap-2 md:justify-start">
            {renderOptionsMenu('list')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card className="humanly-surface flex min-h-[270px] flex-col bg-card/95 transition-colors hover:border-foreground/15">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="line-clamp-2 break-words [overflow-wrap:anywhere] text-xl leading-tight" title={task.name}>
              {task.name}
            </CardTitle>
          </div>
          {renderStatusBadge()}
        </div>
        <CardDescription className="line-clamp-3 min-h-[3.75rem] break-words [overflow-wrap:anywhere]" title={task.description || undefined}>
          {task.description || 'No description provided.'}
        </CardDescription>
      </CardHeader>

      <CardContent className="flex-1">
        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-3">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span>{formatCompletionCount(task)}</span>
          </div>
          <div className="flex items-center gap-3">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span>Created {formatDateTime(task.createdAt)}</span>
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex space-x-2 border-t border-border/70 bg-muted/20 pt-4">
        {renderActionControls()}
      </CardFooter>
    </Card>
  );
}
