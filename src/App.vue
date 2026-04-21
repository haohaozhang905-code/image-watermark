<template>
  <div class="app">
    <header class="app-header">
      <div class="header-inner">
        <div class="header-brand">
          <div class="header-logo">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <span class="header-title">隐私水印</span>
          <span class="header-v2-tag">V2</span>
        </div>
        <span class="header-sep" />
        <span class="header-badge">
          <span class="badge-icon">✨</span>
          本地智能处理
        </span>
      </div>
    </header>

    <main class="app-main">
      <!-- 左：配置面板 -->
      <aside class="sidebar">
        <ConfigPanel
          :config="config"
          :has-images="images.length > 0"
          :image-count="images.length"
          :processing="processing"
          :progress="progress"
          :processed-count="processedBlobs.filter(Boolean).length"
          @update:config="config = $event"
          @process="startProcess"
          @download-zip="downloadZip"
        />
      </aside>

      <!-- 右：主操作区 -->
      <div class="content">
        <PreviewCanvas
          class="work-preview"
          :images="images"
          :config="config"
          :active-index="activeIndex"
          @update:active-index="activeIndex = $event"
          @update:images="onImagesUpdate"
        />

        <div v-if="images.length" class="bottom-controls">
          <UploadZone
            class="work-thumbs"
            :images="images"
            :processed-blobs="processedBlobs"
            :active-index="activeIndex"
            @update:images="onImagesUpdate"
            @select-image="activeIndex = $event"
          />
          <div class="export-actions">
            <button
              type="button"
              class="btn-export"
              :disabled="!processedBlobs.some(Boolean) || processing"
              @click="downloadZip"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              导出ZIP结果
            </button>
          </div>
        </div>
      </div>
    </main>

    <Transition name="toast">
      <div v-if="toast.show" class="toast" :class="toast.type">{{ toast.msg }}</div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, reactive, computed } from 'vue'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import ConfigPanel   from './components/ConfigPanel.vue'
import PreviewCanvas from './components/PreviewCanvas.vue'
import UploadZone    from './components/UploadZone.vue'
import { applyWatermark } from './utils/watermark.js'
import { SCENES } from './utils/scenes.js'

const images         = ref([])
const processedBlobs = ref([])
const activeIndex    = ref(0)

const config = ref({
  text:        '仅用于入职背景调查，他用无效',
  fontSize:    4,
  fontWeight:  400,
  color:       '#000000',
  opacity:     0.3,
  layout:      'tile',
  rotation:    -30,
  spacing:     'dense',
})

const currentSceneName = computed(() => {
  const matched = SCENES.find(s => s.config && s.config.text === config.value.text)
  return matched ? matched.title : '自定义'
})

const processing = ref(false)
const progress   = reactive({ current: 0, total: 0 })
const toast      = reactive({ show: false, msg: '', type: 'info' })

function onImagesUpdate(list) {
  images.value         = list
  processedBlobs.value = new Array(list.length).fill(null)
  activeIndex.value    = 0
}

async function startProcess() {
  if (!images.value.length || processing.value) return
  processing.value     = true
  progress.current     = 0
  progress.total       = images.value.length
  processedBlobs.value = new Array(images.value.length).fill(null)

  for (let i = 0; i < images.value.length; i++) {
    try {
      processedBlobs.value[i] = await applyWatermark(images.value[i], config.value)
    } catch (e) {
      console.error('处理失败:', images.value[i].name, e)
    }
    progress.current = i + 1
  }

  processing.value = false
  showToast(`处理完成，共 ${progress.total} 张`, 'success')
}

async function downloadZip() {
  if (!images.value.length) return

  // 如果还没处理过，或者中途改了配置，先执行一遍处理逻辑
  if (!processedBlobs.value.some(Boolean) || processing.value) {
    await startProcess()
  }

  showToast('正在打包…', 'info')
  const zip = new JSZip()
  processedBlobs.value.forEach((blob, i) => {
    if (!blob) return
    const n   = images.value[i].name
    const dot = n.lastIndexOf('.')
    zip.file(
      dot === -1 ? n + '_watermarked' : n.slice(0, dot) + '_watermarked' + n.slice(dot),
      blob
    )
  })
  const zipBlob = await zip.generateAsync({ type: 'blob' })
  saveAs(zipBlob, `watermarked_${Date.now()}.zip`)
  showToast('ZIP 下载成功', 'success')
}

let toastTimer = null
function showToast(msg, type = 'info') {
  clearTimeout(toastTimer)
  Object.assign(toast, { show: true, msg, type })
  toastTimer = setTimeout(() => { toast.show = false }, 3000)
}
</script>

<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  height: 100%;
  height: 100dvh;
  overflow: hidden;
}
body {
  font-family: Inter, 'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif;
  background: #f4f6f8;
  color: #101828;
  -webkit-font-smoothing: antialiased;
}

.app {
  height: 100vh;
  height: 100dvh;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #f4f6f8;
}

/* Header */
.app-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  height: 60px;
  display: flex;
  align-items: center;
  padding: 0 24px;
}
.header-inner { display: flex; align-items: center; gap: 16px; width: 100%; }
.header-brand { display: flex; align-items: center; gap: 10px; }
.header-logo {
  width: 32px; height: 32px;
  background: #2563eb;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
}
.header-title {
  font-size: 18px;
  font-weight: 700;
  color: #101828;
  letter-spacing: -0.5px;
}
.header-v2-tag {
  font-size: 11px;
  font-weight: 700;
  color: #2563eb;
  background: #eff6ff;
  padding: 1px 6px;
  border-radius: 4px;
  margin-left: 4px;
}
.header-badge {
  font-size: 13px;
  font-weight: 600;
  color: #059669;
  background: #ecfdf5;
  border: 1px solid #d1fae5;
  border-radius: 999px;
  padding: 4px 12px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.badge-icon {
  font-size: 14px;
}

/* Layout */
.app-main {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: stretch;
  width: 100%;
  max-width: 100%;
  margin: 0;
  overflow: hidden;
}

.sidebar {
  width: 320px;
  flex-shrink: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
  border-right: 1px solid #e5e7eb;
}

.content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 24px;
  background: #f4f6f8;
  gap: 12px;
}

.work-preview {
  flex: 1;
  min-height: 0;
}

/* 底部操作区 */
.bottom-controls {
  display: flex;
  align-items: flex-end;
  gap: 16px;
  flex-shrink: 0;
}

.work-thumbs {
  flex: 1;
  min-width: 0;
}

.export-actions {
  flex-shrink: 0;
  padding-bottom: 4px; /* 对齐缩略图卡片底部 */
}

.btn-export {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 48px;
  padding: 0 24px;
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 12px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);
}

.btn-export:hover:not(:disabled) {
  background: #1d4ed8;
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(37, 99, 235, 0.3);
}

.btn-export:disabled {
  background: #9ca3af;
  cursor: not-allowed;
  box-shadow: none;
}

.header-sep {
  width: 1px;
  height: 16px;
  background: #d1d5dc;
  flex-shrink: 0;
}

/* Toast */
.toast {
  position: fixed;
  top: 28px;
  left: 50%;
  transform: translateX(-50%);
  padding: 11px 22px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  z-index: 9999;
  box-shadow: 0 4px 20px rgba(0,0,0,0.15);
  white-space: nowrap;
}
.toast.success { background: #34c759; color: #fff; }
.toast.info    { background: #007AFF; color: #fff; }
.toast.error   { background: #ff3b30; color: #fff; }

.toast-enter-active, .toast-leave-active { transition: opacity 0.25s, transform 0.25s; }
.toast-enter-from { opacity: 0; transform: translateX(-50%) translateY(-10px); }
.toast-leave-to   { opacity: 0; transform: translateX(-50%) translateY(-10px); }
</style>
