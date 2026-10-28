const MAX_BYTES = 10 * 1024 * 1024
const MAX_FILES = 100
const MAX_TOTAL_BYTES = 100 * 1024 * 1024
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export function classifyUploads(fileList, currentFiles) {
  const valid = []
  const rejected = []
  let totalBytes = currentFiles.reduce((sum, file) => sum + file.size, 0)
  for (const file of Array.from(fileList)) {
    let reason = ''
    if (!ALLOWED_TYPES.has(file.type)) reason = '格式不支持'
    else if (file.size > MAX_BYTES) reason = '超过 10 MB 限制'
    else if (currentFiles.length + valid.length >= MAX_FILES) reason = '一次最多处理 100 张'
    else if (totalBytes + file.size > MAX_TOTAL_BYTES) reason = '图片总大小不能超过 100 MB'
    if (reason) rejected.push({ name: file.name, reason })
    else { valid.push(file); totalBytes += file.size }
  }
  return { valid, rejected }
}
