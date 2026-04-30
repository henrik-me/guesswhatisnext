const { getDeployEnvironment } = require('../server/config');

describe('getDeployEnvironment', () => {
  test('prefers valid GWN_ENV override', () => {
    expect(getDeployEnvironment({ GWN_ENV: 'local-container', NODE_ENV: 'production' })).toBe('local-container');
    expect(getDeployEnvironment({ GWN_ENV: 'staging', NODE_ENV: 'production' })).toBe('staging');
    expect(getDeployEnvironment({ GWN_ENV: 'production', NODE_ENV: 'development' })).toBe('production');
  });

  test('trims GWN_ENV before validating', () => {
    expect(getDeployEnvironment({ GWN_ENV: ' staging ', NODE_ENV: 'production' })).toBe('staging');
  });

  test('throws for unknown GWN_ENV values', () => {
    expect(() => getDeployEnvironment({ GWN_ENV: 'dev', NODE_ENV: 'development' })).toThrow(/Invalid GWN_ENV/);
    expect(() => getDeployEnvironment({ GWN_ENV: 'STAGING', NODE_ENV: 'staging' })).toThrow(/Invalid GWN_ENV/);
  });

  test('maps NODE_ENV to deploy environment when GWN_ENV is unset', () => {
    expect(getDeployEnvironment({ NODE_ENV: 'production' })).toBe('production');
    expect(getDeployEnvironment({ NODE_ENV: 'staging' })).toBe('staging');
    expect(getDeployEnvironment({ NODE_ENV: 'development' })).toBe('local-container');
    expect(getDeployEnvironment({ NODE_ENV: 'test' })).toBe('local-container');
    expect(getDeployEnvironment({})).toBe('local-container');
  });
});
