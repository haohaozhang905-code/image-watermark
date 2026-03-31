<template>
  <div class="upload-zone">
    <div
      class="thumb-zone"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="onDrop"
    >
      <div class="thumb-strip-card">
        <div class="thumb-strip-row">
          <div class="thumb-strip-scroll">
            <button
              v-for="(file, idx) in images"
              :key="file.name + idx"
              type="button"
              class="thumb-tile"
              :class="{ active: idx === activeIndex, done: processedBlobs[idx] }"
              @click="emit('select-image', idx)"
            >
              <img :src="thumbUrls[idx]" :alt="file.name" class="thumb-img" />
              <div class="thumb-actions">
                <button type="button" class="btn-rm" @click.stop="removeImage(idx)">✕</button>
                <a
                  v-if="processedBlobs[idx]"
                  class="btn-dl"
                  :href="getBlobUrl(idx)"
                  :download="dlName(file.name)"
                  @click.stop
                >↓</a>
              </div>
              <span v-if="processedBlobs[idx]" class="thumb-done-dot" aria-hidden="true" />
            </button>
            <button type="button" class="thumb-add" @click="fileInput.click()">
              <svg class="thumb-add-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12h14" stroke-linecap="round" />
              </svg>
              <span class="thumb-add-label">添加</span>
            </button>
          </div>
          <button type="button" class="btn-clear-text" @click="emit('update:images', [])">清空</button>
        </div>
      </div>
      <div
        class="drop-overlay"
        :class="{ visible: isDragging }"
        @dragover.prevent
        @dragleave.prevent="isDragging = false"
        @drop.prevent="onDrop"
      >松开鼠标添加图片</div>
    </div>

    <input
      ref="fileInput"
      type="file"
      accept="image/jpeg,image/png,image/webp"
      multiple
      class="file-input-hidden"
      @change="onFileChange"
    />
  </div>
</template>

<script setup>
import { ref, watch, onUnmounted } from 'vue'

const MAX_BYTES = 10 * 1024 * 1024

const props = defineProps({
  images:         { type: Array, default: () => [] },
  processedBlobs: { type: Array, default: () => [] },
  activeIndex:    { type: Number, default: 0 },
})
const emit = defineEmits(['update:images', 'select-image'])

const fileInput  = ref(null)
const isDragging = ref(false)
const thumbUrls  = ref([])

watch(
  () => props.images,
  (files) => {
    thumbUrls.value.forEach(u => URL.revokeObjectURL(u))
    thumbUrls.value = files.map(f => URL.createObjectURL(f))
  },
  { immediate: true, deep: true }
)

onUnmounted(() => thumbUrls.value.forEach(u => URL.revokeObjectURL(u)))

const blobCache = {}
function getBlobUrl(idx) {
  const blob = props.processedBlobs[idx]
  if (!blob) return null
  if (!blobCache[idx]) blobCache[idx] = URL.createObjectURL(blob)
  return blobCache[idx]
}

function removeImage(idx) {
  emit('update:images', props.images.filter((_, i) => i !== idx))
}

function dlName(name) {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? name + '_watermarked' : name.slice(0, dot) + '_watermarked' + name.slice(dot)
}

function addFiles(fileList) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp']
  const valid = Array.from(fileList).filter(
    f => allowed.includes(f.type) && f.size <= MAX_BYTES
  )
  emit('update:images', [...props.images, ...valid].slice(0, 100))
}

function onDrop(e) {
  isDragging.value = false
  addFiles(e.dataTransfer.files)
}

function onFileChange(e) {
  addFiles(e.target.files)
  e.target.value = ''
}
</script>

<style scoped>
.upload-zone {
  --thumb: clamp(44px, 8vw, 54px);
  position: relative;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  min-height: 0;
}

.file-input-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.thumb-zone {
  position: relative;
  flex-shrink: 0;
}

/* —— 缩略图条：紧凑容器；清空与缩略图同一行，不单独占顶栏 —— */
.thumb-strip-card {
  border-radius: 8px;
  border: 1px solid rgba(229, 231, 235, 0.65);
  background: rgba(255, 255, 255, 0.85);
  box-shadow: none;
  padding: 4px 6px;
  box-sizing: border-box;
}

.thumb-strip-row {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  min-height: 0;
}

.btn-clear-text {
  flex-shrink: 0;
  border: none;
  background: none;
  font-size: 12px;
  font-weight: 500;
  color: #6a7282;
  cursor: pointer;
  font-family: inherit;
  padding: 4px 6px;
  border-radius: 6px;
  line-height: 1.2;
  align-self: center;
}
.btn-clear-text:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.08);
}

.thumb-strip-scroll {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  align-content: center;
  gap: 6px;
  overflow: visible;
}

.thumb-tile {
  position: relative;
  flex-shrink: 0;
  width: var(--thumb);
  height: var(--thumb);
  box-sizing: border-box;
  padding: 2px;
  border-radius: 10px;
  border: 2px solid transparent;
  background: transparent;
  cursor: pointer;
  overflow: hidden;
  opacity: 0.6;
  transition: opacity 0.15s, box-shadow 0.15s, border-color 0.15s;
}
.thumb-tile:hover {
  opacity: 0.85;
}
.thumb-tile.active {
  opacity: 1;
  border-color: #2b7fff;
  box-shadow: 0 0 0 2px rgba(43, 127, 255, 0.2);
}
.thumb-actions {
  position: absolute;
  top: 4px;
  right: 4px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
  z-index: 1;
}
.thumb-tile:hover .thumb-actions { opacity: 1; }
.btn-rm,
.btn-dl {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: none;
  font-size: 10px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  font-weight: 700;
  line-height: 1;
}
.btn-rm { background: rgba(0, 0, 0, 0.5); color: #fff; }
.btn-rm:hover { background: #ef4444; }
.btn-dl { background: rgba(0, 122, 255, 0.92); color: #fff; font-size: 12px; }
.btn-dl:hover { background: #007aff; }

.thumb-img {
  display: block;
  width: 100%;
  height: calc(var(--thumb) - 4px);
  object-fit: cover;
  border-radius: 8px;
}
.thumb-done-dot {
  position: absolute;
  bottom: 4px;
  right: 4px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #10b981;
  border: 2px solid #fff;
}

.thumb-add {
  flex-shrink: 0;
  width: var(--thumb);
  height: var(--thumb);
  box-sizing: border-box;
  padding: 2px;
  border-radius: 10px;
  border: 2px dashed #d1d5dc;
  background: rgba(249, 250, 251, 0.5);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  cursor: pointer;
  color: #6a7282;
  font-family: inherit;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.thumb-add-icon {
  width: 40%;
  height: 40%;
  max-width: 22px;
  max-height: 22px;
}
.thumb-add:hover {
  border-color: #007aff;
  color: #007aff;
  background: rgba(239, 246, 255, 0.45);
}
.thumb-add-label {
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.02px;
  line-height: 1;
}

.drop-overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  border-radius: 12px;
  border: 2px dashed #007aff;
  background: rgba(0, 122, 255, 0.07);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 600;
  color: #007aff;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s;
}
.drop-overlay.visible {
  opacity: 1;
  pointer-events: all;
}
</style>
