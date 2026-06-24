import crypto from 'crypto';
import {
  CertificateSeal,
  CertificateSealStatus,
  CertificateType,
  AuthorshipComposition,
  AuthorshipTextSourceSpan,
  WritingAnomalyFlag,
} from '@humanly/shared';

export const LEGACY_CERTIFICATE_SEAL_VERSION = 'hly-seal-v1';
export const HMAC_CERTIFICATE_SEAL_VERSION = 'hly-seal-v2';
export const CERTIFICATE_SEAL_VERSION = 'hly-seal-v3';
export const LEGACY_CERTIFICATE_SEAL_ALGORITHM = 'HMAC-SHA256';
export const CERTIFICATE_SEAL_ALGORITHM = 'Ed25519';
export const CERTIFICATE_SEAL_KEY_ID = 'humanly-ed25519-v1';
export const CERTIFICATE_SEAL_SIGNATURE_PREFIX = `${CERTIFICATE_SEAL_VERSION}.`;
export const HMAC_CERTIFICATE_SEAL_SIGNATURE_PREFIX = `${HMAC_CERTIFICATE_SEAL_VERSION}.`;
export const LEGACY_CERTIFICATE_SEAL_SIGNATURE_PREFIX = `${LEGACY_CERTIFICATE_SEAL_VERSION}.`;
const CERTIFICATE_SEAL_POLICY_HASH_FIELD = 'policyHash';
const CERTIFICATE_SEAL_FINAL_COMPOSITION_FIELD = 'metrics.finalTextComposition';
const CERTIFICATE_SEAL_FINAL_SOURCE_SPANS_FIELD = 'metrics.finalTextSourceSpans';
const CERTIFICATE_SEAL_PROCESS_COMPOSITION_FIELD = 'metrics.processInputVolume';

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
  finalTextComposition?: AuthorshipComposition | null;
  finalTextSourceSpans?: AuthorshipTextSourceSpan[] | null;
  processInputVolume?: AuthorshipComposition | null;
  editingTimeSeconds: number;
  anomalyFlags?: WritingAnomalyFlag[];
  policyHash?: string | null;
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

export interface CertificateSealKeyOptions {
  privateKeyPem?: string;
  publicKeyPem?: string;
  keyId?: string;
}

export interface CertificatePublicVerificationKey {
  version: string;
  algorithm: string;
  keyId: string;
  publicKeyPem: string;
  publicKeyFingerprint: string;
}

type CertificateSealPayloadVersion =
  | typeof CERTIFICATE_SEAL_VERSION
  | typeof HMAC_CERTIFICATE_SEAL_VERSION
  | typeof LEGACY_CERTIFICATE_SEAL_VERSION;

interface Ed25519SealMetadata {
  algorithm: typeof CERTIFICATE_SEAL_ALGORITHM;
  keyId: string;
  publicKeyFingerprint: string;
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

function normalizePem(value: string): string {
  return value.replace(/\\n/g, '\n').trim();
}

function encodeJsonBase64Url(value: unknown): string {
  return Buffer.from(canonicalJSONString(value), 'utf8').toString('base64url');
}

function decodeJsonBase64Url<T>(value: string): T {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
}

function exportPublicKeyPem(publicKey: crypto.KeyObject): string {
  return publicKey.export({ type: 'spki', format: 'pem' }) as string;
}

function fingerprintPublicKey(publicKeyPem: string): string {
  return sha256Hex(normalizePem(publicKeyPem));
}

function deriveEd25519PrivateKey(secret: string): crypto.KeyObject {
  const seed = crypto
    .createHash('sha256')
    .update(`humanly-certificate-ed25519-v1:${secret}`, 'utf8')
    .digest();
  const pkcs8Der = Buffer.concat([
    Buffer.from('302e020100300506032b657004220420', 'hex'),
    seed,
  ]);
  return crypto.createPrivateKey({ key: pkcs8Der, format: 'der', type: 'pkcs8' });
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
      || signature?.startsWith(HMAC_CERTIFICATE_SEAL_SIGNATURE_PREFIX)
      || signature?.startsWith(LEGACY_CERTIFICATE_SEAL_SIGNATURE_PREFIX)
    );
  }

  private static resolveSigningKeys(
    secret: string,
    options: CertificateSealKeyOptions = {}
  ) {
    const privateKey = options.privateKeyPem
      ? crypto.createPrivateKey(normalizePem(options.privateKeyPem))
      : deriveEd25519PrivateKey(secret);
    const publicKey = crypto.createPublicKey(privateKey);
    const publicKeyPem = exportPublicKeyPem(publicKey);
    const keyId = options.keyId || (options.privateKeyPem ? CERTIFICATE_SEAL_KEY_ID : 'humanly-ed25519-derived-v1');

    return {
      privateKey,
      publicKey,
      publicKeyPem,
      keyId,
      publicKeyFingerprint: fingerprintPublicKey(publicKeyPem),
    };
  }

  private static resolveVerificationPublicKey(
    secret: string,
    options: CertificateSealKeyOptions = {}
  ): string {
    if (options.privateKeyPem && options.publicKeyPem) {
      return normalizePem(options.publicKeyPem);
    }
    return this.resolveSigningKeys(secret, options).publicKeyPem;
  }

  static getPublicVerificationKey(
    secret: string,
    options: CertificateSealKeyOptions = {}
  ): CertificatePublicVerificationKey {
    const publicKeyPem = this.resolveVerificationPublicKey(secret, options);
    return {
      version: CERTIFICATE_SEAL_VERSION,
      algorithm: CERTIFICATE_SEAL_ALGORITHM,
      keyId: options.keyId || (options.privateKeyPem ? CERTIFICATE_SEAL_KEY_ID : 'humanly-ed25519-derived-v1'),
      publicKeyPem,
      publicKeyFingerprint: fingerprintPublicKey(publicKeyPem),
    };
  }

  private static buildPayloadForVersion(
    input: CertificateSealInput,
    version: CertificateSealPayloadVersion
  ) {
    const metrics: Record<string, unknown> = {
      totalEvents: input.totalEvents,
      typingEvents: input.typingEvents,
      pasteEvents: input.pasteEvents,
      totalCharacters: input.totalCharacters,
      typedCharacters: input.typedCharacters,
      pastedCharacters: input.pastedCharacters,
      editingTimeSeconds: input.editingTimeSeconds,
    };

    if (input.finalTextComposition) {
      metrics.finalTextComposition = input.finalTextComposition;
    }

    if (input.finalTextSourceSpans) {
      metrics.finalTextSourceSpans = input.finalTextSourceSpans;
    }

    if (input.processInputVolume) {
      metrics.processInputVolume = input.processInputVolume;
    }

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
      metrics,
      options: {
        signerName: input.signerName || null,
        includeFullText: input.includeFullText,
        includeEditHistory: input.includeEditHistory,
        isProtected: input.isProtected,
      },
    };

    if (version !== LEGACY_CERTIFICATE_SEAL_VERSION) {
      const v2Payload: Record<string, unknown> = {
        ...payload,
        anomalyFlags: input.anomalyFlags || [],
      };
      if (input.policyHash) {
        v2Payload.policyHash = input.policyHash;
      }
      return v2Payload;
    }

    return payload;
  }

  private static getSignedFieldsForVersion(
    input: CertificateSealInput,
    version: CertificateSealPayloadVersion
  ): string[] {
    if (version === LEGACY_CERTIFICATE_SEAL_VERSION) {
      return [...LEGACY_CERTIFICATE_SEAL_SIGNED_FIELDS];
    }

    const signedFields: string[] = [...CERTIFICATE_SEAL_SIGNED_FIELDS];
    if (input.finalTextComposition) {
      signedFields.push(CERTIFICATE_SEAL_FINAL_COMPOSITION_FIELD);
    }
    if (input.finalTextSourceSpans) {
      signedFields.push(CERTIFICATE_SEAL_FINAL_SOURCE_SPANS_FIELD);
    }
    if (input.processInputVolume) {
      signedFields.push(CERTIFICATE_SEAL_PROCESS_COMPOSITION_FIELD);
    }
    if (input.policyHash) {
      signedFields.push(CERTIFICATE_SEAL_POLICY_HASH_FIELD);
    }

    return signedFields;
  }

  static buildPayload(input: CertificateSealInput) {
    return this.buildPayloadForVersion(input, CERTIFICATE_SEAL_VERSION);
  }

  static createSeal(
    input: CertificateSealInput,
    secret: string,
    options: CertificateSealKeyOptions = {}
  ): CertificateSeal {
    return this.createEd25519Seal(input, secret, options);
  }

  private static createHmacSealForVersion(
    input: CertificateSealInput,
    secret: string,
    version: typeof HMAC_CERTIFICATE_SEAL_VERSION | typeof LEGACY_CERTIFICATE_SEAL_VERSION
  ): CertificateSeal {
    const payloadHash = sha256Hex(canonicalJSONString(this.buildPayloadForVersion(input, version)));
    const signatureBody = hmacBase64Url(`${version}.${payloadHash}`, secret);

    return {
      version,
      algorithm: LEGACY_CERTIFICATE_SEAL_ALGORITHM,
      keyId: version === LEGACY_CERTIFICATE_SEAL_VERSION ? 'humanly-server-v1' : 'humanly-server-v2',
      payloadHash,
      signature: `${version}.${signatureBody}`,
      signedFields: this.getSignedFieldsForVersion(input, version),
    };
  }

  private static createEd25519Seal(
    input: CertificateSealInput,
    secret: string,
    options: CertificateSealKeyOptions = {}
  ): CertificateSeal {
    const payloadHash = sha256Hex(canonicalJSONString(this.buildPayloadForVersion(input, CERTIFICATE_SEAL_VERSION)));
    const keys = this.resolveSigningKeys(secret, options);
    const metadata: Ed25519SealMetadata = {
      algorithm: CERTIFICATE_SEAL_ALGORITHM,
      keyId: keys.keyId,
      publicKeyFingerprint: keys.publicKeyFingerprint,
    };
    const metadataBody = encodeJsonBase64Url(metadata);
    const signingInput = `${CERTIFICATE_SEAL_VERSION}.${metadataBody}.${payloadHash}`;
    const signatureBody = crypto
      .sign(null, Buffer.from(signingInput, 'utf8'), keys.privateKey)
      .toString('base64url');

    return {
      version: CERTIFICATE_SEAL_VERSION,
      algorithm: CERTIFICATE_SEAL_ALGORITHM,
      keyId: metadata.keyId,
      publicKeyFingerprint: metadata.publicKeyFingerprint,
      payloadHash,
      signature: `${CERTIFICATE_SEAL_VERSION}.${metadataBody}.${signatureBody}`,
      signedFields: this.getSignedFieldsForVersion(input, CERTIFICATE_SEAL_VERSION),
    };
  }

  private static parseEd25519Signature(storedSignature: string): {
    metadataBody: string;
    signatureBody: string;
    metadata: Ed25519SealMetadata;
  } | null {
    const parts = storedSignature.split('.');
    if (parts.length !== 3 || parts[0] !== CERTIFICATE_SEAL_VERSION) {
      return null;
    }

    try {
      const metadata = decodeJsonBase64Url<Ed25519SealMetadata>(parts[1]);
      if (metadata.algorithm !== CERTIFICATE_SEAL_ALGORITHM || !metadata.keyId || !metadata.publicKeyFingerprint) {
        return null;
      }
      return {
        metadataBody: parts[1],
        signatureBody: parts[2],
        metadata,
      };
    } catch {
      return null;
    }
  }

  static verifySealWithPublicKey(
    input: CertificateSealInput,
    publicKeyPem: string,
    storedSignature: string
  ): CertificateSealVerification {
    if (!storedSignature) {
      return {
        valid: false,
        sealStatus: 'missing',
        message: 'Certificate seal is missing',
      };
    }

    const parsed = this.parseEd25519Signature(storedSignature);
    if (!parsed) {
      return {
        valid: false,
        sealStatus: this.isSealSignature(storedSignature) ? 'legacy_valid' : 'missing',
        message: this.isSealSignature(storedSignature)
          ? 'Certificate uses a legacy integrity seal that is not public-key verifiable'
          : 'Certificate uses a legacy integrity seal format',
      };
    }

    const payloadHash = sha256Hex(canonicalJSONString(this.buildPayloadForVersion(input, CERTIFICATE_SEAL_VERSION)));
    const signingInput = `${CERTIFICATE_SEAL_VERSION}.${parsed.metadataBody}.${payloadHash}`;
    const valid = crypto.verify(
      null,
      Buffer.from(signingInput, 'utf8'),
      crypto.createPublicKey(normalizePem(publicKeyPem)),
      Buffer.from(parsed.signatureBody, 'base64url')
    );

    return {
      valid,
      seal: {
        version: CERTIFICATE_SEAL_VERSION,
        algorithm: CERTIFICATE_SEAL_ALGORITHM,
        keyId: parsed.metadata.keyId,
        publicKeyFingerprint: parsed.metadata.publicKeyFingerprint,
        payloadHash,
        signature: storedSignature,
        signedFields: this.getSignedFieldsForVersion(input, CERTIFICATE_SEAL_VERSION),
      },
      sealStatus: valid ? 'valid' : 'invalid',
      message: valid
        ? 'Certificate publicly verifiable signature is valid'
        : 'Certificate seal does not match the protected certificate fields',
    };
  }

  static verifySeal(
    input: CertificateSealInput,
    secret: string,
    storedSignature: string,
    options: CertificateSealKeyOptions = {}
  ): CertificateSealVerification {
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
        message: 'Certificate uses a legacy integrity seal format',
      };
    }

    if (storedSignature.startsWith(CERTIFICATE_SEAL_SIGNATURE_PREFIX)) {
      return this.verifySealWithPublicKey(
        input,
        this.resolveVerificationPublicKey(secret, options),
        storedSignature
      );
    }

    const isLegacyV1 = storedSignature.startsWith(LEGACY_CERTIFICATE_SEAL_SIGNATURE_PREFIX);
    const version = isLegacyV1 ? LEGACY_CERTIFICATE_SEAL_VERSION : HMAC_CERTIFICATE_SEAL_VERSION;
    const seal = this.createHmacSealForVersion(input, secret, version);
    const valid = safeEqual(storedSignature, seal.signature);

    return {
      valid,
      seal: {
        ...seal,
        signature: storedSignature,
      },
      sealStatus: valid ? 'legacy_valid' : 'invalid',
      message: valid
        ? 'Certificate legacy integrity seal is valid'
        : 'Certificate seal does not match the protected certificate fields',
    };
  }

  static fingerprint(signature?: string | null): string | null {
    if (!signature) return null;
    const digest = sha256Hex(signature);
    return `${digest.slice(0, 12)}-${digest.slice(-12)}`;
  }
}
