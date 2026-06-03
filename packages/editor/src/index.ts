/**
 * @humanly/editor - Reusable Lexical editor with integrated keystroke tracking
 */

// Main editor component
export { LexicalEditor } from './lexical-editor';

// Plugins
export { TrackingPlugin } from './plugins/tracking-plugin';
export { ToolbarPlugin } from './plugins/toolbar-plugin';
export { AutoSavePlugin } from './plugins/auto-save-plugin';
export { SelectionPopupPlugin } from './plugins/selection-popup-plugin';
export type {
  SelectionInfo,
  SelectionPopupPluginProps,
  SelectionReplacementOptions,
  SelectionReplacementResult,
} from './plugins/selection-popup-plugin';

// Tracking infrastructure
export { EditorTracker } from './tracking/editor-tracker';

// Types
export * from './types';
