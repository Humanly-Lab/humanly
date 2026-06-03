import { createCommand, LexicalCommand } from 'lexical';
import type { EventMetadata } from '../types';

/**
 * Custom formatting commands for the editor
 */

// Heading commands
export const HEADING_CHANGE_COMMAND: LexicalCommand<{
  level: 1 | 2 | 3 | 4 | 5 | 6 | null;
  previousLevel?: 1 | 2 | 3 | 4 | 5 | 6 | null;
}> = createCommand('HEADING_CHANGE_COMMAND');

// Font formatting commands
export const FONT_FAMILY_CHANGE_COMMAND: LexicalCommand<{
  fontFamily: string;
}> = createCommand('FONT_FAMILY_CHANGE_COMMAND');

export const FONT_SIZE_CHANGE_COMMAND: LexicalCommand<{
  fontSize: string;
}> = createCommand('FONT_SIZE_CHANGE_COMMAND');

export const TEXT_COLOR_CHANGE_COMMAND: LexicalCommand<{
  color: string;
}> = createCommand('TEXT_COLOR_CHANGE_COMMAND');

export const HIGHLIGHT_COLOR_CHANGE_COMMAND: LexicalCommand<{
  color: string;
}> = createCommand('HIGHLIGHT_COLOR_CHANGE_COMMAND');

// List commands
export const LIST_CREATE_COMMAND: LexicalCommand<{
  listType: 'bullet' | 'number' | 'check';
}> = createCommand('LIST_CREATE_COMMAND');

export const LIST_DELETE_COMMAND: LexicalCommand<void> = createCommand('LIST_DELETE_COMMAND');

export const LIST_INDENT_COMMAND: LexicalCommand<void> = createCommand('LIST_INDENT_COMMAND');

export const LIST_OUTDENT_COMMAND: LexicalCommand<void> = createCommand('LIST_OUTDENT_COMMAND');

export const LIST_ITEM_CHECK_COMMAND: LexicalCommand<{
  checked: boolean;
}> = createCommand('LIST_ITEM_CHECK_COMMAND');

// Alignment commands
export const ALIGNMENT_CHANGE_COMMAND: LexicalCommand<{
  alignment: 'left' | 'center' | 'right' | 'justify';
  previousAlignment?: string;
}> = createCommand('ALIGNMENT_CHANGE_COMMAND');

// Line spacing command
export const LINE_SPACING_CHANGE_COMMAND: LexicalCommand<{
  spacing: number;
}> = createCommand('LINE_SPACING_CHANGE_COMMAND');

// Indent command
export const INDENT_CHANGE_COMMAND: LexicalCommand<{
  level: number;
}> = createCommand('INDENT_CHANGE_COMMAND');

// Find and Replace commands
export const FIND_OPEN_COMMAND: LexicalCommand<void> = createCommand('FIND_OPEN_COMMAND');

export const FIND_SEARCH_COMMAND: LexicalCommand<{
  query: string;
  matchCount: number;
}> = createCommand('FIND_SEARCH_COMMAND');

export const FIND_NEXT_COMMAND: LexicalCommand<void> = createCommand('FIND_NEXT_COMMAND');

export const FIND_PREVIOUS_COMMAND: LexicalCommand<void> = createCommand('FIND_PREVIOUS_COMMAND');

export const REPLACE_COMMAND: LexicalCommand<{
  from: string;
  to: string;
}> = createCommand('REPLACE_COMMAND');

export const REPLACE_ALL_COMMAND: LexicalCommand<{
  from: string;
  to: string;
  count: number;
}> = createCommand('REPLACE_ALL_COMMAND');

export const FIND_CLOSE_COMMAND: LexicalCommand<void> = createCommand('FIND_CLOSE_COMMAND');

// Clear formatting command
export const CLEAR_FORMATTING_COMMAND: LexicalCommand<void> = createCommand('CLEAR_FORMATTING_COMMAND');

export const TRACKING_TEXT_CHANGE_METADATA_COMMAND: LexicalCommand<EventMetadata> =
  createCommand('TRACKING_TEXT_CHANGE_METADATA_COMMAND');

export const TRACKING_SUPPRESS_NEXT_TEXT_CHANGE_COMMAND: LexicalCommand<boolean | void> =
  createCommand('TRACKING_SUPPRESS_NEXT_TEXT_CHANGE_COMMAND');
