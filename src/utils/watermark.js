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

/** 快速侦测图片平均亮度（返回 0-255） */
function detectLuminance(img) {
  const size = 50 // 采样网格
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, size, size)

  try {
    const data = ctx.getImageData(0, 0, size, size).data
    let totalL = 0
    for (let i = 0; i < data.length; i += 4) {
      // 经典亮度公式：Y = 0.299R + 0.587G + 0.114B
      totalL += (data[i] * 0.299 + data[i+1] * 0.587 + data[i+2] * 0.114)
    }
    return totalL / (size * size)
  } catch (e) {
    return 255 // 默认亮色背景
  }
}

/** 核心平铺算法：模拟 Base64 背景平铺 + 奇偶行交错 + 智能自适应颜色 */
function drawTileWatermark(ctx, width, height, config, luminance = 255) {
  const text = String(config.text ?? '').trim()
  if (!text) return

  // 1. 参数设定
  const fontSize = fontSizePx(config, width, height)
  const angle = -40
  const rad = (angle * Math.PI) / 180

  ctx.save()
  ctx.font = canvasFont(fontSize, config)

  // 动态测量文字宽度，避免重叠
  const { tw } = measureTextBox(ctx, text, fontSize)

  // 动态步长：文字宽 + 间距，高度固定间距
  // 根据 config.spacing 调整间距系数
  const spacingMap = {
    dense:  { x: 45,  y: 60 },
    medium: { x: 90,  y: 110 },
    sparse: { x: 160, y: 180 }
  }
  const s = spacingMap[config.spacing] || spacingMap.dense

  const stepX = tw + s.x
  const stepY = s.y

  // 智能自适应对比度：仅当设定为黑色 (#000000) 且背景太暗 (亮度 < 128) 时，才强制使用白色
  const isBlack = (config.color || '#000000').toLowerCase() === '#000000'
  const shouldBeWhite = isBlack && luminance < 128

  const finalColor = shouldBeWhite ? '#ffffff' : (config.color || '#000000')
  const finalOpacity = shouldBeWhite ? Math.min((config.opacity || 0.15) + 0.05, 0.8) : (config.opacity || 0.15)

  ctx.fillStyle = hexToRgba(finalColor, finalOpacity)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const diagLen = Math.sqrt(width * width + height * height)

  ctx.translate(width / 2, height / 2)
  ctx.rotate(rad)

  // 2. 平铺逻辑
  let row = 0
  for (let y = -diagLen; y < diagLen; y += stepY) {
    // 奇偶行交错（砌砖效果）
    const offsetX = (row % 2 === 0) ? 0 : (stepX / 2)

    for (let x = -diagLen; x < diagLen + stepX; x += stepX) {
      ctx.fillText(text, x - offsetX, y)
    }
    row++
  }

  ctx.restore()
}

function drawCenterWatermark(ctx, width, height, config, luminance = 255) {
  const text = String(config.text ?? '').trim()
  if (!text) return

  const actualFontSize = fontSizePx(config, width, height)
  ctx.save()
  ctx.font = canvasFont(actualFontSize, config)

  const isDark = luminance < 128
  const finalColor = isDark ? '#ffffff' : (config.color || '#000000')
  const finalOpacity = isDark ? Math.min((config.opacity || 0.15) + 0.05, 0.8) : (config.opacity || 0.15)

  ctx.fillStyle = hexToRgba(finalColor, finalOpacity)
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

  // 采样亮度
  const luminance = detectLuminance(img)

  ctx.drawImage(img, dx, dy, dw, dh)
  ctx.save()
  ctx.beginPath()
  ctx.rect(dx, dy, dw, dh)
  ctx.clip()
  ctx.translate(dx, dy)
  if (config.layout === 'tile') drawTileWatermark(ctx, dw, dh, config, luminance)
  else drawCenterWatermark(ctx, dw, dh, config, luminance)
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

      // 采样亮度
      const luminance = detectLuminance(img)

      ctx.drawImage(img, 0, 0)
      if (config.layout === 'tile') drawTileWatermark(ctx, canvas.width, canvas.height, config, luminance)
      else drawCenterWatermark(ctx, canvas.width, canvas.height, config, luminance)
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
