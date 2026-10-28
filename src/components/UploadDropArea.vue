<template>
  <div class="upload-drop-root">
    <div
      class="drop-area"
      :class="{ dragging: isDragging }"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent.stop="onDrop"
      @click.self="fileInput.click()"
      role="group"
      aria-label="选择图片或将图片拖到这里"
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
        <p class="drop-sub">支持 JPG、PNG、WEBP，单张最大 10MB</p>
        <button type="button" class="choose-button" @click.stop="fileInput.click()">选择图片</button>
        <button type="button" class="sample-button" @click.stop="loadSample">先用示例体验一下 <span aria-hidden="true">→</span></button>
        <div class="drop-meta">
          <span>图片仅在本地处理</span>
        </div>
      </div>
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
import { ref } from 'vue'
import { classifyUploads } from '../utils/uploads.js'

const props = defineProps({
  images: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:images', 'reject-files'])

const fileInput = ref(null)
const isDragging = ref(false)

function addFiles(fileList) {
  const { valid, rejected } = classifyUploads(fileList, props.images)
  if (valid.length) emit('update:images', [...props.images, ...valid])
  if (rejected.length) emit('reject-files', rejected)
}

function onDrop(e) {
  isDragging.value = false
  addFiles(e.dataTransfer.files)
}

function onFileChange(e) {
  addFiles(e.target.files)
  e.target.value = ''
}

async function loadSample() {
  try {
    const response = await fetch('/sample-landscape.jpg')
    if (!response.ok) throw new Error('示例图片暂时无法加载')
    const blob = await response.blob()
    addFiles([new File([blob], '山野风景.jpg', { type: 'image/jpeg' })])
  } catch (error) {
    emit('reject-files', [{ name: '示例图片', reason: error.message || '加载失败' }])
  }
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
  padding: 14px;
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
  border: 1px dashed #c8cec3;
  border-radius: 17px;
  cursor: pointer;
  background: #f8f9f6;
  font-family: inherit;
  box-sizing: border-box;
  transition: border-color 0.2s, background 0.2s;
}
.drop-area:hover,
.drop-area.dragging {
  border-color: #718767;
  background: #f3f7ef;
}
.drop-area:focus-visible {
  outline: 2px solid #526d45;
  outline-offset: 2px;
}

.drop-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: clamp(16px, 4vw, 36px) clamp(16px, 3vw, 24px);
  min-height: 100%;
  box-sizing: border-box;
}

.drop-icon-wrap {
  width: 58px;
  height: 58px;
  border-radius: 16px;
  background: #e4f5df;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #476f3e;
  margin-bottom: 2px;
  transition: background 0.2s, color 0.2s;
}
.drop-area:hover .drop-icon-wrap,
.drop-area.dragging .drop-icon-wrap {
  background: #d1ffca;
  color: #365a2d;
}

.drop-title {
  font-size: clamp(16px, 2.4vw, 19px);
  font-weight: 600;
  color: #20251f;
  letter-spacing: -0.3px;
  line-height: 1.35;
  text-align: center;
  margin: 0;
}

.drop-sub {
  font-size: 12px;
  color: #70766d;
  letter-spacing: -0.15px;
  line-height: 1.4;
  text-align: center;
  margin: 0;
}
.choose-button { border: 0; border-radius: 9px; background: #d1ffca; color: #25351f; padding: 11px 24px; margin-top: 5px; font-size: 13px; font-weight: 650; cursor: pointer; transition: background .15s, transform .15s; }
.choose-button:hover { background: #baf5af; transform: translateY(-1px); }
.sample-button { border: 0; padding: 4px 8px; background: transparent; color: #536a49; font-size: 11px; cursor: pointer; }
.sample-button:hover { color: #273c21; text-decoration: underline; text-underline-offset: 3px; }

.drop-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 12px 16px;
  margin-top: 2px;
  padding: 6px 11px;
  border-radius: 999px;
  background: #eef1eb;
  border: 0;
  font-size: 10px;
  line-height: 1.35;
  color: #747b70;
}
</style>
