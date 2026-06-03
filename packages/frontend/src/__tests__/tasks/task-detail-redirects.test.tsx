import AnalyticsRedirectPage from '@/app/tasks/[id]/analytics/page';
import EnrollmentsRedirectPage from '@/app/tasks/[id]/enrollments/page';
import SettingsRedirectPage from '@/app/tasks/[id]/settings/page';
import { redirect } from 'next/navigation';

jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

describe('admin task detail legacy route redirects', () => {
  beforeEach(() => {
    jest.mocked(redirect).mockClear();
  });

  it('redirects analytics to the analytics tab', () => {
    AnalyticsRedirectPage({ params: { id: 'task-123' } });
    expect(redirect).toHaveBeenCalledWith('/tasks/task-123?tab=analytics');
  });

  it('redirects enrollments to the users tab', () => {
    EnrollmentsRedirectPage({ params: { id: 'task-123' } });
    expect(redirect).toHaveBeenCalledWith('/tasks/task-123?tab=users');
  });

  it('redirects settings to the setting tab', () => {
    SettingsRedirectPage({ params: { id: 'task-123' } });
    expect(redirect).toHaveBeenCalledWith('/tasks/task-123?tab=setting');
  });
});
