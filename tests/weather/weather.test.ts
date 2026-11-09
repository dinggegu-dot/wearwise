import { afterEach, describe, expect, it, vi } from 'vitest';
import { OpenMeteoProvider, WeatherService, type WeatherProvider } from '@/modules/weather';
import { describeWeatherCode } from '@/modules/weather/domain/weather-code';
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
describe('天气服务', () => {
  it('正确解析天气时间和温度单位', async () => {
    const observed = Math.floor(Date.now()/1000);
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({current_units:{temperature_2m:'°C',apparent_temperature:'°C'},current:{time:observed,temperature_2m:20,apparent_temperature:19,weather_code:3}})));
    vi.stubGlobal('fetch', fetcher);
    const result = await new OpenMeteoProvider().current('上海');
    expect(result).toMatchObject({ city:'上海', temperature:20, apparentTemperature:19, weatherCode:3, example:false, dataTime:new Date(observed*1000).toISOString() });
    expect(fetcher.mock.calls[0][0]).toContain('latitude=31.2304');
  });
  it('过旧或明显超前的观测时间不能伪装为实时天气',async()=>{
    const now=Math.floor(Date.now()/1000);
    for(const time of [now-3*60*60-10,now+15*60+10]) {
      vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response(JSON.stringify({current_units:{temperature_2m:'°C',apparent_temperature:'°C'},current:{time,temperature_2m:20,apparent_temperature:19}}))));
      await expect(new OpenMeteoProvider().current('上海')).rejects.toThrow('观测时间异常');
    }
  });
  it('单位错误不伪装为天气成功', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({current_units:{temperature_2m:'°F',apparent_temperature:'°F'},current:{time:1700000000,temperature_2m:20,apparent_temperature:19}}))));
    await expect(new OpenMeteoProvider().current('北京')).rejects.toThrow();
  });
  it('HTTP 错误和坏 JSON 不会变成示例天气',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValueOnce(new Response('failed',{status:503})).mockResolvedValueOnce(new Response('{bad')));
    const provider=new OpenMeteoProvider();
    await expect(provider.current('上海')).rejects.toThrow();
    await expect(provider.current('上海')).rejects.toThrow();
  });
  it('超时或外部取消时中止天气请求',async()=>{
    const timeout=new AbortController(); vi.spyOn(AbortSignal,'timeout').mockReturnValue(timeout.signal);
    vi.stubGlobal('fetch',vi.fn((_url,init)=>new Promise((_resolve,reject)=>{
      const signal=init.signal as AbortSignal;
      if(signal.aborted) reject(signal.reason); else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
    })));
    const provider=new OpenMeteoProvider(); const waiting=provider.current('北京');
    timeout.abort(new DOMException('timeout','TimeoutError')); await expect(waiting).rejects.toMatchObject({name:'TimeoutError'});
    vi.spyOn(AbortSignal,'timeout').mockReturnValue(new AbortController().signal);
    const external=new AbortController(); const canceled=provider.current('上海',external.signal);
    external.abort(new DOMException('cancel','AbortError')); await expect(canceled).rejects.toMatchObject({name:'AbortError'});
  });
  it('缓存按城市隔离、主动刷新绕过缓存', async () => {
    const provider: WeatherProvider = { current: vi.fn(async city => ({city,temperature:10,apparentTemperature:9,dataTime:new Date().toISOString(),fetchedAt:new Date().toISOString(),example:false})) };
    const service = new WeatherService(provider);
    await service.current('北京'); expect((await service.current('北京')).cached).toBe(true);
    await service.current('上海'); await service.current('北京', {refresh:true});
    expect(provider.current).toHaveBeenCalledTimes(3);
  });
  it('WMO 未知代码不会显示晴天', () => { expect(describeWeatherCode(0)).toBe('晴朗'); expect(describeWeatherCode(999)).toBe('天气状况未知'); });
});
