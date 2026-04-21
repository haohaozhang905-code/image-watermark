export const SCENES = [
  {
    id: 'onboarding',
    title: '入职背调',
    description: '用于入职审核，高密度防盗用',
    icon: 'briefcase',
    config: {
      text: '仅用于入职背景调查，他用无效',
      spacing: 'dense',
      opacity: 0.18,
      color: '#000000',
      layout: 'tile',
      fontSize: 4,
      rotation: -30,
      fontWeight: 500
    }
  },
  {
    id: 'loan',
    title: '银行贷款',
    description: '用于信贷业务，包含风险提示',
    icon: 'bank',
    config: {
      text: '仅用于银行贷款审核，严禁挪作他用',
      spacing: 'dense',
      opacity: 0.22,
      color: '#000000',
      layout: 'tile',
      fontSize: 3.8,
      rotation: -30,
      fontWeight: 500
    }
  },
  {
    id: 'rental',
    title: '租房材料',
    description: '供身份核验使用，中等密度',
    icon: 'home',
    config: {
      text: '仅供租房合同备案使用',
      spacing: 'medium',
      opacity: 0.12,
      color: '#000000',
      layout: 'tile',
      fontSize: 3.5,
      rotation: -30,
      fontWeight: 500
    }
  },
  {
    id: 'custom',
    title: '自定义',
    description: '手动配置处理策略',
    icon: 'settings',
    config: null // 使用当前表单配置
  }
]
