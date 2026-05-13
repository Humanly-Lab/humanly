import React from 'react';
import { render, screen } from '@testing-library/react';
import { QuickActionDiff } from '@/components/ai/quick-action-diff';

describe('QuickActionDiff', () => {
  it('renders a waiting placeholder when after is empty', () => {
    render(<QuickActionDiff before="hello world" after="" />);
    expect(screen.getByText(/waiting for ai response/i)).toBeInTheDocument();
  });

  it('renders unchanged words without diff styling', () => {
    const { container } = render(<QuickActionDiff before="hello world" after="hello world" />);
    expect(container.textContent).toBe('hello world');
    expect(container.querySelector('.line-through')).toBeNull();
    expect(container.querySelector('.underline')).toBeNull();
  });

  it('shows additions with the emerald underline classes', () => {
    const { container } = render(
      <QuickActionDiff before="hello" after="hello there" />,
    );
    const added = container.querySelector('.bg-emerald-100');
    expect(added).not.toBeNull();
    expect(added?.textContent).toMatch(/there/);
  });

  it('shows removals with the red strikethrough classes', () => {
    const { container } = render(
      <QuickActionDiff before="hello there" after="hello" />,
    );
    const removed = container.querySelector('.line-through');
    expect(removed).not.toBeNull();
    expect(removed?.textContent).toMatch(/there/);
  });

  it('renders both adds and removes together for a substitution', () => {
    const { container } = render(
      <QuickActionDiff before="they are bad" after="they are good" />,
    );
    expect(container.querySelector('.line-through')?.textContent).toMatch(/bad/);
    expect(container.querySelector('.bg-emerald-100')?.textContent).toMatch(/good/);
  });
});
