import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { Certificate } from '@humanly/shared';
import { logger } from '../utils/logger';
import { env } from '../config/env';

export class PDFService {
  /**
   * Generate a PDF certificate
   */
  static async generateCertificatePDF(certificate: Certificate): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margins: {
            top: 0,
            bottom: 0,
            left: 0,
            right: 0,
          },
        });

        const buffers: Buffer[] = [];

        // Collect PDF data
        doc.on('data', (buffer) => buffers.push(buffer));
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(buffers);
          resolve(pdfBuffer);
        });
        doc.on('error', (err) => {
          logger.error('PDF generation error', { error: err });
          reject(err);
        });

        // Build any async assets, such as the verification QR code, before
        // closing the stream so the PDF is complete and deterministic.
        this.buildCertificatePDF(doc, certificate)
          .then(() => doc.end())
          .catch((error) => {
            logger.error('Error in PDF generation', { error });
            reject(error);
          });
      } catch (error) {
        logger.error('Error in PDF generation', { error });
        reject(error);
      }
    });
  }

  /**
   * Build certificate PDF content
   */
  private static async buildCertificatePDF(doc: PDFKit.PDFDocument, certificate: Certificate) {
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;
    const margin = 48;
    const contentWidth = pageWidth - margin * 2;
    const ink = '#171717';
    const muted = '#6b7280';
    const border = '#e5e7eb';
    const soft = '#f7f7f7';
    const accent = '#111111';
    const pasteAccent = '#f97316';
    const verifyUrl = `${env.frontendUserUrl}/verify/${certificate.verificationToken}`;
    const verificationHost = new URL(env.frontendUserUrl).hostname;
    const tokenPreview = certificate.verificationToken.length > 24
      ? `${certificate.verificationToken.slice(0, 12)}...${certificate.verificationToken.slice(-12)}`
      : certificate.verificationToken;

    const totalAuthored = certificate.typedCharacters + certificate.pastedCharacters;
    const typedPercentage = totalAuthored > 0
      ? (certificate.typedCharacters / totalAuthored) * 100
      : 0;
    const pastedPercentage = totalAuthored > 0
      ? (certificate.pastedCharacters / totalAuthored) * 100
      : 0;
    const editingMinutes = Math.round(certificate.editingTimeSeconds / 60);
    const displayName = certificate.signerName || 'Author';
    const certTypeLabel = certificate.certificateType === 'full_authorship'
      ? 'Verified writing process'
      : 'Partial writing record';
    const aiStats = (certificate as any).aiAuthorshipStats;
    const selection = aiStats?.selectionActions;
    const questions = aiStats?.aiQuestions;
    const aiSelectionTotal = selection?.total ?? 0;
    const aiQuestionsTotal = questions?.total ?? 0;

    const formatNumber = (value: number) => value.toLocaleString('en-US');
    const formatDate = (value: Date | string) => new Date(value).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const drawFooter = () => {
      const y = pageHeight - 44;
      doc
        .moveTo(margin, y - 14)
        .lineTo(pageWidth - margin, y - 14)
        .lineWidth(0.5)
        .strokeColor(border)
        .stroke();
      doc
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor(muted)
        .text(`Certificate ID: ${certificate.id}`, margin, y, {
          width: contentWidth / 2,
          height: 10,
          lineBreak: false,
        })
        .text(`Verify at ${verificationHost}`, margin + contentWidth / 2, y, {
          width: contentWidth / 2,
          height: 10,
          align: 'right',
          lineBreak: false,
        });
    };

    const drawPill = (text: string, x: number, y: number, width: number) => {
      doc
        .roundedRect(x, y, width, 22, 11)
        .fillAndStroke('#ffffff', border);
      doc
        .font('Helvetica-Bold')
        .fontSize(8.5)
        .fillColor(muted)
        .text(text, x, y + 6.5, {
          width,
          align: 'center',
        });
    };

    const drawMetric = (x: number, y: number, width: number, label: string, value: string, note?: string) => {
      doc
        .roundedRect(x, y, width, 74, 8)
        .fillAndStroke(soft, border);
      doc
        .font('Helvetica-Bold')
        .fontSize(8)
        .fillColor(muted)
        .text(label.toUpperCase(), x + 14, y + 14, {
          width: width - 28,
        });
      doc
        .font('Helvetica-Bold')
        .fontSize(22)
        .fillColor(ink)
        .text(value, x + 14, y + 31, {
          width: width - 28,
        });
      if (note) {
        doc
          .font('Helvetica')
          .fontSize(7.5)
          .fillColor(muted)
          .text(note, x + 14, y + 56, {
            width: width - 28,
          });
      }
    };

    const drawSmallRow = (label: string, value: string, x: number, y: number, width: number) => {
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(muted)
        .text(label, x, y, { width: width * 0.58 });
      doc
        .font('Helvetica-Bold')
        .fontSize(9)
        .fillColor(ink)
        .text(value, x + width * 0.58, y, {
          width: width * 0.42,
          align: 'right',
        });
    };

    let qrBuffer: Buffer | null = null;
    try {
      const qrCodeDataURL = await QRCode.toDataURL(verifyUrl, {
        width: 160,
        margin: 1,
        color: {
          dark: '#111111',
          light: '#ffffff',
        },
      });
      qrBuffer = Buffer.from(qrCodeDataURL.replace(/^data:image\/png;base64,/, ''), 'base64');
    } catch (error) {
      logger.error('Error generating QR code for PDF', { error });
    }

    doc
      .rect(0, 0, pageWidth, pageHeight)
      .fill('#ffffff');

    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .fillColor(ink)
      .text('Humanly', margin, 42);
    doc
      .font('Helvetica')
      .fontSize(8.5)
      .fillColor(muted)
      .text('Verifiable writing process certificate', margin, 57);
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(muted)
      .text(formatDate(certificate.generatedAt), margin, 42, {
        width: contentWidth,
        align: 'right',
      });
    doc
      .moveTo(margin, 82)
      .lineTo(pageWidth - margin, 82)
      .lineWidth(0.75)
      .strokeColor(border)
      .stroke();

    drawPill(certTypeLabel, margin, 104, 150);

    doc
      .font('Helvetica-Bold')
      .fontSize(32)
      .fillColor(ink)
      .text('Authorship Certificate', margin, 140, {
        width: contentWidth,
      });
    doc
      .font('Helvetica-Bold')
      .fontSize(18)
      .fillColor(ink)
      .text(certificate.title, margin, 184, {
        width: contentWidth - 140,
        lineGap: 2,
      });
    doc
      .font('Helvetica')
      .fontSize(10)
      .fillColor(muted)
      .text(`Prepared for ${displayName}`, margin, 228, {
        width: contentWidth / 2,
      })
      .text(`Generated ${formatDate(certificate.generatedAt)}`, margin + contentWidth / 2, 228, {
        width: contentWidth / 2,
        align: 'right',
      });

    const metricGap = 10;
    const metricWidth = (contentWidth - metricGap * 3) / 4;
    const metricY = 270;
    drawMetric(margin, metricY, metricWidth, 'Typed', `${typedPercentage.toFixed(0)}%`, `${formatNumber(certificate.typedCharacters)} chars`);
    drawMetric(margin + (metricWidth + metricGap), metricY, metricWidth, 'Pasted', `${pastedPercentage.toFixed(0)}%`, `${formatNumber(certificate.pastedCharacters)} chars`);
    drawMetric(margin + (metricWidth + metricGap) * 2, metricY, metricWidth, 'Final Text', formatNumber(certificate.totalCharacters), 'characters');
    drawMetric(margin + (metricWidth + metricGap) * 3, metricY, metricWidth, 'Writing Time', `${editingMinutes} min`, 'recorded');

    const barY = 382;
    doc
      .font('Helvetica-Bold')
      .fontSize(12)
      .fillColor(ink)
      .text('Writing composition', margin, barY);
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(muted)
      .text(`${formatNumber(certificate.typedCharacters)} typed characters · ${formatNumber(certificate.pastedCharacters)} pasted characters`, margin, barY + 17);
    const barWidth = contentWidth;
    const typedBarWidth = Math.max(0, Math.min(barWidth, (typedPercentage / 100) * barWidth));
    doc
      .roundedRect(margin, barY + 42, barWidth, 10, 5)
      .fill('#e5e7eb');
    doc
      .roundedRect(margin, barY + 42, typedBarWidth, 10, 5)
      .fill(accent);
    if (pastedPercentage > 0) {
      doc
        .roundedRect(margin + typedBarWidth, barY + 42, Math.max(2, barWidth - typedBarWidth), 10, 5)
        .fill(pasteAccent);
    }
    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor(muted)
      .text(`${typedPercentage.toFixed(0)}% typed`, margin, barY + 62, {
        width: barWidth,
        align: 'right',
      });

    const panelY = 486;
    const panelGap = 16;
    const leftPanelWidth = (contentWidth - panelGap) * 0.58;
    const rightPanelWidth = contentWidth - panelGap - leftPanelWidth;
    const panelHeight = 158;

    doc
      .roundedRect(margin, panelY, leftPanelWidth, panelHeight, 10)
      .fillAndStroke('#ffffff', border);
    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor(ink)
      .text('Activity record', margin + 18, panelY + 18);
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor(muted)
      .text('Write-time tracking and in-platform AI activity.', margin + 18, panelY + 37, {
        width: leftPanelWidth - 36,
      });
    drawSmallRow('AI chat', formatNumber(aiQuestionsTotal), margin + 18, panelY + 68, leftPanelWidth - 36);
    drawSmallRow('Text improvements', formatNumber(aiSelectionTotal), margin + 18, panelY + 88, leftPanelWidth - 36);
    drawSmallRow('Tracked actions', formatNumber(certificate.totalEvents), margin + 18, panelY + 108, leftPanelWidth - 36);
    drawSmallRow('Typing updates / pastes', `${formatNumber(certificate.typingEvents)} / ${formatNumber(certificate.pasteEvents)}`, margin + 18, panelY + 128, leftPanelWidth - 36);

    const verificationX = margin + leftPanelWidth + panelGap;
    doc
      .roundedRect(verificationX, panelY, rightPanelWidth, panelHeight, 10)
      .fillAndStroke('#ffffff', border);
    doc
      .font('Helvetica-Bold')
      .fontSize(13)
      .fillColor(ink)
      .text('Verification', verificationX + 18, panelY + 18);
    if (qrBuffer) {
      const qrSize = 82;
      doc.image(qrBuffer, verificationX + (rightPanelWidth - qrSize) / 2, panelY + 42, {
        width: qrSize,
        height: qrSize,
      });
    }
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor(muted)
      .text('Scan to verify online', verificationX + 18, panelY + 130, {
        width: rightPanelWidth - 36,
        align: 'center',
      })
      .font('Courier')
      .fontSize(7)
      .fillColor(ink)
      .text(tokenPreview, verificationX + 18, panelY + 143, {
        width: rightPanelWidth - 36,
        align: 'center',
        height: 9,
        lineBreak: false,
      });

    drawFooter();

    if (certificate.includeFullText && certificate.plainTextSnapshot) {
      doc.addPage();
      doc.rect(0, 0, pageWidth, pageHeight).fill('#ffffff');
      doc
        .font('Helvetica-Bold')
        .fontSize(18)
        .fillColor(ink)
        .text('Document Content', margin, 56);
      doc
        .font('Helvetica')
        .fontSize(9)
        .fillColor(muted)
        .text('A snapshot of the submitted text. Long documents are truncated in the PDF export; the JSON export preserves the complete certificate record.', margin, 82, {
          width: contentWidth,
        });

      const textTop = 122;
      const maxTextHeight = pageHeight - textTop - 98;
      const textSample = certificate.plainTextSnapshot.substring(0, 4500);
      const renderedHeight = doc.heightOfString(textSample, {
        width: contentWidth,
        lineGap: 2,
      });
      const isTruncated = certificate.plainTextSnapshot.length > 4500 || renderedHeight > maxTextHeight;

      doc
        .roundedRect(margin, textTop - 14, contentWidth, maxTextHeight + 28, 8)
        .fillAndStroke(soft, border);
      doc
        .font('Helvetica')
        .fontSize(9.5)
        .fillColor(ink)
        .text(textSample, margin + 18, textTop, {
          width: contentWidth - 36,
          height: maxTextHeight,
          lineGap: 2,
        });

      if (isTruncated) {
        doc
          .font('Helvetica')
          .fontSize(8)
          .fillColor(muted)
          .text('Content truncated in PDF preview. Use JSON export for the full certificate payload.', margin, pageHeight - 72, {
            width: contentWidth,
            align: 'center',
          });
      }

      drawFooter();
    }
  }
}
