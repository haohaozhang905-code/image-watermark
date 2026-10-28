<template>
  <div class="app">
    <header class="app-header">
      <div class="header-inner">
        <a class="header-brand" href="#" aria-label="隐私水印首页" @click.prevent>
          <span class="header-logo" aria-hidden="true">印</span>
          <span class="header-title">隐私水印</span>
        </a>
        <div class="workflow" aria-label="使用流程">
          <span :class="{ current: !images.length }"><b>1</b>上传图片</span>
          <i>→</i>
          <span :class="{ current: images.length > 0 }"><b>2</b>调整水印</span>
          <i>→</i>
          <span><b>3</b>导出图片</span>
        </div>
        <div class="privacy"><span aria-hidden="true" />图片仅在本地处理</div>
      </div>
    </header>

    <main class="layout">
      <nav class="mobile-tabs" aria-label="工作台区域">
        <button type="button" :class="{ active: mobileView === 'preview' }" :aria-pressed="mobileView === 'preview'" @click="mobileView = 'preview'">图片预览</button>
        <button type="button" :class="{ active: mobileView === 'settings' }" :aria-pressed="mobileView === 'settings'" @click="mobileView = 'settings'">水印设置</button>
      </nav>

      <div class="workspace" :class="`mobile-show-${mobileView}`">
        <section class="preview-panel" aria-label="图片预览">
          <div class="panel-head">
            <div class="panel-title">
              <h2>图片预览</h2>
              <span class="count" aria-live="polite">{{ images.length ? `${images.length} 张图片` : '未添加图片' }}</span>
            </div>
            <button type="button" class="text-button" @click="requestUpload">＋ 添加图片</button>
          </div>

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

          <UploadZone
            ref="uploadZoneRef"
            class="work-thumbs"
            :images="images"
            :processed-blobs="processedBlobs"
            :active-index="activeIndex"
            :processing="processing"
            @update:images="onImagesUpdate"
            @select-image="activeIndex = $event"
            @reject-files="onFilesRejected"
          />
        </section>

        <ConfigPanel
          class="settings-panel"
          :config="config"
          :processing="processing"
          :image-count="images.length"
          :progress="progress"
          :export-result="exportResult"
          @update:config="onConfigUpdate"
          @export="downloadZip"
        />
      </div>
    </main>

    <Transition name="toast">
      <div v-if="toast.show" class="toast" :class="toast.type" role="status">{{ toast.msg }}</div>
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
import { SCENES } from './utils/scenes.js'

const images         = ref([])
const processedBlobs = ref([])
const activeIndex    = ref(0)
const mobileView     = ref('preview')
const uploadZoneRef  = ref(null)

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

function requestUpload() {
  uploadZoneRef.value?.openFilePicker()
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
:root {
  --canvas: #e5e5e5;
  --paper: #fff;
  --mist: #f3f3f3;
  --ink: #161816;
  --muted: #696c68;
  --line: #d9dcd6;
  --mint: #d1ffca;
  --focus: #476f3e;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #app { width: 100%; height: 100%; overflow: hidden; }
body {
  font-family: Inter, 'Noto Sans SC', -apple-system, BlinkMacSystemFont, sans-serif;
  background: var(--canvas);
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
}
button, textarea, input { font: inherit; }
button:focus-visible, textarea:focus-visible, input:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--focus) 55%, transparent);
  outline-offset: 2px;
}
.app {
  height: 100vh;
  height: 100dvh;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--canvas);
}
.app-header {
  height: 56px;
  flex: 0 0 56px;
  width: 100%;
  padding: 0 24px;
}
.header-inner {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  gap: 18px;
  align-items: center;
  width: 100%;
  max-width: 1600px;
  height: 100%;
  margin: 0 auto;
}
.header-brand { display: flex; align-items: center; gap: 10px; color: inherit; text-decoration: none; }
.header-logo {
  width: 29px;
  height: 29px;
  display: grid;
  place-items: center;
  background: var(--ink);
  color: var(--mint);
  border-radius: 9px;
  font-size: 16px;
  font-weight: 700;
  transform: rotate(-5deg);
}
.header-title { font-size: 18px; letter-spacing: -.6px; font-weight: 650; }
.workflow { display: flex; align-items: center; gap: 14px; color: #6d7566; font-size: 11px; white-space: nowrap; }
.workflow span { display: inline-flex; align-items: center; }
.workflow b {
  display: inline-grid;
  place-items: center;
  width: 18px;
  height: 18px;
  margin-right: 6px;
  border-radius: 50%;
  background: #ffffffa0;
  font-size: 10px;
  font-weight: 500;
}
.workflow .current { color: #283d1e; font-weight: 600; }
.workflow .current b { background: var(--mint); }
.workflow i { color: #8a8f84; font-style: normal; }
.privacy { justify-self: end; display: flex; align-items: center; gap: 7px; color: #5d6657; font-size: 11px; white-space: nowrap; }
.privacy span { width: 6px; height: 6px; border-radius: 50%; background: #4e7b40; }
.layout {
  width: 100%;
  max-width: 1600px;
  padding: 0 20px 16px;
  margin: 0 auto;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.workspace {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 16px;
  align-items: stretch;
}
.preview-panel, .settings-panel {
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: var(--paper);
  border-radius: 22px;
}
.preview-panel { min-width: 0; }
.panel-head { display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; padding: 17px 20px 14px; }
.panel-title { display: flex; align-items: center; gap: 9px; }
.panel-title h2, .settings-title { margin: 0; font-size: 15px; font-weight: 650; letter-spacing: -.3px; }
.count { padding: 3px 8px; border-radius: 20px; background: var(--mist); color: #6d7268; font-size: 10px; }
.text-button { border: 0; background: transparent; padding: 6px; color: #526046; font-size: 11px; cursor: pointer; }
.text-button:hover { text-decoration: underline; text-underline-offset: 3px; }
.work-preview { flex: 1; min-height: 0; }
.work-thumbs { flex-shrink: 0; }
.mobile-tabs { display: none; }
.toast {
  position: fixed;
  z-index: 1000;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  max-width: min(90vw, 560px);
  padding: 10px 16px;
  border-radius: 10px;
  color: #fff;
  font-size: 13px;
  box-shadow: 0 5px 20px #0002;
}
.toast.success { background: #38652f; }
.toast.info { background: #30362e; }
.toast.error { background: #a53b32; }
.toast-enter-active, .toast-leave-active { transition: opacity .18s, transform .18s; }
.toast-enter-from, .toast-leave-to { opacity: 0; transform: translate(-50%, -8px); }
@media (max-width: 900px) and (min-width: 701px) {
  .layout { padding-right: 12px; padding-left: 12px; }
  .workspace { grid-template-columns: minmax(0, 1fr) 300px; gap: 12px; }
  .header-inner { gap: 10px; }
}
@media (max-width: 700px) {
  .app-header { height: 52px; flex-basis: 52px; padding: 0 16px; }
  .header-inner { grid-template-columns: 1fr auto; }
  .workflow, .privacy { display: none; }
  .layout { padding: 0 10px 10px; }
  .mobile-tabs { display: flex; flex: 0 0 auto; gap: 7px; padding: 0 2px 10px; }
  .mobile-tabs button {
    flex: 1;
    border: 1px solid #d5dacd;
    border-radius: 9px;
    padding: 9px 10px;
    background: #f4f5f1;
    color: #65705e;
    font-size: 12px;
  }
  .mobile-tabs button.active { border-color: #a8c39e; background: #e4f5df; color: #24341e; font-weight: 600; }
  .workspace { display: grid; grid-template-columns: minmax(0, 1fr); gap: 0; }
  .preview-panel, .settings-panel { border-radius: 18px; }
  .workspace.mobile-show-preview .settings-panel, .workspace.mobile-show-settings .preview-panel { display: none; }
  .panel-head { padding: 13px 14px 10px; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; }
}
</style>
