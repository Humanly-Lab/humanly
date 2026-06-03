import { render, screen, waitFor } from '@testing-library/react';
import { AISelectionMenu } from '@/components/ai/ai-selection-menu';

jest.mock('@/lib/api-client', () => ({
  __esModule: true,
  default: {
    get: jest.fn(() => Promise.resolve({ data: { data: { hasApiKey: true } } })),
    post: jest.fn(() => Promise.resolve({ data: { success: true } })),
  },
}));

const baseProps = {
  documentId: 'doc-1',
  selection: {
    text: 'selected text',
    start: 0,
    end: 13,
    rect: {} as DOMRect,
  },
  onClose: jest.fn(),
  replaceSelection: jest.fn(),
  cancelAIAction: jest.fn(),
  undoLastAction: jest.fn(),
};

describe('AISelectionMenu access modes', () => {
  it('shows only rewrite quick actions in polish-only mode', async () => {
    const registerActionTrigger = jest.fn();

    render(
      <AISelectionMenu
        {...baseProps}
        allowPolishActions
        allowAskAI={false}
        onAskAI={jest.fn()}
        registerActionTrigger={registerActionTrigger}
      />
    );

    expect(screen.getByRole('button', { name: /fix grammar/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /improve writing/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /simplify/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /make formal/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ask ai/i })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(registerActionTrigger).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  it('shows only Ask AI and unregisters quick-action shortcuts in chat-only mode', async () => {
    const registerActionTrigger = jest.fn();

    render(
      <AISelectionMenu
        {...baseProps}
        allowPolishActions={false}
        allowAskAI
        onAskAI={jest.fn()}
        registerActionTrigger={registerActionTrigger}
      />
    );

    expect(screen.getByRole('button', { name: /ask ai/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /fix grammar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /improve writing/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /simplify/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /make formal/i })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(registerActionTrigger).toHaveBeenCalledWith(null);
    });
  });
});
