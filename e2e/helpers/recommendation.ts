import type { Page, Route } from '@playwright/test';

export function weatherResult(time = Date.now(), temperature = 20) {
  return {
    current_units: { temperature_2m: '°C', apparent_temperature: '°C' },
    current: { time: Math.floor(time / 1000), temperature_2m: temperature, apparent_temperature: temperature - 1, weather_code: 3 },
    daily: { temperature_2m_min: [temperature - 2], temperature_2m_max: [temperature + 4] },
  };
}

export async function mockWeather(page: Page) {
  await page.route('https://api.open-meteo.com/**', route => route.fulfill({ json: weatherResult() }));
}

export async function mockRecommendation(page: Page) {
  await page.route('**/api/recommendation', fulfillRecommendation);
}

export async function fulfillRecommendation(route: Route) {
  const { wardrobe } = route.request().postDataJSON() as { wardrobe: Array<{ id: string; category: string }> };
  const categories = wardrobe.some(garment => garment.category === 'dress') ? ['dress', 'shoes'] : ['top', 'bottom', 'shoes'];
  const garmentIds = categories.map(category => wardrobe.find(garment => garment.category === category)?.id);
  if (garmentIds.some(id => !id)) return route.fulfill({ status: 422, json: { ok: false } });
  return route.fulfill({ json: { ok: true, data: { garmentIds, reason: '模拟推荐：衣物配色协调。', knowledgeVersion: 'V1.2' } } });
}
