import { resolveSocketUrl } from '@/lib/socket-client';

describe('resolveSocketUrl', () => {
  it('routes production app and admin socket origins through the direct API host', () => {
    expect(resolveSocketUrl('wss://app.writehumanly.net')).toBe('https://api.writehumanly.net');
    expect(resolveSocketUrl('wss://admin.writehumanly.net')).toBe('https://api.writehumanly.net');
    expect(resolveSocketUrl('https://writehumanly.net')).toBe('https://api.writehumanly.net');
  });

  it('keeps local and custom socket origins unchanged', () => {
    expect(resolveSocketUrl('http://localhost:3001')).toBe('http://localhost:3001');
    expect(resolveSocketUrl('wss://staging.example.com')).toBe('wss://staging.example.com');
    expect(resolveSocketUrl('/socket.io')).toBe('/socket.io');
  });
});
