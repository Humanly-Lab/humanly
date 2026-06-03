import { getUserDisplayLabel, isGuestUserEmail } from '@/components/navigation/user-display';

describe('navbar user display labels', () => {
  it('shows generated public task guest accounts as guest', () => {
    expect(
      getUserDisplayLabel({ email: 'public-a38af2b9-942c5946-210c-4119-88c1-3d999aa8581e@guest.humanly.local' })
    ).toBe('guest');
  });

  it('shows other guest-domain accounts as guest', () => {
    expect(getUserDisplayLabel({ email: 'anonymous@guest.humanly.local' })).toBe('guest');
    expect(isGuestUserEmail('anonymous@guest.humanly.local')).toBe(true);
  });

  it('keeps real user emails visible', () => {
    expect(getUserDisplayLabel({ email: 'writer@example.com' })).toBe('writer@example.com');
    expect(isGuestUserEmail('writer@example.com')).toBe(false);
  });
});
