import type { Certificate } from '@humanly/shared';

export interface CertificateTaskGroup {
  documentId: string;
  title: string;
  latestCertificate: Certificate;
  certificates: Certificate[];
}

function generatedAtMs(certificate: Certificate): number {
  const value = new Date(certificate.generatedAt).getTime();
  return Number.isFinite(value) ? value : 0;
}

export function groupCertificatesByDocument(certificates: Certificate[]): CertificateTaskGroup[] {
  const sortedCertificates = [...certificates].sort((left, right) => (
    generatedAtMs(right) - generatedAtMs(left)
  ));
  const groups = new Map<string, CertificateTaskGroup>();

  for (const certificate of sortedCertificates) {
    const existing = groups.get(certificate.documentId);

    if (!existing) {
      groups.set(certificate.documentId, {
        documentId: certificate.documentId,
        title: certificate.title,
        latestCertificate: certificate,
        certificates: [certificate],
      });
      continue;
    }

    existing.certificates.push(certificate);
  }

  return Array.from(groups.values());
}
