<template>
  <div class="preview-card">
    <div ref="boxEl" class="canvas-shell">
      <div class="watermark-guard" aria-hidden="true"></div>
      <span v-if="images.length > 1" class="nav-pill" aria-live="polite">{{ activeIndex + 1 }} / {{ images.length }}</span>
      <canvas ref="canvasEl" class="preview-canvas" />
      <UploadDropArea
        v-if="!images.length"
        :images="images"
        @update:images="emit('update:images', $event)"
        @reject-files="emit('reject-files', $event)"
      />
      <button
        v-if="images.length > 1"
        type="button"
        class="nav-overlay nav-prev"
        :disabled="activeIndex === 0"
        aria-label="上一张"
        @click="prev"
      >&#8249;</button>
      <button
        v-if="images.length > 1"
        type="button"
        class="nav-overlay nav-next"
        :disabled="activeIndex === images.length - 1"
        aria-label="下一张"
        @click="next"
      >&#8250;</button>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted, nextTick, watchEffect } from 'vue'
import { assertImagePixels, loadImage, renderPreviewFromImg } from '../utils/watermark.js'
import UploadDropArea from './UploadDropArea.vue'

const props = defineProps({
  images:      { type: Array,  default: () => [] },
  config:      { type: Object, required: true },
  activeIndex: { type: Number, default: 0 },
})
const emit = defineEmits(['update:activeIndex', 'update:images', 'reject-files', 'image-error'])

const canvasEl = ref(null)
const boxEl    = ref(null)

const imgCache = ref(null)
let   lastFile = null
let   loadVersion = 0

function initCanvas() {
  const canvas = canvasEl.value
  const box    = boxEl.value
  if (!canvas || !box) return
  const dpr = window.devicePixelRatio || 1
  const w   = Math.max(1, Math.floor(box.clientWidth))
  const h   = Math.max(1, Math.floor(box.clientHeight))
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width        = w * dpr
    canvas.height       = h * dpr
    canvas.style.width  = w + 'px'
    canvas.style.height = h + 'px'
  }
}

function redraw() {
  if (!canvasEl.value) return
  if (!imgCache.value) {
    const ctx = canvasEl.value.getContext('2d')
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.clearRect(0, 0, canvasEl.value.width, canvasEl.value.height)
    return
  }
  if (imgCache.value) {
    renderPreviewFromImg(canvasEl.value, imgCache.value, props.config)
  }
}

function loadAndDraw() {
  initCanvas()
  const file = props.images[props.activeIndex]
  if (!file) {
    loadVersion++
    lastFile = null
    imgCache.value = null
    redraw()
    return
  }
  if (file === lastFile) {
    redraw()
    return
  }
  lastFile = file
  const version = ++loadVersion
  imgCache.value = null
  redraw()
  loadImage(file).then((img) => {
    if (version !== loadVersion || file !== props.images[props.activeIndex]) return
    assertImagePixels(img)
    imgCache.value = img
    redraw()
  }).catch((error) => {
    if (version !== loadVersion) return
    imgCache.value = null
    redraw()
    emit('image-error', { name: file.name, message: error.message || '无法读取图片' })
  })
}

watch(() => props.config, () => {
  if (imgCache.value) renderPreviewFromImg(canvasEl.value, imgCache.value, props.config)
}, { deep: true })

// Observe both selection and the list itself. This also refreshes the canvas
// when the selected file is replaced while its index stays the same.
watch(() => [props.activeIndex, props.images], loadAndDraw)

function prev() {
  if (props.activeIndex > 0) emit('update:activeIndex', props.activeIndex - 1)
}
function next() {
  if (props.activeIndex < props.images.length - 1) emit('update:activeIndex', props.activeIndex + 1)
}

function onKeyDown(e) {
  if (!props.images.length) return
  const target = e.target
  if (target instanceof HTMLElement && (
    target.isContentEditable ||
    target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')
  )) return
  if (e.key === 'ArrowLeft' && props.activeIndex > 0) {
    e.preventDefault()
    prev()
  }
  if (e.key === 'ArrowRight' && props.activeIndex < props.images.length - 1) {
    e.preventDefault()
    next()
  }
}

let resizeObs = null
onMounted(() => {
  nextTick(loadAndDraw)
  window.addEventListener('keydown', onKeyDown)

  // 安全防护：监听水印相关节点
  setupSecurityGuard()
})

function setupSecurityGuard() {
  const target = boxEl.value
  if (!target) return

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      // 如果子节点被删，或者属性被改（比如 display: none）
      if (mutation.type === 'childList' || mutation.type === 'attributes') {
        const guard = target.querySelector('.watermark-guard')
        const canvas = canvasEl.value
        if (!guard || !canvas || canvas.style.display === 'none' || canvas.style.opacity < 0.5) {
          // 暴力恢复状态
          if (canvas) {
            canvas.style.display = 'block'
            canvas.style.opacity = '1'
          }
          loadAndDraw() // 重新渲染
        }
      }
    })
  })

  observer.observe(target, {
    attributes: true,
    childList: true,
    subtree: true,
    attributeFilter: ['style', 'class']
  })
}

watchEffect((onCleanup) => {
  const el = boxEl.value
  if (!el) return
  resizeObs = new ResizeObserver(() => {
    nextTick(loadAndDraw)
  })
  resizeObs.observe(el)
  onCleanup(() => {
    resizeObs?.disconnect()
    resizeObs = null
  })
})
onUnmounted(() => {
  loadVersion++
  resizeObs?.disconnect()
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<style scoped>
.preview-card {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 0 14px 10px;
  border-radius: 0;
  border: 0;
  background: #fff;
  overflow: hidden;
}

.nav-pill {
  position: absolute;
  top: 12px;
  right: 24px;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 9px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(215, 220, 211, 0.9);
  font-size: 11px;
  font-weight: 500;
  color: #626a5d;
  letter-spacing: 0.3px;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}

.canvas-shell {
  position: relative;
  flex: 1;
  min-height: 0;
  width: 100%;
  border-radius: 13px;
  background: #e8e9e6;
  box-shadow: inset 0 0 0 1px #e0e2dc;
  overflow: hidden;
}

.preview-canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.watermark-guard {
  position: absolute;
  inset: 0;
  z-index: 5;
  pointer-events: none;
}

.nav-overlay {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 38px;
  height: 38px;
  border: 1px solid rgba(218, 222, 213, .9);
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.94);
  color: #263022;
  font-size: 26px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, opacity 0.15s, box-shadow .15s;
  box-shadow: 0 3px 12px rgba(22, 28, 20, .12);
  font-family: inherit;
  z-index: 2;
}
.nav-overlay:hover:not(:disabled) { background: #d1ffca; box-shadow: 0 4px 14px rgba(22, 28, 20, .18); }
.nav-overlay:disabled { opacity: 0; pointer-events: none; }
.nav-prev { left: 12px; }
.nav-next { right: 12px; }
@media (max-width: 700px) {
  .preview-card { padding: 0 8px 8px; }
  .canvas-shell { border-radius: 10px; }
  .nav-prev { left: 8px; }
  .nav-next { right: 8px; }
}
</style>
