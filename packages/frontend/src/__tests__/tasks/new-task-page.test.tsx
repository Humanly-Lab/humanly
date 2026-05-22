import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';

import NewTaskPage from '@/app/tasks/new/page';

const mockPush = jest.fn();
const mockToast = jest.fn();
const mockApiGet = jest.fn();
const mockApiPost = jest.fn();
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

jest.mock('@/lib/api-client', () => ({
  api: {
    get: (...args: any[]) => mockApiGet(...args),
    post: (...args: any[]) => mockApiPost(...args),
    put: (...args: any[]) => mockApiPut(...args),
  },
}));

jest.mock('@/components/ui/select', () => {
  const SelectContext = React.createContext<{
    value?: string;
    onValueChange?: (value: string) => void;
  }>({});

  return {
    Select: ({ value, onValueChange, children }: any) => (
      <SelectContext.Provider value={{ value, onValueChange }}>
        <div>{children}</div>
      </SelectContext.Provider>
    ),
    SelectTrigger: ({ children }: any) => <div>{children}</div>,
    SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
    SelectContent: ({ children }: any) => <div>{children}</div>,
    SelectItem: ({ value, children }: any) => {
      const context = React.useContext(SelectContext);
      return (
        <button
          type="button"
          role="option"
          aria-selected={context.value === value}
          onClick={() => context.onValueChange?.(value)}
        >
          {children}
        </button>
      );
    },
  };
});

const createAdminEnvironmentJson = (overrides: Record<string, unknown> = {}) => ({
  preset: 'custom',
  taskType: 'admin_assigned',
  instructions: {
    hasInstructionPdf: false,
    editableAfterSubmission: false,
  },
  aiAccess: 'off',
  allowedModels: [],
  customModels: [],
  aiTokenBudget: {
    shortcutMaxTokens: 1024,
    chatMaxTokens: 4096,
  },
  aiUsageLimit: {
    mode: 'max_requests',
    maxRequests: 100,
  },
  time: {
    lateSubmission: 'not_allowed',
  },
  submission: {
    mode: 'single',
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

describe('admin new task page', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(new Date('2026-05-19T16:00:00.000Z'));
    mockPush.mockClear();
    mockToast.mockClear();
    mockApiGet.mockReset();
    mockApiPost.mockReset();
    mockApiPut.mockReset();

    mockApiGet.mockResolvedValue({ data: null });
    mockApiPost.mockImplementation(async (url: string) => {
      if (url === '/api/v1/tasks') {
        return {
          success: true,
          data: { id: 'created-task-1' },
          message: 'Task created',
        };
      }
      throw new Error(`Unexpected POST ${url}`);
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses the document-style layout and creates default tasks with a two-week window', async () => {
    render(<NewTaskPage />);

    expect(await screen.findByRole('heading', { name: 'New Task' })).toBeInTheDocument();
    expect(screen.getByText('Basic Information')).toBeInTheDocument();
    expect(screen.getAllByText('Environment').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Default Environment').length).toBeGreaterThan(0);
    expect(screen.getByText('Two-week window')).toBeInTheDocument();
    expect(screen.queryByLabelText(/AI Usage Limit/i)).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Task Name/i), {
        target: { value: 'Two Week Draft' },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Create Task$/i }));
    });

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        '/api/v1/tasks',
        expect.objectContaining({
          name: 'Two Week Draft',
          environmentConfig: expect.objectContaining({
            taskType: 'admin_assigned',
            aiAccess: 'off',
            time: expect.objectContaining({
              lateSubmission: 'not_allowed',
            }),
          }),
        })
      );
    });

    const payload = mockApiPost.mock.calls.find(([url]) => url === '/api/v1/tasks')?.[1];
    expect(payload).toBeTruthy();
    const startDate = new Date(payload.startDate);
    const endDate = new Date(payload.endDate);
    expect(endDate.getTime() - startDate.getTime()).toBe(14 * 24 * 60 * 60 * 1000);
    expect(payload.environmentConfig.time.startTime).toBe(payload.startDate);
    expect(payload.environmentConfig.time.endTime).toBe(payload.endDate);
    expect(payload.environmentConfig.time.timeLimitSeconds).toBeUndefined();
  });

  it('creates tasks with an optional writing session timer', async () => {
    render(<NewTaskPage />);

    expect(await screen.findByRole('heading', { name: 'New Task' })).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Task Name/i), {
        target: { value: 'Timed Writing Task' },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: 'Custom' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: 'Time limited' }));
    });

    const timeLimitInput = screen.getByLabelText(/Time Limit \(minutes\)/i);
    expect(timeLimitInput).toHaveValue(60);

    await act(async () => {
      fireEvent.change(timeLimitInput, { target: { value: '45' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Create Task$/i }));
    });

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        '/api/v1/tasks',
        expect.objectContaining({
          name: 'Timed Writing Task',
          environmentConfig: expect.objectContaining({
            time: expect.objectContaining({
              timeLimitSeconds: 45 * 60,
            }),
          }),
        })
      );
    });
  });

  it('auto-tests AI connection before creating AI-enabled tasks', async () => {
    mockApiPost.mockImplementation(async (url: string) => {
      if (url === '/api/v1/ai/settings/test') {
        return {
          success: true,
          message: 'Connection successful.',
          models: ['qwen/qwen3.5-397b-a17b'],
        };
      }
      if (url === '/api/v1/tasks') {
        return {
          success: true,
          data: { id: 'created-ai-task' },
          message: 'Task created',
        };
      }
      throw new Error(`Unexpected POST ${url}`);
    });
    mockApiPut.mockResolvedValue({ success: true });

    render(<NewTaskPage />);

    expect(await screen.findByRole('heading', { name: 'New Task' })).toBeInTheDocument();
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Task Name/i), {
        target: { value: 'AI Task' },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: 'Custom' }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('option', { name: 'AI On' }));
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText(/AI API Key/i), {
        target: { value: 'sk-test' },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Create Task$/i }));
    });

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith('/api/v1/ai/settings/test', expect.objectContaining({
        apiKey: 'sk-test',
      }));
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
        title: 'AI key verified',
      }));
      expect(mockApiPut).toHaveBeenCalledWith('/api/v1/ai/settings', expect.objectContaining({
        apiKey: 'sk-test',
      }));
      expect(mockApiPost).toHaveBeenCalledWith(
        '/api/v1/tasks',
        expect.objectContaining({
          name: 'AI Task',
          environmentConfig: expect.objectContaining({
            aiAccess: 'full',
            traceability: expect.objectContaining({
              trackAiUsage: true,
            }),
          }),
        })
      );
    });
  });

  it('imports AI-on environment JSON and preserves the explicit provider', async () => {
    mockApiGet.mockResolvedValue({
      data: {
        hasApiKey: true,
        maskedApiKey: 'sk-****1234',
        baseUrl: 'https://api.together.xyz/v1',
        model: 'moonshotai/Kimi-K2.6',
      },
    });
    mockApiPut.mockResolvedValue({ success: true });
    mockApiPost.mockImplementation(async (url: string, payload: any) => {
      if (url === '/api/v1/ai/settings/test') {
        expect(payload).toEqual(expect.objectContaining({
          apiKey: '__use_existing__',
          baseUrl: 'https://openrouter.ai/api/v1',
        }));
        return {
          success: true,
          models: ['qwen/qwen3.5-397b-a17b'],
        };
      }
      if (url === '/api/v1/tasks') {
        return {
          success: true,
          data: { id: 'created-task-1' },
          message: 'Task created',
        };
      }
      throw new Error(`Unexpected POST ${url}`);
    });
    render(<NewTaskPage />);

    const importOption = await screen.findByRole('option', { name: 'Import Environment' });
    await act(async () => {
      fireEvent.click(importOption);
    });

    const jsonInput = document.querySelector('input[accept="application/json,.json"]') as HTMLInputElement;
    expect(jsonInput).not.toBeNull();

    const environmentJson = JSON.stringify(createAdminEnvironmentJson({
      aiAccess: 'full',
      aiProvider: {
        provider: 'openrouter',
        baseUrl: 'https://openrouter.ai/api/v1',
      },
      allowedModels: ['qwen/qwen3.5-397b-a17b'],
      aiUsageLimit: { mode: 'max_requests', maxRequests: 42 },
      submission: { mode: 'multiple', minCharacters: 1000 },
      copyPastePolicy: 'blocked',
      traceability: {
        trackAiUsage: true,
        trackTyping: true,
        trackCopyPaste: false,
        trackFocusBlur: true,
      },
    }));
    const environmentFile = new File([environmentJson], 'environment.json', { type: 'application/json' });
    Object.defineProperty(environmentFile, 'text', {
      value: async () => environmentJson,
    });

    await act(async () => {
      fireEvent.change(jsonInput, { target: { files: [environmentFile] } });
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Environment imported',
        description: 'The JSON configuration was applied to this task.',
      }));
    });

    expect(screen.getByRole('option', { name: 'AI On' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText(/AI Usage Limit/i)).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByLabelText(/Task Name/i), {
        target: { value: 'Imported Environment Task' },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /^Create Task$/i }));
    });

    await waitFor(() => {
      expect(mockApiPost).toHaveBeenCalledWith(
        '/api/v1/tasks',
        expect.objectContaining({
          environmentConfig: expect.objectContaining({
            taskType: 'admin_assigned',
            aiAccess: 'full',
            aiProvider: {
              provider: 'openrouter',
              baseUrl: 'https://openrouter.ai/api/v1',
            },
            allowedModels: ['qwen/qwen3.5-397b-a17b'],
            copyPastePolicy: 'blocked',
            aiUsageLimit: {
              mode: 'max_requests',
              maxRequests: 42,
            },
            submission: expect.objectContaining({
              mode: 'multiple',
              minCharacters: 1000,
            }),
            traceability: expect.objectContaining({
              trackAiUsage: true,
            }),
          }),
        })
      );
    });
    expect(mockApiPut).toHaveBeenCalledWith('/api/v1/ai/settings', expect.objectContaining({
      apiKey: '__use_existing__',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'qwen/qwen3.5-397b-a17b',
    }));

  });

  it('rejects AI-on environment JSON without an explicit provider', async () => {
    render(<NewTaskPage />);

    const importOption = await screen.findByRole('option', { name: 'Import Environment' });
    await act(async () => {
      fireEvent.click(importOption);
    });

    const jsonInput = document.querySelector('input[accept="application/json,.json"]') as HTMLInputElement;
    expect(jsonInput).not.toBeNull();

    const environmentJson = JSON.stringify(createAdminEnvironmentJson({
      aiAccess: 'full',
      allowedModels: ['qwen/qwen3.5-397b-a17b'],
      aiUsageLimit: { mode: 'max_requests', maxRequests: 42 },
      traceability: {
        trackAiUsage: true,
        trackTyping: true,
        trackCopyPaste: true,
        trackFocusBlur: true,
      },
    }));
    const environmentFile = new File([environmentJson], 'missing-provider-environment.json', { type: 'application/json' });
    Object.defineProperty(environmentFile, 'text', {
      value: async () => environmentJson,
    });

    await act(async () => {
      fireEvent.change(jsonInput, { target: { files: [environmentFile] } });
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Invalid environment file',
        variant: 'destructive',
      }));
    });
    expect(screen.getByRole('option', { name: 'Import Environment' })).toHaveAttribute('aria-selected', 'true');
    expect(mockApiPost).not.toHaveBeenCalledWith('/api/v1/tasks', expect.anything());
  });

  it('rejects environment JSON missing required template entries', async () => {
    render(<NewTaskPage />);

    const importOption = await screen.findByRole('option', { name: 'Import Environment' });
    await act(async () => {
      fireEvent.click(importOption);
    });

    const jsonInput = document.querySelector('input[accept="application/json,.json"]') as HTMLInputElement;
    expect(jsonInput).not.toBeNull();

    const environment = createAdminEnvironmentJson();
    delete (environment as any).traceability;
    const environmentJson = JSON.stringify(environment);
    const environmentFile = new File([environmentJson], 'incomplete-environment.json', { type: 'application/json' });
    Object.defineProperty(environmentFile, 'text', {
      value: async () => environmentJson,
    });

    await act(async () => {
      fireEvent.change(jsonInput, { target: { files: [environmentFile] } });
    });

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Invalid environment file',
        variant: 'destructive',
      }));
    });
    expect(screen.getByRole('option', { name: 'Import Environment' })).toHaveAttribute('aria-selected', 'true');
    expect(mockApiPost).not.toHaveBeenCalledWith('/api/v1/tasks', expect.anything());
  });
});
