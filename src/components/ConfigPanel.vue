<template>
  <div class="config-panel">
    <div class="form-list">
      <!-- 1. 场景选择 -->
      <div class="form-section">
        <div class="section-header">
          <span class="section-step">1</span>
          <label class="section-title">选择使用场景</label>
        </div>

        <div class="scene-grid">
          <div
            v-for="scene in SCENES"
            :key="scene.id"
            class="scene-card"
            :class="{ active: currentSceneId === scene.id }"
            @click="selectScene(scene)"
          >
            <div class="scene-icon-wrap">
              <span class="scene-icon">{{ getSceneIcon(scene.icon) }}</span>
            </div>
            <div class="scene-info">
              <div class="scene-title">{{ scene.title }}</div>
              <div class="scene-desc">{{ scene.description }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 2. 高级设置 (折叠面板) -->
      <div class="form-section">
        <div class="section-header clickable" @click="isAdvancedOpen = !isAdvancedOpen">
          <div class="header-left">
            <span class="section-step">2</span>
            <label class="section-title">高级 / 手动调整策略</label>
          </div>
          <span class="collapse-icon" :class="{ open: isAdvancedOpen }">▼</span>
        </div>

        <div v-show="isAdvancedOpen" class="advanced-content">
          <div class="form-item">
            <label class="form-label">水印文字内容</label>
            <textarea
              v-model="cfg.text"
              rows="2"
              placeholder="请输入水印文字"
              class="input-textarea"
            />
          </div>

          <div class="form-item">
            <label class="form-label">平铺密度</label>
            <div class="seg-control">
              <button
                v-for="s in spacingOptions"
                :key="s.value"
                type="button"
                class="seg-btn"
                :class="{ active: cfg.spacing === s.value }"
                @click="cfg.spacing = s.value"
              >{{ s.label }}</button>
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
            <label class="form-label">颜色</label>
            <div class="color-row">
              <button
                v-for="c in presetColors"
                :key="c.value"
                type="button"
                class="color-dot"
                :class="{ active: cfg.color === c.value }"
                :style="colorDotStyle(c)"
                @click="cfg.color = c.value"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部固定操作区 -->
    <div class="panel-footer">
      <button
        type="button"
        class="btn-smart"
        :disabled="!hasImages || processing"
        @click="emit('process')"
      >
        <div v-if="processing" class="btn-loading">
          <span class="spin">⏳</span>
          <span>正在批量嵌入安全水印...</span>
        </div>
        <div v-else class="btn-content">
          <span class="smart-icon">✨</span>
          <span>智能识别与处理{{ hasImages ? ` (${imageCount}张)` : '' }}</span>
        </div>
      </button>
      <div v-if="processing" class="footer-status">
        ⚡ 正在批量嵌入安全水印...
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, watch, ref, onMounted } from 'vue'
import { SCENES } from '../utils/scenes'

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
const currentSceneId = ref('custom')
const isAdvancedOpen = ref(false)

// 初始同步
onMounted(() => {
  // 根据初始 config 匹配场景，如果匹配不上则默认为 custom
  const matched = SCENES.find(s => s.config && s.config.text === cfg.text)
  if (matched) currentSceneId.value = matched.id
})

watch(cfg, (val) => emit('update:config', { ...val }), { deep: true })
watch(() => props.config, (val) => Object.assign(cfg, val), { deep: true })

function selectScene(scene) {
  currentSceneId.value = scene.id
  if (scene.config) {
    Object.assign(cfg, scene.config)
    isAdvancedOpen.value = false
  } else {
    isAdvancedOpen.value = true
  }
}

function getSceneIcon(icon) {
  const icons = {
    briefcase: '💼',
    bank: '🏦',
    home: '🏠',
    settings: '🎨'
  }
  return icons[icon] || '📄'
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

function colorDotStyle(c) {
  const isWhite = c.value.toLowerCase() === '#ffffff'
  return {
    background: c.value,
    border: isWhite ? '1px solid #e5e7eb' : 'none',
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
  background: #fff;
}

.form-list {
  flex: 1;
  padding: 24px 16px;
  overflow-y: auto;
}

.form-section {
  margin-bottom: 32px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.section-header.clickable {
  cursor: pointer;
  justify-content: space-between;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.section-step {
  width: 24px;
  height: 24px;
  background: #f3f4f6;
  color: #6b7280;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
}

.section-title {
  font-size: 15px;
  font-weight: 700;
  color: #111827;
}

.scene-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.scene-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
}

.scene-card:hover {
  background: #f9fafb;
  border-color: #d1d5db;
}

.scene-card.active {
  background: #fff;
  border-color: #4f46e5;
  border-width: 2px;
  padding: 15px; /* 补偿 border 宽度 */
  box-shadow: 0 4px 12px rgba(79, 70, 229, 0.08);
}

.scene-icon-wrap {
  width: 44px;
  height: 44px;
  background: #f3f4f6;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
}

.scene-card.active .scene-icon-wrap {
  background: #eef2ff;
}

.scene-info {
  flex: 1;
}

.scene-title {
  font-size: 15px;
  font-weight: 600;
  color: #111827;
  margin-bottom: 2px;
}

.scene-desc {
  font-size: 12px;
  color: #6b7280;
}

.scene-card.active .scene-title {
  color: #4f46e5;
}

.scene-card.active .scene-desc {
  color: #6366f1;
}

.collapse-icon {
  font-size: 10px;
  color: #9ca3af;
  transition: transform 0.2s;
}

.collapse-icon.open {
  transform: rotate(180deg);
}

.advanced-content {
  padding-left: 36px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-item {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.form-label {
  font-size: 13px;
  font-weight: 500;
  color: #374151;
}

.input-textarea {
  width: 100%;
  padding: 12px;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  font-size: 14px;
  background: #f9fafb;
  resize: none;
}

.seg-control {
  display: flex;
  background: #f3f4f6;
  padding: 4px;
  border-radius: 8px;
}

.seg-btn {
  flex: 1;
  padding: 6px;
  border: none;
  background: transparent;
  border-radius: 6px;
  font-size: 13px;
  color: #6b7280;
  cursor: pointer;
}

.seg-btn.active {
  background: #fff;
  color: #111827;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}

.label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.val-pill {
  font-size: 12px;
  font-weight: 700;
  color: #4f46e5;
  background: #eef2ff;
  padding: 2px 8px;
  border-radius: 4px;
}

.slider {
  width: 100%;
  height: 4px;
  background: #e5e7eb;
  border-radius: 2px;
  -webkit-appearance: none;
}

.slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 16px;
  height: 16px;
  background: #fff;
  border: 2px solid #4f46e5;
  border-radius: 50%;
  cursor: pointer;
}

.color-row {
  display: flex;
  gap: 8px;
}

.color-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.2s;
}

.color-dot.active {
  transform: scale(1.2);
  box-shadow: 0 0 0 2px #fff, 0 0 0 4px #4f46e5;
}

.panel-footer {
  padding: 24px 16px;
  border-top: 1px solid #f3f4f6;
}

.btn-smart {
  width: 100%;
  height: 48px;
  background: #f3f4f6;
  border: none;
  border-radius: 12px;
  color: #9ca3af;
  font-weight: 700;
  cursor: not-allowed;
  transition: all 0.3s;
}

.btn-smart:not(:disabled) {
  background: #4f46e5;
  color: #fff;
  cursor: pointer;
}

.btn-smart:not(:disabled):hover {
  background: #4338ca;
  transform: translateY(-1px);
}

.btn-content {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.smart-icon {
  font-size: 18px;
}

.btn-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.footer-status {
  margin-top: 12px;
  font-size: 12px;
  color: #f59e0b;
  text-align: center;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
</style>