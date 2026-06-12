import crypto from 'crypto';
import {
  CertificateSeal,
  CertificateSealStatus,
  CertificateType,
  WritingAnomalyFlag,
} from '@humanly/shared';

export const LEGACY_CERTIFICATE_SEAL_VERSION = 'hly-seal-v1';
export const CERTIFICATE_SEAL_VERSION = 'hly-seal-v2';
export const CERTIFICATE_SEAL_ALGORITHM = 'HMAC-SHA256';
export const CERTIFICATE_SEAL_KEY_ID = 'humanly-server-v1';
export const CERTIFICATE_SEAL_SIGNATURE_PREFIX = `${CERTIFICATE_SEAL_VERSION}.`;
export const LEGACY_CERTIFICATE_SEAL_SIGNATURE_PREFIX = `${LEGACY_CERTIFICATE_SEAL_VERSION}.`;

// The seal protects the server-issued certificate record and current display
// controls. It intentionally does not protect plaintext access codes, access
// code hashes, PDF bytes, or off-platform behavior claims.
export const CERTIFICATE_SEAL_SIGNED_FIELDS = [
  'certificateId',
  'submissionId',
  'documentId',
  'userId',
  'certificateType',
  'title',
  'verificationToken',
  'generatedAt',
  'content.documentSnapshotSha256',
  'content.plainTextSnapshotSha256',
  'metrics.totalEvents',
  'metrics.typingEvents',
  'metrics.pasteEvents',
  'metrics.totalCharacters',
  'metrics.typedCharacters',
  'metrics.pastedCharacters',
  'metrics.editingTimeSeconds',
  'anomalyFlags',
  'options.signerName',
  'options.includeFullText',
  'options.includeEditHistory',
  'options.isProtected',
] as const;

const LEGACY_CERTIFICATE_SEAL_SIGNED_FIELDS = CERTIFICATE_SEAL_SIGNED_FIELDS.filter(
  (field) => field !== 'anomalyFlags'
);

export interface CertificateSealInput {
  id: string;
  submissionId?: string | null;
  documentId: string;
  userId: string;
  certificateType: CertificateType;
  title: string;
  documentSnapshot: Record<string, any>;
  plainTextSnapshot: string;
  totalEvents: number;
  typingEvents: number;
  pasteEvents: number;
  totalCharacters: number;
  typedCharacters: number;
  pastedCharacters: number;
  editingTimeSeconds: number;
  anomalyFlags?: WritingAnomalyFlag[];
  verificationToken: string;
  signerName?: string | null;
  includeFullText: boolean;
  includeEditHistory: boolean;
  isProtected: boolean;
  generatedAt: Date | string;
}

export interface CertificateSealVerification {
  valid: boolean;
  seal?: CertificateSeal;
  sealStatus: CertificateSealStatus;
  message: string;
}

type CanonicalValue =
  | string
  | number
  | boolean
  | null
  | CanonicalValue[]
  | { [key: string]: CanonicalValue };

function normalizeValue(value: unknown): CanonicalValue {
  if (value === undefined || value === null) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }

  if (typeof value === 'object') {
    const normalized: { [key: string]: CanonicalValue } = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      normalized[key] = normalizeValue((value as Record<string, unknown>)[key]);
    }
    return normalized;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  return String(value);
}

export function canonicalJSONString(value: unknown): string {
  return JSON.stringify(normalizeValue(value));
}

export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

function hmacBase64Url(value: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(value, 'utf8').digest('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export class CertificateSealService {
  static isSealSignature(signature?: string | null): boolean {
    return Boolean(
      signature?.startsWith(CERTIFICATE_SEAL_SIGNATURE_PREFIX)
      || signature?.startsWith(LEGACY_CERTIFICATE_SEAL_SIGNATURE_PREFIX)
    );
  }

  private static buildPayloadForVersion(
    input: CertificateSealInput,
    version: typeof CERTIFICATE_SEAL_VERSION | typeof LEGACY_CERTIFICATE_SEAL_VERSION
  ) {
    const payload = {
      version,
      certificateId: input.id,
      submissionId: input.submissionId || null,
      documentId: input.documentId,
      userId: input.userId,
      certificateType: input.certificateType,
      title: input.title,
      verificationToken: input.verificationToken,
      generatedAt: new Date(input.generatedAt).toISOString(),
      content: {
        documentSnapshotSha256: sha256Hex(canonicalJSONString(input.documentSnapshot || {})),
        plainTextSnapshotSha256: sha256Hex(input.plainTextSnapshot || ''),
      },
      metrics: {
        totalEvents: input.totalEvents,
        typingEvents: input.typingEvents,
        pasteEvents: input.pasteEvents,
        totalCharacters: input.totalCharacters,
        typedCharacters: input.typedCharacters,
        pastedCharacters: input.pastedCharacters,
        editingTimeSeconds: input.editingTimeSeconds,
      },
      options: {
        signerName: input.signerName || null,
        includeFullText: input.includeFullText,
        includeEditHistory: input.includeEditHistory,
        isProtected: input.isProtected,
      },
    };

    if (version === CERTIFICATE_SEAL_VERSION) {
      return {
        ...payload,
        anomalyFlags: input.anomalyFlags || [],
      };
    }

    return payload;
  }

  static buildPayload(input: CertificateSealInput) {
    return this.buildPayloadForVersion(input, CERTIFICATE_SEAL_VERSION);
  }

  static createSeal(input: CertificateSealInput, secret: string): CertificateSeal {
    return this.createSealForVersion(input, secret, CERTIFICATE_SEAL_VERSION);
  }

  private static createSealForVersion(
    input: CertificateSealInput,
    secret: string,
    version: typeof CERTIFICATE_SEAL_VERSION | typeof LEGACY_CERTIFICATE_SEAL_VERSION
  ): CertificateSeal {
    const payloadHash = sha256Hex(canonicalJSONString(this.buildPayloadForVersion(input, version)));
    const signatureBody = hmacBase64Url(`${version}.${payloadHash}`, secret);

    return {
      version,
      algorithm: CERTIFICATE_SEAL_ALGORITHM,
      keyId: CERTIFICATE_SEAL_KEY_ID,
      payloadHash,
      signature: `${version}.${signatureBody}`,
      signedFields: version === CERTIFICATE_SEAL_VERSION
        ? [...CERTIFICATE_SEAL_SIGNED_FIELDS]
        : [...LEGACY_CERTIFICATE_SEAL_SIGNED_FIELDS],
    };
  }

  static verifySeal(input: CertificateSealInput, secret: string, storedSignature: string): CertificateSealVerification {
    if (!storedSignature) {
      return {
        valid: false,
        sealStatus: 'missing',
        message: 'Certificate seal is missing',
      };
    }

    if (!this.isSealSignature(storedSignature)) {
      return {
        valid: false,
        sealStatus: 'missing',
        message: 'Certificate uses a legacy signature format',
      };
    }

    const isLegacySeal = storedSignature.startsWith(LEGACY_CERTIFICATE_SEAL_SIGNATURE_PREFIX);
    const seal = this.createSealForVersion(
      input,
      secret,
      isLegacySeal ? LEGACY_CERTIFICATE_SEAL_VERSION : CERTIFICATE_SEAL_VERSION
    );
    const valid = safeEqual(storedSignature, seal.signature);

    return {
      valid,
      seal: {
        ...seal,
        signature: storedSignature,
      },
      sealStatus: valid ? (isLegacySeal ? 'legacy_valid' : 'valid') : 'invalid',
      message: valid
        ? isLegacySeal
          ? 'Certificate legacy seal is valid'
          : 'Certificate seal is valid'
        : 'Certificate seal does not match the protected certificate fields',
    };
  }

  static fingerprint(signature?: string | null): string | null {
    if (!signature) return null;
    const digest = sha256Hex(signature);
    return `${digest.slice(0, 12)}-${digest.slice(-12)}`;
  }
}
