jest.mock('../../services/certificate.service');
jest.mock('../../models/document-event.model');
jest.mock('../../models/ai.model');
jest.mock('../../utils/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

import request from 'supertest';
import { createApp } from '../../app';
import { CertificateService } from '../../services/certificate.service';
import { DocumentEventModel } from '../../models/document-event.model';
import { AIModel } from '../../models/ai.model';

const MockCertificateService = CertificateService as jest.Mocked<typeof CertificateService>;
const MockDocumentEventModel = DocumentEventModel as jest.Mocked<typeof DocumentEventModel>;
const MockAIModel = AIModel as jest.Mocked<typeof AIModel>;

const TOKEN = 'verif-token-123';
const ACCESS_CODE = 'secret-code';

function makeCertificate(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cert-1',
    documentId: 'doc-1',
    includeEditHistory: true,
    isProtected: false,
    ...overrides,
  };
}

// The edit-history endpoint reconstructs the full document from recorded
// events, so for protected certificates it must be gated behind the same
// access code as the rest of the protected content.
describe('GET /api/v1/certificates/verify/:token/history access control', () => {
  const app = createApp();

  beforeEach(() => {
    jest.clearAllMocks();
    MockDocumentEventModel.findByDocumentId.mockResolvedValue([] as any);
    MockDocumentEventModel.countByDocumentId.mockResolvedValue(0);
    MockAIModel.getLogs.mockResolvedValue({ logs: [], total: 0 });
  });

  it('returns edit history for an unprotected certificate without an access code', async () => {
    MockCertificateService.verifyCertificate.mockResolvedValue({
      valid: true,
      certificate: makeCertificate({ isProtected: false }),
    } as any);

    const response = await request(app).get(`/api/v1/certificates/verify/${TOKEN}/history`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(MockDocumentEventModel.findByDocumentId).toHaveBeenCalledWith('doc-1', expect.any(Object));
    expect(MockCertificateService.verifyCertificateWithAccessCode).not.toHaveBeenCalled();
  });

  it('refuses a protected certificate when no access code is supplied', async () => {
    MockCertificateService.verifyCertificate.mockResolvedValue({
      valid: true,
      certificate: makeCertificate({ isProtected: true }),
    } as any);

    const response = await request(app).get(`/api/v1/certificates/verify/${TOKEN}/history`);

    expect(response.status).toBe(403);
    // The protected document must never be reconstructed for an unauthorized caller.
    expect(MockDocumentEventModel.findByDocumentId).not.toHaveBeenCalled();
  });

  it('refuses a protected certificate when the access code is wrong', async () => {
    MockCertificateService.verifyCertificate.mockResolvedValue({
      valid: true,
      certificate: makeCertificate({ isProtected: true }),
    } as any);
    MockCertificateService.verifyCertificateWithAccessCode.mockResolvedValue({
      valid: false,
      certificate: null,
    } as any);

    const response = await request(app)
      .get(`/api/v1/certificates/verify/${TOKEN}/history`)
      .set('X-Access-Code', 'wrong-code');

    expect(response.status).toBe(403);
    expect(MockCertificateService.verifyCertificateWithAccessCode).toHaveBeenCalledWith(TOKEN, 'wrong-code');
    expect(MockDocumentEventModel.findByDocumentId).not.toHaveBeenCalled();
  });

  it('returns edit history for a protected certificate with the correct access code', async () => {
    MockCertificateService.verifyCertificate.mockResolvedValue({
      valid: true,
      certificate: makeCertificate({ isProtected: true }),
    } as any);
    MockCertificateService.verifyCertificateWithAccessCode.mockResolvedValue({
      valid: true,
      certificate: makeCertificate({ isProtected: true }),
    } as any);

    const response = await request(app)
      .get(`/api/v1/certificates/verify/${TOKEN}/history`)
      .set('X-Access-Code', ACCESS_CODE);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(MockCertificateService.verifyCertificateWithAccessCode).toHaveBeenCalledWith(TOKEN, ACCESS_CODE);
    expect(MockDocumentEventModel.findByDocumentId).toHaveBeenCalledWith('doc-1', expect.any(Object));
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('still refuses when edit history is disabled, regardless of protection', async () => {
    MockCertificateService.verifyCertificate.mockResolvedValue({
      valid: true,
      certificate: makeCertificate({ isProtected: false, includeEditHistory: false }),
    } as any);

    const response = await request(app).get(`/api/v1/certificates/verify/${TOKEN}/history`);

    expect(response.status).toBe(403);
    expect(MockDocumentEventModel.findByDocumentId).not.toHaveBeenCalled();
  });

  it('returns public logs for an unprotected certificate without an access code', async () => {
    const anomalyFlags = [
      {
        code: 'rapid_text_accumulation',
        severity: 'warning',
        label: 'Rapid text accumulation',
        description: 'A large amount of text appeared within a short time window.',
        evidence: {
          sources: ['untracked_input'],
          untrackedEventType: 'select',
          untrackedTimestamp: '2026-05-14T12:00:04.000Z',
          untrackedAddedCharacters: 419,
        },
      },
    ];
    MockCertificateService.verifyCertificate.mockResolvedValue({
      valid: true,
      certificate: makeCertificate({
        isProtected: false,
        title: 'Shared certificate',
        anomalyFlags,
      }),
    } as any);

    const response = await request(app).get(`/api/v1/certificates/verify/${TOKEN}/logs`);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.title).toBe('Shared certificate');
    expect(response.body.data.anomalyFlags).toEqual(anomalyFlags);
    expect(response.body.data.timeline.summary.rawEventTotal).toBe(0);
    expect(MockDocumentEventModel.findByDocumentId).toHaveBeenCalledWith('doc-1', expect.any(Object));
    expect(MockDocumentEventModel.countByDocumentId).toHaveBeenCalledWith('doc-1');
    expect(MockAIModel.getLogs).toHaveBeenCalledWith({
      documentId: 'doc-1',
      limit: 50,
      offset: 0,
    });
  });

  it('refuses public logs for a protected certificate when no access code is supplied', async () => {
    MockCertificateService.verifyCertificate.mockResolvedValue({
      valid: true,
      certificate: makeCertificate({ isProtected: true }),
    } as any);

    const response = await request(app).get(`/api/v1/certificates/verify/${TOKEN}/logs`);

    expect(response.status).toBe(403);
    expect(MockDocumentEventModel.findByDocumentId).not.toHaveBeenCalled();
    expect(MockAIModel.getLogs).not.toHaveBeenCalled();
  });

  it('returns public logs for a protected certificate with the correct access code', async () => {
    MockCertificateService.verifyCertificate.mockResolvedValue({
      valid: true,
      certificate: makeCertificate({ isProtected: true }),
    } as any);
    MockCertificateService.verifyCertificateWithAccessCode.mockResolvedValue({
      valid: true,
      certificate: makeCertificate({ isProtected: true }),
    } as any);

    const response = await request(app)
      .get(`/api/v1/certificates/verify/${TOKEN}/logs`)
      .set('X-Access-Code', ACCESS_CODE);

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(MockCertificateService.verifyCertificateWithAccessCode).toHaveBeenCalledWith(TOKEN, ACCESS_CODE);
    expect(MockDocumentEventModel.findByDocumentId).toHaveBeenCalledWith('doc-1', expect.any(Object));
    expect(response.headers['cache-control']).toBe('no-store');
  });
});
