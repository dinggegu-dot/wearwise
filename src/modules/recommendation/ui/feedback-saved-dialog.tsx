
'use client';

export function FeedbackSavedDialog({
  busy,
  error,
  onSwap,
  onReturn
}: {
  busy: boolean;
  error?: string;
  onSwap: () => void;
  onReturn: () => void;
}) {
  return (
    <div className="feedback-overlay">
      <section
        className="feedback-dialog feedback-saved-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-saved-title"
      >
        <div className="feedback-success-icon">
          ✓
        </div>

        <h2 id="feedback-saved-title">
          反馈已保存
        </h2>

        <p>
          我们会根据你的评价调整后续搭配。
        </p>

        {error && (
          <p role="alert" className="feedback-error">
            {error}
          </p>
        )}

        <button
          type="button"
          className="feedback-primary"
          disabled={busy}
          onClick={onSwap}
        >
          {busy ? '正在根据反馈调整…' : '根据反馈换一套'}
        </button>

        <button
          type="button"
          className="feedback-secondary"
          disabled={busy}
          onClick={onReturn}
        >
          暂时不换，返回
        </button>
      </section>
    </div>
  );
}
