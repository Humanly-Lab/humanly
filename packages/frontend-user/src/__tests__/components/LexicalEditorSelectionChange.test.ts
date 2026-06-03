import fs from 'fs';
import path from 'path';

describe('LexicalEditor selection-only updates', () => {
  it('does not route selection-only updates through document content changes', () => {
    const editorSource = fs.readFileSync(
      path.join(process.cwd(), '../editor/src/lexical-editor.tsx'),
      'utf8'
    );

    expect(editorSource).toContain(
      '<OnChangePlugin onChange={handleChange} ignoreSelectionChange />'
    );
  });
});
