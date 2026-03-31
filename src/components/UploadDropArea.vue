<template>
  <div class="upload-drop-root">
    <button
      type="button"
      class="drop-area"
      :class="{ dragging: isDragging }"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="onDrop"
      @click="fileInput.click()"
    >
      <div class="drop-inner">
        <div class="drop-icon-wrap">
          <svg class="drop-icon" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
        </div>
        <p class="drop-title">将图片拖到这里</p>
        <p class="drop-sub">或 <span class="link">点击选择文件</span></p>
        <div class="drop-meta">
          <span>支持 JPG, PNG, WEBP</span>
          <span>最大 10MB/张</span>
        </div>
      </div>
    </button>
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
import { ref } from 'vue'

const MAX_BYTES = 10 * 1024 * 1024

const props = defineProps({
  images: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:images'])

const fileInput = ref(null)
const isDragging = ref(false)

function addFiles(fileList) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp']
  const valid = Array.from(fileList).filter(
    (f) => allowed.includes(f.type) && f.size <= MAX_BYTES
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
.upload-drop-root {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 12px;
  box-sizing: border-box;
  pointer-events: auto;
}

.file-input-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

/* 默认灰色虚线；hover / 拖拽时蓝色虚线 */
.drop-area {
  appearance: none;
  -webkit-appearance: none;
  flex: 1;
  min-height: 0;
  width: 100%;
  margin: 0;
  border: 2px dashed #d1d5dc;
  border-radius: clamp(14px, 2vw, 20px);
  cursor: pointer;
  background: rgba(249, 250, 251, 0.92);
  font-family: inherit;
  box-sizing: border-box;
  transition: border-color 0.2s, background 0.2s;
}
.drop-area:hover,
.drop-area.dragging {
  border-color: #007aff;
  background: rgba(239, 246, 255, 0.55);
}
.drop-area:focus-visible {
  outline: 2px solid #007aff;
  outline-offset: 2px;
}

.drop-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: clamp(20px, 4vw, 36px) clamp(16px, 3vw, 24px);
  min-height: 100%;
  box-sizing: border-box;
}

.drop-icon-wrap {
  width: clamp(64px, 12vw, 80px);
  height: clamp(64px, 12vw, 80px);
  border-radius: 16px;
  background: #eff6ff;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #3b82f6;
  margin-bottom: 6px;
  transition: background 0.2s, color 0.2s;
}
.drop-area:hover .drop-icon-wrap,
.drop-area.dragging .drop-icon-wrap {
  background: #dbeafe;
  color: #2563eb;
}

.drop-title {
  font-size: clamp(16px, 2.4vw, 18px);
  font-weight: 600;
  color: #101828;
  letter-spacing: -0.3px;
  line-height: 1.35;
  text-align: center;
  margin: 0;
}

.drop-sub {
  font-size: clamp(13px, 1.8vw, 15px);
  color: #6a7282;
  letter-spacing: -0.15px;
  line-height: 1.4;
  text-align: center;
  margin: 0;
}
.link {
  color: #007aff;
  font-weight: 400;
}

.drop-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 12px 16px;
  margin-top: 14px;
  padding: 8px 16px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.75);
  border: 1px solid rgba(229, 231, 235, 0.9);
  font-size: 12px;
  line-height: 1.35;
  color: #99a1af;
}
</style>
