import React, { useState, useEffect, useCallback } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isRangeSelection, SELECTION_CHANGE_COMMAND } from 'lexical';
import { mergeRegister } from '@lexical/utils';
import { AlignLeft, AlignCenter, AlignRight, AlignJustify } from 'lucide-react';
import { ALIGNMENT_CHANGE_COMMAND } from '../../commands/formatting-commands';

type AlignmentType = 'left' | 'center' | 'right' | 'justify';

export function AlignmentControls(): JSX.Element {
  const [editor] = useLexicalComposerContext();
  const [alignment, setAlignment] = useState<AlignmentType>('left');

  const updateAlignment = useCallback(() => {
    editor.getEditorState().read(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;

      const anchorNode = selection.anchor.getNode();
      const element = anchorNode.getKey() === 'root' ? anchorNode : anchorNode.getTopLevelElementOrThrow();

      const elementFormat = element.getFormatType?.() || 'left';
      setAlignment(elementFormat as AlignmentType);
    });
  }, [editor]);

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => updateAlignment());
      }),
      editor.registerCommand(SELECTION_CHANGE_COMMAND, () => {
        updateAlignment();
        return false;
      }, 1)
    );
  }, [editor, updateAlignment]);

  const handleAlignment = (newAlignment: AlignmentType) => {
    editor.update(() => {
      editor.dispatchCommand(ALIGNMENT_CHANGE_COMMAND, { alignment: newAlignment, previousAlignment: alignment });
    });
  };

  const getAlignmentIcon = (align: AlignmentType) => {
    switch (align) {
      case 'left':
        return <AlignLeft size={16} />;
      case 'center':
        return <AlignCenter size={16} />;
      case 'right':
        return <AlignRight size={16} />;
      case 'justify':
        return <AlignJustify size={16} />;
    }
  };

  return (
    <div style={styles.container}>
      {(['left', 'center', 'right', 'justify'] as AlignmentType[]).map((align) => (
        <button
          key={align}
          onClick={() => handleAlignment(align)}
          style={{
            ...styles.button,
            ...(alignment === align ? styles.activeButton : {}),
          }}
          aria-label={`Align ${align}`}
          title={`Align ${align}`}
        >
          {getAlignmentIcon(align)}
        </button>
      ))}
    </div>
  );
}

const styles = {
  container: { display: 'flex', gap: '4px' },
  button: {
    padding: '6px 12px',
    border: '1px solid #d8d9cf',
    borderRadius: '4px',
    backgroundColor: '#ffffff',
    cursor: 'pointer',
    fontSize: '14px',
    fontFamily: 'inherit',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeButton: {
    backgroundColor: '#1a1c20',
    color: '#ffffff',
    borderColor: '#1a1c20',
  },
};
