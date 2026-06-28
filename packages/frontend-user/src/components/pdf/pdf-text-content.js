function createEmptyTextContent() {
  return {
    items: [],
    styles: Object.create(null),
    lang: null,
  };
}

async function readPDFTextContentStream(page) {
  const stream = typeof page.streamTextContent === 'function'
    ? page.streamTextContent()
    : null;
  const reader = stream && typeof stream.getReader === 'function'
    ? stream.getReader()
    : null;

  if (!reader || typeof reader.read !== 'function') {
    throw new Error('PDF text stream reader unavailable');
  }

  const textContent = createEmptyTextContent();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      if (textContent.lang === null && value.lang) {
        textContent.lang = value.lang;
      }
      if (value.styles) {
        Object.assign(textContent.styles, value.styles);
      }
      if (Array.isArray(value.items)) {
        textContent.items.push(...value.items);
      }
    }
  } finally {
    if (typeof reader.releaseLock === 'function') {
      reader.releaseLock();
    }
  }

  return textContent;
}

async function extractCompatiblePDFTextContent(page) {
  try {
    return await page.getTextContent();
  } catch (error) {
    if (typeof page.streamTextContent !== 'function') {
      throw error;
    }

    try {
      return await readPDFTextContentStream(page);
    } catch {
      throw error;
    }
  }
}

module.exports = {
  extractCompatiblePDFTextContent,
  readPDFTextContentStream,
};
