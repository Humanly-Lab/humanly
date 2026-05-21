import React, { useState, useEffect, useCallback } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getSelection, $isRangeSelection, SELECTION_CHANGE_COMMAND, INDENT_CONTENT_COMMAND, OUTDENT_CONTENT_COMMAND } from 'lexical';
import { $isListNode } from '@lexical/list';
import { mergeRegister } from '@lexical/utils';
import { List, ListOrdered, CheckSquare, Indent, Outdent } from 'lucide-react';
import {
  LIST_CREATE_COMMAND,
  LIST_DELETE_COMMAND,
} from '../../commands/formatting-commands';

type ListType = 'bullet' | 'number' | 'check' | null;

/**
 * ListControls component for list operations
 */
export function ListControls(): JSX.Element {
  const [editor] = useLexicalComposerContext();
  const [currentListType, setCurrentListType] = useState<ListType>(null);

  const updateListType = useCallback(() => {
    editor.getEditorState().read(() => {
      const selection = $getSelection();

      if (!$isRangeSelection(selection)) {
        setCurrentListType(null);
        return;
      }

      const anchorNode = selection.anchor.getNode();
      const element =
        anchorNode.getKey() === 'root'
          ? anchorNode
          : anchorNode.getTopLevelElementOrThrow();

      const parent = element.getParent();

      if ($isListNode(parent)) {
        const listType = parent.getListType();
        setCurrentListType(listType === 'bullet' ? 'bullet' : 'number');
      } else {
        setCurrentListType(null);
      }
    });
  }, [editor]);

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          updateListType();
        });
      }),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          updateListType();
          return false;
        },
        1
      )
    );
  }, [editor, updateListType]);

  const handleListToggle = (listType: 'bullet' | 'number' | 'check') => {
    if (currentListType === listType) {
      // Remove list if clicking the same type
      editor.dispatchCommand(LIST_DELETE_COMMAND, undefined);
    } else {
      // Create or convert to new list type
      editor.dispatchCommand(LIST_CREATE_COMMAND, { listType });
    }
  };

  const handleIndent = () => {
    editor.dispatchCommand(INDENT_CONTENT_COMMAND, undefined);
  };

  const handleOutdent = () => {
    editor.dispatchCommand(OUTDENT_CONTENT_COMMAND, undefined);
  };

  return (
    <div style={styles.container}>
      <button
        onClick={() => handleListToggle('bullet')}
        style={{
          ...styles.button,
          ...(currentListType === 'bullet' ? styles.activeButton : {}),
        }}
        aria-label="Bulleted list"
        title="Bulleted list"
      >
        <List size={16} />
      </button>

      <button
        onClick={() => handleListToggle('number')}
        style={{
          ...styles.button,
          ...(currentListType === 'number' ? styles.activeButton : {}),
        }}
        aria-label="Numbered list"
        title="Numbered list"
      >
        <ListOrdered size={16} />
      </button>

      <button
        onClick={() => handleListToggle('check')}
        style={styles.button}
        aria-label="Checklist"
        title="Checklist"
      >
        <CheckSquare size={16} />
      </button>

      <div style={styles.divider} />

      <button
        onClick={handleIndent}
        style={styles.button}
        aria-label="Increase indent"
        title="Increase indent (Tab)"
      >
        <Indent size={16} />
      </button>

      <button
        onClick={handleOutdent}
        style={styles.button}
        aria-label="Decrease indent"
        title="Decrease indent (Shift+Tab)"
      >
        <Outdent size={16} />
      </button>
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    gap: '4px',
    alignItems: 'center',
  },
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
  disabledButton: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  divider: {
    width: '1px',
    height: '24px',
    backgroundColor: '#d8d9cf',
    margin: '0 4px',
  },
};
