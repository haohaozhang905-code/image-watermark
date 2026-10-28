// Regression coverage for the shipped v6 workbench HTML.
// Uses the repository's existing Playwright installation when available.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const JSZip = require('jszip')
const playwright = require(process.env.PLAYWRIGHT_MODULE_PATH || 'playwright')

async function main() {
  const outputDir = process.env.TEST_ARTIFACT_DIR || await fs.mkdtemp(path.join(os.tmpdir(), 'watermark-v6-'))
  await fs.mkdir(outputDir, { recursive: true })
  const { createServer } = await import('vite')
  const server = await createServer({ server: { host: '127.0.0.1', port: 0 } })
  await server.listen()
  let browser
  try {
    browser = await playwright.chromium.launch({
      headless: true,
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}),
    })
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
    page.setDefaultTimeout(15000)
    await page.route('**/*', route => {
      const url = new URL(route.request().url())
      return ['127.0.0.1', 'localhost'].includes(url.hostname) ? route.continue() : route.abort()
    })

    await page.goto(server.resolvedUrls.local[0], { waitUntil: 'domcontentloaded' })
    await page.waitForURL('**/workbench-v6.html')
    assert.equal(await page.title(), '隐私水印 · 工作台设计稿')
    assert.equal(await page.locator('.scene').count(), 4)
    assert.equal(await page.locator('#export').isDisabled(), true)

    await page.locator('#sample').click()
    await page.locator('.thumb').waitFor({ state: 'visible' })
    assert.equal(await page.locator('.thumb').count(), 1)
    assert.equal(await page.locator('#export').isEnabled(), true)

    // Add a second local copy to exercise both navigation controls and arrow keys.
    const html = await fs.readFile(path.join(process.cwd(), 'public/workbench-v6.html'), 'utf8')
    const encodedPhoto = html.match(/const samplePhoto='data:image\/jpeg;base64,([^']+)'/)
    assert.ok(encodedPhoto, "the design sample photo should remain embedded")
    await page.locator('#fileinput').setInputFiles([{
      name: 'second.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from(encodedPhoto[1], 'base64'),
    }])
    await page.waitForFunction(() => document.querySelectorAll('.thumb').length === 2)
    await page.locator('#next-image').click()
    assert.equal(await page.locator('.thumb.active img').getAttribute('alt'), 'second.jpg')
    await page.keyboard.press('ArrowLeft')
    assert.equal(await page.locator('.thumb.active img').getAttribute('alt'), '雪山风景示例.jpg')

    await page.locator('[data-pane="settings"]').click()
    await page.locator('.scene[data-scene="bank"]').click()
    assert.equal(await page.locator('#text').inputValue(), '仅用于银行贷款审核，严禁挪作他用')
    await page.locator('[data-color="#ffffff"]').click()
    assert.equal(await page.locator('#colorname').innerText(), '白色')

    const pending = page.waitForEvent('download')
    await page.locator('#export').click()
    const download = await pending
    const zipPath = path.join(outputDir, 'watermarked-v6.zip')
    await download.saveAs(zipPath)
    const zip = await JSZip.loadAsync(await fs.readFile(zipPath))
    assert.deepEqual(Object.keys(zip.files), [
      '1_雪山风景示例_watermarked.jpg',
      '2_second_watermarked.jpg',
    ])

    await page.setViewportSize({ width: 390, height: 844 })
    await page.locator('#adjust').click()
    assert.equal(await page.locator('[data-pane="settings"]').getAttribute('aria-pressed'), 'true')
    const overflow = await page.evaluate(() => ({
      horizontal: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      bodyHeight: document.body.scrollHeight,
      viewportHeight: innerHeight,
    }))
    assert.equal(overflow.horizontal, false, JSON.stringify(overflow))

    console.log('PASS v6 redirect, sample, scenes, image navigation, export, mobile pane')
    console.log(`Artifacts: ${outputDir}`)
  } finally {
    await browser?.close()
    await server.close()
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
