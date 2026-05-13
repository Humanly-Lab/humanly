import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { EditorTracker } from '../tracking/editor-tracker';
import { EditorTrackerConfig } from '../types';

/**
 * TrackingPlugin integrates keystroke tracking into Lexical editor
 */
export function TrackingPlugin(props: EditorTrackerConfig): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    if (!props.enabled) {
      return;
    }

    const tracker = new EditorTracker(editor, props);
    tracker.start();

    return () => {
      tracker.stop();
    };
  }, [
    editor,
    props.documentId,
    props.userId,
    props.batchSize,
    props.flushInterval,
    props.enabled,
    props.copyPastePolicy,
  ]);

  return null;
}
