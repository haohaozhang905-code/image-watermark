export function hexToRgba(hex, opacity) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

function canvasFont(sizePx, config) {
  const w = Number(config?.fontWeight)
  const weight = Number.isFinite(w) && w > 0 ? Math.round(w) : 400
  return `${weight} ${sizePx}px "Noto Sans SC", Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`
}

/** 字号：config.fontSize 表示「较短边的百分比」，横图/竖图视觉更一致 */
function fontSizePx(config, width, height) {
  const base = Math.min(width, height)
  return (config.fontSize / 100) * base
}

/** measureText 宽度 + 尽量用语义框高度，改善平铺步长 */
function measureTextBox(ctx, text, fallbackHeight) {
  const m = ctx.measureText(text)
  const tw = m.width
  let th = fallbackHeight
  if (
    typeof m.actualBoundingBoxAscent === 'number' &&
    typeof m.actualBoundingBoxDescent === 'number' &&
    Number.isFinite(m.actualBoundingBoxAscent) &&
    Number.isFinite(m.actualBoundingBoxDescent)
  ) {
    th = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent
  }
  if (th <= 0) th = fallbackHeight
  return { tw, th }
}

function drawTileWatermark(ctx, width, height, config) {
  const text = String(config.text ?? '').trim()
  if (!text) return

  const spacingMap = { sparse: 1.8, medium: 1.2, dense: 0.6 }
  const gap = spacingMap[config.spacing] ?? 1.2
  const actualFontSize = fontSizePx(config, width, height)

  ctx.save()
  ctx.font = canvasFont(actualFontSize, config)
  const { tw, th } = measureTextBox(ctx, text, actualFontSize)
  const rad = (config.rotation * Math.PI) / 180
  const abscos = Math.abs(Math.cos(rad))
  const abssin = Math.abs(Math.sin(rad))
  const bboxW = tw * abscos + th * abssin
  const bboxH = tw * abssin + th * abscos
  const stepX = bboxW * (1 + gap)
  const stepY = bboxH * (1 + gap)
  ctx.fillStyle = hexToRgba(config.color, config.opacity)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  let row = 0
  for (let y = -stepY; y < height + stepY * 2; y += stepY) {
    const offsetX = row % 2 === 0 ? 0 : stepX / 2
    for (let x = -stepX + offsetX; x < width + stepX * 2; x += stepX) {
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(rad)
      ctx.fillText(text, 0, 0)
      ctx.restore()
    }
    row++
  }
  ctx.restore()
}

function drawCenterWatermark(ctx, width, height, config) {
  const text = String(config.text ?? '').trim()
  if (!text) return

  const actualFontSize = fontSizePx(config, width, height)
  ctx.save()
  ctx.font = canvasFont(actualFontSize, config)
  ctx.fillStyle = hexToRgba(config.color, config.opacity)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.translate(width / 2, height / 2)
  ctx.rotate((config.rotation * Math.PI) / 180)
  ctx.fillText(text, 0, 0)
  ctx.restore()
}

/** 同步渲染（图片已预加载），无闪烁 */
export function renderPreviewFromImg(canvasEl, img, config) {
  if (!canvasEl || !img) return
  const dpr = window.devicePixelRatio || 1
  const lw = canvasEl.width / dpr
  const lh = canvasEl.height / dpr
  const ctx = canvasEl.getContext('2d')
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, lw, lh)
  const scale = Math.min(lw / img.naturalWidth, lh / img.naturalHeight)
  const dw = img.naturalWidth * scale
  const dh = img.naturalHeight * scale
  const dx = (lw - dw) / 2
  const dy = (lh - dh) / 2
  ctx.drawImage(img, dx, dy, dw, dh)
  ctx.save()
  ctx.beginPath()
  ctx.rect(dx, dy, dw, dh)
  ctx.clip()
  ctx.translate(dx, dy)
  if (config.layout === 'tile') drawTileWatermark(ctx, dw, dh, config)
  else drawCenterWatermark(ctx, dw, dh, config)
  ctx.restore()
}

/** 从 File 加载图片后同步渲染（首次加载用） */
export function renderPreview(canvasEl, imageFile, config, onImgLoaded) {
  if (!canvasEl || !imageFile) return
  const img = new Image()
  const url = URL.createObjectURL(imageFile)
  img.onload = () => {
    URL.revokeObjectURL(url)
    renderPreviewFromImg(canvasEl, img, config)
    onImgLoaded && onImgLoaded(img)
  }
  img.onerror = () => URL.revokeObjectURL(url)
  img.src = url
}

/** 对单张图片文件应用水印，返回 Blob，保持原始尺寸不压缩 */
export function applyWatermark(imageFile, config) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(imageFile)
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0)
      if (config.layout === 'tile') drawTileWatermark(ctx, canvas.width, canvas.height, config)
      else drawCenterWatermark(ctx, canvas.width, canvas.height, config)
      URL.revokeObjectURL(url)
      const mimeType = imageFile.type || 'image/jpeg'
      const quality = mimeType === 'image/png' ? undefined : 1.0
      canvas.toBlob((blob) => {
        blob ? resolve(blob) : reject(new Error('toBlob 失败'))
      }, mimeType, quality)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片加载失败'))
    }
    img.src = url
  })
}
