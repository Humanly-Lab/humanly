import { CodeNode } from '@lexical/code';
import { $createLinkNode, $isLinkNode, LinkNode } from '@lexical/link';
import {
  $convertFromMarkdownString,
  CHECK_LIST,
  CODE,
  HEADING,
  ORDERED_LIST,
  QUOTE,
  TEXT_FORMAT_TRANSFORMERS,
  UNORDERED_LIST,
  type ElementTransformer,
  type TextMatchTransformer,
  type Transformer,
} from '@lexical/markdown';
import {
  $createTableCellNode,
  $createTableNode,
  $createTableRowNode,
  TableCellHeaderStates,
  TableCellNode,
  TableNode,
  TableRowNode,
} from '@lexical/table';
import {
  $createHorizontalRuleNode,
  $isHorizontalRuleNode,
  HorizontalRuleNode,
} from '@lexical/react/LexicalHorizontalRuleNode';
import { HeadingNode, QuoteNode } from '@lexical/rich-text';
import { ListItemNode, ListNode } from '@lexical/list';
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $isTextNode,
  $parseSerializedNode,
  createEditor,
  type ElementFormatType,
  type Klass,
  type LexicalNode,
  type SerializedLexicalNode,
  type TextNode,
} from 'lexical';

interface ParsedMarkdownTable {
  header: string[];
  alignments: ElementFormatType[];
  rows: string[][];
}

type MarkdownBlock =
  | { type: 'markdown'; text: string }
  | { type: 'table'; table: ParsedMarkdownTable };

const markdownUrlPattern = '(?:https?:\\/\\/|mailto:)[^\\s<>()\\]]+[^\\s<>()\\].,!?;:]';

const HORIZONTAL_RULE: ElementTransformer = {
  dependencies: [HorizontalRuleNode],
  export: (node) => ($isHorizontalRuleNode(node) ? '---' : null),
  regExp: /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/,
  replace: (parentNode) => {
    const horizontalRuleNode = $createHorizontalRuleNode();
    parentNode.replace(horizontalRuleNode);
    horizontalRuleNode.selectNext(0, 0);
  },
  type: 'element',
};

const SAFE_LINK: TextMatchTransformer = {
  dependencies: [LinkNode],
  export: (node, _exportChildren, exportFormat) => {
    if (!$isLinkNode(node)) {
      return null;
    }

    const title = node.getTitle();
    const linkContent = title
      ? `[${node.getTextContent()}](${node.getURL()} "${title}")`
      : `[${node.getTextContent()}](${node.getURL()})`;
    const firstChild = node.getFirstChild();

    if (node.getChildrenSize() === 1 && $isTextNode(firstChild)) {
      return exportFormat(firstChild, linkContent);
    }

    return linkContent;
  },
  importRegExp: /(^|[^!])\[([^[\]\n]+)\]\(([^()\s]+)(?:\s"((?:[^"]*\\")*[^"]*)"\s*)?\)/,
  regExp: /(^|[^!])\[([^[\]\n]+)\]\(([^()\s]+)(?:\s"((?:[^"]*\\")*[^"]*)"\s*)?\)$/,
  replace: (textNode, match) => {
    const [, prefix, linkText, linkUrl, linkTitle] = match;
    const linkNode = $createLinkNode(linkUrl, { title: linkTitle });
    const linkTextNode = createTextNodeWithFormat(linkText, textNode);
    linkNode.append(linkTextNode);
    replaceTextNodeWithParts(textNode, [
      ...(prefix ? [createTextNodeWithFormat(prefix, textNode)] : []),
      linkNode,
    ]);
  },
  trigger: ')',
  type: 'text-match',
};

const BARE_AUTOLINK: TextMatchTransformer = {
  dependencies: [LinkNode],
  export: (node) => {
    if (!$isLinkNode(node)) {
      return null;
    }

    const textContent = node.getTextContent();
    return textContent === node.getURL() ? textContent : null;
  },
  importRegExp: new RegExp(`(^|\\s)(${markdownUrlPattern})`, 'i'),
  regExp: new RegExp(`(^|\\s)(${markdownUrlPattern})\\s$`, 'i'),
  replace: (textNode, match) => {
    const [, prefix, url] = match;
    const hasTrailingSpace = match[0].endsWith(' ');
    const linkNode = $createLinkNode(url);
    linkNode.append(createTextNodeWithFormat(url, textNode));

    replaceTextNodeWithParts(textNode, [
      ...(prefix ? [createTextNodeWithFormat(prefix, textNode)] : []),
      linkNode,
      ...(hasTrailingSpace ? [createTextNodeWithFormat(' ', textNode)] : []),
    ]);
  },
  trigger: ' ',
  type: 'text-match',
};

export const markdownShortcutTransformers: Transformer[] = [
  HORIZONTAL_RULE,
  HEADING,
  QUOTE,
  CODE,
  CHECK_LIST,
  UNORDERED_LIST,
  ORDERED_LIST,
  ...TEXT_FORMAT_TRANSFORMERS,
  SAFE_LINK,
  BARE_AUTOLINK,
];

export const editorNodes: Array<Klass<LexicalNode>> = [
  HeadingNode,
  QuoteNode,
  CodeNode,
  LinkNode,
  ListNode,
  ListItemNode,
  TableNode,
  TableRowNode,
  TableCellNode,
  HorizontalRuleNode,
];

const markdownDetectionPatterns = [
  /^#{1,6}\s+\S/m,
  /^>\s+\S/m,
  /^[-*+]\s+\[[ xX]\]\s+\S/m,
  /^[-*+]\s+\S/m,
  /^\d+\.\s+\S/m,
  /^```[\s\S]*```$/m,
  /^ {0,3}\|?.+\|.+\n {0,3}\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/m,
  /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/m,
  /^\S[^\n]*\n {0,3}(?:=+|-+)\s*$/m,
  /^(?: {4}|\t)\S/m,
  /^\s{0,3}\[[^\]\n]+?\]:\s*(?:https?:\/\/|mailto:)\S+/m,
  /(^|[^!])\[[^\]\n]+?\]\[[^\]\n]*\]/,
  /(^|\s)(?:https?:\/\/|mailto:)[^\s<>()\]]+/i,
  /\*\*[^*\n]+?\*\*/,
  /__[^_\n]+?__/,
  /(^|[^*])\*[^*\n]+?\*($|[^*])/,
  /(^|[^_])_[^_\n]+?_($|[^_])/,
  /`[^`\n]+?`/,
  /~~[^~\n]+?~~/,
  /(^|[^!])\[[^\]\n]+?\]\([^)]+?\)/,
];

export function looksLikeMarkdown(text: string): boolean {
  const candidate = text.trimEnd();
  if (candidate.trim().length < 3) {
    return false;
  }

  return markdownDetectionPatterns.some((pattern) => pattern.test(candidate));
}

export function createSerializedMarkdownNodes(markdown: string): SerializedLexicalNode[] {
  const normalizedMarkdown = normalizeCommonMarkdown(markdown);
  const blocks = splitMarkdownIntoBlocks(normalizedMarkdown);
  const serializedNodes: SerializedLexicalNode[] = [];

  for (const block of blocks) {
    if (block.type === 'table') {
      const tableNode = createSerializedTableNode(block.table);
      if (tableNode) {
        serializedNodes.push(tableNode);
      }
      continue;
    }

    serializedNodes.push(...createSerializedMarkdownChunkNodes(block.text));
  }

  return serializedNodes;
}

function createTextNodeWithFormat(text: string, sourceNode: TextNode): TextNode {
  const textNode = $createTextNode(text);
  textNode.setFormat(sourceNode.getFormat());
  return textNode;
}

function replaceTextNodeWithParts(textNode: TextNode, parts: LexicalNode[]): void {
  const [firstPart, ...remainingParts] = parts;
  if (!firstPart) {
    textNode.remove();
    return;
  }

  textNode.replace(firstPart);
  let previousPart = firstPart;
  for (const part of remainingParts) {
    previousPart = previousPart.insertAfter(part);
  }
}

function normalizeCommonMarkdown(markdown: string): string {
  return normalizeReferenceLinks(
    normalizeSetextHeadings(
      normalizeIndentedCodeBlocks(markdown)
    )
  );
}

function normalizeIndentedCodeBlocks(markdown: string): string {
  const lines = markdown.split('\n');
  const output: string[] = [];
  let inFencedCodeBlock = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (isFenceLine(line)) {
      output.push(line);
      inFencedCodeBlock = !inFencedCodeBlock;
      continue;
    }

    if (!inFencedCodeBlock && isIndentedCodeLine(line)) {
      const codeLines: string[] = [];

      while (index < lines.length && isIndentedCodeLine(lines[index])) {
        codeLines.push(stripCodeIndent(lines[index]));
        index += 1;
      }

      output.push('```', ...codeLines, '```');
      index -= 1;
      continue;
    }

    output.push(line);
  }

  return output.join('\n');
}

function normalizeSetextHeadings(markdown: string): string {
  const lines = markdown.split('\n');
  const output: string[] = [];
  let inFencedCodeBlock = false;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];

    if (isFenceLine(line)) {
      output.push(line);
      inFencedCodeBlock = !inFencedCodeBlock;
      continue;
    }

    const nextLine = lines[index + 1];
    const underlineMatch = !inFencedCodeBlock && nextLine ? getSetextUnderlineMatch(nextLine) : null;

    if (underlineMatch && canBecomeSetextHeading(line)) {
      const tag = underlineMatch[1].startsWith('=') ? 'h1' : 'h2';
      output.push(`${tag === 'h1' ? '#' : '##'} ${line.trim()}`);
      index += 1;
      continue;
    }

    output.push(line);
  }

  return output.join('\n');
}

function normalizeReferenceLinks(markdown: string): string {
  const lines = markdown.split('\n');
  const definitions = new Map<string, string>();
  const contentLines: string[] = [];
  let inFencedCodeBlock = false;

  for (const line of lines) {
    if (isFenceLine(line)) {
      contentLines.push(line);
      inFencedCodeBlock = !inFencedCodeBlock;
      continue;
    }

    const definitionMatch = !inFencedCodeBlock
      ? line.match(/^ {0,3}\[([^\]\n]+)\]:\s*(\S+)(?:\s+.*)?$/)
      : null;

    if (definitionMatch) {
      definitions.set(normalizeReferenceId(definitionMatch[1]), definitionMatch[2]);
      continue;
    }

    contentLines.push(line);
  }

  if (definitions.size === 0) {
    return contentLines.join('\n');
  }

  return contentLines
    .join('\n')
    .replace(/(^|[^!])\[([^\]\n]+)\]\[([^\]\n]*)\]/g, (match, prefix, label, id) => {
      const referenceId = normalizeReferenceId(id || label);
      const url = definitions.get(referenceId);
      return url ? `${prefix}[${label}](${url})` : match;
    });
}

function splitMarkdownIntoBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.split('\n');
  const blocks: MarkdownBlock[] = [];
  const markdownLines: string[] = [];
  let inFencedCodeBlock = false;
  let index = 0;

  const flushMarkdownLines = () => {
    if (markdownLines.length === 0) {
      return;
    }

    blocks.push({ type: 'markdown', text: markdownLines.join('\n') });
    markdownLines.length = 0;
  };

  while (index < lines.length) {
    const line = lines[index];

    if (isFenceLine(line)) {
      markdownLines.push(line);
      inFencedCodeBlock = !inFencedCodeBlock;
      index += 1;
      continue;
    }

    const tableMatch = !inFencedCodeBlock ? parseTableAt(lines, index) : null;
    if (tableMatch) {
      flushMarkdownLines();
      blocks.push({ type: 'table', table: tableMatch.table });
      index = tableMatch.nextIndex;
      continue;
    }

    markdownLines.push(line);
    index += 1;
  }

  flushMarkdownLines();
  return blocks;
}

function parseTableAt(lines: string[], startIndex: number): { table: ParsedMarkdownTable; nextIndex: number } | null {
  const header = parseTableCells(lines[startIndex]);
  const alignments = parseTableAlignment(lines[startIndex + 1]);

  if (!header || !alignments || header.length !== alignments.length) {
    return null;
  }

  const rows: string[][] = [];
  let index = startIndex + 2;

  while (index < lines.length) {
    const row = parseTableCells(lines[index]);
    if (!row) {
      break;
    }

    rows.push(normalizeTableRow(row, header.length));
    index += 1;
  }

  return {
    nextIndex: index,
    table: {
      alignments,
      header: normalizeTableRow(header, alignments.length),
      rows,
    },
  };
}

function parseTableCells(line: string | undefined): string[] | null {
  if (!line || !line.includes('|')) {
    return null;
  }

  let content = line.trim();
  if (!content) {
    return null;
  }

  if (content.startsWith('|')) {
    content = content.slice(1);
  }

  if (endsWithUnescapedPipe(content)) {
    content = content.slice(0, -1);
  }

  const cells = splitUnescapedPipes(content).map((cell) => cell.trim());
  return cells.length > 0 ? cells : null;
}

function parseTableAlignment(line: string | undefined): ElementFormatType[] | null {
  const cells = parseTableCells(line);
  if (!cells) {
    return null;
  }

  const alignments: Array<ElementFormatType | null> = cells.map((cell) => {
    const marker = cell.replace(/\s+/g, '');
    if (!/^:?-{3,}:?$/.test(marker)) {
      return null;
    }

    if (marker.startsWith(':') && marker.endsWith(':')) {
      return 'center';
    }

    if (marker.endsWith(':')) {
      return 'right';
    }

    return 'left';
  });

  return alignments.every((alignment): alignment is ElementFormatType => alignment !== null)
    ? alignments
    : null;
}

function normalizeTableRow(row: string[], columnCount: number): string[] {
  const normalizedRow = row.slice(0, columnCount);
  while (normalizedRow.length < columnCount) {
    normalizedRow.push('');
  }
  return normalizedRow;
}

function splitUnescapedPipes(value: string): string[] {
  const cells: string[] = [];
  let currentCell = '';

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    const nextCharacter = value[index + 1];

    if (character === '\\' && nextCharacter === '|') {
      currentCell += '|';
      index += 1;
      continue;
    }

    if (character === '|') {
      cells.push(currentCell);
      currentCell = '';
      continue;
    }

    currentCell += character;
  }

  cells.push(currentCell);
  return cells;
}

function endsWithUnescapedPipe(value: string): boolean {
  if (!value.endsWith('|')) {
    return false;
  }

  let backslashCount = 0;
  for (let index = value.length - 2; index >= 0 && value[index] === '\\'; index -= 1) {
    backslashCount += 1;
  }

  return backslashCount % 2 === 0;
}

function createSerializedMarkdownChunkNodes(markdown: string): SerializedLexicalNode[] {
  if (markdown.trim().length === 0) {
    return [];
  }

  const markdownEditor = createEditor({
    namespace: 'humanlyMarkdownPasteChunk',
    nodes: editorNodes,
    onError: (error: Error) => {
      throw error;
    },
  });

  markdownEditor.update(
    () => {
      $convertFromMarkdownString(markdown, markdownShortcutTransformers);
    },
    { discrete: true }
  );

  return markdownEditor.getEditorState().toJSON().root.children;
}

function createSerializedTableNode(table: ParsedMarkdownTable): SerializedLexicalNode | null {
  const serializedHeaderCells = table.header.map(createSerializedInlineCellChildren);
  const serializedRows = table.rows.map((row) => row.map(createSerializedInlineCellChildren));
  const tableEditor = createEditor({
    namespace: 'humanlyMarkdownPasteTable',
    nodes: editorNodes,
    onError: (error: Error) => {
      throw error;
    },
  });

  tableEditor.update(
    () => {
      const root = $getRoot();
      const tableNode = $createTableNode();
      tableNode.append(
        createTableRow(serializedHeaderCells, table.alignments, true),
        ...serializedRows.map((row) => createTableRow(row, table.alignments, false))
      );
      root.append(tableNode);
    },
    { discrete: true }
  );

  return tableEditor.getEditorState().toJSON().root.children[0] ?? null;
}

function createSerializedInlineCellChildren(cell: string): SerializedLexicalNode[] {
  if (!cell) {
    return [];
  }

  const blockNodes = createSerializedMarkdownChunkNodes(cell);
  if (blockNodes.length !== 1) {
    return [createSerializedPlainTextNode(cell)];
  }

  const [blockNode] = blockNodes as Array<SerializedLexicalNode & { children?: SerializedLexicalNode[] }>;
  return blockNode.type === 'paragraph' && Array.isArray(blockNode.children)
    ? blockNode.children
    : [createSerializedPlainTextNode(cell)];
}

function createSerializedPlainTextNode(text: string): SerializedLexicalNode {
  return {
    detail: 0,
    format: 0,
    mode: 'normal',
    style: '',
    text,
    type: 'text',
    version: 1,
  } as SerializedLexicalNode;
}

function createTableRow(cells: SerializedLexicalNode[][], alignments: ElementFormatType[], isHeader: boolean): LexicalNode {
  const rowNode = $createTableRowNode();

  cells.forEach((cell, index) => {
    const cellNode = $createTableCellNode(
      isHeader ? TableCellHeaderStates.COLUMN : TableCellHeaderStates.NO_STATUS
    );
    const paragraphNode = $createParagraphNode();
    const alignment = alignments[index];

    if (alignment) {
      paragraphNode.setFormat(alignment);
    }

    const cellChildren = cell
      .map((serializedNode) => $parseSerializedNode(serializedNode))
      .filter((node): node is LexicalNode => Boolean(node));

    paragraphNode.append(...cellChildren);
    cellNode.append(paragraphNode);
    rowNode.append(cellNode);
  });

  return rowNode;
}

function isFenceLine(line: string): boolean {
  return /^ {0,3}```/.test(line);
}

function isIndentedCodeLine(line: string): boolean {
  return /^(?: {4}|\t)/.test(line);
}

function stripCodeIndent(line: string): string {
  return line.startsWith('\t') ? line.slice(1) : line.slice(4);
}

function getSetextUnderlineMatch(line: string): RegExpMatchArray | null {
  return line.match(/^ {0,3}(=+|-+)\s*$/);
}

function canBecomeSetextHeading(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.length > 0 &&
    !/^#{1,6}\s/.test(trimmed) &&
    !/^>/.test(trimmed) &&
    !/^```/.test(trimmed) &&
    !/^[-*+]\s/.test(trimmed) &&
    !/^\d+\.\s/.test(trimmed) &&
    !/^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)
  );
}

function normalizeReferenceId(id: string): string {
  return id.trim().replace(/\s+/g, ' ').toLowerCase();
}
