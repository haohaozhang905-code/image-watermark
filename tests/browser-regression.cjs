// Uses an existing Playwright installation; no browser/dependency installation is performed.
// Optional: PLAYWRIGHT_MODULE_PATH, PLAYWRIGHT_CHROMIUM_EXECUTABLE, TEST_ARTIFACT_DIR.
// TEST_BUILD_DIR + --production runs only the production-bundle smoke check.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const JSZip = require('jszip')
// Font requests are blocked in these tests; screenshots should not wait for them.
process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY ||= '1'
const playwright = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')

async function main() {
  if (process.argv.includes('--production') && !process.env.TEST_BUILD_DIR) {
    throw new Error('--production 需要 TEST_BUILD_DIR 指向已构建的静态文件目录')
  }
  const outputDir = process.env.TEST_ARTIFACT_DIR || await fs.mkdtemp(path.join(os.tmpdir(), 'watermark-regression-'))
  await fs.mkdir(outputDir, { recursive: true })
  const { createServer } = await import('vite')
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 } })
  await server.listen()
  let browser
  const results = []
  try {
    browser = await playwright.chromium.launch({
      headless: true,
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}),
    })
    const baseURL = server.resolvedUrls.local[0]
    const contexts = []
    async function newPage(dpr = 1, url = baseURL) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: dpr, acceptDownloads: true })
      contexts.push(context)
      const page = await context.newPage()
      page.setDefaultTimeout(20000)
      await page.route('**/*', route => {
        const address = new URL(route.request().url())
        return ['127.0.0.1', 'localhost'].includes(address.hostname) ? route.continue() : route.abort()
      })
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForSelector('.drop-area')
      return page
    }
    async function check(name, fn) {
      if (process.argv.includes('--production') && !name.startsWith('Production')) return
      try {
        const evidence = await fn()
        results.push({ name, status: 'passed', evidence })
        console.log(`PASS ${name}`)
      } catch (error) {
        results.push({ name, status: 'failed', error: error.stack })
        console.error(`FAIL ${name}: ${error.message}`)
      } finally {
        await Promise.all(contexts.splice(0).map(context => context.close()))
        await fs.writeFile(path.join(outputDir, 'results.json'), JSON.stringify(results, null, 2))
      }
    }
    const fixturePage = await newPage()
    const fixtures = await fixturePage.evaluate(async () => {
      const files = {}
      for (const [name, w, h, color] of [['white', 2400, 1600, 'white'], ['dark', 1600, 1000, '#111111'], ['portrait', 1200, 1800, '#eeeeee']]) {
        const canvas = document.createElement('canvas')
        canvas.width = w; canvas.height = h
        canvas.getContext('2d').fillStyle = color
        canvas.getContext('2d').fillRect(0, 0, w, h)
        files[name] = canvas.toDataURL().split(',')[1]
      }
      return files
    })
    await Promise.all(contexts.splice(0).map(context => context.close()))
    const file = (name, fixture = 'white') => ({ name, mimeType: 'image/png', buffer: Buffer.from(fixtures[fixture], 'base64') })
    const broken = () => ({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image') })
    async function upload(page, files) {
      await page.locator('input[type=file]').setInputFiles(files)
      await page.waitForSelector('.thumb-tile')
    }
    async function exportZip(page, name) {
      const pending = page.waitForEvent('download')
      await page.locator('.btn-export').click()
      const download = await pending
      const zipPath = path.join(outputDir, name + '.zip')
      await download.saveAs(zipPath)
      await page.waitForFunction(() => !document.querySelector('.btn-export').disabled)
      return JSZip.loadAsync(await fs.readFile(zipPath))
    }
    const dimensions = buffer => [buffer.readUInt32BE(16), buffer.readUInt32BE(20)]

    for (const [dpr, fixture, layout, spacing] of [[1, 'white', 'tile', 'dense'], [2, 'portrait', 'tile', 'sparse'], [1, 'dark', 'center', 'medium']]) {
      await check(`R01 preview/export geometry (DPR ${dpr}, ${fixture}, ${layout}, ${spacing})`, async () => {
        const page = await newPage(dpr)
        const evidence = await page.evaluate(async ({ data, layout, spacing }) => {
          const { applyWatermark, loadImage, renderPreviewFromImg } = await import('/src/utils/watermark.js')
          const input = new File([await (await fetch('data:image/png;base64,' + data)).blob()], 'source.png', { type: 'image/png' })
          const config = { text: '仅用于测试 TEST', fontSize: 4, fontWeight: 400, color: '#000000', opacity: 0.3, layout, rotation: -30, spacing }
          const img = await loadImage(input)
          const dpr = devicePixelRatio
          const width = 600, height = 450
          const preview = document.createElement('canvas')
          preview.width = width * dpr; preview.height = height * dpr
          renderPreviewFromImg(preview, img, config)
          const blob = await applyWatermark(input, config)
          const bitmap = await createImageBitmap(blob)
          const expected = document.createElement('canvas')
          expected.width = preview.width; expected.height = preview.height
          const scale = Math.min(width / img.naturalWidth, height / img.naturalHeight)
          const dw = img.naturalWidth * scale, dh = img.naturalHeight * scale
          expected.getContext('2d').drawImage(bitmap, (width - dw) * dpr / 2, (height - dh) * dpr / 2, dw * dpr, dh * dpr)
          const a = preview.getContext('2d').getImageData(0, 0, preview.width, preview.height).data
          const b = expected.getContext('2d').getImageData(0, 0, expected.width, expected.height).data
          let sum = 0, different = 0, ink = 0
          for (let i = 0; i < a.length; i += 4) {
            sum += Math.abs(a[i] - b[i])
            if (Math.abs(a[i] - b[i]) > 12) different++
            if (a[i + 3] && a[i] > 30 && a[i] < 240) ink++
          }
          return { meanDifference: sum / (a.length / 4), differentFraction: different / (a.length / 4), ink, dimensions: [bitmap.width, bitmap.height], preview: preview.toDataURL(), expected: expected.toDataURL() }
        }, { data: fixtures[fixture], layout, spacing })
        for (const key of ['preview', 'expected']) {
          await fs.writeFile(path.join(outputDir, `geometry-${dpr}-${fixture}-${key}.png`), Buffer.from(evidence[key].split(',')[1], 'base64'))
          delete evidence[key]
        }
        assert.ok(evidence.ink > 100, 'comparison must include rendered watermark pixels')
        assert.ok(evidence.meanDifference < 3, JSON.stringify(evidence))
        assert.ok(evidence.differentFraction < 0.06, JSON.stringify(evidence))
        return evidence
      })
    }

    await check('Single export action + R02 latest settings', async () => {
      const page = await newPage()
      await upload(page, [file('white.png')])
      assert.equal(await page.locator('.btn-smart').count(), 0)
      assert.equal(await page.locator('.btn-export').isEnabled(), true)
      const before = await exportZip(page, 'first-export')
      const beforeBytes = await before.file('white_watermarked.png').async('nodebuffer')
      assert.deepEqual(dimensions(beforeBytes), [2400, 1600])
      await page.locator('.section-header.clickable').click()
      await page.locator('textarea').fill('LATEST-ONLY')
      await page.evaluate(() => {
        window._exportTexts = []
        const original = CanvasRenderingContext2D.prototype.fillText
        CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
          if (this.canvas.width === 2400) window._exportTexts.push(text)
          return original.call(this, text, ...args)
        }
      })
      assert.equal(await page.locator('.thumb-done-dot').count(), 0)
      const after = await exportZip(page, 'changed-export')
      assert.equal(beforeBytes.equals(await after.file('white_watermarked.png').async('nodebuffer')), false)
      assert.deepEqual(await page.evaluate(() => [...new Set(window._exportTexts)]), ['LATEST-ONLY'])
      await page.screenshot({ path: path.join(outputDir, 'desktop-after-export.png') })
      return { immediateExport: true, outputChanged: true, dimensions: [2400, 1600] }
    })

    await check('R03 same-name files remain distinct in ZIP', async () => {
      const page = await newPage()
      await upload(page, [file('same.png'), file('same.png', 'dark'), file('SAME.png', 'portrait')])
      const zip = await exportZip(page, 'same-names')
      const names = Object.keys(zip.files)
      assert.deepEqual(names, ['same_watermarked.png', 'same_watermarked_2.png', 'SAME_watermarked_3.png'])
      const sizes = await Promise.all(names.map(async name => dimensions(await zip.file(name).async('nodebuffer'))))
      assert.deepEqual(sizes, [[2400, 1600], [1600, 1000], [1200, 1800]])
      return { names, sizes }
    })

    await check('R04/R05 export snapshot, mutation lock, duplicate click guard', async () => {
      const page = await newPage()
      await upload(page, [file('first.png'), file('second.png')])
      await page.locator('.section-header.clickable').click()
      await page.locator('textarea').fill('BEFORE')
      await page.evaluate(() => {
        window._texts = []; window._blobCalls = 0
        const fill = CanvasRenderingContext2D.prototype.fillText
        CanvasRenderingContext2D.prototype.fillText = function (t, ...args) {
          if (this.canvas.width === 2400) window._texts.push(t)
          return fill.call(this, t, ...args)
        }
        const original = HTMLCanvasElement.prototype.toBlob
        HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
          const first = ++window._blobCalls === 1
          return original.call(this, blob => {
            if (first) { window._release = () => callback(blob); window._held = true }
            else callback(blob)
          }, ...args)
        }
      })
      let downloads = 0
      page.on('download', () => downloads++)
      const pending = page.waitForEvent('download')
      await page.locator('.btn-export').click()
      await page.waitForFunction(() => window._held)
      for (const selector of ['textarea', 'input[type=range]', '.seg-btn', '.color-dot', '.btn-rm', '.btn-clear-text', '.thumb-add', 'input[type=file]', '.btn-export']) {
        assert.equal(await page.locator(selector).first().isDisabled(), true, selector)
      }
      // Also exercise parent/handler guards against queued or synthetic events.
      await page.locator('.scene-card').nth(1).click()
      await page.locator('.btn-rm').first().dispatchEvent('click')
      await page.locator('.btn-clear-text').dispatchEvent('click')
      await page.locator('input[type=file]').setInputFiles([file('third.png')])
      await page.locator('.btn-export').dispatchEvent('click')
      assert.equal(await page.locator('.thumb-tile').count(), 2)
      assert.equal(await page.locator('textarea').inputValue(), 'BEFORE')
      await page.evaluate(() => window._release())
      const download = await pending
      const zipPath = path.join(outputDir, 'locked-batch.zip')
      await download.saveAs(zipPath)
      await page.waitForFunction(() => !document.querySelector('.btn-export').disabled)
      const zip = await JSZip.loadAsync(await fs.readFile(zipPath))
      assert.deepEqual(Object.keys(zip.files), ['first_watermarked.png', 'second_watermarked.png'])
      assert.equal((await zip.file('first_watermarked.png').async('nodebuffer')).equals(await zip.file('second_watermarked.png').async('nodebuffer')), true)
      assert.deepEqual(await page.evaluate(() => [...new Set(window._texts)]), ['BEFORE'])
      assert.equal(await page.locator('textarea').isEnabled(), true)
      assert.equal(await page.locator('.btn-rm').first().isEnabled(), true)
      assert.equal(downloads, 1)
      return { files: 2, identicalSettings: true, downloads, controlsUnlocked: true }
    })

    await check('R06 late image cannot overwrite selected image', async () => {
      const page = await newPage()
      await upload(page, [file('white.png'), file('dark.png', 'dark')])
      await page.waitForFunction(() => {
        const c = document.querySelector('canvas')
        return c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data[3] === 255
      })
      await page.evaluate(() => {
        const NativeImage = window.Image
        window.Image = function (...args) {
          const img = new NativeImage(...args)
          Object.defineProperty(img, 'onload', { set(fn) {
            img.addEventListener('load', () => {
              if (img.naturalWidth === 1600) { window._darkPending = true; setTimeout(() => { fn.call(img); window._darkReturned = true }, 250) }
              else fn.call(img)
            }, { once: true })
          } })
          return img
        }
      })
      await page.locator('.thumb-tile').nth(1).click()
      await page.waitForFunction(() => window._darkPending)
      await page.locator('.thumb-tile').nth(0).click()
      await page.waitForFunction(() => window._darkReturned)
      const evidence = await page.evaluate(() => {
        const c = document.querySelector('canvas')
        return { active: document.querySelector('.thumb-tile.active img').alt, center: [...c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data] }
      })
      assert.equal(evidence.active, 'white.png')
      assert.ok(evidence.center[0] > 150, JSON.stringify(evidence))
      return evidence
    })

    await check('R06 latest configuration is used when image finishes loading', async () => {
      const page = await newPage()
      await page.evaluate(() => {
        const NativeImage = window.Image
        window.Image = function (...args) {
          const img = new NativeImage(...args)
          Object.defineProperty(img, 'onload', { set(fn) { img.addEventListener('load', () => { window._finishImage = () => fn.call(img); window._imagePending = true }, { once: true }) } })
          return img
        }
        const original = CanvasRenderingContext2D.prototype.fillText
        window._texts = []
        CanvasRenderingContext2D.prototype.fillText = function (text, ...args) { window._texts.push(text); return original.call(this, text, ...args) }
      })
      await upload(page, [file('white.png')])
      await page.waitForFunction(() => window._imagePending)
      await page.locator('.section-header.clickable').click()
      await page.locator('textarea').fill('LATEST-TEXT')
      await page.evaluate(() => window._finishImage())
      await page.waitForFunction(() => window._texts.includes('LATEST-TEXT'))
      const texts = await page.evaluate(() => [...new Set(window._texts)])
      assert.deepEqual(texts, ['LATEST-TEXT'])
      return { texts }
    })

    await check('R06 cleared list stays blank after an old load completes', async () => {
      const page = await newPage()
      await page.evaluate(() => {
        const NativeImage = window.Image
        window.Image = function (...args) {
          const img = new NativeImage(...args)
          Object.defineProperty(img, 'onload', { set(fn) { img.addEventListener('load', () => { window._finishImage = () => fn.call(img); window._imagePending = true }, { once: true }) } })
          return img
        }
      })
      await upload(page, [file('white.png')])
      await page.waitForFunction(() => window._imagePending)
      await page.locator('.btn-clear-text').click()
      await page.waitForSelector('.drop-area')
      await page.evaluate(() => window._finishImage())
      const alpha = await page.locator('canvas').evaluate(c => c.getContext('2d').getImageData(c.width / 2, c.height / 2, 1, 1).data[3])
      assert.equal(alpha, 0)
      return { alpha }
    })

    await check('R07 all failures report filenames and permit retry without downloading', async () => {
      const page = await newPage()
      let downloads = 0
      page.on('download', () => downloads++)
      await upload(page, [broken()])
      await page.locator('.btn-export').click()
      await page.waitForFunction(() => document.querySelector('.export-status')?.textContent.includes('成功 0 张'))
      assert.match(await page.locator('.export-status').innerText(), /失败 1 张[\s\S]*broken.png[\s\S]*图片加载失败/)
      assert.equal(downloads, 0)
      assert.equal(await page.locator('.btn-export').isEnabled(), true)
      await page.screenshot({ path: path.join(outputDir, 'failed-export.png') })
      await page.locator('.btn-rm').click({ force: true })
      await upload(page, [file('retry.png')])
      const zip = await exportZip(page, 'retry')
      assert.deepEqual(Object.keys(zip.files), ['retry_watermarked.png'])
      return { failedDownloads: 0, retrySucceeded: true }
    })

    await check('R07 partial failure exports only successful files and reports accurate counts', async () => {
      const page = await newPage()
      await upload(page, [file('good.png'), broken()])
      const zip = await exportZip(page, 'partial')
      assert.deepEqual(Object.keys(zip.files), ['good_watermarked.png'])
      assert.match(await page.locator('.export-status').innerText(), /已导出 1 张，失败 1 张[\s\S]*broken.png/)
      assert.equal(await page.locator('.thumb-done-dot').count(), 1)
      return { exported: 1, failed: 1 }
    })

    await check('R07 encoder failure is handled and releases export lock', async () => {
      const page = await newPage()
      await upload(page, [file('white.png')])
      await page.evaluate(() => {
        const original = HTMLCanvasElement.prototype.toBlob
        HTMLCanvasElement.prototype.toBlob = function (cb, ...args) {
          if (this.width === 2400) { cb(null); return }
          return original.call(this, cb, ...args)
        }
      })
      await page.locator('.btn-export').click()
      await page.waitForFunction(() => document.querySelector('.export-status')?.textContent.includes('图片编码失败'))
      assert.equal(await page.locator('.btn-export').isEnabled(), true)
      return { recovered: true }
    })

    await check('R09 rejected uploads explain the reason and preserve existing results', async () => {
      const page = await newPage()
      await upload(page, [file('good.png')])
      await exportZip(page, 'upload-before-rejection')
      const tooLarge = { name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(10 * 1024 * 1024 + 1) }
      const unsupported = { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('notes') }
      await page.locator('input[type=file]').setInputFiles([tooLarge, unsupported])
      const message = await page.locator('.toast').innerText()
      assert.match(message, /large.png（超过 10 MB 限制）/)
      assert.match(message, /notes.txt（格式不支持）/)
      assert.equal(await page.locator('.thumb-tile').count(), 1)
      assert.equal(await page.locator('.thumb-done-dot').count(), 1)
      const limits = await page.evaluate(async () => {
        const { classifyUploads } = await import('/src/utils/uploads.js')
        const current = Array.from({ length: 99 }, () => ({ size: 1 }))
        const candidates = Array.from({ length: 2 }, (_, i) => ({ name: `extra-${i}.png`, type: 'image/png', size: 1 }))
        const count = classifyUploads(candidates, current)
        const total = classifyUploads([{ name: 'over-total.png', type: 'image/png', size: 2 * 1024 * 1024 }], [{ size: 99 * 1024 * 1024 }])
        return { acceptedAtLimit: count.valid.length, rejectedAtLimit: count.rejected.length, totalRejected: total.rejected[0]?.reason }
      })
      assert.deepEqual(limits, { acceptedAtLimit: 1, rejectedAtLimit: 1, totalRejected: '图片总大小不能超过 100 MB' })
      return { message, limits }
    })

    await check('R10 arrow keys inside editable controls do not change selected image', async () => {
      const page = await newPage()
      await upload(page, [file('first.png'), file('second.png', 'dark')])
      await page.locator('.section-header.clickable').click()
      await page.locator('textarea').focus()
      await page.keyboard.press('ArrowRight')
      assert.equal(await page.locator('.thumb-tile.active img').getAttribute('alt'), 'first.png')
      await page.keyboard.press('ArrowLeft')
      assert.equal(await page.locator('.thumb-tile.active img').getAttribute('alt'), 'first.png')
      return { selected: 'first.png' }
    })

    await check('R11 initial values match the selected preset and edits select Custom', async () => {
      const page = await newPage()
      await page.locator('.section-header.clickable').click()
      assert.equal(await page.locator('.scene-card.active .scene-title').innerText(), '入职背调')
      assert.equal(await page.locator('.val-pill').innerText(), '18%')
      await page.locator('textarea').fill('自定义文字')
      assert.equal(await page.locator('.scene-card.active .scene-title').innerText(), '自定义')
      await page.locator('.scene-card').first().click()
      assert.equal(await page.locator('textarea').inputValue(), '仅用于入职背景调查，他用无效')
      return { initialOpacity: '18%', customSelection: true, presetRestore: true }
    })

    await check('R12 multiline text is drawn on separate measured lines', async () => {
      const page = await newPage()
      await upload(page, [file('white.png')])
      await page.locator('.section-header.clickable').click()
      await page.evaluate(() => {
        window._lineDraws = []
        const original = CanvasRenderingContext2D.prototype.fillText
        CanvasRenderingContext2D.prototype.fillText = function (text, x, y) {
          if (this.canvas.width === 2400) window._lineDraws.push({ text, y })
          return original.call(this, text, x, y)
        }
      })
      await page.locator('textarea').fill('FIRST LINE\nSECOND LINE')
      await exportZip(page, 'multiline')
      await page.evaluate(async ({ data }) => {
        const { applyWatermark } = await import('/src/utils/watermark.js')
        const input = new File([await (await fetch('data:image/png;base64,' + data)).blob()], 'center.png', { type: 'image/png' })
        await applyWatermark(input, { text: 'CENTER ONE\nCENTER TWO', fontSize: 4, fontWeight: 400, color: '#000000', opacity: 0.3, layout: 'center', rotation: -30, spacing: 'dense' })
      }, { data: fixtures.white })
      const lines = await page.evaluate(() => window._lineDraws)
      assert.ok(lines.some(line => line.text === 'FIRST LINE'))
      assert.ok(lines.some(line => line.text === 'SECOND LINE'))
      assert.ok(lines.some(line => line.text === 'CENTER ONE'))
      assert.ok(lines.some(line => line.text === 'CENTER TWO'))
      assert.ok(!lines.some(line => line.text.includes('\n')))
      return { separateLines: [...new Set(lines.map(line => line.text))] }
    })

    await check('R13 blank watermark text is rejected without starting a download', async () => {
      const page = await newPage()
      let downloads = 0
      page.on('download', () => downloads++)
      await upload(page, [file('white.png')])
      await page.locator('.section-header.clickable').click()
      await page.locator('textarea').fill('  \n  ')
      await page.locator('.btn-export').click()
      assert.match(await page.locator('.export-status').innerText(), /请先填写水印文字/)
      assert.equal(await page.locator('.btn-export').isEnabled(), true)
      assert.equal(downloads, 0)
      return { downloads, error: await page.locator('.export-status').innerText() }
    })

    await check('R14/R15 configured rotation, transparent pixels and contrast rules', async () => {
      const page = await newPage()
      const evidence = await page.evaluate(async () => {
        const { applyWatermark } = await import('/src/utils/watermark.js')
        const rotations = [], colors = []
        const originalRotate = CanvasRenderingContext2D.prototype.rotate
        const originalFill = CanvasRenderingContext2D.prototype.fillText
        CanvasRenderingContext2D.prototype.rotate = function (angle) { rotations.push(angle * 180 / Math.PI); return originalRotate.call(this, angle) }
        CanvasRenderingContext2D.prototype.fillText = function (text, ...args) { colors.push(this.fillStyle); return originalFill.call(this, text, ...args) }
        async function makeFile({ name, color, alpha = 1 }) {
          const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32
          const ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.globalAlpha = alpha; ctx.fillRect(0, 0, 32, 32)
          return new File([await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))], name, { type: 'image/png' })
        }
        const config = { text: 'TEST', fontSize: 20, fontWeight: 400, color: '#2563eb', opacity: .3, layout: 'tile', rotation: 0, spacing: 'dense' }
        await applyWatermark(await makeFile({ name: 'transparent.png', color: '#000', alpha: 0 }), config)
        await applyWatermark(await makeFile({ name: 'dark.png', color: '#111' }), { ...config, layout: 'center' })
        await applyWatermark(await makeFile({ name: 'rotated.png', color: '#fff' }), { ...config, rotation: -30 })
        await applyWatermark(await makeFile({ name: 'dark-auto.png', color: '#111' }), { ...config, color: '#000000', layout: 'center' })
        await applyWatermark(await makeFile({ name: 'light-auto.png', color: '#fff' }), { ...config, color: '#000000', layout: 'center' })
        CanvasRenderingContext2D.prototype.rotate = originalRotate
        CanvasRenderingContext2D.prototype.fillText = originalFill
        return { rotations, colors: [...new Set(colors)] }
      })
      assert.ok(evidence.rotations.includes(0))
      assert.ok(evidence.rotations.some(angle => Math.abs(angle + 30) < 0.001), JSON.stringify(evidence.rotations))
      assert.ok(evidence.colors.includes('rgba(37, 99, 235, 0.3)'), JSON.stringify(evidence))
      assert.ok(evidence.colors.includes('rgba(255, 255, 255, 0.35)'), JSON.stringify(evidence))
      assert.ok(evidence.colors.includes('rgba(0, 0, 0, 0.3)'), JSON.stringify(evidence))
      return evidence
    })

    await check('R16 scene and settings controls expose accessible names and valid structure', async () => {
      const page = await newPage()
      await page.locator('.section-header.clickable').click()
      assert.equal(await page.locator('.scene-card').count(), 4)
      assert.equal(await page.locator('.scene-card').evaluateAll(els => els.every(el => el.tagName === 'BUTTON' && el.hasAttribute('aria-pressed'))), true)
      assert.equal(await page.locator('.section-header.clickable').getAttribute('aria-expanded'), 'true')
      assert.equal(await page.locator('textarea').evaluate(el => el.labels.length), 1)
      assert.equal(await page.locator('input[type=range]').evaluate(el => el.labels.length), 1)
      assert.equal(await page.locator('.color-dot').evaluateAll(els => els.every(el => el.getAttribute('aria-label'))), true)
      await upload(page, [file('photo.png')])
      assert.equal(await page.locator('button button').count(), 0)
      assert.equal(await page.locator('.btn-rm').getAttribute('aria-label'), '删除 photo.png')
      return { sceneButtons: 4, labels: true, nestedButtons: 0 }
    })

    await check('R19 oversized pixel dimensions fail safely before canvas allocation', async () => {
      const page = await newPage()
      const evidence = await page.evaluate(async () => {
        const { assertImagePixels } = await import('/src/utils/watermark.js')
        try { assertImagePixels({ naturalWidth: 6500, naturalHeight: 6500 }); return 'accepted' }
        catch (error) { return error.message }
      })
      assert.equal(evidence, '图片像素超过 4000 万限制')
      return { pixels: 42_250_000, error: evidence }
    })

    await check('Presets remain visible on mixed and transparent backgrounds', async () => {
      const page = await newPage()
      const evidence = await page.evaluate(async () => {
        const { SCENES } = await import('/src/utils/scenes.js')
        const { applyWatermark } = await import('/src/utils/watermark.js')
        const results = []
        for (const scene of SCENES.filter(scene => scene.config)) {
          for (const transparent of [false, true]) {
            const source = document.createElement('canvas')
            source.width = 1200; source.height = 800
            const ctx = source.getContext('2d')
            if (!transparent) {
              ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 600, 800)
              ctx.fillStyle = '#000'; ctx.fillRect(600, 0, 600, 800)
            }
            const file = new File([await new Promise(resolve => source.toBlob(resolve, 'image/png'))], 'test.png', { type: 'image/png' })
            const bitmap = await createImageBitmap(await applyWatermark(file, scene.config))
            const out = document.createElement('canvas'); out.width = 1200; out.height = 800
            out.getContext('2d').drawImage(bitmap, 0, 0)
            const data = out.getContext('2d').getImageData(0, 0, 1200, 800).data
            const visible = [0, 0]
            for (let y = 0; y < 800; y++) for (let x = 0; x < 1200; x++) {
              const i = (y * 1200 + x) * 4, alpha = data[i + 3] / 255
              if (transparent) {
                if (data[i] * alpha > 8) visible[0]++
                if (255 - (data[i] * alpha + 255 * (1 - alpha)) > 8) visible[1]++
              } else {
                const background = x < 600 ? 255 : 0
                if (Math.abs(data[i] - background) > 8) visible[x < 600 ? 0 : 1]++
              }
            }
            results.push({ scene: scene.id, transparent, visible })
          }
        }
        return results
      })
      for (const result of evidence) assert.ok(result.visible.every(count => count > 100), JSON.stringify(result))
      return evidence
    })

    await check('R21 app mounts while the web-font readiness promise is pending', async () => {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
      await page.addInitScript(() => Object.defineProperty(document, 'fonts', { configurable: true, value: { ready: new Promise(() => {}) } }))
      await page.goto(baseURL, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('.drop-area')
      assert.equal(await page.title(), '图片隐私水印工具')
      return { mountedBeforeFontsReady: true }
    })

    if (process.env.TEST_BUILD_DIR) {
      const { preview } = await import('vite')
      const built = await preview({ build: { outDir: process.env.TEST_BUILD_DIR }, preview: { host: '127.0.0.1', port: 0 } })
      try {
        await check('Production bundle: direct export, updated settings and failure recovery', async () => {
          const page = await newPage(1, built.resolvedUrls.local[0])
          const errors = []
          page.on('pageerror', error => errors.push(error.message))
          await upload(page, [file('production.png')])
          assert.equal(await page.locator('.btn-smart').count(), 0)
          const first = await exportZip(page, 'production-first')
          await page.locator('.section-header.clickable').click()
          await page.locator('textarea').fill('PRODUCTION-LATEST')
          const latest = await exportZip(page, 'production-latest')
          assert.equal((await first.file('production_watermarked.png').async('nodebuffer')).equals(await latest.file('production_watermarked.png').async('nodebuffer')), false)
          await page.locator('.btn-clear-text').click()
          await upload(page, [broken()])
          await page.locator('.btn-export').click()
          await page.waitForFunction(() => document.querySelector('.export-status')?.textContent.includes('成功 0 张'))
          assert.match(await page.locator('.export-status').innerText(), /broken.png/)
          assert.equal(await page.locator('.btn-export').isEnabled(), true)
          assert.deepEqual(errors, [])
          return { updatedOutput: true, failureRecovery: true, pageErrors: errors }
        })
      } finally {
        await new Promise(resolve => built.httpServer.close(resolve))
      }
    }

    const failed = results.filter(result => result.status === 'failed')
    console.log(`${results.length - failed.length}/${results.length} passed. Artifacts: ${outputDir}`)
    if (failed.length) process.exitCode = 1
  } finally {
    await browser?.close()
    await server.close()
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
