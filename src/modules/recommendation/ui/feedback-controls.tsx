'use client';

import { useRef, useState } from 'react';
import type { FeedbackChoice } from '@/modules/feedback';
import styles from './feedback-controls.module.css';

export function FeedbackControls({ choice, disabled, onRate }: {
  choice?: FeedbackChoice;
  disabled: boolean;
  onRate: (choice: FeedbackChoice) => Promise<void>;
}) {
  const [pending, setPending] = useState<FeedbackChoice>();
  const saving = useRef(false);
  const rate = async (next: FeedbackChoice) => {
    if (disabled || saving.current) return;
    saving.current = true; setPending(next);
    try { await onRate(next); }
    finally { saving.current = false; setPending(undefined); }
  };
  return <div>
    <div className="wardrobe-actions" aria-busy={!!pending}>
      <span>留下你的想法：</span>
      {(['like', 'dislike'] as const).map(value => <button key={value} type="button"
        className={styles.button} disabled={disabled || !!pending} aria-pressed={choice === value}
        onClick={() => void rate(value)}>
        {choice === value && <span aria-hidden="true">✓ </span>}{value === 'like' ? '喜欢' : '不喜欢'}
      </button>)}
    </div>
    <p className={styles.status} role="status" aria-label="反馈状态">
      {pending ? '正在保存反馈…' : choice ? `反馈已保存：${choice === 'like' ? '喜欢' : '不喜欢'}` : '请选择喜欢或不喜欢。'}
    </p>
  </div>;
}
