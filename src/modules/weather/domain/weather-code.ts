// WMO 分类改编自 Wearly；来源和许可见 THIRD_PARTY_NOTICES.md。
const labels: Record<number, string> = {
  0:'晴朗',1:'晴间多云',2:'多云',3:'阴天',45:'雾',48:'冻雾',
  51:'小毛毛雨',53:'毛毛雨',55:'大毛毛雨',56:'冻毛毛雨',57:'强冻毛毛雨',
  61:'小雨',63:'中雨',65:'大雨',66:'冻雨',67:'强冻雨',71:'小雪',73:'中雪',75:'大雪',77:'雪粒',
  80:'阵雨',81:'强阵雨',82:'猛烈阵雨',85:'阵雪',86:'强阵雪',95:'雷雨',96:'雷雨夹冰雹',99:'强雷雨夹冰雹'
};
export function describeWeatherCode(code: number | null | undefined): string { return code == null ? '天气状况未知' : labels[code] ?? '天气状况未知'; }
