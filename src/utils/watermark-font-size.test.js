import assert from 'node:assert/strict'
import test from 'node:test'
import { fontSizePx } from './watermark.js'

test('watermark font size stays the same percentage of the short edge', () => {
  const config = { fontSize: 4 }
  const dimensions = [[1080, 2376], [4240, 2832], [2560, 2387]]

  for (const [width, height] of dimensions) {
    assert.equal(fontSizePx(config, width, height) / Math.min(width, height), 0.04)
  }
})
