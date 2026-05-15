import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(process.cwd(), '../..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('navigation workflow contracts', () => {
  it('keeps the current user portal routes available', () => {
    const userRoutes = [
      ['packages/frontend-user/src/app/documents/page.tsx', 'My Documents'],
      ['packages/frontend-user/src/app/documents/new/page.tsx', 'New Document'],
      ['packages/frontend-user/src/app/certificates/page.tsx', 'My Certificates'],
      ['packages/frontend-user/src/app/terms/page.tsx', 'Terms of Service'],
      ['packages/frontend-user/src/app/privacy/page.tsx', 'Privacy Policy'],
    ];

    for (const [file, expectedText] of userRoutes) {
      expect(fs.existsSync(path.join(repoRoot, file))).toBe(true);
      expect(read(file)).toContain(expectedText);
    }
  });

  it('keeps the selected admin task routes available', () => {
    const adminRoutes = [
      ['packages/frontend/src/app/(auth)/login/page.tsx', 'Welcome back'],
      ['packages/frontend/src/app/tasks/page.tsx', 'Admin Tasks'],
      ['packages/frontend/src/app/tasks/new/page.tsx', 'Create Writing Task'],
      ['packages/frontend/src/app/tasks/[id]/page.tsx', 'Task Overview'],
      ['packages/frontend/src/app/tasks/[id]/settings/page.tsx', 'Task Settings'],
      ['packages/frontend/src/app/tasks/[id]/enrollments/page.tsx', 'Enrolled Users'],
    ];

    for (const [file, expectedText] of adminRoutes) {
      expect(fs.existsSync(path.join(repoRoot, file))).toBe(true);
      expect(read(file)).toContain(expectedText);
    }
  });
});
