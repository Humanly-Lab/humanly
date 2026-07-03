'use client';

import type { KeyboardEvent } from 'react';
import {
  Archive,
  Calendar,
  Copy,
  Eye,
  KeyRound,
  Link as LinkIcon,
  Loader2,
  MoreHorizontal,
  Pause,
  Play,
  RotateCcw,
  Settings,
  Square,
  Trash2,
  Users,
} from 'lucide-react';

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

export const TASK_LIST_GRID_CLASS = 'md:grid-cols-[minmax(0,1.4fr)_8.5rem_10rem_11rem_15rem]';

interface TaskCardProps {
  task: TaskDashboardItem;
  activeTab: TaskDashboardTab;
  nowMs: number;
  variant?: 'card' | 'list';
  isDeleting: boolean;
  isChangingActiveState: boolean;
  isChangingLifecycleState: boolean;
  isDuplicating: boolean;
  isOptionsOpen: boolean;
  onOptionsOpenChange: (open: boolean) => void;
  onView: (task: TaskDashboardItem) => void;
  onEditSetting: (task: TaskDashboardItem) => void;
  onDelete: (task: TaskDashboardItem) => void;
  onActiveStateChange: (task: TaskDashboardItem, nextIsActive: boolean) => void;
  onLifecycleAction: (task: TaskDashboardItem, action: 'launch' | 'pause' | 'resume') => void;
  onCopyShareLink: (task: TaskDashboardItem) => void;
  onCopyInviteCode: (task: TaskDashboardItem) => void;
  onDuplicate: (task: TaskDashboardItem) => void;
}

const getCompletionCount = (task: TaskDashboardItem) => task.submissionCount ?? 0;

const formatCompletionCount = (task: TaskDashboardItem) => {
  const count = getCompletionCount(task);
  return `${count.toLocaleString()} ${count === 1 ? 'completion' : 'completions'}`;
};

const statusToneClass: Record<TaskWindowStatus['tone'], string> = {
  muted: 'border-border/80 bg-muted/45 text-muted-foreground',
  success: 'border-[var(--hly-green-border)] bg-[var(--hly-green-bg)] text-[var(--hly-green-text)]',
  warning: 'border-[var(--hly-amber-border)] bg-[var(--hly-amber-bg)] text-[var(--hly-amber-text)]',
};

export function TaskCard({
  task,
  activeTab,
  nowMs,
  variant = 'card',
  isDeleting,
  isChangingActiveState,
  isChangingLifecycleState,
  isDuplicating,
  isOptionsOpen,
  onOptionsOpenChange,
  onView,
  onEditSetting,
  onDelete,
  onActiveStateChange,
  onLifecycleAction,
  onCopyShareLink,
  onCopyInviteCode,
  onDuplicate,
}: TaskCardProps) {
  const nextIsActive = activeTab === 'archived';
  const activeStateAction = getTaskActiveStateAction(nextIsActive);
  const taskWindowStatus = getTaskWindowStatus(task, nowMs);

  const handleRowKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onView(task);
    }
  };

  const renderStatusBadge = () => (
    <Badge
      variant="outline"
      className={`${statusToneClass[taskWindowStatus.tone]} shrink-0 whitespace-nowrap`}
    >
      {taskWindowStatus.label}
    </Badge>
  );

  const lifecycleAction = (() => {
    if (!task.isActive) {
      return {
        action: null,
        label: 'Archived',
        pendingLabel: 'Archived',
        icon: Archive,
      };
    }

    if (task.lifecycleStatus === 'draft') {
      return {
        action: 'launch' as const,
        label: 'Launch',
        pendingLabel: 'Launching...',
        icon: Play,
      };
    }
    if (task.lifecycleStatus === 'active') {
      return {
        action: 'pause' as const,
        label: 'Pause',
        pendingLabel: 'Pausing...',
        icon: Pause,
      };
    }
    if (task.lifecycleStatus === 'paused') {
      return {
        action: 'resume' as const,
        label: 'Resume',
        pendingLabel: 'Resuming...',
        icon: Play,
      };
    }
    return {
      action: null,
      label: 'Ended',
      pendingLabel: 'Ended',
      icon: Square,
    };
  })();

  const LifecycleIcon = lifecycleAction.icon;

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
        <DropdownMenuItem onClick={() => onCopyShareLink(task)}>
          <LinkIcon className="mr-2 h-4 w-4" />
          Copy Sharing Link
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onCopyInviteCode(task)}>
          <KeyRound className="mr-2 h-4 w-4" />
          Copy Invite Code
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onEditSetting(task)}>
          <Settings className="mr-2 h-4 w-4" />
          View Setting
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={isDuplicating}
          onClick={() => onDuplicate(task)}
        >
          {isDuplicating ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Copy className="mr-2 h-4 w-4" />
          )}
          Duplicate
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
        className="min-w-0 flex-1"
        onClick={() => onView(task)}
      >
        <Eye className="mr-2 h-4 w-4" />
        View
      </Button>
      <Button
        type="button"
        variant={task.lifecycleStatus === 'active' ? 'outline' : 'secondary'}
        size="sm"
        className="min-w-[112px]"
        disabled={!lifecycleAction.action || isChangingLifecycleState || activeTab === 'archived'}
        onClick={() => {
          if (lifecycleAction.action) {
            onLifecycleAction(task, lifecycleAction.action);
          }
        }}
      >
        {isChangingLifecycleState ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <LifecycleIcon className="mr-2 h-4 w-4" />
        )}
        {isChangingLifecycleState ? lifecycleAction.pendingLabel : lifecycleAction.label}
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
          className={`grid min-h-[5.5rem] cursor-pointer grid-cols-1 gap-3 px-2 py-3 transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${TASK_LIST_GRID_CLASS} md:items-center`}
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
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant={task.lifecycleStatus === 'active' ? 'outline' : 'secondary'}
              size="sm"
              className="min-w-[96px]"
              disabled={!lifecycleAction.action || isChangingLifecycleState || activeTab === 'archived'}
              onClick={(event) => {
                event.stopPropagation();
                if (lifecycleAction.action) {
                  onLifecycleAction(task, lifecycleAction.action);
                }
              }}
            >
              {isChangingLifecycleState ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <LifecycleIcon className="mr-2 h-4 w-4" />
              )}
              {isChangingLifecycleState ? lifecycleAction.pendingLabel : lifecycleAction.label}
            </Button>
            {renderOptionsMenu('list')}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Card className="humanly-surface flex h-full min-h-[390px] flex-col bg-card/95 transition-colors hover:border-foreground/15">
      <CardHeader className="h-[230px] shrink-0 overflow-hidden">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle
              className="line-clamp-2 break-words [overflow-wrap:anywhere] text-xl leading-tight"
              title={task.name}
            >
              {task.name}
            </CardTitle>
          </div>

          {renderStatusBadge()}
        </div>

        <CardDescription
          className="mt-4 line-clamp-4 break-words [overflow-wrap:anywhere]"
          title={task.description || undefined}
        >
          {task.description || 'No description provided.'}
        </CardDescription>
      </CardHeader>

      <CardContent className="shrink-0 pb-8">
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

      <CardFooter className="mt-auto flex gap-2 border-t border-border/70 bg-muted/20 pt-4">
        {renderActionControls()}
      </CardFooter>
    </Card>
  );
}
