import fs from 'fs';
import path from 'path';

import {
  createSerializedMarkdownNodes,
  looksLikeMarkdown,
} from '../../../../editor/src/markdown/common-markdown';

function findNodesByType(nodes: any[], type: string): any[] {
  const matches: any[] = [];

  for (const node of nodes) {
    if (node.type === type) {
      matches.push(node);
    }

    if (Array.isArray(node.children)) {
      matches.push(...findNodesByType(node.children, type));
    }
  }

  return matches;
}

describe('LexicalEditor markdown shortcuts', () => {
  const editorSource = fs.readFileSync(
    path.join(process.cwd(), '../editor/src/lexical-editor.tsx'),
    'utf8'
  );
  const markdownSource = fs.readFileSync(
    path.join(process.cwd(), '../editor/src/markdown/common-markdown.ts'),
    'utf8'
  );
  const toolbarSource = fs.readFileSync(
    path.join(process.cwd(), '../editor/src/plugins/toolbar-plugin.tsx'),
    'utf8'
  );

  it('registers the Lexical markdown shortcut plugin with common markdown nodes', () => {
    expect(editorSource).toContain(
      'MarkdownShortcutPlugin transformers={markdownShortcutTransformers}'
    );
    expect(markdownSource).toContain('TableNode');
    expect(markdownSource).toContain('TableRowNode');
    expect(markdownSource).toContain('TableCellNode');
    expect(markdownSource).toContain('HorizontalRuleNode');
    expect(editorSource).toContain('nodes: editorNodes');
  });

  it('keeps markdown mode off until the toolbar toggle enables it', () => {
    expect(editorSource).toContain('const [markdownEnabled, setMarkdownEnabled] = React.useState(false);');
    expect(editorSource).toContain('markdownEnabled={markdownEnabled}');
    expect(editorSource).toContain('onMarkdownEnabledChange={setMarkdownEnabled}');
    expect(editorSource).toContain('{markdownEnabled && (');
  });

  it('renders a minimal markdown toolbar switch', () => {
    expect(toolbarSource).toContain('role="switch"');
    expect(toolbarSource).toContain('aria-label="Markdown input"');
    expect(toolbarSource).toContain('<span style={toolbarStyles.markdownLabel}>Markdown</span>');
    expect(toolbarSource).toContain('config.onMarkdownEnabledChange?.(!markdownEnabled)');
  });

  it('only prompts for pasted markdown when markdown mode is enabled', () => {
    expect(editorSource).toContain('function MarkdownPastePromptPlugin');
    expect(editorSource).toContain('if (!enabled) {');
    expect(editorSource).toContain('getMarkdownPastePromptPosition(editor.getRootElement())');
    expect(editorSource).toContain('Markdown detected. Render formatting?');
    expect(editorSource).toContain('Plain text');
    expect(editorSource).toContain('Render');
  });

  it('checks task-list markdown before the generic unordered-list transformer', () => {
    const transformerStart = markdownSource.indexOf('export const markdownShortcutTransformers');
    const transformerEnd = markdownSource.indexOf('export const editorNodes');
    const transformerBlock = markdownSource.slice(transformerStart, transformerEnd);

    expect(transformerBlock).toContain('CHECK_LIST');
    expect(transformerBlock.indexOf('CHECK_LIST')).toBeLessThan(
      transformerBlock.indexOf('UNORDERED_LIST')
    );
  });

  it('declares markdown and table as direct editor package dependencies', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), '../editor/package.json'), 'utf8')
    );

    expect(packageJson.dependencies['@lexical/markdown']).toBe('^0.12.6');
    expect(packageJson.dependencies['@lexical/table']).toBe('^0.12.6');
  });

  it('imports GFM pipe tables into Lexical table nodes', () => {
    const [table] = createSerializedMarkdownNodes(
      '| A | B |\n| --- | :---: |\n| https://example.com | [Docs](mailto:team@example.com) |'
    ) as any[];

    expect(table.type).toBe('table');
    expect(table.children).toHaveLength(2);
    expect(table.children[0].type).toBe('tablerow');
    expect(table.children[0].children[0].type).toBe('tablecell');
    expect(table.children[0].children[0].headerState).not.toBe(0);
    expect(table.children[0].children[1].children[0].format).toBe('center');
    expect(findNodesByType([table], 'link').map((node) => node.url)).toEqual([
      'https://example.com',
      'mailto:team@example.com',
    ]);
  });

  it('keeps horizontal rules distinct from setext h2 headings', () => {
    const [horizontalRule] = createSerializedMarkdownNodes('---') as any[];
    const [heading] = createSerializedMarkdownNodes('Title\n---') as any[];

    expect(horizontalRule.type).toBe('horizontalrule');
    expect(heading.type).toBe('heading');
    expect(heading.tag).toBe('h2');
  });

  it('turns bare URLs and reference links into link nodes', () => {
    const autolinkNodes = createSerializedMarkdownNodes('Visit https://example.com now');
    const referenceNodes = createSerializedMarkdownNodes(
      'Read [docs][d]\n\n[d]: mailto:team@example.com'
    );

    expect(findNodesByType(autolinkNodes as any[], 'link')[0].url).toBe('https://example.com');
    expect(findNodesByType(referenceNodes as any[], 'link')[0].url).toBe('mailto:team@example.com');
  });

  it('supports indented code blocks and does not render image markdown or raw HTML', () => {
    const [codeBlock] = createSerializedMarkdownNodes('    const x = 1;') as any[];
    const imageMarkdown = '![alt](https://example.com/image.png)';
    const imageNodes = createSerializedMarkdownNodes(imageMarkdown);
    const htmlNodes = createSerializedMarkdownNodes('<strong>Hello</strong>');

    expect(looksLikeMarkdown('    const x = 1;')).toBe(true);
    expect(codeBlock.type).toBe('code');
    expect(looksLikeMarkdown(imageMarkdown)).toBe(false);
    expect(findNodesByType(imageNodes as any[], 'link')).toHaveLength(0);
    expect(findNodesByType(htmlNodes as any[], 'link')).toHaveLength(0);
    expect(findNodesByType(htmlNodes as any[], 'text')[0].text).toBe('<strong>Hello</strong>');
  });
});
