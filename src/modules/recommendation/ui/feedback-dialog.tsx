
'use client';

import {
  useEffect,
  useRef,
  useState
} from 'react';

import type {
  FeedbackDraft,
  OutfitResult
} from '@/modules/session';

import { OutfitImage } from './outfit-image';

type Choice = 'like' | 'dislike';
type Scope = 'once' | 'permanent';

type LoadImage =
  (id: string) => Promise<Blob | undefined>;

type DraftInput =
  Omit<FeedbackDraft, 'updatedAt'>;

type SubmitInput = {
  requestId: string;
  choice: Choice;
  reason: string;
  scope: Scope;
};

const REASONS: Record<Choice, string[]> = {
  like: [
    '颜色搭配好',
    '整体风格喜欢',
    '适合使用场景',
    '单品组合协调',
    '符合我的审美'
  ],

  dislike: [
    '颜色不喜欢',
    '风格不合适',
    '场景不合适',
    '单品不合适',
    '搭配不够协调',
    '不符合我的审美'
  ]
};

export function FeedbackDialog({
  result,
  roundId,
  initialDraft,
  initialChoice,
  loadImage,
  onDraftChange,
  onSave,
  onCancel
}: {
  result: OutfitResult;
  roundId: string;
  initialDraft?: FeedbackDraft;
  initialChoice: Choice;
  loadImage: LoadImage;

  onDraftChange:
    (draft: DraftInput) => Promise<void>;

  onSave:
    (input: SubmitInput) => Promise<void>;

  onCancel: () => Promise<void>;
}) {
  const restored =
    initialDraft?.roundId === roundId &&
    initialDraft?.resultId === result.id
      ? initialDraft
      : undefined;

  const [choice, setChoice] =
    useState<Choice>(
      restored?.choice ?? initialChoice
    );

  const [reason, setReason] =
    useState(restored?.reason ?? '');

  const [scope, setScope] =
    useState<Scope>(
      restored?.scope ?? 'once'
    );

  const [saving, setSaving] =
    useState(false);

  const [draftSaving, setDraftSaving] =
    useState(false);

  const [error, setError] =
    useState('');

  // 当前组件生命周期。
  const mounted = useRef(false);

  // 提交与取消共用操作锁。
  const actionLock = useRef(false);

  // 草稿按顺序保存。
  const queue =
    useRef<Promise<void>>(Promise.resolve());

  // 草稿版本号，避免旧请求覆盖最新提示。
  const draftRevision = useRef(0);

  // 当前草稿的最新值。
  const draftRef = useRef<DraftInput>({
    roundId,
    resultId: result.id,
    choice,
    reason,
    scope
  });

  // 同一份正式反馈重复提交时使用相同 ID。
  const requestRef = useRef<{
    id: string;
    fingerprint: string;
  } | null>(null);

  const persistDraft = (
    next: DraftInput
  ) => {
    const revision = ++draftRevision.current;

    if (mounted.current) {
      setDraftSaving(true);
    }

    const task = queue.current.then(
      () => onDraftChange(next)
    );

    // 允许失败后继续保存后续版本。
    queue.current = task.catch(
      () => undefined
    );

    void task.then(
      () => {
        if (
          mounted.current &&
          draftRevision.current === revision
        ) {
          setDraftSaving(false);

          setError(previous =>
            previous === '反馈草稿保存失败，请重试。'
              ? ''
              : previous
          );
        }
      },

      () => {
        if (
          mounted.current &&
          draftRevision.current === revision
        ) {
          setDraftSaving(false);
          setError(
            '反馈草稿保存失败，请重试。'
          );
        }
      }
    );

    return task;
  };

  // 打开弹窗时保存初始草稿。
  useEffect(() => {
    mounted.current = true;

    void persistDraft(
      draftRef.current
    ).catch(() => undefined);

    return () => {
      mounted.current = false;
    };
  }, []);

  // 每次修改立即进入保存队列。
  const updateDraft = (
    patch: Partial<
      Pick<DraftInput, 'choice' | 'reason' | 'scope'>
    >
  ) => {
    if (actionLock.current) return;

    const next: DraftInput = {
      ...draftRef.current,
      ...patch
    };

    draftRef.current = next;

    void persistDraft(next).catch(
      () => undefined
    );
  };

  const changeChoice = (
    next: Choice
  ) => {
    if (actionLock.current) return;

    setChoice(next);
    updateDraft({ choice: next });
  };

  const changeReason = (
    next: string
  ) => {
    if (actionLock.current) return;

    const value = next.slice(0, 300);

    setReason(value);
    updateDraft({ reason: value });
  };

  const changeScope = (
    next: Scope
  ) => {
    if (actionLock.current) return;

    setScope(next);
    updateDraft({ scope: next });
  };

  // 保存反馈。
  const submit = async () => {
    if (actionLock.current) return;

    actionLock.current = true;

    setSaving(true);
    setError('');

    try {
      const latest = draftRef.current;

      if (!latest.choice) {
        throw new Error(
          '请选择喜欢或不喜欢。'
        );
      }

      const normalized = {
        choice: latest.choice,
        reason: latest.reason.trim(),
        scope: latest.scope
      };

      const fingerprint =
        JSON.stringify(normalized);

      // 相同内容重试沿用原请求 ID。
      if (
        !requestRef.current ||
        requestRef.current.fingerprint !== fingerprint
      ) {
        requestRef.current = {
          id: crypto.randomUUID(),
          fingerprint
        };
      }

      // 等待最后一次草稿写入完成。
      await persistDraft(latest);

      // 若已经离开页面，不继续发起正式保存。
      if (!mounted.current) return;

      await onSave({
        requestId: requestRef.current.id,
        ...normalized
      });

    } catch {
      if (mounted.current) setError('反馈保存失败，已保留填写内容，请重试。');
    } finally {
      actionLock.current = false;

      if (mounted.current) {
        setSaving(false);
      }
    }
  };

  // 取消反馈，仅删除未提交草稿。
  const cancel = async () => {
    if (actionLock.current) return;

    actionLock.current = true;

    setSaving(true);
    setError('');

    try {
      // 防止取消后旧草稿又写回数据库。
      await queue.current;

      if (!mounted.current) return;

      await onCancel();

    } catch (e) {
      if (mounted.current) {
        setError(
          e instanceof Error
            ? e.message
            : '取消失败，请重试。'
        );
      }
    } finally {
      actionLock.current = false;

      if (mounted.current) {
        setSaving(false);
      }
    }
  };

  return (
    <div
      className="feedback-overlay"
      role="presentation"
    >
      <section
        className="feedback-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-title"
        aria-busy={saving}
      >
        <header className="feedback-heading">
          <div>
            <span>OUTFIT FEEDBACK</span>

            <h2 id="feedback-title">
              这套搭配怎么样？
            </h2>
          </div>

          <button
            type="button"
            aria-label="关闭反馈"
            disabled={saving}
            onClick={() => void cancel()}
          >
            ×
          </button>
        </header>

        <div className="feedback-outfit">
          {result.snapshots.map(item => (
            <figure key={item.id}>
              <OutfitImage
                item={item}
                load={loadImage}
              />

              <figcaption>
                {item.name}
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="feedback-choice">
          <button
            type="button"
            aria-pressed={choice === 'like'}
            disabled={saving}
            onClick={() => changeChoice('like')}
          >
            <span>♡</span>
            喜欢
          </button>

          <button
            type="button"
            aria-pressed={choice === 'dislike'}
            disabled={saving}
            onClick={() => changeChoice('dislike')}
          >
            <span>✕</span>
            不喜欢
          </button>
        </div>

        <div className="feedback-reasons">
          <strong>原因（可选）</strong>

          <div>
            {REASONS[choice].map(item => (
              <button
                key={item}
                type="button"
                disabled={saving}
                aria-pressed={reason === item}
                onClick={() =>
                  changeReason(
                    reason === item ? '' : item
                  )
                }
              >
                {item}
              </button>
            ))}
          </div>

          <textarea
            value={reason}
            maxLength={300}
            disabled={saving}
            placeholder="也可以补充你的具体想法，不填写也可以。"
            onChange={event =>
              changeReason(event.target.value)
            }
          />

          <span>
            {reason.length}/300
          </span>
        </div>

        <div className="feedback-scope">
          <strong>适用范围</strong>

          <label>
            <input
              type="radio"
              name="feedback-scope"
              checked={scope === 'once'}
              disabled={saving}
              onChange={() => changeScope('once')}
            />

            仅本轮适用
          </label>

          <label>
            <input
              type="radio"
              name="feedback-scope"
              checked={scope === 'permanent'}
              disabled={saving}
              onChange={() =>
                changeScope('permanent')
              }
            />

            永久适用
          </label>

          <p>
            仅本轮适用的反馈会参与本轮连续调整，
            开启新一轮后清除。
          </p>

          <p>
            永久适用的反馈会同步保存到「我的偏好」。
          </p>
        </div>

        {draftSaving && !saving && (
          <p role="status">
            正在保存反馈草稿…
          </p>
        )}

        {error && (
          <p
            className="feedback-error"
            role="alert"
          >
            {error}
          </p>
        )}

        <footer>
          <button
            type="button"
            disabled={saving}
            onClick={() => void cancel()}
          >
            取消
          </button>

          <button
            type="button"
            disabled={saving}
            onClick={() => void submit()}
          >
            {saving
              ? '正在处理…'
              : '提交反馈'}
          </button>
        </footer>
      </section>
    </div>
  );
}
