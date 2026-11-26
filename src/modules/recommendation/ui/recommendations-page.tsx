
'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import { createServices } from '@/composition';
import { useMode } from '@/composition/mode-provider';

import type { City, Weather } from '@/modules/weather';

import type {
  RoundView,
  SettingsDraft,
  GarmentSnapshot,
  FeedbackDraft
} from '@/modules/session';

import { WeatherPanel } from '@/modules/weather/ui/weather-panel';
import { ConditionsPanel } from './conditions-panel';
import { OutfitFlatLay } from './outfit-flat-lay';
import { OutfitGarmentList } from './outfit-garment-list';
import { FeedbackDialog } from './feedback-dialog';
import { FeedbackSavedDialog } from './feedback-saved-dialog';

type PageOperation =
  | 'generate'
  | 'swap-outfit'
  | 'swap-item'
  | 'feedback-save'
  | 'feedback-swap';

type GarmentStatus = {
  deleted: GarmentSnapshot[];
  paused: GarmentSnapshot[];
};

type OperationTask = {
  kind: PageOperation;
  controller: AbortController;
};

const OPERATION_LABELS: Record<PageOperation, string> = {
  generate: '正在分析衣橱并生成搭配，请稍候…',
  'swap-outfit': '正在为你更换整套搭配…',
  'swap-item': '正在寻找合适的替代单品…',
  'feedback-save': '正在保存反馈…',
  'feedback-swap': '正在根据反馈调整搭配…'
};

export function RecommendationsPage() {
  const { mode } = useMode();

  const services = useMemo(
    () => createServices(mode),
    [mode]
  );

  // 推荐条件及当前轮次
  const [settings, setSettings] =
    useState<SettingsDraft>();

  const [roundView, setRoundView] =
    useState<RoundView>({ results: [] });

  const [city, setCity] =
    useState<City>('深圳');

  const [weather, setWeather] =
    useState<Weather>();

  const [garmentStatus, setGarmentStatus] =
    useState<GarmentStatus>();

  // 页面状态
  const [initialized, setInitialized] = useState(false);

  const [operation, setOperation] =
    useState<PageOperation | null>(null);

  const [error, setError] = useState('');

  const [swappingGarmentId, setSwappingGarmentId] =
    useState<string | null>(null);

  // 反馈状态
  const [feedbackChoice, setFeedbackChoice] =
    useState<'like' | 'dislike' | null>(null);

  const [feedbackSaved, setFeedbackSaved] =
    useState(false);

  const [feedbackSwapError, setFeedbackSwapError] =
    useState('');

  // 生命周期及同步操作锁
  const lifecycle = useRef(0);
  const mounted = useRef(false);

  const operationLock =
    useRef<OperationTask | null>(null);

  const settingsRef = useRef<SettingsDraft | undefined>(undefined);

  const settingsSaveQueue =
    useRef<Promise<void>>(Promise.resolve());

  const citySaveQueue =
    useRef<Promise<void>>(Promise.resolve());

  const busy = operation !== null;

  const modalOpen =
    feedbackChoice !== null || feedbackSaved;

  const controlsDisabled =
    !initialized || busy || modalOpen;

  // 修改条件：立即更新 UI，并顺序保存。
  const updateSettings = useCallback(
    (next: SettingsDraft) => {
      const version = lifecycle.current;

      settingsRef.current = next;
      setSettings(next);

      const save = settingsSaveQueue.current
        .catch(() => undefined)
        .then(() =>
          services.session.saveSettingsDraft(next)
        );

      settingsSaveQueue.current = save;

      void save.catch(() => {
        if (
          mounted.current &&
          lifecycle.current === version
        ) {
          setError('推荐条件保存失败，请重试。');
        }
      });

      return save;
    },
    [services]
  );

  // 上传本次喜好参考图。
  const addPreferenceImage = useCallback(
    async (file: File) => {
      const version = lifecycle.current;
      const previous = settingsRef.current;

      if (!previous?.preference.enabled) return;

      if (previous.preference.imageIds.length >= 6) {
        throw new Error('最多上传 6 张参考图。');
      }

      const id =
        await services.session.addReferenceImage(file);

      if (
        !mounted.current ||
        lifecycle.current !== version
      ) {
        return;
      }

      const latest = settingsRef.current;

      if (!latest?.preference.enabled) return;

      if (latest.preference.imageIds.length >= 6) {
        throw new Error('最多上传 6 张参考图。');
      }

      await updateSettings({
        ...latest,
        preference: {
          ...latest.preference,
          imageIds: [
            ...latest.preference.imageIds,
            id
          ]
        }
      });
    },
    [services, updateSettings]
  );

  // 删除本次喜好参考图。
  const removePreferenceImage = useCallback(
    async (id: string) => {
      const latest = settingsRef.current;

      if (!latest?.preference.enabled) return;

      await updateSettings({
        ...latest,
        preference: {
          ...latest.preference,
          imageIds: latest.preference.imageIds.filter(
            item => item !== id
          )
        }
      });
    },
    [updateSettings]
  );

  // 读取真实衣物图片。
  const loadImage = useCallback(
    (id: string) => services.wardrobe.image(id),
    [services]
  );

  // 重新读取当前轮次。
  const refreshRound = useCallback(
    async (signal?: AbortSignal) => {
      const version = lifecycle.current;

      signal?.throwIfAborted();

      const view = await services.session.readRound();

      signal?.throwIfAborted();

      if (
        mounted.current &&
        lifecycle.current === version
      ) {
        setRoundView(view);
        setGarmentStatus(undefined);
      }

      let status: GarmentStatus | undefined;

      if (view.current) {
        status = await services.session.resultStatus(
          view.current
        );
      }

      signal?.throwIfAborted();

      if (
        mounted.current &&
        lifecycle.current === version
      ) {
        setGarmentStatus(status);
      }

      return view;
    },
    [services]
  );

  // 页面初始化及生命周期管理。
  useEffect(() => {
    mounted.current = true;

    const version = ++lifecycle.current;

    setInitialized(false);
    setOperation(null);
    setSwappingGarmentId(null);
    setFeedbackChoice(null);
    setFeedbackSaved(false);
    setFeedbackSwapError('');
    setError('');
    setSettings(undefined);
    setWeather(undefined);
    setRoundView({ results: [] });
    setGarmentStatus(undefined);

    settingsRef.current = undefined;
    settingsSaveQueue.current = Promise.resolve();
    citySaveQueue.current = Promise.resolve();

    const isActive = () =>
      mounted.current &&
      lifecycle.current === version;

    const initialize = async () => {
      try {
        const [
          draft,
          view,
          savedCity
        ] = await Promise.all([
          services.session.getSettingsDraft(),
          services.session.readRound(),
          services.session.getCity()
        ]);

        if (!isActive()) return;

        const resolvedCity = savedCity ?? '深圳';

        if (!savedCity) {
          await services.session.setCity(resolvedCity);
        }

        if (!isActive()) return;

        let status: GarmentStatus | undefined;

        if (view.current) {
          status = await services.session.resultStatus(
            view.current
          );
        }

        if (!isActive()) return;

        settingsRef.current = draft;

        setSettings(draft);
        setRoundView(view);
        setCity(resolvedCity);
        setGarmentStatus(status);

        // 只恢复属于当前搭配的未提交反馈。
        const feedbackDraft = view.feedbackDraft;

        if (
          feedbackDraft?.choice &&
          feedbackDraft.roundId === view.round?.roundId &&
          feedbackDraft.resultId === view.current?.id
        ) {
          setFeedbackChoice(feedbackDraft.choice);
        }

        setInitialized(true);

      } catch (e) {
        if (!isActive()) return;

        setError(
          e instanceof Error
            ? e.message
            : '无法恢复上次的推荐状态，请刷新重试。'
        );
      }
    };

    void initialize();

    // 离开页面时取消尚未完成的推荐操作。
    return () => {
      mounted.current = false;
      lifecycle.current++;

      operationLock.current?.controller.abort();
      operationLock.current = null;

      services.dispose();
    };
  }, [services]);

  // 修改城市，不覆盖当前轮次已经使用的天气。
  const changeCity = useCallback(
    (next: City) => {
      const version = lifecycle.current;

      setCity(next);

      const save = citySaveQueue.current
        .catch(() => undefined)
        .then(() => services.session.setCity(next));

      citySaveQueue.current = save;

      void save.catch(() => {
        if (
          mounted.current &&
          lifecycle.current === version
        ) {
          setError('城市保存失败，请重试。');
        }
      });
    },
    [services]
  );

  const updateWeather = useCallback(
    (next: Weather | undefined) => {
      setWeather(next);
    },
    []
  );

  // 所有推荐和反馈操作共享同一个同步锁。
  const beginOperation = (
    kind: PageOperation
  ): OperationTask | null => {
    if (
      !mounted.current ||
      operationLock.current !== null
    ) {
      return null;
    }

    const task: OperationTask = {
      kind,
      controller: new AbortController()
    };

    operationLock.current = task;
    setOperation(kind);

    return task;
  };

  // 检查任务是否仍然有效。
  const isCurrentOperation = (
    task: OperationTask
  ) => {
    return (
      mounted.current &&
      operationLock.current === task &&
      !task.controller.signal.aborted
    );
  };

  // 仅允许任务释放自己的操作锁。
  const endOperation = (
    task: OperationTask
  ) => {
    if (operationLock.current !== task) return;

    operationLock.current = null;

    if (mounted.current) {
      setOperation(null);
    }
  };

  // 已提交成功的结果，读取失败时不能当作生成失败。
  const refreshCommitted = async (
    task: OperationTask
  ) => {
    try {
      await refreshRound(task.controller.signal);
    } catch {
      if (isCurrentOperation(task)) {
        setError(
          '结果已保存，但页面刷新失败，请重新加载页面。'
        );
      }
    }
  };

  // 生成穿搭：只有提交成功才开始新一轮。
  const generate = async () => {
    if (!initialized || modalOpen) return;

    const task = beginOperation('generate');

    if (!task) return;

    setError('');

    try {
      await settingsSaveQueue.current;
      await citySaveQueue.current;

      task.controller.signal.throwIfAborted();

      const result =
        await services.recommendationCore.generateNewRound({
          signal: task.controller.signal
        });

      if (!isCurrentOperation(task)) return;

      if (result.status !== 'committed') {
        setError(result.message);
        return;
      }

      setFeedbackChoice(null);
      setFeedbackSaved(false);
      setFeedbackSwapError('');

      await refreshCommitted(task);

    } catch (e) {
      if (!isCurrentOperation(task)) return;

      setError(
        e instanceof Error
          ? e.message
          : '生成失败，请重试。'
      );
    } finally {
      endOperation(task);
    }
  };

  // 换一套：沿用本轮已经应用的条件和反馈。
  const swapOutfit = async () => {
    if (!roundView.current || modalOpen) return;

    const task = beginOperation('swap-outfit');

    if (!task) return;

    setError('');

    try {
      const result =
        await services.recommendationCore.swapOutfit({
          signal: task.controller.signal
        });

      if (!isCurrentOperation(task)) return;

      if (result.status !== 'committed') {
        setError(result.message);
        return;
      }

      await refreshCommitted(task);

    } catch (e) {
      if (!isCurrentOperation(task)) return;

      setError(
        e instanceof Error
          ? e.message
          : '换一套失败，请重试。'
      );
    } finally {
      endOperation(task);
    }
  };

  // 换掉指定单品。
  const swapItem = async (
    garmentId: string
  ) => {
    if (!roundView.current || modalOpen) return;

    const task = beginOperation('swap-item');

    if (!task) return;

    setSwappingGarmentId(garmentId);
    setError('');

    try {
      const result =
        await services.recommendationCore.swapItem(
          garmentId,
          { signal: task.controller.signal }
        );

      if (!isCurrentOperation(task)) return;

      if (result.status !== 'committed') {
        setError(result.message);
        return;
      }

      await refreshCommitted(task);

    } catch (e) {
      if (!isCurrentOperation(task)) return;

      setError(
        e instanceof Error
          ? e.message
          : '替换单件失败，请重试。'
      );
    } finally {
      if (isCurrentOperation(task)) {
        setSwappingGarmentId(null);
      }

      endOperation(task);
    }
  };

  // 打开反馈弹窗。
  const openFeedback = (
    choice: 'like' | 'dislike'
  ) => {
    if (
      !roundView.current ||
      !roundView.round ||
      operationLock.current ||
      modalOpen
    ) {
      return;
    }

    setFeedbackSwapError('');
    setFeedbackChoice(choice);
  };

  // 保存尚未提交的反馈草稿。
  const updateFeedbackDraft = useCallback(
    async (
      draft: Omit<FeedbackDraft, 'updatedAt'>
    ) => {
      const version = lifecycle.current;

      await services.session.saveFeedbackDraft(draft);

      if (
        mounted.current &&
        lifecycle.current === version
      ) {
        setRoundView(previous => ({
          ...previous,
          feedbackDraft: {
            ...draft,
            updatedAt: new Date().toISOString()
          }
        }));
      }
    },
    [services]
  );

  // 正式提交反馈。
  const submitFeedback = async (
    input: {
      requestId: string;
      choice: 'like' | 'dislike';
      reason: string;
      scope: 'once' | 'permanent';
    }
  ) => {
    if (!roundView.current || !roundView.round) {
      throw new Error(
        '当前搭配不存在，请刷新后重试。'
      );
    }

    const task = beginOperation('feedback-save');

    if (!task) {
      throw new Error(
        '当前有其他操作正在执行，请稍后重试。'
      );
    }

    setError('');

    try {
      const savedRound =
        await services.session.saveFeedback({
          expectedRoundId: roundView.round.roundId,
          resultId: roundView.current.id,
          choice: input.choice,
          reason: input.reason,
          scope: input.scope,
          requestId: input.requestId
        });

      // 保存事务可能已经完成，但页面已经离开。
      if (!isCurrentOperation(task)) return;

      // 数据库写入成功后立即确认成功。
      setRoundView(previous => ({
        ...previous,
        round: savedRound,
        feedbackDraft: undefined
      }));

      setFeedbackChoice(null);
      setFeedbackSaved(true);
      setFeedbackSwapError('');

      try {
        await refreshRound(task.controller.signal);
      } catch {
        if (isCurrentOperation(task)) {
          setError(
            '反馈已保存，但页面刷新失败，请重新加载。'
          );
        }
      }

    } finally {
      endOperation(task);
    }
  };

  // 取消反馈：只清除未提交草稿。
  const cancelFeedback = async () => {
    const version = lifecycle.current;

    if (operationLock.current) {
      throw new Error('当前操作尚未完成。');
    }

    await services.session.clearFeedbackDraft();

    if (
      !mounted.current ||
      lifecycle.current !== version
    ) {
      return;
    }

    setRoundView(previous => ({
      ...previous,
      feedbackDraft: undefined
    }));

    setFeedbackChoice(null);
  };

  // 根据已保存的反馈重新推荐。
  const swapByFeedback = async () => {
    if (!feedbackSaved) return;

    const task = beginOperation('feedback-swap');

    if (!task) return;

    setFeedbackSwapError('');
    setError('');

    try {
      const result =
        await services.recommendationCore.feedbackSwap({
          signal: task.controller.signal
        });

      if (!isCurrentOperation(task)) return;

      if (result.status !== 'committed') {
        setFeedbackSwapError(result.message);
        return;
      }

      setFeedbackSaved(false);

      await refreshCommitted(task);

    } catch (e) {
      if (!isCurrentOperation(task)) return;

      setFeedbackSwapError(
        e instanceof Error
          ? e.message
          : '根据反馈更换失败，请重试。'
      );
    } finally {
      endOperation(task);
    }
  };

  const current = roundView.current;

  return (
    <>
      <div className="page-heading">
        <div>
          <span className="section-kicker">
            OUTFITS FOR YOU
          </span>

          <h1>
            穿搭推荐
            <span className="heading-dot">.</span>
          </h1>

          <p>
            从自己的衣橱中找到适合当下的搭配。
          </p>
        </div>
      </div>

      <div
        className="recommend-layout"
        data-settings-loaded={settings !== undefined}
      >
        <aside className="recommend-side">

          <div className="panel">
            <h2>天气参考</h2>

            <WeatherPanel
              onChange={updateWeather}
              onCityChange={changeCity}
              initialCity={city}
              exampleOnly={mode === 'demo'}
              initialWeather={weather}
            />

            <p>
              生成时将根据已保存的城市获取天气。
            </p>
          </div>

          <div className="panel">
            {!settings ? (
              <p>正在恢复设置…</p>
            ) : (
              <ConditionsPanel
                settings={settings}
                onChange={updateSettings}
                onAddImage={addPreferenceImage}
                onRemoveImage={removePreferenceImage}
                loadImage={loadImage}
              />
            )}
          </div>
        </aside>

        <div className="outfit-panel">
          <h2>为你推荐</h2>

          <p>
            根据已经应用的条件和当前可用衣物生成搭配。
          </p>

          <button
            type="button"
            className="primary-link"
            disabled={controlsDisabled}
            onClick={() => void generate()}
          >
            {operation === 'generate'
              ? '正在生成…'
              : '生成穿搭'}
          </button>

          {error && (
            <p role="alert">{error}</p>
          )}

          {!current && !busy && (
            <div className="outfit-empty">
              <h3>还没有穿搭推荐</h3>

              <p>
                设置好推荐条件后，点击生成穿搭。
              </p>
            </div>
          )}

          {operation && (
            <p role="status">
              {OPERATION_LABELS[operation]}
            </p>
          )}

          {current && (
            <article className="panel">
              <div className="outfit-heading">
                <div>
                  <h3>当前穿搭</h3>

                  <button
                    type="button"
                    className="secondary-button"
                    disabled={controlsDisabled}
                    onClick={() => void swapOutfit()}
                  >
                    {operation === 'swap-outfit'
                      ? '正在调整…'
                      : '换一套'}
                  </button>

                  <p>
                    {current.createdAt
                      ? new Date(
                          current.createdAt
                        ).toLocaleString('zh-CN')
                      : ''}
                  </p>
                </div>
              </div>

              <OutfitFlatLay
                result={current}
                load={loadImage}
              />

              <OutfitGarmentList
                result={current}
                load={loadImage}
                onSwapItem={swapItem}
                disabled={controlsDisabled}
                swappingGarmentId={swappingGarmentId}
              />

              <h3>搭配理由</h3>
              <p>{current.reason}</p>

              <h3>生成依据</h3>

              <p>
                {current.basis.label ||
                  '未使用额外条件'}
              </p>

              {garmentStatus?.deleted.length ? (
                <p role="status">
                  当前搭配包含已删除衣物：
                  {garmentStatus.deleted
                    .map(item => item.name)
                    .join('、')}
                </p>
              ) : null}

              {garmentStatus?.paused.length ? (
                <p role="status">
                  当前搭配包含已暂停衣物：
                  {garmentStatus.paused
                    .map(item => item.name)
                    .join('、')}
                </p>
              ) : null}

              <div className="outfit-feedback-actions">
                <span>这套搭配怎么样？</span>

                <button
                  type="button"
                  disabled={controlsDisabled}
                  onClick={() => openFeedback('like')}
                >
                  ♡ 喜欢
                </button>

                <button
                  type="button"
                  disabled={controlsDisabled}
                  onClick={() => openFeedback('dislike')}
                >
                  不喜欢
                </button>
              </div>
            </article>
          )}
        </div>
      </div>

      {feedbackChoice && current && roundView.round && (
        <FeedbackDialog
          key={`${roundView.round.roundId}:${current.id}`}
          result={current}
          roundId={roundView.round.roundId}
          initialDraft={roundView.feedbackDraft}
          initialChoice={feedbackChoice}
          loadImage={loadImage}
          onDraftChange={updateFeedbackDraft}
          onSave={submitFeedback}
          onCancel={cancelFeedback}
        />
      )}

      {feedbackSaved && (
        <FeedbackSavedDialog
          busy={busy}
          error={feedbackSwapError}
          onSwap={() => void swapByFeedback()}
          onReturn={() => {
            if (!operationLock.current) {
              setFeedbackSaved(false);
            }
          }}
        />
      )}
    </>
  );
}
