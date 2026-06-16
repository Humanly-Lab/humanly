import { fireEvent, render, screen } from '@testing-library/react';
import { DocumentReplay } from '@/components/certificates/document-replay';

jest.mock('@/components/certificates/document-viewer', () => ({
  DocumentViewer: () => <div data-testid="document-viewer" />,
}));

const editorState = {
  root: {
    children: [
      {
        children: [{ text: 'Draft text' }],
      },
    ],
  },
};

describe('DocumentReplay controls', () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          editHistory: [
            { timestamp: '2026-06-10T12:00:00.000Z', editorState },
            { timestamp: '2026-06-10T12:00:08.000Z', editorState },
            { timestamp: '2026-06-10T12:00:16.000Z', editorState },
          ],
        },
      }),
    } as Response);
  });

  afterEach(() => {
    delete (global as any).fetch;
  });

  it('supports labeled controls and direct replay seeking', async () => {
    render(<DocumentReplay token="certificate-token" />);

    expect(await screen.findByRole('button', { name: 'Play replay' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Restart replay' })).toBeInTheDocument();

    const slider = screen.getByRole('slider', { name: 'Replay frame' }) as HTMLInputElement;
    Object.defineProperty(slider, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 0,
        right: 200,
        top: 0,
        bottom: 8,
        width: 200,
        height: 8,
        x: 0,
        y: 0,
        toJSON: () => {},
      }),
    });

    expect(screen.getByText('1 / 3')).toBeInTheDocument();

    fireEvent.mouseDown(slider, { clientX: 200 });
    expect(screen.getByText('3 / 3')).toBeInTheDocument();

    fireEvent.keyDown(slider, { key: 'Home' });
    expect(screen.getByText('1 / 3')).toBeInTheDocument();

    fireEvent.keyDown(slider, { key: 'ArrowRight' });
    expect(screen.getByText('2 / 3')).toBeInTheDocument();

    fireEvent.keyDown(slider, { key: 'End' });
    expect(screen.getByText('3 / 3')).toBeInTheDocument();
  });
});
