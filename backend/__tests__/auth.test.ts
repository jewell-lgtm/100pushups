import { signToken, verifyToken } from '../src/auth.js';

describe('signToken / verifyToken', () => {
  const secret = 'test-secret-32-bytes-or-thereabouts';

  it('round-trips a deviceId through sign + verify', () => {
    const token = signToken('device-alpha', secret);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(verifyToken(token, secret)).toEqual({ deviceId: 'device-alpha' });
  });

  it('produces stable tokens for the same input', () => {
    expect(signToken('d1', secret)).toBe(signToken('d1', secret));
  });

  it('rejects a token signed with a different secret', () => {
    const token = signToken('d1', secret);
    expect(verifyToken(token, 'other-secret')).toBeNull();
  });

  it('rejects a malformed token', () => {
    expect(verifyToken('', secret)).toBeNull();
    expect(verifyToken('nodot', secret)).toBeNull();
    expect(verifyToken('.', secret)).toBeNull();
    expect(verifyToken('a.', secret)).toBeNull();
    expect(verifyToken('.b', secret)).toBeNull();
  });

  it('rejects a token whose mac has been tampered with', () => {
    const token = signToken('d1', secret);
    const [id, mac] = token.split('.');
    const tampered = `${id}.${mac.slice(0, -1)}A`;
    expect(verifyToken(tampered, secret)).toBeNull();
  });

  it('rejects a token whose deviceId has been tampered with', () => {
    const token = signToken('d1', secret);
    const [, mac] = token.split('.');
    const otherId = Buffer.from('d2', 'utf8').toString('base64').replace(/=+$/, '');
    expect(verifyToken(`${otherId}.${mac}`, secret)).toBeNull();
  });
});
