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

/** 字号按图片短边的百分比计算，避免竖长手机截图上的文字相对显得更大。 */
export function fontSizePx(config, width, height) {
  return (config.fontSize / 100) * Math.min(width, height)
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

/** 快速侦测图片平均亮度（返回 0-255） */
const luminanceCache = new WeakMap()
const MAX_IMAGE_PIXELS = 40_000_000

function detectLuminance(img) {
  if (luminanceCache.has(img)) return luminanceCache.get(img)
  const size = 50 // 采样网格
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, size, size)

  try {
    const data = ctx.getImageData(0, 0, size, size).data
    let totalL = 0
    let transparentArea = 0
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3] / 255
      totalL += (data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114) * alpha
      transparentArea += 1 - alpha
    }
    const luminance = (totalL + 255 * transparentArea) / (size * size)
    luminanceCache.set(img, luminance)
    return luminance
  } catch (e) {
    return 255 // 默认亮色背景
  }
}

function watermarkStyle(config, luminance) {
  const color = String(config.color || '#000000').toLowerCase()
  const opacityValue = Number(config.opacity)
  const opacity = Number.isFinite(opacityValue) ? opacityValue : 0.15
  const lightenBlack = color === '#000000' && luminance < 128
  return {
    color: lightenBlack ? '#ffffff' : color,
    opacity: lightenBlack ? Math.min(opacity + 0.05, 0.8) : opacity,
  }
}

function rotationDegrees(config) {
  const value = Number(config.rotation)
  return Number.isFinite(value) ? value : -30
}

// A contrasting outline keeps the text visible over both light and dark areas,
// including transparent images composited over an unknown background.
function setWatermarkStyle(ctx, config, luminance, fontSize) {
  const resolved = watermarkStyle(config, luminance)
  const r = parseInt(resolved.color.slice(1, 3), 16)
  const g = parseInt(resolved.color.slice(3, 5), 16)
  const b = parseInt(resolved.color.slice(5, 7), 16)
  const outline = r * 0.299 + g * 0.587 + b * 0.114 < 128 ? '#ffffff' : '#000000'
  ctx.fillStyle = hexToRgba(resolved.color, resolved.opacity)
  ctx.strokeStyle = hexToRgba(outline, resolved.opacity)
  ctx.lineWidth = Math.max(fontSize * 0.12, 0.5)
  ctx.lineJoin = 'round'
}

/** 核心平铺算法：模拟 Base64 背景平铺 + 奇偶行交错 + 智能自适应颜色 */
function drawTileWatermark(ctx, width, height, config, luminance = 255) {
  const text = String(config.text ?? '').trim()
  if (!text) return

  // 1. 参数设定
  const fontSize = fontSizePx(config, width, height)

  ctx.save()
  ctx.font = canvasFont(fontSize, config)

  // 动态测量文字宽度，避免重叠
  const lines = text.split(/\r?\n/)
  const metrics = lines.map(line => measureTextBox(ctx, line || ' ', fontSize))
  const tw = Math.max(...metrics.map(metric => metric.tw))
  const lineGap = fontSize * 0.2
  const lineHeights = metrics.map(metric => Math.max(metric.th, fontSize))
  const blockHeight = lineHeights.reduce((sum, lineHeight) => sum + lineHeight, 0) + lineGap * (lines.length - 1)

  // 动态步长：文字宽度 + 归一化间距
  // 根据 config.spacing 调整间距系数
  const spacingMap = {
    dense:  { x: 45,  y: 60 },
    medium: { x: 90,  y: 110 },
    sparse: { x: 160, y: 180 }
  }
  const s = spacingMap[config.spacing] || spacingMap.dense

  // 用图片短边归一化间距，保持不同分辨率下的密度，并避免大图文字重叠。
  const spacingScale = Math.min(width, height) / 600
  const stepX = tw + s.x * spacingScale
  const stepY = Math.max(s.y * spacingScale, blockHeight + fontSize * 0.5)

  // 智能自适应对比度：仅当设定为黑色 (#000000) 且背景太暗 (亮度 < 128) 时，才强制使用白色
  setWatermarkStyle(ctx, config, luminance, fontSize)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const diagLen = Math.sqrt(width * width + height * height)

  ctx.translate(width / 2, height / 2)
  ctx.rotate(rotationDegrees(config) * Math.PI / 180)

  // 2. 平铺逻辑
  let row = 0
  for (let y = -diagLen; y < diagLen; y += stepY) {
    // 奇偶行交错（砌砖效果）
    const offsetX = (row % 2 === 0) ? 0 : (stepX / 2)

    for (let x = -diagLen; x < diagLen + stepX; x += stepX) {
      let lineY = y - blockHeight / 2
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        ctx.strokeText(lines[lineIndex], x - offsetX, lineY + lineHeights[lineIndex] / 2)
        ctx.fillText(lines[lineIndex], x - offsetX, lineY + lineHeights[lineIndex] / 2)
        lineY += lineHeights[lineIndex] + lineGap
      }
    }
    row++
  }

  ctx.restore()
}

function drawCenterWatermark(ctx, width, height, config, luminance = 255) {
  const text = String(config.text ?? '').trim()
  if (!text) return

  const actualFontSize = fontSizePx(config, width, height)
  const lines = text.split(/\r?\n/)
  ctx.save()
  ctx.font = canvasFont(actualFontSize, config)

  setWatermarkStyle(ctx, config, luminance, actualFontSize)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.translate(width / 2, height / 2)
  ctx.rotate(rotationDegrees(config) * Math.PI / 180)
  const lineHeights = lines.map(line => Math.max(measureTextBox(ctx, line || ' ', actualFontSize).th, actualFontSize))
  const lineGap = actualFontSize * 0.2
  const blockHeight = lineHeights.reduce((sum, lineHeight) => sum + lineHeight, 0) + lineGap * (lines.length - 1)
  let lineY = -blockHeight / 2
  for (let index = 0; index < lines.length; index++) {
    ctx.strokeText(lines[index], 0, lineY + lineHeights[index] / 2)
    ctx.fillText(lines[index], 0, lineY + lineHeights[index] / 2)
    lineY += lineHeights[index] + lineGap
  }
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

  // 采样亮度
  const luminance = detectLuminance(img)

  ctx.drawImage(img, dx, dy, dw, dh)
  ctx.save()
  ctx.beginPath()
  ctx.rect(dx, dy, dw, dh)
  ctx.clip()
  ctx.translate(dx, dy)
  // 预览只缩放原图坐标系，文字测量、间距和起点与导出完全共用。
  ctx.scale(scale, scale)
  if (config.layout === 'tile') drawTileWatermark(ctx, img.naturalWidth, img.naturalHeight, config, luminance)
  else drawCenterWatermark(ctx, img.naturalWidth, img.naturalHeight, config, luminance)
  ctx.restore()
}

/** 只加载图片，由调用方确认请求仍然有效后再绘制。 */
export function loadImage(imageFile) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(imageFile)
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片加载失败'))
    }
    img.src = url
  })
}

/** 对单张图片文件应用水印，返回原始像素尺寸的 Blob。 */
export async function applyWatermark(imageFile, config) {
  const img = await loadImage(imageFile)
  assertImagePixels(img)
  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法创建图片画布')

  const luminance = detectLuminance(img)
  ctx.drawImage(img, 0, 0)
  if (config.layout === 'tile') drawTileWatermark(ctx, canvas.width, canvas.height, config, luminance)
  else drawCenterWatermark(ctx, canvas.width, canvas.height, config, luminance)

  const mimeType = imageFile.type || 'image/jpeg'
  const quality = mimeType === 'image/png' ? undefined : 1.0
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      blob ? resolve(blob) : reject(new Error('图片编码失败'))
    }, mimeType, quality)
  })
}

export function assertImagePixels(img) {
  if (img.naturalWidth * img.naturalHeight > MAX_IMAGE_PIXELS) {
    throw new Error('图片像素超过 4000 万限制')
  }
}
