CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
    purpose VARCHAR(50) NOT NULL CHECK (purpose IN ('document_source_pdf', 'task_instruction_pdf')),
    title VARCHAR(500) NOT NULL,
    original_filename VARCHAR(500) NOT NULL,
    mime_type VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
    storage_provider VARCHAR(50) NOT NULL DEFAULT 'local',
    storage_key VARCHAR(1000) NOT NULL,
    file_size INTEGER NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    page_count INTEGER,
    legacy_source_id UUID UNIQUE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    CONSTRAINT files_document_or_task_scope CHECK (
        (purpose = 'document_source_pdf' AND document_id IS NOT NULL AND task_id IS NULL)
        OR
        (purpose = 'task_instruction_pdf' AND task_id IS NOT NULL AND document_id IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_files_document_purpose ON files(document_id, purpose) WHERE document_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_files_task_purpose ON files(task_id, purpose) WHERE task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_files_owner_user_id ON files(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_files_legacy_source_id ON files(legacy_source_id) WHERE legacy_source_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS file_pages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    text TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (file_id, page_number)
);

CREATE TABLE IF NOT EXISTS file_sections (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    section_title TEXT NOT NULL,
    start_page INTEGER,
    end_page INTEGER,
    text TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS file_text_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_id UUID NOT NULL REFERENCES files(id) ON DELETE CASCADE,
    page_number INTEGER,
    section_title TEXT,
    chunk_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE (file_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_file_pages_file_page ON file_pages(file_id, page_number);
CREATE INDEX IF NOT EXISTS idx_file_sections_file_title ON file_sections(file_id, lower(section_title));
CREATE INDEX IF NOT EXISTS idx_file_text_chunks_file_page ON file_text_chunks(file_id, page_number);
CREATE INDEX IF NOT EXISTS idx_file_pages_text_search ON file_pages USING GIN(to_tsvector('english', text));
CREATE INDEX IF NOT EXISTS idx_file_sections_text_search ON file_sections USING GIN(to_tsvector('english', text));
CREATE INDEX IF NOT EXISTS idx_file_text_chunks_text_search ON file_text_chunks USING GIN(to_tsvector('english', text));

INSERT INTO files (
    owner_user_id,
    document_id,
    task_id,
    purpose,
    title,
    original_filename,
    mime_type,
    storage_provider,
    storage_key,
    file_size,
    checksum,
    page_count,
    legacy_source_id,
    created_at,
    updated_at
)
SELECT
    uploaded_by,
    document_id,
    NULL,
    'document_source_pdf',
    title,
    title || '.pdf',
    'application/pdf',
    'local',
    'papers/' || pdf_storage_path,
    pdf_file_size,
    pdf_checksum,
    pdf_page_count,
    id,
    created_at,
    updated_at
FROM papers
WHERE document_id IS NOT NULL
ON CONFLICT (legacy_source_id) DO NOTHING;

INSERT INTO files (
    owner_user_id,
    document_id,
    task_id,
    purpose,
    title,
    original_filename,
    mime_type,
    storage_provider,
    storage_key,
    file_size,
    checksum,
    page_count,
    legacy_source_id,
    created_at,
    updated_at
)
SELECT
    uploaded_by,
    NULL,
    task_id,
    'task_instruction_pdf',
    title,
    title || '.pdf',
    'application/pdf',
    'local',
    'papers/' || pdf_storage_path,
    pdf_file_size,
    pdf_checksum,
    pdf_page_count,
    id,
    created_at,
    updated_at
FROM papers
WHERE keywords @> ARRAY['instructions']::text[]
ON CONFLICT (legacy_source_id) DO NOTHING;

INSERT INTO file_pages (file_id, page_number, text, created_at, updated_at)
SELECT files.id, paper_pages.page_number, paper_pages.text, paper_pages.created_at, paper_pages.updated_at
FROM paper_pages
JOIN files ON files.legacy_source_id = paper_pages.paper_id
ON CONFLICT (file_id, page_number) DO NOTHING;

INSERT INTO file_sections (file_id, section_title, start_page, end_page, text, created_at, updated_at)
SELECT files.id, paper_sections.section_title, paper_sections.start_page, paper_sections.end_page, paper_sections.text, paper_sections.created_at, paper_sections.updated_at
FROM paper_sections
JOIN files ON files.legacy_source_id = paper_sections.paper_id;

INSERT INTO file_text_chunks (file_id, page_number, section_title, chunk_index, text, created_at)
SELECT files.id, paper_text_chunks.page_number, paper_text_chunks.section_title, paper_text_chunks.chunk_index, paper_text_chunks.text, paper_text_chunks.created_at
FROM paper_text_chunks
JOIN files ON files.legacy_source_id = paper_text_chunks.paper_id
ON CONFLICT (file_id, chunk_index) DO NOTHING;
