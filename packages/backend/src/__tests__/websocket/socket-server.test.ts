import { authenticateSocket, getSocketTokenCandidates, TypedSocket } from '../../websocket/socket-server';
import { generateAccessToken } from '../../utils/jwt';

jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

jest.mock('../../websocket/handlers/live-preview.handler', () => ({
  setupLivePreviewHandlers: jest.fn(),
}));

jest.mock('../../websocket/handlers/ai.handler', () => ({
  setupAIHandlers: jest.fn(),
}));

const validPayload = { userId: 'u-1', email: 'alice@example.com' };
const cookiePayload = { userId: 'u-cookie', email: 'cookie@example.com' };

function makeSocket(overrides: {
  authToken?: string | null;
  queryToken?: string | null;
  cookieHeader?: string;
} = {}): TypedSocket {
  return {
    id: 'socket-1',
    handshake: {
      auth: overrides.authToken === undefined ? {} : { token: overrides.authToken },
      query: overrides.queryToken === undefined ? {} : { token: overrides.queryToken },
      headers: overrides.cookieHeader ? { cookie: overrides.cookieHeader } : {},
      address: '127.0.0.1',
    },
    data: {},
  } as unknown as TypedSocket;
}

describe('getSocketTokenCandidates', () => {
  it('orders auth, query, and cookie token candidates without exposing cookie parsing details', () => {
    const socket = makeSocket({
      authToken: 'auth-token',
      queryToken: 'query-token',
      cookieHeader: 'theme=light; accessToken=cookie-token; other=value',
    });

    expect(getSocketTokenCandidates(socket)).toEqual([
      { source: 'auth', token: 'auth-token' },
      { source: 'query', token: 'query-token' },
      { source: 'cookie', token: 'cookie-token' },
    ]);
  });

  it('decodes URL-encoded cookie tokens', () => {
    const socket = makeSocket({
      cookieHeader: `accessToken=${encodeURIComponent('token.with/slash+plus')}`,
    });

    expect(getSocketTokenCandidates(socket)).toEqual([
      { source: 'cookie', token: 'token.with/slash+plus' },
    ]);
  });
});

describe('authenticateSocket', () => {
  it('authenticates from a valid auth token', () => {
    const token = generateAccessToken(validPayload);
    const socket = makeSocket({ authToken: token });
    const next = jest.fn();

    authenticateSocket(socket, next);

    expect(socket.data.userId).toBe('u-1');
    expect(socket.data.email).toBe('alice@example.com');
    expect(next).toHaveBeenCalledWith();
  });

  it('authenticates from a valid query token', () => {
    const token = generateAccessToken(validPayload);
    const socket = makeSocket({ queryToken: token });
    const next = jest.fn();

    authenticateSocket(socket, next);

    expect(socket.data.userId).toBe('u-1');
    expect(next).toHaveBeenCalledWith();
  });

  it('authenticates from the accessToken cookie when no explicit token is present', () => {
    const cookieToken = generateAccessToken(cookiePayload);
    const socket = makeSocket({
      cookieHeader: `theme=light; accessToken=${encodeURIComponent(cookieToken)}`,
    });
    const next = jest.fn();

    authenticateSocket(socket, next);

    expect(socket.data.userId).toBe('u-cookie');
    expect(socket.data.email).toBe('cookie@example.com');
    expect(next).toHaveBeenCalledWith();
  });

  it('falls back to a valid cookie when an explicit auth token is stale', () => {
    const cookieToken = generateAccessToken(cookiePayload);
    const socket = makeSocket({
      authToken: 'stale.or.invalid.token',
      cookieHeader: `accessToken=${encodeURIComponent(cookieToken)}`,
    });
    const next = jest.fn();

    authenticateSocket(socket, next);

    expect(socket.data.userId).toBe('u-cookie');
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects sockets with no token candidate', () => {
    const socket = makeSocket();
    const next = jest.fn();

    authenticateSocket(socket, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Authentication required',
    }));
  });

  it('rejects sockets when all token candidates are invalid', () => {
    const socket = makeSocket({
      authToken: 'stale.or.invalid.token',
      cookieHeader: 'accessToken=also.invalid',
    });
    const next = jest.fn();

    authenticateSocket(socket, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Invalid or expired token',
    }));
  });
});
