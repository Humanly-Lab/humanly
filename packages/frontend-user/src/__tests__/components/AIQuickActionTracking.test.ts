import fs from 'fs';
import path from 'path';

describe('AI quick action tracking', () => {
  const commandsSource = fs.readFileSync(
    path.join(process.cwd(), '../editor/src/commands/formatting-commands.ts'),
    'utf8'
  );
  const trackerSource = fs.readFileSync(
    path.join(process.cwd(), '../editor/src/tracking/editor-tracker.ts'),
    'utf8'
  );
  const selectionPopupSource = fs.readFileSync(
    path.join(process.cwd(), '../editor/src/plugins/selection-popup-plugin.tsx'),
    'utf8'
  );
  const aiSelectionMenuSource = fs.readFileSync(
    path.join(process.cwd(), 'src/components/ai/ai-selection-menu.tsx'),
    'utf8'
  );

  it('suppresses the editor mirror text event when applying an AI quick action', () => {
    expect(commandsSource).toContain('TRACKING_SUPPRESS_NEXT_TEXT_CHANGE_COMMAND');
    expect(trackerSource).toContain('private suppressNextTextChange: boolean = false');
    expect(trackerSource).toContain('TRACKING_SUPPRESS_NEXT_TEXT_CHANGE_COMMAND');
    expect(trackerSource).toContain('if (this.suppressNextTextChange) {');
    expect(trackerSource).toContain('this.suppressNextTextChange = false;');
    expect(selectionPopupSource).toContain('suppressTextChangeTracking?: boolean');
    expect(selectionPopupSource).toContain(
      'editor.dispatchCommand(TRACKING_SUPPRESS_NEXT_TEXT_CHANGE_COMMAND, true)'
    );
    expect(aiSelectionMenuSource).toContain(
      'replaceSelection(improvedText, true, {'
    );
    expect(aiSelectionMenuSource).toContain('suppressTextChangeTracking: true');
  });
});
