jest.mock('@/lib/api-client', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

jest.mock('@/lib/socket-client', () => ({
  initializeSocket: jest.fn(),
  emitEvent: jest.fn(),
  onEvent: jest.fn(),
  offEvent: jest.fn(),
}));

const mockStreamSilent = jest.fn();
const mockCancelSilentStream = jest.fn();

jest.mock('@/stores/ai-store', () => ({
  useAIStore: {
    getState: () => ({
      streamSilent: mockStreamSilent,
      cancelSilentStream: mockCancelSilentStream,
    }),
  },
}));

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AISelectionMenu, type ActionType } from '@/components/ai/ai-selection-menu';
import api from '@/lib/api-client';

const mockedApi = api as jest.Mocked<typeof api>;

const selection = {
  text: 'This are bad grammar.',
  start: 7,
  end: 28,
  rect: {
    x: 0,
    y: 0,
    width: 100,
    height: 20,
    top: 0,
    left: 0,
    right: 100,
    bottom: 20,
    toJSON: () => ({}),
  } as DOMRect,
};

const plainText = `Before. ${selection.text} After.`;

function renderMenu(extraProps?: { registerActionTrigger?: (trigger: ((type: ActionType) => void) | null) => void }) {
  const replaceSelection = jest.fn();
  const cancelAIAction = jest.fn();
  const undoLastAction = jest.fn();
  const onClose = jest.fn();
  const onActionApplied = jest.fn();

  const utils = render(
    <AISelectionMenu
      documentId="doc-1"
      selection={selection}
      replaceSelection={replaceSelection}
      cancelAIAction={cancelAIAction}
      undoLastAction={undoLastAction}
      onClose={onClose}
      onActionApplied={onActionApplied}
      getDocumentPlainText={() => plainText}
      documentTitle="Test doc"
      registerActionTrigger={extraProps?.registerActionTrigger}
    />,
  );

  return {
    ...utils,
    replaceSelection,
    cancelAIAction,
    undoLastAction,
    onClose,
    onActionApplied,
  };
}

describe('AISelectionMenu quick actions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedApi.get.mockResolvedValue({ data: { data: { hasApiKey: true } } } as any);
    mockedApi.post.mockResolvedValue({ data: { success: true } } as any);
  });

  it('streams the suggestion via streamSilent and accepts on Apply', async () => {
    mockStreamSilent.mockImplementation(async (_docId, _msg, _ctx, onChunk: (c: string) => void) => {
      onChunk('This is ');
      onChunk('better.');
      return 'This is better.';
    });

    const { replaceSelection, onActionApplied, onClose } = renderMenu();

    await userEvent.click(await screen.findByRole('button', { name: /fix grammar/i }));

    await waitFor(() => {
      expect(mockStreamSilent).toHaveBeenCalledTimes(1);
    });

    // Context carries selectedText + a surroundingContext window from plainText.
    const [, , passedContext] = mockStreamSilent.mock.calls[0];
    expect(passedContext.selectedText).toBe(selection.text);
    expect(passedContext.surroundingContext).toEqual(
      expect.objectContaining({
        before: expect.any(String),
        after: expect.any(String),
        documentTitle: 'Test doc',
      }),
    );
    expect(passedContext.surroundingContext.before).toContain('Before.');
    expect(passedContext.surroundingContext.after).toContain('After.');

    // Chat-side REST endpoint is NOT hit during the stream; selection-action
    // tracking still uses REST on Apply.
    expect(mockedApi.post).not.toHaveBeenCalledWith('/ai/chat', expect.anything(), expect.anything());

    await waitFor(() => {
      expect(screen.getByText(/better/)).toBeInTheDocument();
    });

    const applyButton = screen.getByRole('button', { name: /apply/i });
    expect(applyButton).toBeEnabled();
    await userEvent.click(applyButton);

    expect(replaceSelection).toHaveBeenCalledWith('This is better.', true);
    expect(onActionApplied).toHaveBeenCalledWith('grammar', selection.text, 'This is better.', undefined);
    expect(mockedApi.post).toHaveBeenCalledWith(
      '/ai/selection-action',
      expect.objectContaining({
        documentId: 'doc-1',
        actionType: 'grammar',
        decision: 'accepted',
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('registers a keyboard trigger that runs the selected action', async () => {
    mockStreamSilent.mockResolvedValue('Streamed result.');

    let captured: ((type: ActionType) => void) | null = null;
    renderMenu({
      registerActionTrigger: (trigger) => {
        captured = trigger;
      },
    });

    // Wait for the hasAISettings probe to settle so handleAction does not
    // short-circuit on the warning path.
    await waitFor(() => expect(mockedApi.get).toHaveBeenCalled());

    expect(captured).toBeInstanceOf(Function);

    captured?.('improve');

    await waitFor(() => {
      expect(mockStreamSilent).toHaveBeenCalledTimes(1);
    });

    const [, prompt] = mockStreamSilent.mock.calls[0];
    expect(prompt).toMatch(/improve the following text/i);
  });
});
