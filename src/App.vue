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
        <span class="header-badge"><span class="badge-icon">✨</span>本地智能处理</span>
        <button type="button" class="btn-config-toggle" @click="sidebarOpen = !sidebarOpen">
          {{ sidebarOpen ? '收起配置 ▲' : '展开配置 ▼' }}
        </button>
      </div>
    </header>

    <main class="app-main">
      <!-- 左：配置面板 -->
      <aside class="sidebar" :class="{ 'sidebar-mobile-open': sidebarOpen, 'sidebar-mobile-hidden': isMobile && !sidebarOpen }">
        <ConfigPanel
          :config="config"
          :processing="processing"
          @update:config="onConfigUpdate"
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
          @reject-files="onFilesRejected"
          @image-error="onPreviewImageError"
        />

        <div v-if="images.length" class="bottom-controls">
          <UploadZone
            class="work-thumbs"
            :images="images"
            :processed-blobs="processedBlobs"
            :active-index="activeIndex"
            :processing="processing"
            @update:images="onImagesUpdate"
            @select-image="activeIndex = $event"
            @reject-files="onFilesRejected"
          />
          <div class="export-actions">
            <button
              type="button"
              class="btn-export"
              :disabled="!images.length || processing"
              @click="downloadZip"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              {{ processing ? (progress.phase === 'packing' ? '正在打包…' : `正在处理 ${progress.current}/${progress.total}`) : '导出ZIP结果' }}
            </button>
            <div v-if="exportResult" class="export-status" role="status">
              <p>{{ exportResult.message }}</p>
              <p v-for="(failure, index) in exportResult.failures" :key="index">
                {{ failure.name }}：{{ failure.message }}
              </p>
            </div>
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
import { ref, reactive, onMounted, onUnmounted } from 'vue'
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

// 移动端侧边栏折叠状态
const isMobile    = ref(false)
const sidebarOpen = ref(false)

function checkMobile() {
  isMobile.value = window.innerWidth < 768
}
onMounted(() => { checkMobile(); window.addEventListener('resize', checkMobile) })
onUnmounted(() => window.removeEventListener('resize', checkMobile))

const config = ref({ ...SCENES[0].config })

const processing = ref(false)
const progress   = reactive({ current: 0, total: 0, phase: 'processing' })
const toast      = reactive({ show: false, msg: '', type: 'info' })
const exportResult = ref(null)

function onConfigUpdate(value) {
  if (processing.value) return
  config.value = value
  processedBlobs.value = []
  exportResult.value = null
}

function onImagesUpdate(list) {
  if (processing.value) return
  images.value         = list
  processedBlobs.value = new Array(list.length).fill(null)
  activeIndex.value    = 0
  exportResult.value   = null
}

function onFilesRejected(files) {
  if (!files.length) return
  const names = files.slice(0, 3).map(file => `${file.name}（${file.reason}）`).join('；')
  showToast(`未添加 ${files.length} 张${names ? `：${names}` : ''}${files.length > 3 ? '；其余文件有相同限制' : ''}`, 'error')
}

function onPreviewImageError(error) {
  showToast(`${error.name}：${error.message}`, 'error')
}

function uniqueOutputName(name, usedNames) {
  const dot = name.lastIndexOf('.')
  const base = dot > 0 ? name.slice(0, dot) : name
  const ext = dot > 0 ? name.slice(dot) : ''
  let outputName = `${base}_watermarked${ext}`
  let suffix = 2
  while (usedNames.has(outputName.toLowerCase())) {
    outputName = `${base}_watermarked_${suffix++}${ext}`
  }
  usedNames.add(outputName.toLowerCase())
  return outputName
}

async function downloadZip() {
  if (!images.value.length || processing.value) return
  if (!String(config.value.text || '').trim()) {
    const message = '请先填写水印文字，再导出图片'
    exportResult.value = { message, failures: [] }
    showToast(message, 'error')
    return
  }
  processing.value = true
  // 固定本次任务的图片身份与配置；每次导出重新生成，不复用旧配置的 Blob。
  const files = [...images.value]
  const taskConfig = { ...config.value }
  const results = []
  const failures = []
  processedBlobs.value = []
  exportResult.value = null
  Object.assign(progress, { current: 0, total: files.length, phase: 'processing' })

  try {
    for (const file of files) {
      try {
        const blob = await applyWatermark(file, taskConfig)
        results.push({ file, blob })
      } catch (error) {
        failures.push({ name: file.name, message: error.message || '图片处理失败' })
      }
      progress.current++
    }

    if (!results.length) {
      const message = `导出失败：成功 0 张，失败 ${failures.length} 张`
      exportResult.value = { message, failures }
      showToast(message, 'error')
      return
    }

    progress.phase = 'packing'
    const zip = new JSZip()
    const usedNames = new Set()
    for (const { file, blob } of results) {
      zip.file(uniqueOutputName(file.name, usedNames), blob)
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' })
    saveAs(zipBlob, `watermarked_${Date.now()}.zip`)
    // 状态只关联任务中实际成功的 File，不依赖可能变化的列表下标。
    const blobsByFile = new Map(results.map(({ file, blob }) => [file, blob]))
    processedBlobs.value = images.value.map(file => blobsByFile.get(file) || null)
    const message = failures.length
      ? `已导出 ${results.length} 张，失败 ${failures.length} 张`
      : `已导出 ${results.length} 张`
    exportResult.value = { message, failures }
    showToast(message, failures.length ? 'info' : 'success')
  } catch (error) {
    const message = `导出失败：${error.message || '打包失败，请重试'}`
    exportResult.value = { message, failures }
    showToast(message, 'error')
  } finally {
    processing.value = false
  }
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

.export-status {
  max-width: 240px;
  max-height: 96px;
  overflow-y: auto;
  overflow-wrap: anywhere;
  margin-top: 8px;
  color: #6a7282;
  font-size: 12px;
  line-height: 1.5;
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

/* 移动端折叠按钮：桌面隐藏 */
.btn-config-toggle {
  display: none;
}

@media (max-width: 767px) {
  .btn-config-toggle {
    display: inline-flex;
    margin-left: auto;
    padding: 6px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    background: #f9fafb;
    font-size: 13px;
    font-weight: 600;
    color: #374151;
    cursor: pointer;
    white-space: nowrap;
  }

  .app-main {
    flex-direction: column;
    overflow-y: auto;
  }

  .sidebar {
    width: 100%;
    max-height: 60vh;
    border-right: none;
    border-bottom: 1px solid #e5e7eb;
    overflow-y: auto;
    flex-shrink: 0;
  }

  .sidebar-mobile-hidden {
    display: none;
  }

  .content {
    padding: 12px;
    overflow-y: auto;
    min-height: 0;
    flex: 1;
  }

  .app {
    overflow-y: auto;
    height: auto;
    min-height: 100dvh;
  }

  html, body {
    overflow: auto;
    height: auto;
  }
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
