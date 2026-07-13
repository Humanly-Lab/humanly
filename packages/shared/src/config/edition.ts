export type Edition = 'community' | 'cloud';

export type EditionFeature = 'billing' | 'managedTypingDetector';

const EDITION_FEATURES: Record<Edition, readonly EditionFeature[]> = {
  community: [],
  cloud: ['billing', 'managedTypingDetector'],
};

export const normalizeEdition = (value: string | undefined | null): Edition =>
  value === 'cloud' ? 'cloud' : 'community';

export const hasFeature = (edition: Edition, feature: EditionFeature): boolean =>
  EDITION_FEATURES[edition].includes(feature);
