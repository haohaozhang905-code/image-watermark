<template>
  <div class="app">
    <header class="app-header">
      <div class="header-inner">
        <div class="header-brand">
          <div class="header-logo">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
              <rect x="3" y="3" width="18" height="18" rx="2.5" />
              <circle cx="8.5" cy="9.5" r="1.5" />
              <path d="M21 15l-5-5L5 21" />
            </svg>
          </div>
          <span class="header-title">图片水印</span>
        </div>
        <span class="header-sep" />
        <span class="header-badge">
          <svg width="14" height="14" viewBox="0 0 12 12" fill="none" class="header-badge-icon">
            <path d="M2 6l3 3 5-5" stroke="#007a55" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          本地处理 · 不上传
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

      <!-- 右：仅「实时预览」卡片（顶栏+画布）与缩略图条分离；无图时底部占位与有图时缩略条同高，画布区尺寸一致 -->
      <div class="content content--work">
        <PreviewCanvas
          class="work-preview"
          :images="images"
          :config="config"
          :active-index="activeIndex"
          @update:active-index="activeIndex = $event"
          @update:images="onImagesUpdate"
        />
        <UploadZone
          v-if="images.length"
          class="work-thumbs"
          :images="images"
          :processed-blobs="processedBlobs"
          :active-index="activeIndex"
          @update:images="onImagesUpdate"
          @select-image="activeIndex = $event"
        />
        <div
          v-else
          class="work-thumbs work-thumbs--reserve"
          aria-hidden="true"
        />
      </div>
    </main>

    <Transition name="toast">
      <div v-if="toast.show" class="toast" :class="toast.type">{{ toast.msg }}</div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, reactive } from 'vue'
import JSZip from 'jszip'
import { saveAs } from 'file-saver'
import ConfigPanel   from './components/ConfigPanel.vue'
import PreviewCanvas from './components/PreviewCanvas.vue'
import UploadZone    from './components/UploadZone.vue'
import { applyWatermark } from './utils/watermark.js'

const images         = ref([])
const processedBlobs = ref([])
const activeIndex    = ref(0)

const config = ref({
  text:        '内部资料 · 禁止外传',
  fontSize:    3.5,
  fontWeight:  550,
  color:       '#000000',
  opacity:     0.3,
  layout:      'tile',
  rotation:    -45,
  spacing:     'dense',
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
  if (!processedBlobs.value.some(Boolean)) return
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
  background: #f9fafb;
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
}

/* Header */
.app-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(255,255,255,0.78);
  backdrop-filter: saturate(180%) blur(20px);
  -webkit-backdrop-filter: saturate(180%) blur(20px);
  border-bottom: 1px solid #e5e7eb;
  height: 56px;
  display: flex;
  align-items: center;
  padding: 0 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06);
}
.header-inner { display: flex; align-items: center; gap: 16px; }
.header-brand { display: flex; align-items: center; gap: 8px; }
.header-logo {
  width: 32px; height: 32px;
  background: #007aff;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
  box-shadow: inset 0 2px 4px rgba(20, 71, 230, 0.5);
}
.header-title {
  font-size: 15px;
  font-weight: 600;
  color: #101828;
  letter-spacing: -0.45px;
}
.header-badge {
  font-size: 12px;
  font-weight: 500;
  color: #007a55;
  background: #ecfdf5;
  border: 1px solid rgba(164, 244, 207, 0.6);
  border-radius: 999px;
  height: 26px;
  padding: 0 12px 0 30px;
  position: relative;
  display: inline-flex;
  align-items: center;
}
.header-badge-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  flex-shrink: 0;
}

/* Layout */
.app-main {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: stretch;
  max-width: min(1280px, 100%);
  width: 100%;
  margin: 0 auto;
  overflow: hidden;
  box-sizing: border-box;
}

.sidebar {
  width: min(288px, 34vw);
  min-width: 240px;
  flex-shrink: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: clamp(10px, 1.5vw, 20px);
  background-color: #f0f2f5;
  background-image:
    radial-gradient(ellipse 100% 80% at 50% 45%, rgba(229, 231, 235, 0.4) 0%, transparent 58%),
    linear-gradient(90deg, #f0f2f5 0%, #f0f2f5 100%);
}

/* 预览在上、有图时缩略图条在底；极矮屏或多张换行时由整列滚动 */
.content--work {
  gap: clamp(8px, 1.2vw, 12px);
  overflow-y: auto;
  overscroll-behavior: contain;
}
.content--work .work-preview {
  flex: 1;
  min-height: 0;
}
.content--work .work-thumbs {
  flex-shrink: 0;
  position: sticky;
  bottom: 0;
  z-index: 2;
  background: #f0f2f5;
  padding-top: 2px;
  margin-top: auto;
}

/* 与缩略图条单行高度对齐，避免无图时预览卡片过高导致画布区域与有图时不一致 */
.content--work .work-thumbs--reserve {
  flex-shrink: 0;
  position: sticky;
  bottom: 0;
  margin-top: auto;
  padding-top: 2px;
  min-height: 66px;
  box-sizing: border-box;
  visibility: hidden;
  pointer-events: none;
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
