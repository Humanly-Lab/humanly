import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import NewDocumentPage from '@/app/documents/new/page';

const mockPush = jest.fn();
const mockToast = jest.fn();
const mockCreateDocument = jest.fn();
const mockApiGet = jest.fn();
const mockApiPut = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

jest.mock('@/hooks/use-documents', () => ({
  useDocuments: () => ({
    createDocument: mockCreateDocument,
  }),
}));

jest.mock('@/lib/api-client', () => ({
  apiClient: {
    get: (...args: any[]) => mockApiGet(...args),
    put: (...args: any[]) => mockApiPut(...args),
    post: jest.fn(),
  },
}));

const createPersonalEnvironmentJson = (overrides: Record<string, unknown> = {}) => ({
  preset: 'custom',
  taskType: 'personal',
  instructions: {
    hasInstructionPdf: false,
    editableAfterSubmission: true,
  },
  aiAccess: 'off',
  allowedModels: [],
  customModels: [],
  aiTokenBudget: {
    shortcutMaxTokens: 1024,
    chatMaxTokens: 4096,
  },
  aiUsageLimit: {
    mode: 'unlimited',
  },
  time: {
    lateSubmission: 'allowed',
  },
  submission: {
    mode: 'multiple',
  },
  traceability: {
    trackAiUsage: false,
    trackTyping: true,
    trackCopyPaste: true,
    trackFocusBlur: true,
  },
  copyPastePolicy: 'allowed',
  ...overrides,
});

describe('document creation workflow', () => {
  beforeAll(() => {
    Object.defineProperty(Element.prototype, 'hasPointerCapture', {
      configurable: true,
      value: jest.fn(() => false),
    });
    Object.defineProperty(Element.prototype, 'setPointerCapture', {
      configurable: true,
      value: jest.fn(),
    });
    Object.defineProperty(Element.prototype, 'releasePointerCapture', {
      configurable: true,
      value: jest.fn(),
    });
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: jest.fn(),
    });
  });

  beforeEach(() => {
    mockPush.mockClear();
    mockToast.mockClear();
    mockCreateDocument.mockReset();
    mockApiGet.mockReset();
    mockApiPut.mockReset();
    mockApiGet.mockResolvedValue({ data: { data: null } });
    mockApiPut.mockResolvedValue({ data: { success: true } });
  });

  it('blocks empty titles and creates an AI-off document that opens the editor', async () => {
    const user = userEvent.setup();
    mockCreateDocument.mockResolvedValueOnce({ id: 'doc-123', title: 'Workflow Document' });

    render(<NewDocumentPage />);

    await screen.findByRole('heading', { name: /create writing/i });
    await user.click(screen.getByRole('button', { name: /^create writing$/i }));

    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Error',
      description: 'Please enter a document title',
      variant: 'destructive',
    }));
    expect(mockCreateDocument).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/document name/i), 'Workflow Document');
    await user.type(screen.getByLabelText(/description/i), 'Current document workflow');

    expect(screen.getByText('A simple personal writing setup with authorship tracking enabled and no AI assistant configured.')).toBeInTheDocument();
    expect(screen.getByText('Copy & paste allowed')).toBeInTheDocument();
    expect(screen.getByText('Choose Custom to configure AI access, copy-paste rules, or a time limit.')).toBeInTheDocument();
    expect(screen.queryByText('Writing Control')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/ai api key/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^create writing$/i }));

    await waitFor(() => {
      expect(mockCreateDocument).toHaveBeenCalledWith(
        'Workflow Document',
        undefined,
        expect.objectContaining({
          aiAccess: 'off',
          taskType: 'personal',
        }),
        'Current document workflow'
      );
      expect(mockPush).toHaveBeenCalledWith('/documents/doc-123');
    });
  });

  it('keeps default environment simple and reveals controls when custom is selected', async () => {
    const user = userEvent.setup();

    render(<NewDocumentPage />);

    await screen.findByRole('heading', { name: /create writing/i });
    expect(screen.getByText('Choose Custom to configure AI access, copy-paste rules, or a time limit.')).toBeInTheDocument();
    expect(screen.queryByText('Writing Control')).not.toBeInTheDocument();
    expect(screen.queryByText('Time Limitation')).not.toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: /environment/i }));
    await user.click(await screen.findByRole('option', { name: 'Custom' }));

    expect(screen.getByText('Writing Control')).toBeInTheDocument();
    expect(screen.getByText('Time Limitation')).toBeInTheDocument();
    expect(screen.getAllByText('Off').length).toBeGreaterThan(0);
    expect(screen.queryByLabelText(/minimum characters/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/maximum characters/i)).toBeInTheDocument();
    expect(screen.queryByText('Choose Custom to configure AI access, copy-paste rules, or a time limit.')).not.toBeInTheDocument();
  });

  it('shows only the import box until a JSON environment is applied', async () => {
    const user = userEvent.setup();
    render(<NewDocumentPage />);

    await screen.findByRole('heading', { name: /create writing/i });
    await user.click(screen.getByRole('combobox', { name: /environment/i }));
    await user.click(await screen.findByRole('option', { name: 'Import Environment' }));

    expect(screen.getByText('Import JSON Configuration')).toBeInTheDocument();
    expect(screen.queryByText('Custom Environment')).not.toBeInTheDocument();
    expect(screen.queryByText('Default Environment')).not.toBeInTheDocument();

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"][accept="application/json,.json"]');
    expect(fileInput).toBeTruthy();

    const environmentJson = JSON.stringify(createPersonalEnvironmentJson({
      copyPastePolicy: 'blocked',
      submission: { mode: 'multiple', maxCharacters: 123 },
      traceability: {
        trackAiUsage: false,
        trackTyping: true,
        trackCopyPaste: false,
        trackFocusBlur: true,
      },
    }));
    const environmentFile = new File([environmentJson], 'environment.json', { type: 'application/json' });
    Object.defineProperty(environmentFile, 'text', {
      value: jest.fn().mockResolvedValue(environmentJson),
    });

    await user.upload(fileInput!, environmentFile);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Environment imported',
      }));
    });
    expect(screen.getByText('Custom Environment')).toBeInTheDocument();
    expect(screen.getByText('Paste blocked')).toBeInTheDocument();
    expect(screen.queryByText('Import JSON Configuration')).not.toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: /environment/i }));
    await user.click(await screen.findByRole('option', { name: 'Import Environment' }));

    expect(screen.getByText('Import JSON Configuration')).toBeInTheDocument();
    expect(screen.queryByText('Custom Environment')).not.toBeInTheDocument();
  });

  it('preserves imported AI-on environments with an explicit provider', async () => {
    const user = userEvent.setup();
    render(<NewDocumentPage />);

    await screen.findByRole('heading', { name: /create writing/i });
    await user.click(screen.getByRole('combobox', { name: /environment/i }));
    await user.click(await screen.findByRole('option', { name: 'Import Environment' }));

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"][accept="application/json,.json"]');
    expect(fileInput).toBeTruthy();

    const environmentJson = JSON.stringify(createPersonalEnvironmentJson({
      aiAccess: 'full',
      aiProvider: {
        provider: 'openrouter',
        baseUrl: 'https://openrouter.ai/api/v1',
      },
      allowedModels: ['qwen/qwen3.5-397b-a17b'],
      traceability: {
        trackAiUsage: true,
        trackTyping: true,
        trackCopyPaste: true,
        trackFocusBlur: true,
      },
    }));
    const environmentFile = new File([environmentJson], 'ai-on-environment.json', { type: 'application/json' });
    Object.defineProperty(environmentFile, 'text', {
      value: jest.fn().mockResolvedValue(environmentJson),
    });

    await user.upload(fileInput!, environmentFile);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Environment imported',
        description: 'The JSON configuration was applied to this document.',
      }));
    });

    expect(screen.getByText('Custom Environment')).toBeInTheDocument();
    expect(screen.getByText('Full')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^edit settings$/i }));
    expect(screen.getByText('qwen/qwen3.5-397b-a17b')).toBeInTheDocument();
    expect(screen.getByText('OpenRouter')).toBeInTheDocument();
  });

  it('rejects AI-on environment JSON without an explicit provider', async () => {
    const user = userEvent.setup();
    render(<NewDocumentPage />);

    await screen.findByRole('heading', { name: /create writing/i });
    await user.click(screen.getByRole('combobox', { name: /environment/i }));
    await user.click(await screen.findByRole('option', { name: 'Import Environment' }));

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"][accept="application/json,.json"]');
    expect(fileInput).toBeTruthy();

    const environment = createPersonalEnvironmentJson({
      aiAccess: 'full',
      allowedModels: ['qwen/qwen3.5-397b-a17b'],
      traceability: {
        trackAiUsage: true,
        trackTyping: true,
        trackCopyPaste: true,
        trackFocusBlur: true,
      },
    });
    const environmentJson = JSON.stringify(environment);
    const environmentFile = new File([environmentJson], 'missing-provider-environment.json', { type: 'application/json' });
    Object.defineProperty(environmentFile, 'text', {
      value: jest.fn().mockResolvedValue(environmentJson),
    });

    await user.upload(fileInput!, environmentFile);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Invalid environment file',
        variant: 'destructive',
      }));
    });
    expect(screen.getByText('Import JSON Configuration')).toBeInTheDocument();
    expect(screen.queryByText('Custom Environment')).not.toBeInTheDocument();
  });

  it('rejects environment JSON missing required template entries', async () => {
    const user = userEvent.setup();
    render(<NewDocumentPage />);

    await screen.findByRole('heading', { name: /create writing/i });
    await user.click(screen.getByRole('combobox', { name: /environment/i }));
    await user.click(await screen.findByRole('option', { name: 'Import Environment' }));

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"][accept="application/json,.json"]');
    expect(fileInput).toBeTruthy();

    const environment = createPersonalEnvironmentJson();
    delete (environment as any).aiTokenBudget;
    const environmentJson = JSON.stringify(environment);
    const environmentFile = new File([environmentJson], 'incomplete-environment.json', { type: 'application/json' });
    Object.defineProperty(environmentFile, 'text', {
      value: jest.fn().mockResolvedValue(environmentJson),
    });

    await user.upload(fileInput!, environmentFile);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Invalid environment file',
        variant: 'destructive',
      }));
    });
    expect(screen.getByText('Import JSON Configuration')).toBeInTheDocument();
    expect(screen.queryByText('Custom Environment')).not.toBeInTheDocument();
  });

  it('does not expose or persist minimum character limits for personal writing', async () => {
    const user = userEvent.setup();
    mockCreateDocument.mockResolvedValueOnce({ id: 'doc-123', title: 'Personal Character Policy' });

    render(<NewDocumentPage />);

    await screen.findByRole('heading', { name: /create writing/i });
    await user.type(screen.getByLabelText(/document name/i), 'Personal Character Policy');
    await user.click(screen.getByRole('combobox', { name: /environment/i }));
    await user.click(await screen.findByRole('option', { name: 'Custom' }));

    expect(screen.queryByLabelText(/minimum characters/i)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/maximum characters/i), '200');
    await user.click(screen.getByRole('button', { name: /^done$/i }));
    await user.click(screen.getByRole('button', { name: /^create writing$/i }));

    await waitFor(() => {
      expect(mockCreateDocument).toHaveBeenCalledWith(
        'Personal Character Policy',
        undefined,
        expect.objectContaining({
          taskType: 'personal',
          submission: expect.objectContaining({
            maxCharacters: 200,
          }),
        }),
        ''
      );
    });

    expect(mockCreateDocument.mock.calls[0][2].submission.minCharacters).toBeUndefined();
  });

  it('keeps known-provider model choices on the curated whitelist without a separate connection test', async () => {
    const user = userEvent.setup();

    render(<NewDocumentPage />);

    await screen.findByRole('heading', { name: /create writing/i });
    await user.click(screen.getByRole('combobox', { name: /environment/i }));
    await user.click(await screen.findByRole('option', { name: 'Custom' }));
    await user.click(screen.getByRole('combobox', { name: /ai access/i }));
    await user.click(await screen.findByRole('option', { name: 'Full' }));

    await user.type(screen.getByLabelText(/ai api key/i), 'sk-or-test');
    await user.click(screen.getByRole('combobox', { name: /ai provider/i }));
    await user.click(await screen.findByRole('option', { name: 'OpenRouter' }));

    expect(screen.queryByRole('button', { name: /test connection/i })).not.toBeInTheDocument();
    expect(screen.getByText('qwen/qwen3.5-397b-a17b')).toBeInTheDocument();
    expect(screen.queryByText('qwen/qwen-plus-2025-07-28')).not.toBeInTheDocument();
    expect(screen.queryByText('Custom model')).not.toBeInTheDocument();
    expect(screen.queryByText('Custom Base URL')).not.toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: /ai provider/i }));
    await user.click(await screen.findByRole('option', { name: 'OpenAI' }));
    expect(screen.getByText('gpt-5.4-mini')).toBeInTheDocument();
    expect(screen.queryByText('gpt-4o')).not.toBeInTheDocument();
    expect(screen.queryByText('Custom model')).not.toBeInTheDocument();

    await user.click(screen.getByRole('combobox', { name: /ai provider/i }));
    await user.click(await screen.findByRole('option', { name: 'Anthropic' }));
    expect(screen.getByText('claude-sonnet-4-6')).toBeInTheDocument();
    expect(screen.queryByText('claude-sonnet-4-5')).not.toBeInTheDocument();
    expect(screen.queryByText('Custom model')).not.toBeInTheDocument();
  });

  it('persists the selected provider with the environment JSON config', async () => {
    const user = userEvent.setup();
    mockCreateDocument.mockResolvedValueOnce({ id: 'doc-456', title: 'Provider-bound Writing' });

    render(<NewDocumentPage />);

    await screen.findByRole('heading', { name: /create writing/i });
    await user.type(screen.getByLabelText(/document name/i), 'Provider-bound Writing');
    await user.click(screen.getByRole('combobox', { name: /environment/i }));
    await user.click(await screen.findByRole('option', { name: 'Custom' }));
    await user.click(screen.getByRole('combobox', { name: /ai access/i }));
    await user.click(await screen.findByRole('option', { name: 'Full' }));
    await user.type(screen.getByLabelText(/ai api key/i), 'sk-or-test');
    await user.click(screen.getByRole('combobox', { name: /ai provider/i }));
    await user.click(await screen.findByRole('option', { name: 'OpenRouter' }));
    await user.click(screen.getByRole('button', { name: /^done$/i }));
    await user.click(screen.getByRole('button', { name: /^create writing$/i }));

    await waitFor(() => {
      expect(mockApiPut).toHaveBeenCalledWith('/ai/settings', expect.objectContaining({
        apiKey: 'sk-or-test',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'qwen/qwen3.5-397b-a17b',
      }));
      expect(mockCreateDocument).toHaveBeenCalledWith(
        'Provider-bound Writing',
        undefined,
        expect.objectContaining({
          aiAccess: 'full',
          aiProvider: {
            provider: 'openrouter',
            baseUrl: 'https://openrouter.ai/api/v1',
          },
          allowedModels: ['qwen/qwen3.5-397b-a17b'],
          customModels: [],
        }),
        '',
      );
    });
  });

  it('persists agent-chat-only AI access for personal documents', async () => {
    const user = userEvent.setup();
    mockCreateDocument.mockResolvedValueOnce({ id: 'doc-chat', title: 'Chat-only Writing' });

    render(<NewDocumentPage />);

    await screen.findByRole('heading', { name: /create writing/i });
    await user.type(screen.getByLabelText(/document name/i), 'Chat-only Writing');
    await user.click(screen.getByRole('combobox', { name: /environment/i }));
    await user.click(await screen.findByRole('option', { name: 'Custom' }));
    await user.click(screen.getByRole('combobox', { name: /ai access/i }));
    await user.click(await screen.findByRole('option', { name: 'Only agent chat' }));
    await user.type(screen.getByLabelText(/ai api key/i), 'sk-chat-test');
    await user.click(screen.getByRole('button', { name: /^done$/i }));
    await user.click(screen.getByRole('button', { name: /^create writing$/i }));

    await waitFor(() => {
      expect(mockApiPut).toHaveBeenCalledWith('/ai/settings', expect.objectContaining({
        apiKey: 'sk-chat-test',
      }));
      expect(mockCreateDocument).toHaveBeenCalledWith(
        'Chat-only Writing',
        undefined,
        expect.objectContaining({
          aiAccess: 'chat',
          traceability: expect.objectContaining({
            trackAiUsage: true,
          }),
        }),
        '',
      );
    });
  });

  it('closes custom settings without a separate AI key verification step and validates on create', async () => {
    const user = userEvent.setup();
    render(<NewDocumentPage />);

    await screen.findByRole('heading', { name: /create writing/i });
    await user.click(screen.getByRole('combobox', { name: /environment/i }));
    await user.click(await screen.findByRole('option', { name: 'Custom' }));
    await user.click(screen.getByRole('combobox', { name: /ai access/i }));
    await user.click(await screen.findByRole('option', { name: 'Full' }));

    await user.click(screen.getByRole('button', { name: /^done$/i }));

    expect(screen.queryByRole('button', { name: /test connection/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /custom environment/i })).not.toBeInTheDocument();
    expect(screen.getByText('Custom Environment')).toBeInTheDocument();
    expect(screen.getByText('Full')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/document name/i), 'Needs AI Key');
    await user.click(screen.getByRole('button', { name: /^create writing$/i }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
        title: 'AI key required',
      }));
    });
    expect(mockApiPut).not.toHaveBeenCalled();
    expect(mockCreateDocument).not.toHaveBeenCalled();
  });

  it('reverts unvalidated AI-on settings when the custom dialog is dismissed', async () => {
    const user = userEvent.setup();
    render(<NewDocumentPage />);

    await screen.findByRole('heading', { name: /create writing/i });
    await user.click(screen.getByRole('combobox', { name: /environment/i }));
    await user.click(await screen.findByRole('option', { name: 'Custom' }));
    await user.click(screen.getByRole('combobox', { name: /ai access/i }));
    await user.click(await screen.findByRole('option', { name: 'Full' }));

    await user.click(screen.getByRole('button', { name: /^close$/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /custom environment/i })).not.toBeInTheDocument();
    });
    expect(screen.getByText('Custom Environment')).toBeInTheDocument();
    expect(screen.getByText('Off')).toBeInTheDocument();
  });

  it('allows the time-limit minutes field to be cleared while editing', async () => {
    const user = userEvent.setup();

    render(<NewDocumentPage />);

    await screen.findByRole('heading', { name: /create writing/i });
    await user.click(screen.getByRole('combobox', { name: /environment/i }));
    await user.click(await screen.findByRole('option', { name: 'Custom' }));
    await user.click(screen.getByRole('combobox', { name: /time policy/i }));
    await user.click(await screen.findByRole('option', { name: 'Time limited' }));

    const timeLimitInput = await screen.findByLabelText(/time limit \(minutes\)/i);
    await user.clear(timeLimitInput);

    expect(timeLimitInput).toHaveDisplayValue('');

    fireEvent.blur(timeLimitInput);
    expect(timeLimitInput).toHaveValue(1);
  });
});
