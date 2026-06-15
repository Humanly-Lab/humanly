import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  $getSelection,
  $isRangeSelection,
  $getRoot,
  $createRangeSelection,
  $setSelection,
  SELECTION_CHANGE_COMMAND,
  COMMAND_PRIORITY_LOW,
  UNDO_COMMAND,
} from 'lexical';
import { createPortal } from 'react-dom';
import { TRACKING_SUPPRESS_NEXT_TEXT_CHANGE_COMMAND } from '../commands/formatting-commands';

export interface SelectionInfo {
  text: string;
  start: number;
  end: number;
  rect: DOMRect;
}

export interface SelectionReplacementResult {
  selectionStart: number;
  selectionEnd: number;
  cursorPosition: number;
  editorStateBefore?: Record<string, any>;
  editorStateAfter?: Record<string, any>;
}

export interface SelectionReplacementOptions {
  suppressTextChangeTracking?: boolean;
}

export interface SelectionPopupPluginProps {
  onSelectionChange?: (selection: SelectionInfo | null) => void;
  maxCharacters?: number | null;
  onCharacterLimitReached?: (limit: number) => void;
  initialSelectionText?: string;
  clearSelectionOnClose?: boolean;
  renderPopup?: (props: {
    selection: SelectionInfo;
    onClose: () => void;
    replaceSelection: (
      newText: string,
      keepOpen?: boolean,
      options?: SelectionReplacementOptions
    ) => SelectionReplacementResult | undefined;
    cancelAIAction: () => void;
    undoLastAction: () => void;
  }) => React.ReactNode;
}

/**
 * SelectionPopupPlugin detects text selection and can render a floating popup
 */
export function SelectionPopupPlugin({
  onSelectionChange,
  maxCharacters,
  onCharacterLimitReached,
  initialSelectionText,
  clearSelectionOnClose = false,
  renderPopup,
}: SelectionPopupPluginProps): JSX.Element | null {
  const [editor] = useLexicalComposerContext();
  const [selectionInfo, setSelectionInfo] = useState<SelectionInfo | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const isProcessingAIAction = useRef(false); // Track if AI action is in progress
  const hasAppliedInitialSelection = useRef(false);

  const updateSelection = useCallback(() => {
    // Don't clear the popup while an AI action is being processed
    if (isProcessingAIAction.current) return;

    editor.getEditorState().read(() => {
      const selection = $getSelection();

      if (!$isRangeSelection(selection) || selection.isCollapsed()) {
        setSelectionInfo(null);
        setIsVisible(false);
        onSelectionChange?.(null);
        return;
      }

      const text = selection.getTextContent();
      if (!text || text.trim().length === 0) {
        setSelectionInfo(null);
        setIsVisible(false);
        onSelectionChange?.(null);
        return;
      }

      // Get the DOM selection to position the popup
      const nativeSelection = window.getSelection();
      if (!nativeSelection || nativeSelection.rangeCount === 0) {
        return;
      }

      // Only show popup if the native selection is inside the editor
      const editorRoot = editor.getRootElement();
      if (
        !editorRoot ||
        !nativeSelection.anchorNode ||
        !editorRoot.contains(nativeSelection.anchorNode)
      ) {
        setSelectionInfo(null);
        setIsVisible(false);
        onSelectionChange?.(null);
        return;
      }

      const range = nativeSelection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      const anchor = selection.anchor;
      const focus = selection.focus;
      const start = Math.min(anchor.offset, focus.offset);
      const end = Math.max(anchor.offset, focus.offset);

      const info: SelectionInfo = {
        text,
        start,
        end,
        rect,
      };

      setSelectionInfo(info);
      setIsVisible(true);
      onSelectionChange?.(info);
    });
  }, [editor, onSelectionChange]);

  const handleClose = useCallback(() => {
    setIsVisible(false);
    setSelectionInfo(null);
    isProcessingAIAction.current = false; // Reset flag when closing
    if (clearSelectionOnClose) {
      editor.update(() => {
        $setSelection(null);
      }, { discrete: true });
      window.getSelection()?.removeAllRanges();
      onSelectionChange?.(null);
    }
  }, [clearSelectionOnClose, editor, onSelectionChange]);

  const cancelAIAction = useCallback(() => {
    console.log('[SelectionPopupPlugin] AI action cancelled, unlocking popup');
    isProcessingAIAction.current = false;
  }, []);

  useEffect(() => {
    const textToSelect = initialSelectionText?.trim();
    if (!textToSelect || hasAppliedInitialSelection.current) return;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let frameId: number | undefined;

    const applyInitialSelection = () => {
      let didSelect = false;

      editor.update(() => {
        const root = $getRoot();
        for (const textNode of root.getAllTextNodes()) {
          const text = textNode.getTextContent();
          const start = text.indexOf(textToSelect);
          if (start < 0) continue;

          textNode.select(start, start + textToSelect.length);
          didSelect = true;
          break;
        }
      }, { discrete: true });

      if (!didSelect) return;

      hasAppliedInitialSelection.current = true;
      frameId = requestAnimationFrame(() => {
        updateSelection();
      });
    };

    timeoutId = setTimeout(applyInitialSelection, 120);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [editor, initialSelectionText, updateSelection]);

  const normalizedMaxCharacters =
    typeof maxCharacters === 'number' && Number.isFinite(maxCharacters) && maxCharacters > 0
      ? Math.floor(maxCharacters)
      : null;

  // Replace the current selection with new text
  // keepOpen: if true, don't close the popup (for inline review mode)
  const replaceSelection = useCallback((
    newText: string,
    keepOpen?: boolean,
    options?: SelectionReplacementOptions
  ): SelectionReplacementResult | undefined => {
    // Store the selection info before updating, in case it gets cleared
    const storedSelectionInfo = selectionInfo;

    if (!storedSelectionInfo) {
      console.warn('[SelectionPopupPlugin] No selection info available for replacement');
      return undefined;
    }

    const editorStateBefore = editor.getEditorState().toJSON();
    let editorStateAfter: Record<string, any> | undefined;
    const cursorPosition = storedSelectionInfo.start + newText.length;

    if (normalizedMaxCharacters) {
      let exceedsLimit = false;
      editor.getEditorState().read(() => {
        const currentLength = $getRoot().getTextContent().length;
        const selectedLength = storedSelectionInfo.text.length;
        const projectedLength = currentLength - selectedLength + newText.length;
        exceedsLimit = projectedLength > normalizedMaxCharacters && projectedLength >= currentLength;
      });

      if (exceedsLimit) {
        onCharacterLimitReached?.(normalizedMaxCharacters);
        return undefined;
      }
    }

    const shouldSuppressTextChange =
      options?.suppressTextChangeTracking === true && newText !== storedSelectionInfo.text;
    let didReplace = false;

    // Set flag to prevent popup from closing during AI dialog interaction
    isProcessingAIAction.current = true;

    if (shouldSuppressTextChange) {
      editor.dispatchCommand(TRACKING_SUPPRESS_NEXT_TEXT_CHANGE_COMMAND, true);
    }

    editor.update(() => {
      const selection = $getSelection();

      // If selection is still active, use it directly
      if ($isRangeSelection(selection) && !selection.isCollapsed()) {
        selection.insertText(newText);
        didReplace = true;
      } else {
        // Selection was lost (e.g., user clicked on dialog), restore it using stored offsets
        const root = $getRoot();
        const textNodes: any[] = [];

        // Collect all text nodes
        root.getChildren().forEach((child: any) => {
          if (child.getTextContent) {
            child.getChildren().forEach((node: any) => {
              if (node.getTextContent) {
                textNodes.push(node);
              }
            });
          }
        });

        // Find the text node and restore selection
        let currentOffset = 0;
        for (const textNode of textNodes) {
          const textContent = textNode.getTextContent();
          const nodeLength = textContent.length;

          if (currentOffset + nodeLength >= storedSelectionInfo.start) {
            const localStart = storedSelectionInfo.start - currentOffset;
            const localEnd = Math.min(storedSelectionInfo.end - currentOffset, nodeLength);

            // Select the text in this node
            const newSelection = $createRangeSelection();
            newSelection.anchor.set(textNode.getKey(), localStart, 'text');
            newSelection.focus.set(textNode.getKey(), localEnd, 'text');
            $setSelection(newSelection);

            // Now insert the new text
            newSelection.insertText(newText);
            didReplace = true;
            break;
          }

          currentOffset += nodeLength;
        }
      }

      editorStateAfter = editor.getEditorState().toJSON();
    });

    if (shouldSuppressTextChange && !didReplace) {
      editor.dispatchCommand(TRACKING_SUPPRESS_NEXT_TEXT_CHANGE_COMMAND, false);
    }

    if (keepOpen) {
      // Keep popup open for inline review (Undo/Keep)
      isProcessingAIAction.current = true;
    } else {
      // Reset flag and close popup
      isProcessingAIAction.current = false;
      handleClose();
    }

    return {
      selectionStart: storedSelectionInfo.start,
      selectionEnd: storedSelectionInfo.end,
      cursorPosition,
      editorStateBefore,
      editorStateAfter,
    };
  }, [editor, handleClose, normalizedMaxCharacters, onCharacterLimitReached, selectionInfo]);

  // Undo the last editor action (used for reverting AI text replacements)
  const undoLastAction = useCallback(() => {
    editor.dispatchCommand(UNDO_COMMAND, undefined);
  }, [editor]);

  useEffect(() => {
    // Listen for selection changes
    const removeListener = editor.registerCommand(
      SELECTION_CHANGE_COMMAND,
      () => {
        // Delay to ensure selection is updated
        requestAnimationFrame(updateSelection);
        return false;
      },
      COMMAND_PRIORITY_LOW
    );

    // Also listen for mouseup to catch selection via mouse (only inside editor)
    const handleMouseUp = (e: MouseEvent) => {
      const editorRoot = editor.getRootElement();
      if (editorRoot && editorRoot.contains(e.target as Node)) {
        setTimeout(updateSelection, 10);
      }
    };

    // Listen for keyup to catch selection via keyboard (shift+arrow keys, only inside editor)
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.shiftKey) {
        const editorRoot = editor.getRootElement();
        if (editorRoot && editorRoot.contains(e.target as Node)) {
          setTimeout(updateSelection, 10);
        }
      }
    };

    // Hide popup when clicking outside
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Don't close if clicking on a button within the popup
      if (popupRef.current && popupRef.current.contains(target)) {
        console.log('[SelectionPopupPlugin] Click is within popup, keeping open');
        // Set flag when clicking buttons in popup (AI actions)
        if (target.closest('button')) {
          isProcessingAIAction.current = true;
          console.log('[SelectionPopupPlugin] AI action initiated, locking popup');
        }
        return;
      }

      // Don't close if an AI action is being processed
      if (isProcessingAIAction.current) {
        console.log('[SelectionPopupPlugin] Ignoring click outside - AI action in progress');
        return;
      }

      // Check if click is within the editor or AI dialog
      const editorRoot = editor.getRootElement();

      // Check if the click is on an AI dialog (which has role="dialog" or data-radix-portal)
      const isDialogClick = target.closest('[role="dialog"]') || target.closest('[data-radix-portal]');

      if (isDialogClick) {
        console.log('[SelectionPopupPlugin] Click is on dialog, keeping popup open');
        return;
      }

      if (editorRoot && !editorRoot.contains(target)) {
        console.log('[SelectionPopupPlugin] Click outside editor and popup, closing');
        handleClose();
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('keyup', handleKeyUp);
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      removeListener();
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('keyup', handleKeyUp);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [editor, updateSelection, handleClose]);

  // Don't render if no selection or no renderPopup function
  if (!isVisible || !selectionInfo || !renderPopup) {
    return null;
  }

  // Calculate popup position (above the selection, clamped to viewport)
  const POPUP_WIDTH_ESTIMATE = 500; // approximate popup width
  const PADDING = 8;
  const centerX = selectionInfo.rect.left + selectionInfo.rect.width / 2;
  const viewportWidth = window.innerWidth;

  // Clamp horizontal position so popup stays within viewport
  let left = centerX;
  let translateX = '-50%';
  if (centerX - POPUP_WIDTH_ESTIMATE / 2 < PADDING) {
    left = PADDING;
    translateX = '0%';
  } else if (centerX + POPUP_WIDTH_ESTIMATE / 2 > viewportWidth - PADDING) {
    left = viewportWidth - PADDING;
    translateX = '-100%';
  }

  const popupStyle: React.CSSProperties = {
    position: 'fixed',
    top: selectionInfo.rect.top - 8,
    left,
    transform: `translate(${translateX}, -100%)`,
    zIndex: 1000,
  };

  return createPortal(
    <div ref={popupRef} style={popupStyle}>
      {renderPopup({ selection: selectionInfo, onClose: handleClose, replaceSelection, cancelAIAction, undoLastAction })}
    </div>,
    document.body
  );
}
