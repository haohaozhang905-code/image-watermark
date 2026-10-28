<template>
  <aside class="config-panel">
    <div class="panel-head">
      <h2 class="settings-title">水印设置</h2>
      <span class="live-badge"><i aria-hidden="true" />实时预览</span>
    </div>

    <div class="fields">
      <section class="field">
        <div class="field-label-row">
          <span class="field-label">使用场景</span>
          <small>选择后自动填入水印</small>
        </div>
        <div class="scene-grid">
          <button
            v-for="scene in SCENES"
            :key="scene.id"
            type="button"
            class="scene-button"
            :class="{ active: currentSceneId === scene.id }"
            :aria-pressed="currentSceneId === scene.id"
            :disabled="processing"
            @click="selectScene(scene)"
          >
            <svg v-if="scene.icon === 'briefcase'" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="18" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12a24 24 0 0 0 18 0M12 11v4"/></svg>
            <svg v-else-if="scene.icon === 'bank'" viewBox="0 0 24 24" aria-hidden="true"><path d="m3 9 9-6 9 6H3ZM5 10v8m5-8v8m4-8v8m5-8v8M3 21h18"/></svg>
            <svg v-else-if="scene.icon === 'home'" viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7M5 9v12h14V9M9 21v-8h6v8"/></svg>
            <svg v-else viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.6a8 8 0 0 1-1.5.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.5-.9l-1.7.6-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.8l-1.4-1.1 1.4-2.4 1.7.6a8 8 0 0 1 1.5-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.5.9l1.7-.6 1.4 2.4-1.4 1.1a7 7 0 0 1-.1 1.7Z" transform="translate(-1 -1) scale(1.08)"/></svg>
            <span>{{ scene.title }}</span>
            <span v-if="currentSceneId === scene.id" class="scene-check" aria-hidden="true">✓</span>
          </button>
        </div>
      </section>

      <section class="field">
        <div class="field-label-row">
          <label class="field-label" for="watermark-text">水印文字</label>
          <small>可换行</small>
        </div>
        <textarea
          id="watermark-text"
          v-model="cfg.text"
          :disabled="processing"
          rows="3"
          placeholder="请输入水印文字"
          class="input-textarea"
        />
      </section>

      <section class="field">
        <span class="field-label">平铺密度</span>
        <div class="seg-control" role="group" aria-label="平铺密度">
          <button
            v-for="option in spacingOptions"
            :key="option.value"
            type="button"
            :disabled="processing"
            class="seg-btn"
            :class="{ active: cfg.spacing === option.value }"
            :aria-pressed="cfg.spacing === option.value"
            @click="cfg.spacing = option.value"
          >{{ option.label }}</button>
        </div>
      </section>

      <section class="field">
        <div class="field-label-row">
          <label class="field-label" for="watermark-opacity">透明度</label>
          <output class="value-label" for="watermark-opacity">{{ Math.round(cfg.opacity * 100) }}%</output>
        </div>
        <input
          id="watermark-opacity"
          type="range"
          :disabled="processing"
          v-model.number="cfg.opacity"
          min="0.05"
          max="1"
          step="0.01"
          class="slider"
          :style="sliderBg(cfg.opacity, 0.05, 1)"
        />
      </section>

      <section class="field">
        <div class="field-label-row">
          <span class="field-label">水印颜色</span>
          <span class="color-name">{{ selectedColorLabel }}</span>
        </div>
        <div class="color-row" role="group" aria-label="水印颜色">
          <button
            v-for="c in presetColors"
            :key="c.value"
            type="button"
            :disabled="processing"
            :aria-label="c.label"
            :aria-pressed="cfg.color === c.value"
            class="color-dot"
            :class="{ active: cfg.color === c.value }"
            :style="colorDotStyle(c)"
            @click="cfg.color = c.value"
          />
        </div>
      </section>
    </div>

    <footer class="export-footer">
      <button type="button" class="export-button" :disabled="!imageCount || processing" @click="emit('export')">
        <svg v-if="!processing" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0 5-5m-5 5-5-5M5 17v3h14v-3"/></svg>
        <svg v-else class="spinner-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/></svg>
        <span>{{ buttonLabel }}</span>
      </button>
      <div v-if="exportResult" class="export-status" role="status">
        <p>{{ exportResult.message }}</p>
        <p v-for="(failure, index) in exportResult.failures" :key="index">{{ failure.name }}：{{ failure.message }}</p>
      </div>
      <p v-else class="export-note">打包为 ZIP · 保留图片原始尺寸</p>
    </footer>
  </aside>
</template>

<script setup>
import { reactive, watch, ref, onMounted, computed } from 'vue'
import { SCENES } from '../utils/scenes'

const props = defineProps({
  config: { type: Object, required: true },
  processing: { type: Boolean, default: false },
  imageCount: { type: Number, default: 0 },
  progress: { type: Object, default: () => ({ current: 0, total: 0, phase: 'processing' }) },
  exportResult: { type: Object, default: null },
})
const emit = defineEmits(['update:config', 'export'])

const cfg = reactive({ ...props.config })
const currentSceneId = ref('custom')

onMounted(() => {
  const matched = SCENES.find(scene => scene.config && scene.config.text === cfg.text)
  if (matched) currentSceneId.value = matched.id
})

watch(cfg, (value) => {
  currentSceneId.value = SCENES.find(scene => scene.config &&
    Object.entries(scene.config).every(([key, expected]) => value[key] === expected)
  )?.id || 'custom'
  emit('update:config', { ...value })
}, { deep: true })

watch(() => props.config, value => Object.assign(cfg, value), { deep: true })

function selectScene(scene) {
  if (props.processing) return
  currentSceneId.value = scene.id
  if (scene.config) Object.assign(cfg, scene.config)
}

const presetColors = [
  { value: '#000000', label: '黑色' },
  { value: '#ffffff', label: '白色' },
  { value: '#2563eb', label: '蓝色' },
  { value: '#ef4444', label: '红色' },
  { value: '#10b981', label: '绿色' },
  { value: '#f59e0b', label: '黄色' },
  { value: '#8b5cf6', label: '紫色' },
]
const selectedColorLabel = computed(() => presetColors.find(color => color.value === cfg.color)?.label || '自定义')
const buttonLabel = computed(() => {
  if (!props.processing) return props.imageCount ? `处理并导出 ${props.imageCount} 张图片` : '添加图片后导出'
  if (props.progress.phase === 'packing') return '正在打包…'
  return `正在处理 ${props.progress.current}/${props.progress.total}`
})

function colorDotStyle(color) {
  return { '--swatch': color.value }
}
function sliderBg(value, min, max) {
  return { '--pct': `${((value - min) / (max - min)) * 100}%` }
}

const spacingOptions = [
  { value: 'sparse', label: '稀疏' },
  { value: 'medium', label: '适中' },
  { value: 'dense', label: '密集' },
]
</script>

<style scoped>
.config-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: #fff;
  border-radius: 22px;
}
.panel-head { display: flex; align-items: center; justify-content: space-between; flex: 0 0 auto; padding: 17px 20px 14px; }
.settings-title { font-size: 15px; font-weight: 650; letter-spacing: -.3px; }
.live-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 9px; border-radius: 20px; background: #d1ffca; color: #36522b; font-size: 10px; }
.live-badge i { width: 6px; height: 6px; border-radius: 50%; background: #4e7b40; }
.fields { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 17px 12px; scrollbar-width: thin; }
.fields::-webkit-scrollbar { width: 5px; }
.fields::-webkit-scrollbar-thumb { border-radius: 5px; background: #d9ded4; }
.field { margin: 0 0 clamp(12px, 2.1vh, 18px); }
.field-label-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.field-label { display: block; color: #343b31; font-size: 12px; font-weight: 600; }
.field-label-row small, .color-name { color: #626b5b; font-size: 11px; font-weight: 400; }
.scene-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
.scene-button {
  position: relative;
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  padding: 9px 10px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: #f3f4f0;
  color: #5d6556;
  text-align: left;
  font-size: 11px;
  cursor: pointer;
  transition: background .15s, border-color .15s, color .15s;
}
.scene-button svg { width: 17px; height: 17px; flex: 0 0 17px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; color: #737f69; }
.scene-button span:not(.scene-check) { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.scene-button:hover:not(:disabled) { background: #e8eee3; }
.scene-button.active { border-color: #a8c39e; background: #e4f5df; color: #24341e; font-weight: 600; }
.scene-button.active svg { color: #426834; }
.scene-button:disabled { cursor: not-allowed; opacity: .65; }
.scene-check { margin-left: auto; color: #476b3b; font-size: 10px; }
.input-textarea {
  display: block;
  width: 100%;
  height: 74px;
  min-height: 54px;
  resize: vertical;
  border: 1px solid #d4dace;
  border-radius: 9px;
  padding: 9px 11px;
  background: #fcfdfb;
  color: #353f2f;
  font-size: 12px;
  line-height: 1.7;
}
.input-textarea:disabled { color: #7a8174; background: #f5f6f3; }
.seg-control { display: flex; gap: 3px; padding: 3px; border-radius: 7px; background: #f0f2ed; }
.seg-btn { flex: 1; border: 0; border-radius: 4px; padding: 6px 0; background: transparent; color: #747e6b; font-size: 11px; cursor: pointer; }
.seg-btn.active { background: #fff; color: #283322; box-shadow: 0 0 0 1px #e1e6db; }
.seg-btn:disabled { cursor: not-allowed; opacity: .55; }
.value-label { color: #4a613f; font-size: 11px; font-variant-numeric: tabular-nums; }
.slider { display: block; width: 100%; height: 20px; margin: 0; appearance: none; background: transparent; accent-color: #516b44; cursor: pointer; }
.slider::-webkit-slider-runnable-track { height: 4px; border-radius: 4px; background: linear-gradient(to right, #516b44 0 var(--pct), #d7ddd2 var(--pct) 100%); }
.slider::-moz-range-track { height: 4px; border-radius: 4px; background: #d7ddd2; }
.slider::-moz-range-progress { height: 4px; border-radius: 4px; background: #516b44; }
.slider::-webkit-slider-thumb { width: 15px; height: 15px; margin-top: -5.5px; appearance: none; border: 2px solid #516b44; border-radius: 50%; background: #fff; }
.slider::-moz-range-thumb { width: 15px; height: 15px; border: 2px solid #516b44; border-radius: 50%; background: #fff; }
.slider:disabled { cursor: not-allowed; opacity: .6; }
.color-row { display: flex; align-items: center; gap: 8px; padding: 1px; }
.color-dot { width: 23px; height: 23px; flex: 0 0 23px; padding: 0; border: 3px solid #fff; border-radius: 50%; outline: 1px solid #d7dbd2; background: var(--swatch); cursor: pointer; }
.color-dot.active { outline: 2px solid #33482a; }
.color-dot:disabled { cursor: not-allowed; opacity: .6; }
.export-footer { flex: 0 0 auto; margin-top: auto; padding: 14px 17px 16px; border-top: 1px solid #ecf0e7; background: #fafbf8; }
.export-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  padding: 10px 12px;
  border: 0;
  border-radius: 8px;
  background: #181b17;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background .15s, transform .15s;
}
.export-button:hover:not(:disabled) { background: #333a2e; }
.export-button:active:not(:disabled) { transform: translateY(1px); }
.export-button:disabled { background: #e1e5dc; color: #939c8a; cursor: not-allowed; }
.export-button svg { width: 17px; height: 17px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
.spinner-icon { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.export-note { margin-top: 8px; color: #626b5b; text-align: center; font-size: 11px; }
.export-status { max-height: 96px; overflow-y: auto; overflow-wrap: anywhere; margin-top: 8px; color: #626b5b; font-size: 11px; line-height: 1.5; }
.export-status p + p { margin-top: 3px; }
@media (max-width: 700px) {
  .config-panel { border-radius: 18px; }
  .fields { padding-right: 22px; padding-left: 22px; }
  .scene-button, .seg-btn { font-size: 12px; }
  .scene-button { padding: 10px 11px; }
  .export-footer { padding-right: 22px; padding-left: 22px; }
}
</style>
