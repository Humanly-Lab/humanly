import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import NewDocumentPage from '@/app/documents/new/page';

const mockPush = jest.fn();
const mockToast = jest.fn();
const mockCreateDocument = jest.fn();
const mockApiGet = jest.fn();

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
    put: jest.fn(),
    post: jest.fn(),
  },
}));

describe('document creation workflow', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockToast.mockClear();
    mockCreateDocument.mockReset();
    mockApiGet.mockReset();
    mockApiGet.mockResolvedValue({ data: { data: null } });
  });

  it('blocks empty titles and creates an AI-off document that opens the editor', async () => {
    const user = userEvent.setup();
    mockCreateDocument.mockResolvedValueOnce({ id: 'doc-123', title: 'Workflow Document' });

    render(<NewDocumentPage />);

    await screen.findByRole('heading', { name: /new document/i });
    await user.click(screen.getByRole('button', { name: /^create document$/i }));

    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Error',
      description: 'Please enter a document title',
      variant: 'destructive',
    }));
    expect(mockCreateDocument).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText(/document name/i), 'Workflow Document');
    await user.type(screen.getByLabelText(/description/i), 'Current document workflow');

    expect(screen.getByText('AI Off')).toBeInTheDocument();
    expect(screen.queryByLabelText(/ai api key/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^create document$/i }));

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
});
