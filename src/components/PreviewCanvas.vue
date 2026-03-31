<template>
  <div class="preview-card">
    <div ref="boxEl" class="canvas-shell">
      <span v-if="images.length > 1" class="nav-pill" aria-live="polite">{{ activeIndex + 1 }} / {{ images.length }}</span>
      <canvas ref="canvasEl" class="preview-canvas" />
      <UploadDropArea
        v-if="!images.length"
        :images="images"
        @update:images="emit('update:images', $event)"
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
import { renderPreview, renderPreviewFromImg } from '../utils/watermark.js'
import UploadDropArea from './UploadDropArea.vue'

const props = defineProps({
  images:      { type: Array,  default: () => [] },
  config:      { type: Object, required: true },
  activeIndex: { type: Number, default: 0 },
})
const emit = defineEmits(['update:activeIndex', 'update:images'])

const canvasEl = ref(null)
const boxEl    = ref(null)

const imgCache = ref(null)
let   lastFile = null

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
  if (!props.images.length) {
    const ctx = canvasEl.value.getContext('2d')
    ctx.clearRect(0, 0, canvasEl.value.width, canvasEl.value.height)
    return
  }
  if (imgCache.value) {
    renderPreviewFromImg(canvasEl.value, imgCache.value, props.config)
  }
}

function loadAndDraw() {
  initCanvas()
  if (!props.images.length) { redraw(); return }
  const file = props.images[props.activeIndex]
  if (!file) return
  if (file === lastFile && imgCache.value) {
    renderPreviewFromImg(canvasEl.value, imgCache.value, props.config)
    return
  }
  lastFile = file
  imgCache.value = null
  renderPreview(canvasEl.value, file, props.config, (img) => {
    imgCache.value = img
  })
}

watch(() => props.config, () => {
  if (imgCache.value) renderPreviewFromImg(canvasEl.value, imgCache.value, props.config)
}, { deep: true })

watch(() => props.activeIndex, () => {
  imgCache.value = null
  lastFile = null
  loadAndDraw()
})

watch(() => props.images, (newList) => {
  if (newList.length === 0) { imgCache.value = null; lastFile = null; redraw(); return }
  if (newList[props.activeIndex] === lastFile && imgCache.value) {
    renderPreviewFromImg(canvasEl.value, imgCache.value, props.config)
  } else {
    loadAndDraw()
  }
}, { deep: false })

function prev() {
  if (props.activeIndex > 0) emit('update:activeIndex', props.activeIndex - 1)
}
function next() {
  if (props.activeIndex < props.images.length - 1) emit('update:activeIndex', props.activeIndex + 1)
}

function onKeyDown(e) {
  if (!props.images.length) return
  if (e.key === 'ArrowLeft')  prev()
  if (e.key === 'ArrowRight') next()
}

let resizeObs = null
onMounted(() => {
  nextTick(loadAndDraw)
  window.addEventListener('keydown', onKeyDown)
})
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
  border-radius: 16px;
  border: 1px solid rgba(229, 231, 235, 0.8);
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px -1px rgba(0, 0, 0, 0.1);
  overflow: hidden;
}

.nav-pill {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 8px;
  background: rgba(243, 244, 246, 0.92);
  border: 1px solid rgba(229, 231, 235, 0.9);
  font-size: 12px;
  font-weight: 500;
  color: #6a7282;
  letter-spacing: 0.3px;
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}

.canvas-shell {
  position: relative;
  flex: 1;
  min-height: 0;
  width: 100%;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  overflow: hidden;
}

.preview-canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.nav-overlay {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 36px;
  height: 56px;
  border: none;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.28);
  color: #fff;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s, opacity 0.15s;
  font-family: inherit;
  z-index: 2;
}
.nav-overlay:hover:not(:disabled) { background: rgba(0, 0, 0, 0.5); }
.nav-overlay:disabled { opacity: 0.2; cursor: not-allowed; }
.nav-prev { left: 8px; }
.nav-next { right: 8px; }
</style>
