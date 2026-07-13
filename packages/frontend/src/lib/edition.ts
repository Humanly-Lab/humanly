import { normalizeEdition, type Edition } from '@humanly/shared';

const edition = normalizeEdition(process.env.NEXT_PUBLIC_EDITION);

export const getEdition = (): Edition => edition;
