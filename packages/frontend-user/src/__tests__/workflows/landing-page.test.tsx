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

  it('explains the trust model and use cases', () => {
    render(<HomePage />);

    expect(screen.getByText('Process beats')).toBeInTheDocument();
    expect(screen.getByText('prediction.')).toBeInTheDocument();
    expect(screen.getByText('For writers')).toBeInTheDocument();
    expect(screen.getByText('For instructors')).toBeInTheDocument();
    expect(screen.queryByText('What it proves,')).not.toBeInTheDocument();
    expect(screen.queryByText('It does not claim')).not.toBeInTheDocument();
  });
});
