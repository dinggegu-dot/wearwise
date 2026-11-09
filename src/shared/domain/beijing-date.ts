/** 本阶段所有“当天”“恢复日期”均按北京时间（Asia/Shanghai，UTC+8，无夏令时）解释。 */
export const BEIJING_TIME_ZONE = 'Asia/Shanghai';
export const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

/** 返回某一时刻在北京时间的日期，格式 YYYY-MM-DD。 */
export function beijingDate(at: Date | string | number = new Date()): string {
  const time = at instanceof Date ? at.getTime() : typeof at === 'number' ? at : Date.parse(at);
  if (!Number.isFinite(time)) throw new Error('时间无效');
  return new Date(time + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** 校验 YYYY-MM-DD 是真实存在的日历日期。 */
export function isDateOnly(value: string): boolean {
  if (!dateOnlyPattern.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** 某个北京日期 00:00 对应的 UTC 时刻。 */
export function beijingMidnight(date: string): Date {
  if (!isDateOnly(date)) throw new Error('日期格式应为 YYYY-MM-DD');
  return new Date(Date.parse(`${date}T00:00:00+08:00`));
}
