import { render, screen } from '@testing-library/react';

import HomePage from '@/app/page';

describe('landing page', () => {
  it('presents the approved human-AI collaboration and authorship proof copy', () => {
    render(<HomePage />);

    expect(screen.getByRole('heading', { name: /Write with AI/i })).toBeInTheDocument();
    expect(screen.getByText('Write with AI.', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText(
      'A writing workspace that quietly records how a draft came together, then signs it with a certificate any reader can verify.'
    )).toBeInTheDocument();
    expect(screen.queryByText('Human-AI collaboration')).not.toBeInTheDocument();
    expect(screen.queryByText('Tracked writing process')).not.toBeInTheDocument();
    expect(screen.queryByText('Verifiable certificates')).not.toBeInTheDocument();
  });
});
