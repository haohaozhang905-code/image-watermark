<template>
  <div class="config-panel">
    <div class="form-list">
      <div class="form-section">
        <label class="form-label form-label--section">水印文字</label>
        <textarea
          v-model="cfg.text"
          rows="2"
          placeholder="请输入水印文字"
          class="input-textarea"
        />
      </div>

      <div class="form-divider" />

      <div class="form-section form-section--sliders">
        <div class="form-item">
          <div class="label-row">
            <label class="form-label" title="按图片较短边的百分比计算字号，横图与竖图视觉更一致">字体大小</label>
            <span class="val-pill">{{ cfg.fontSize }}%</span>
          </div>
          <input
            type="range"
            v-model.number="cfg.fontSize"
            min="0.5"
            max="10"
            step="0.1"
            class="slider"
            :style="sliderBg(cfg.fontSize, 0.5, 10)"
          />
        </div>
        <div class="form-item">
          <label class="form-label">字重</label>
          <div class="seg-control">
            <button
              v-for="fw in fontWeightOptions"
              :key="fw.value"
              type="button"
              class="seg-btn"
              :class="{ active: cfg.fontWeight === fw.value }"
              :title="fw.hint"
              @click="cfg.fontWeight = fw.value"
            >{{ fw.label }}</button>
          </div>
        </div>
        <div class="form-item">
          <div class="label-row">
            <label class="form-label">透明度</label>
            <span class="val-pill">{{ Math.round(cfg.opacity * 100) }}%</span>
          </div>
          <input
            type="range"
            v-model.number="cfg.opacity"
            min="0.05"
            max="1"
            step="0.01"
            class="slider"
            :style="sliderBg(cfg.opacity, 0.05, 1)"
          />
        </div>
        <div class="form-item">
          <div class="label-row">
            <label class="form-label">旋转角度</label>
            <span class="val-pill">{{ cfg.rotation }}°</span>
          </div>
          <input
            type="range"
            v-model.number="cfg.rotation"
            min="-90"
            max="90"
            step="1"
            class="slider"
            :style="sliderBg(cfg.rotation, -90, 90)"
          />
        </div>
      </div>

      <div class="form-divider" />

      <div class="form-section">
        <label class="form-label">颜色</label>
        <div class="color-row">
          <button
            v-for="c in presetColors"
            :key="c.value"
            type="button"
            class="color-dot"
            :class="{ active: cfg.color === c.value }"
            :style="colorDotStyle(c)"
            :title="c.label"
            @click="cfg.color = c.value"
          />
          <label class="color-custom-wrap" title="自定义颜色">
            <span class="color-custom-icon" aria-hidden="true">+</span>
            <input type="color" v-model="cfg.color" class="color-picker-hidden" />
          </label>
        </div>
      </div>

      <div class="form-divider" />

      <div class="form-section form-section--segments">
        <div class="form-item">
          <label class="form-label">排列方式</label>
          <div class="seg-control">
            <button
              type="button"
              class="seg-btn"
              :class="{ active: cfg.layout === 'tile' }"
              @click="cfg.layout = 'tile'"
            >平铺</button>
            <button
              type="button"
              class="seg-btn"
              :class="{ active: cfg.layout === 'center' }"
              @click="cfg.layout = 'center'"
            >居中</button>
          </div>
        </div>
        <div class="form-item" :class="{ 'item-disabled': cfg.layout !== 'tile' }">
          <label class="form-label">间距密度</label>
          <div class="seg-control">
            <button
              v-for="s in spacingOptions"
              :key="s.value"
              type="button"
              class="seg-btn"
              :class="{ active: cfg.spacing === s.value }"
              :disabled="cfg.layout !== 'tile'"
              @click="cfg.layout === 'tile' && (cfg.spacing = s.value)"
            >{{ s.label }}</button>
          </div>
        </div>
      </div>
    </div>

    <div class="panel-actions">
      <button
        type="button"
        class="btn-primary"
        :disabled="!hasImages || processing"
        @click="emit('process')"
      >
        <span v-if="processing">
          <span class="spin">⏳</span> 处理中 {{ progress.current }}/{{ progress.total }}
        </span>
        <span v-else>开始处理{{ hasImages ? ` (${imageCount} 张)` : '' }}</span>
      </button>

      <div v-if="processing" class="progress-bar-wrap">
        <div class="progress-bar" :style="{ width: progressPct + '%' }" />
      </div>

      <button
        type="button"
        class="btn-secondary"
        :disabled="!processedCount || processing"
        @click="emit('download-zip')"
      >
        <svg class="btn-secondary-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 3v12" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          <path d="M8 11l4 4 4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          <path d="M4 21h16" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </svg>
        打包下载 ZIP
      </button>
    </div>
  </div>
</template>

<script setup>
import { reactive, watch, computed } from 'vue'

const props = defineProps({
  config:         { type: Object,  required: true },
  hasImages:      { type: Boolean, default: false },
  imageCount:     { type: Number,  default: 0 },
  processing:     { type: Boolean, default: false },
  progress:       { type: Object,  default: () => ({ current: 0, total: 0 }) },
  processedCount: { type: Number,  default: 0 },
})
const emit = defineEmits(['update:config', 'process', 'download-zip'])

const cfg = reactive({ ...props.config })

watch(cfg, (val) => emit('update:config', { ...val }), { deep: true })
watch(() => props.config, (val) => Object.assign(cfg, val), { deep: true })

const progressPct = computed(() =>
  props.progress.total
    ? Math.round((props.progress.current / props.progress.total) * 100)
    : 0
)

const presetColors = [
  { value: '#000000', label: '黑色' },
  { value: '#888888', label: '灰色' },
  { value: '#b0b0b0', label: '浅灰' },
  { value: '#ffffff', label: '白色' },
  { value: '#3B82F6', label: '蓝色' },
  { value: '#EF4444', label: '红色' },
  { value: '#10B981', label: '绿色' },
  { value: '#8B5CF6', label: '紫色' },
]

const fontWeightOptions = [
  { value: 400, label: '常规', hint: 'font-weight 400' },
  { value: 550, label: '中等', hint: 'font-weight 550' },
  { value: 700, label: '加粗', hint: 'font-weight 700' },
]

function colorDotStyle(c) {
  const isLight = c.value.toLowerCase() === '#ffffff'
  return {
    background: c.value,
    border: isLight ? '1px solid #e5e7eb' : '1px solid transparent',
  }
}

function sliderBg(val, min, max) {
  const pct = ((val - min) / (max - min)) * 100
  return { '--pct': pct + '%' }
}

const spacingOptions = [
  { value: 'sparse', label: '稀疏' },
  { value: 'medium', label: '适中' },
  { value: 'dense',  label: '密集' },
]
</script>

<style scoped>
.config-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: #fff;
  border-right: 1px solid #e5e7eb;
  box-shadow: 4px 0 24px rgba(0, 0, 0, 0.02);
  overflow: hidden;
}

.form-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 12px 14px 12px 12px;
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  overscroll-behavior: contain;
}
.form-list::-webkit-scrollbar {
  width: 6px;
}
.form-list::-webkit-scrollbar-thumb {
  background: #e5e7eb;
  border-radius: 3px;
}

.form-section { display: flex; flex-direction: column; gap: 8px; }
.form-section--sliders { gap: 14px; }
.form-section--segments { gap: 12px; }

.form-divider {
  height: 1px;
  background: #f3f4f6;
  margin: 0;
  border: none;
}

.form-item { display: flex; flex-direction: column; gap: 10px; }
.form-section--sliders .form-item { gap: 10px; }
.form-section--segments .form-item { gap: 8px; }

.label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 22px;
}

.form-label {
  font-size: 13px;
  font-weight: 500;
  color: #364153;
  letter-spacing: -0.12px;
}
.form-label--section {
  font-weight: 600;
  color: #101828;
  font-size: 13px;
}

.val-pill {
  display: inline-flex;
  align-items: center;
  min-height: 22px;
  padding: 1px 7px;
  border-radius: 6px;
  background: #eff6ff;
  font-size: 12px;
  font-weight: 600;
  color: #007aff;
  letter-spacing: -0.1px;
  font-variant-numeric: tabular-nums;
}

.input-textarea {
  width: 100%;
  resize: none;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 8px 10px;
  font-size: 13px;
  line-height: 18px;
  font-family: inherit;
  color: #101828;
  background: #f9fafb;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
  box-sizing: border-box;
  min-height: 52px;
}
.input-textarea::placeholder {
  color: rgba(30, 41, 57, 0.5);
}
.input-textarea:focus {
  border-color: #007aff;
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.12);
}

.slider {
  width: 100%;
  -webkit-appearance: none;
  appearance: none;
  height: 20px;
  background: transparent;
  outline: none;
  cursor: pointer;
  padding: 0;
  display: block;
}
.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  border: none;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  margin-top: -5px;
}
.slider::-webkit-slider-runnable-track {
  height: 5px;
  border-radius: 10px;
  background: linear-gradient(
    to right,
    #007aff 0%,
    #007aff var(--pct, 50%),
    #e5e7eb var(--pct, 50%)
  );
}
.slider::-moz-range-thumb {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  border: none;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.2), 0 0 0 1px rgba(0, 0, 0, 0.08);
  cursor: pointer;
}
.slider::-moz-range-track {
  height: 5px;
  border-radius: 10px;
  background: #e5e7eb;
}

.color-row {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: flex-start;
  gap: 7px;
  min-height: 0;
  width: 100%;
}
.color-dot {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border-radius: 50%;
  cursor: pointer;
  outline: none;
  transition: transform 0.15s, box-shadow 0.15s;
}
.color-dot:hover { transform: scale(1.06); }
.color-dot.active {
  box-shadow:
    0 0 0 2px rgba(255, 255, 255, 1),
    0 0 0 4px rgba(43, 127, 255, 0.35);
  transform: scale(1.05);
}

.color-custom-wrap {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border-radius: 50%;
  border: 1px dashed #d1d5dc;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  flex-shrink: 0;
  transition: border-color 0.15s;
  background: transparent;
}
.color-custom-wrap:hover { border-color: #007aff; }
.color-custom-icon {
  font-size: 14px;
  font-weight: 600;
  line-height: 1;
  color: #99a1af;
}
.color-picker-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  opacity: 0;
  pointer-events: none;
}

.item-disabled {
  opacity: 0.4;
  pointer-events: none;
}

.seg-control {
  display: flex;
  background: rgba(243, 244, 246, 0.8);
  border: 1px solid rgba(229, 231, 235, 0.5);
  border-radius: 10px;
  padding: 3px;
  gap: 0;
}
.seg-btn {
  flex: 1;
  height: 30px;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  color: #6a7282;
  background: transparent;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, box-shadow 0.15s;
  letter-spacing: -0.15px;
}
.seg-btn.active {
  background: #fff;
  color: #101828;
  border: 1px solid rgba(229, 231, 235, 0.5);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06);
}
.seg-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.panel-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px 12px;
  border-top: 1px solid #f3f4f6;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.04);
  flex-shrink: 0;
  background: #fff;
}

.btn-primary {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 40px;
  background: #007aff;
  color: #fff;
  border: none;
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.2px;
  cursor: pointer;
  font-family: inherit;
  transition: opacity 0.15s, transform 0.1s, box-shadow 0.15s;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}
.btn-primary:hover:not(:disabled) { opacity: 0.92; }
.btn-primary:active:not(:disabled) { transform: scale(0.99); }
.btn-primary:disabled {
  background: #f3f4f6;
  color: #99a1af;
  box-shadow: none;
  cursor: not-allowed;
  opacity: 1;
}

.progress-bar-wrap {
  height: 4px;
  background: #e5e7eb;
  border-radius: 2px;
  overflow: hidden;
  margin-top: -4px;
}
.progress-bar {
  height: 100%;
  background: #007aff;
  border-radius: 2px;
  transition: width 0.25s ease;
}

.btn-secondary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 38px;
  background: #fff;
  color: #364153;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 8px 12px;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.2px;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
.btn-secondary-icon { flex-shrink: 0; color: currentColor; width: 15px; height: 15px; }
.btn-secondary:hover:not(:disabled) { background: #f9fafb; }
.btn-secondary:disabled {
  color: #d1d5dc;
  border-color: #e5e7eb;
  box-shadow: none;
  cursor: not-allowed;
}

.spin { display: inline-block; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
</style>
