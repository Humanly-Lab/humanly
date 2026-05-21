import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(process.cwd(), '../..');

function read(relativePath: string) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

describe('navigation workflow contracts', () => {
  it('keeps the current user portal routes available', () => {
    const userRoutes = [
      ['packages/frontend-user/src/app/documents/page.tsx', 'Personal Writing'],
      ['packages/frontend-user/src/app/documents/new/page.tsx', 'Create Writing'],
      ['packages/frontend-user/src/app/certificates/page.tsx', 'Authorship records'],
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
      ['packages/frontend/src/app/tasks/new/page.tsx', 'New Task'],
      ['packages/frontend/src/app/tasks/[id]/page.tsx', 'TASK_DETAIL_TABS'],
      ['packages/frontend/src/app/tasks/[id]/_components/OverviewPanel.tsx', 'Task Overview'],
      ['packages/frontend/src/app/tasks/[id]/_components/SettingsPanel.tsx', 'Task Settings'],
      ['packages/frontend/src/app/tasks/[id]/_components/UsersPanel.tsx', 'Enrolled Users'],
      ['packages/frontend/src/app/tasks/[id]/settings/page.tsx', '?tab=setting'],
      ['packages/frontend/src/app/tasks/[id]/enrollments/page.tsx', '?tab=users'],
    ];

    for (const [file, expectedText] of adminRoutes) {
      expect(fs.existsSync(path.join(repoRoot, file))).toBe(true);
      expect(read(file)).toContain(expectedText);
    }
  });
});
