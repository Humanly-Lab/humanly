import { render, screen } from '@testing-library/react';

import EnvironmentConfigFields from '@/components/EnvironmentConfigFields';
import {
  DEFAULT_WRITING_ENVIRONMENT_CONFIG,
  type WritingEnvironmentConfig,
} from '@humanly/shared';

function renderFields(config: Partial<WritingEnvironmentConfig>) {
  return render(
    <EnvironmentConfigFields
      value={{
        ...DEFAULT_WRITING_ENVIRONMENT_CONFIG,
        ...config,
      }}
      onChange={jest.fn()}
    />
  );
}

describe('EnvironmentConfigFields token budgets', () => {
  it('disables chat tokens when AI access is polish-only', () => {
    renderFields({ aiAccess: 'polish' });

    expect(screen.getByLabelText('Shortcut Tokens')).toBeEnabled();
    expect(screen.getByLabelText('Chat Tokens')).toBeDisabled();
    expect(screen.getByText(/not available when ai access is polish only/i)).toBeInTheDocument();
  });

  it('disables shortcut tokens when AI access is chat-only', () => {
    renderFields({ aiAccess: 'chat' });

    expect(screen.getByLabelText('Shortcut Tokens')).toBeDisabled();
    expect(screen.getByLabelText('Chat Tokens')).toBeEnabled();
    expect(screen.getByText(/not available when ai access is chat only/i)).toBeInTheDocument();
  });

  it('keeps both token controls editable when AI access is full', () => {
    renderFields({ aiAccess: 'full' });

    expect(screen.getByLabelText('Shortcut Tokens')).toBeEnabled();
    expect(screen.getByLabelText('Chat Tokens')).toBeEnabled();
  });

  it('exposes optional recording notice controls', () => {
    renderFields({});

    expect(screen.getByText('Show screen recording notice')).toBeInTheDocument();
    expect(screen.getByText('Show camera recording notice')).toBeInTheDocument();
  });
});
