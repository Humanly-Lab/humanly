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

  it('shows AI policy guard controls only when chat is enabled', () => {
    const { rerender } = render(
      <EnvironmentConfigFields
        value={{
          ...DEFAULT_WRITING_ENVIRONMENT_CONFIG,
          aiAccess: 'polish',
        }}
        onChange={jest.fn()}
      />
    );

    expect(screen.queryByLabelText(/ai policy enforcement/i)).not.toBeInTheDocument();

    rerender(
      <EnvironmentConfigFields
        value={{
          ...DEFAULT_WRITING_ENVIRONMENT_CONFIG,
          aiAccess: 'chat',
          aiPolicy: {
            mode: 'guard',
            rejectionRule: 'Refuse evaluative claims.',
          },
        }}
        onChange={jest.fn()}
      />
    );

    expect(screen.getByLabelText(/ai policy enforcement/i)).toHaveValue('guard');
    expect(screen.getByLabelText(/ai rejection rule/i)).toHaveValue('Refuse evaluative claims.');
  });
});
