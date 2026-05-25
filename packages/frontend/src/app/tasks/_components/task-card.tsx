'use client';

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

  return (
    <Card className="flex min-h-[270px] flex-col transition-[border-color,transform] hover:-translate-y-1 hover:border-foreground/20">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="line-clamp-2 break-words text-xl leading-tight" title={task.name}>
              {task.name}
            </CardTitle>
          </div>
          {taskWindowStatus ? (
            <Badge variant="outline" className={`${statusToneClass[taskWindowStatus.tone]} shrink-0 whitespace-nowrap`}>
              {taskWindowStatus.label}
            </Badge>
          ) : (
            <Badge variant="outline" className="shrink-0 whitespace-nowrap border-border/80 bg-muted/45 text-muted-foreground">
              Archived
            </Badge>
          )}
        </div>
        <CardDescription className="line-clamp-3 min-h-[3.75rem]" title={task.description || undefined}>
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

      <CardFooter className="flex space-x-2 border-t border-border/70 pt-4">
        <Button
          variant="default"
          size="sm"
          className="w-full"
          onClick={() => onView(task)}
        >
          <Eye className="mr-2 h-4 w-4" />
          View
        </Button>
        <DropdownMenu
          open={isOptionsOpen}
          onOpenChange={onOptionsOpenChange}
        >
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="min-w-[120px]"
              onPointerDown={(event) => event.preventDefault()}
              onClick={(event) => {
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
          >
            <DropdownMenuItem onClick={() => onView(task)}>
              <Eye className="mr-2 h-4 w-4" />
              View Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEditSetting(task)}>
              <Settings className="mr-2 h-4 w-4" />
              Edit Setting
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
      </CardFooter>
    </Card>
  );
}
