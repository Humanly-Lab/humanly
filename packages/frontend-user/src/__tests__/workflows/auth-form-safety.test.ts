import fs from 'node:fs';
import path from 'node:path';

const AUTH_FORM_FILES = [
  ['user login', 'src/app/(auth)/login/page.tsx'],
  ['user register', 'src/app/(auth)/register/page.tsx'],
  ['user forgot password', 'src/app/(auth)/forgot-password/page.tsx'],
  ['user reset password', 'src/app/(auth)/reset-password/page.tsx'],
  ['admin login', '../frontend/src/app/(auth)/login/page.tsx'],
  ['admin register', '../frontend/src/app/(auth)/register/page.tsx'],
  ['admin forgot password', '../frontend/src/app/(auth)/forgot-password/page.tsx'],
  ['admin reset password', '../frontend/src/app/(auth)/reset-password/page.tsx'],
] as const;

describe('auth form native fallback safety', () => {
  it.each(AUTH_FORM_FILES)('%s form uses POST before hydration', (_label, relativePath) => {
    const filePath = path.resolve(process.cwd(), relativePath);
    const source = fs.readFileSync(filePath, 'utf8');

    expect(source).toMatch(/<form\s+method="post"\s+onSubmit=/);
  });
});
