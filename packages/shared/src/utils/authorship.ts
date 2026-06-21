import type { AuthorshipComposition } from '../types/document.types';

export function getAuthorshipCompositionTotal(
  composition?: AuthorshipComposition | null
): number | null {
  if (!composition) return null;

  return Math.max(
    0,
    (composition.typedCharacters || 0)
      + (composition.pastedCharacters || 0)
      + (composition.aiAssistedCharacters || 0)
  );
}

export function getCertificateFinalTextCharacterCount(input: {
  finalTextComposition?: AuthorshipComposition | null;
  totalCharacters?: number | null;
}): number {
  return getAuthorshipCompositionTotal(input.finalTextComposition)
    ?? input.totalCharacters
    ?? 0;
}

export function getDocumentDisplayCharacterCount(input: {
  finalTextCharacterCount?: number | null;
  characterCount?: number | null;
  plainText?: string | null;
}): number {
  return input.finalTextCharacterCount
    ?? input.characterCount
    ?? input.plainText?.length
    ?? 0;
}
