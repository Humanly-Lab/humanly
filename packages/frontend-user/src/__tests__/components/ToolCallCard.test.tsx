import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReasoningBlock, ToolCallCard, ToolCallTimeline } from '@/components/ai/tool-call-card';
import type { ToolCallEntry } from '@/stores/ai-store';

function makeEntry(overrides: Partial<ToolCallEntry> = {}): ToolCallEntry {
  return {
    toolCallId: 't1',
    toolName: 'getDocumentText',
    args: {},
    startedAt: 0,
    status: 'pending',
    ...overrides,
  };
}

describe('ToolCallCard', () => {
  it('renders tool name and pending spinner when status is pending', () => {
    render(<ToolCallCard entry={makeEntry()} />);

    expect(screen.getByText('getDocumentText')).toBeInTheDocument();
    expect(screen.getByTestId('tool-call-spinner')).toBeInTheDocument();
  });

  it('shows duration when status is done', () => {
    render(
      <ToolCallCard
        entry={makeEntry({
          toolName: 'searchDocument',
          args: { query: 'x' },
          result: '{}',
          durationMs: 42,
          status: 'done',
          isError: false,
        })}
      />
    );

    expect(screen.getByText('searchDocument')).toBeInTheDocument();
    expect(screen.getByText('42ms')).toBeInTheDocument();
  });

  it('expands to show args and prettified result on click', async () => {
    const user = userEvent.setup();

    render(
      <ToolCallCard
        entry={makeEntry({
          toolName: 'searchDocument',
          args: { query: 'motivation' },
          result: '{"hits":3}',
          status: 'done',
          isError: false,
        })}
      />
    );

    await user.click(screen.getByRole('button', { name: /searchDocument/ }));

    expect(screen.getByText(/motivation/)).toBeInTheDocument();
    expect(screen.getByText(/hits/)).toBeInTheDocument();
    expect(screen.getByText(/3/)).toBeInTheDocument();
  });
});

describe('ToolCallTimeline', () => {
  it('renders nothing for empty entry arrays', () => {
    const { container } = render(<ToolCallTimeline entries={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders a collapsed pending summary by default', () => {
    render(
      <ToolCallTimeline
        entries={[
          makeEntry({ toolCallId: 't1', toolName: 'getDocumentText' }),
          makeEntry({ toolCallId: 't2', toolName: 'searchDocument' }),
        ]}
      />
    );

    expect(screen.getByRole('button', { name: /tool activity/i })).toBeInTheDocument();
    expect(screen.getByText('Using tools...')).toBeInTheDocument();
    expect(screen.getByText('2 tools')).toBeInTheDocument();
    expect(screen.getByTestId('tool-call-timeline-spinner')).toBeInTheDocument();
    expect(screen.queryByText('getDocumentText')).not.toBeInTheDocument();
    expect(screen.queryByText('searchDocument')).not.toBeInTheDocument();
  });

  it('expands to show individual tool cards', async () => {
    const user = userEvent.setup();

    render(
      <ToolCallTimeline
        entries={[
          makeEntry({ toolCallId: 't1', toolName: 'getDocumentText' }),
          makeEntry({ toolCallId: 't2', toolName: 'searchDocument' }),
        ]}
      />
    );

    await user.click(screen.getByRole('button', { name: /tool activity/i }));

    expect(screen.getByText('getDocumentText')).toBeInTheDocument();
    expect(screen.getByText('searchDocument')).toBeInTheDocument();
  });

  it('renders completed summary without a spinner', () => {
    render(
      <ToolCallTimeline
        entries={[
          makeEntry({ toolCallId: 't1', status: 'done', isError: false }),
        ]}
      />
    );

    expect(screen.getByText('Tools used')).toBeInTheDocument();
    expect(screen.getByText('1 tool')).toBeInTheDocument();
    expect(screen.queryByTestId('tool-call-timeline-spinner')).not.toBeInTheDocument();
  });
});

describe('ReasoningBlock', () => {
  it('renders collapsed reasoning and expands on click', async () => {
    const user = userEvent.setup();

    render(<ReasoningBlock thinking="Inspect syllabus, then search for grading." />);

    expect(screen.getByRole('button', { name: /reasoning/i })).toBeInTheDocument();
    expect(screen.getByText(/chars/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /reasoning/i }));

    expect(screen.getByText(/Inspect syllabus/)).toBeVisible();
  });

  it('renders nothing for empty thinking', () => {
    const { container } = render(<ReasoningBlock thinking="  " />);

    expect(container).toBeEmptyDOMElement();
  });
});
