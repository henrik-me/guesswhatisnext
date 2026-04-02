/**
 * Tests for the OpenTelemetry bootstrap module (server/telemetry.js)
 * and related config entries.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest'
import path from 'path'

/** Clear all server modules from the require cache. */
function clearServerCache() {
  const serverDir = path.resolve(__dirname, '..', 'server')
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(serverDir)) {
      delete require.cache[key]
    }
  }
}

describe('server/telemetry.js', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    clearServerCache()
  })

  afterEach(() => {
    // Restore original env vars
    process.env = { ...originalEnv }
  })

  test('loads without error when APPLICATIONINSIGHTS_CONNECTION_STRING is not set', () => {
    delete process.env.APPLICATIONINSIGHTS_CONNECTION_STRING
    expect(() => require('../server/telemetry')).not.toThrow()
  })

  test('exports an empty object (no-op) when connection string is absent', () => {
    delete process.env.APPLICATIONINSIGHTS_CONNECTION_STRING
    const mod = require('../server/telemetry')
    expect(mod).toEqual({})
  })

  test('does not crash when APPLICATIONINSIGHTS_CONNECTION_STRING is empty string', () => {
    process.env.APPLICATIONINSIGHTS_CONNECTION_STRING = ''
    expect(() => require('../server/telemetry')).not.toThrow()
  })
})

describe('server/config.js – APPLICATIONINSIGHTS_CONNECTION_STRING', () => {
  beforeEach(() => {
    clearServerCache()
  })

  afterEach(() => {
    delete process.env.APPLICATIONINSIGHTS_CONNECTION_STRING
    clearServerCache()
  })

  test('config includes APPLICATIONINSIGHTS_CONNECTION_STRING defaulting to empty string', () => {
    delete process.env.APPLICATIONINSIGHTS_CONNECTION_STRING
    const { config } = require('../server/config')
    expect(config).toHaveProperty('APPLICATIONINSIGHTS_CONNECTION_STRING')
    expect(config.APPLICATIONINSIGHTS_CONNECTION_STRING).toBe('')
  })

  test('config picks up APPLICATIONINSIGHTS_CONNECTION_STRING from env', () => {
    process.env.APPLICATIONINSIGHTS_CONNECTION_STRING = 'InstrumentationKey=test-key'
    const { config } = require('../server/config')
    expect(config.APPLICATIONINSIGHTS_CONNECTION_STRING).toBe('InstrumentationKey=test-key')
  })
})
