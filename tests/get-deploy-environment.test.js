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

describe('validateConfig — GWN_ENV startup validation', () => {
  const originalEnv = { ...process.env };
  let warnSpy;
  let errorSpy;

  function loadValidate() {
    const configPath = require.resolve('../server/config');
    delete require.cache[configPath];
    return require('../server/config').validateConfig;
  }

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.JWT_SECRET = 'test-secret';
    process.env.SYSTEM_API_KEY = 'test-key';
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('valid GWN_ENV passes without warning or throw', () => {
    process.env.NODE_ENV = 'production';
    process.env.GWN_ENV = 'staging';
    process.env.CANONICAL_HOST = 'example.com';
    const validateConfig = loadValidate();
    expect(() => validateConfig()).not.toThrow();
    expect(warnSpy).not.toHaveBeenCalledWith(expect.stringMatching(/Invalid GWN_ENV/));
    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringMatching(/Invalid GWN_ENV/));
  });

  test('invalid GWN_ENV in production throws to fail boot', () => {
    process.env.NODE_ENV = 'production';
    process.env.GWN_ENV = 'prod';
    process.env.CANONICAL_HOST = 'example.com';
    const validateConfig = loadValidate();
    expect(() => validateConfig()).toThrow(/Invalid GWN_ENV/);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringMatching(/Invalid GWN_ENV/));
  });

  test('invalid GWN_ENV in development warns and does not throw', () => {
    process.env.NODE_ENV = 'development';
    process.env.GWN_ENV = 'prod';
    const validateConfig = loadValidate();
    expect(() => validateConfig()).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/Invalid GWN_ENV/));
  });

  test('unset GWN_ENV is preserved as default behaviour', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.GWN_ENV;
    process.env.CANONICAL_HOST = 'example.com';
    const validateConfig = loadValidate();
    expect(() => validateConfig()).not.toThrow();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
