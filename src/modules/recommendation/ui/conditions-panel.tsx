
'use client';

import { useEffect, useState } from 'react';
import type { SettingsDraft, GarmentSnapshot } from '@/modules/session';
import { STYLE_TAGS, SCENE_TAGS } from '@/shared/domain/tags';

type LoadImage = (id: string) => Promise<Blob | undefined>;

interface ConditionsPanelProps {
  settings: SettingsDraft;
  onChange: (next: SettingsDraft) => void | Promise<void>;
  onAddImage: (file: File) => Promise<void>;
  onRemoveImage: (id: string) => void | Promise<void>;
  loadImage: LoadImage;
}

function ReferencePreview({
  id,
  load,
  onRemove,
  disabled
}: {
  id: string;
  load: LoadImage;
  onRemove: () => void;
  disabled: boolean;
}) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl = '';

    void load(id).then(blob => {
      if (!active) return;
      if (!blob) {
        setError(true);
        return;
      }

      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    }).catch(() => {
      if (active) setError(true);
    });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, load]);

  return (
    <div className="condition-reference-item">
      {url ? (
        <img src={url} alt="本次喜好参考图" />
      ) : (
        <span>{error ? '图片不可用' : '加载中…'}</span>
      )}

      <button
  type="button"
  disabled={disabled}
  onClick={onRemove}
  aria-label="删除参考图"
>
  ×
</button>
    </div>
  );
}

function ConditionSwitch({
  label,
  description,
  checked,
  onChange
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="condition-switch-row">
      <div>
        <strong>{label}</strong>
        <p>{description}</p>
      </div>

      <label className="condition-switch">
        <input
          type="checkbox"
          checked={checked}
          onChange={event => onChange(event.target.checked)}
          aria-label={label}
        />
        <span>{checked ? '开启' : '关闭'}</span>
      </label>
    </div>
  );
}

export function ConditionsPanel({
  settings,
  onChange,
  onAddImage,
  onRemoveImage,
  loadImage
}: ConditionsPanelProps) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const update = (patch: Partial<SettingsDraft>) => {
    void onChange({
      ...settings,
      ...patch
    });
  };

  const updatePreference = (
    patch: Partial<SettingsDraft['preference']>
  ) => {
    update({
      preference: {
        ...settings.preference,
        ...patch
      }
    });
  };

  const updateScene = (
    patch: Partial<SettingsDraft['scene']>
  ) => {
    update({
      scene: {
        ...settings.scene,
        ...patch
      }
    });
  };

  const toggleStyle = (tag: typeof STYLE_TAGS[number]) => {
    const current = settings.preference.styleTags;

    const next = current.includes(tag)
      ? current.filter(item => item !== tag)
      : [...current, tag];

    updatePreference({ styleTags: next });
  };

  const upload = async (file?: File) => {
    if (!file) return;

    setUploadError('');

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setUploadError('仅支持 JPG、PNG、WebP 图片。');
      return;
    }

    if (file.size === 0 || file.size > 4 * 1024 * 1024) {
      setUploadError('图片大小不能超过 4MB。');
      return;
    }

    if (settings.preference.imageIds.length >= 6) {
      setUploadError('最多上传 6 张参考图。');
      return;
    }

    setUploading(true);

    try {
      await onAddImage(file);
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : '图片上传失败，请重试。'
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="conditions-panel">
      <h2>推荐条件</h2>

      {/* 1. 长期记忆 */}
      <section className="condition-section">
        <ConditionSwitch
          label="长期记忆与偏好"
          description="参考我的长期穿搭偏好和反馈"
          checked={settings.memory}
          onChange={memory => update({ memory })}
        />
      </section>

      {/* 2. 天气 */}
      <section className="condition-section">
        <ConditionSwitch
          label="天气"
          description="根据当前城市天气调整穿搭"
          checked={settings.weather}
          onChange={weather => update({ weather })}
        />
      </section>

      {/* 3. 本次喜好 */}
      <section className="condition-section">
        <ConditionSwitch
          label="本次喜好"
          description="仅影响本轮推荐"
          checked={settings.preference.enabled}
          onChange={enabled => updatePreference({ enabled })}
        />

        <div
          className="condition-content"
          aria-disabled={!settings.preference.enabled}
          data-disabled={!settings.preference.enabled}
        >
          <label>
            本次穿搭要求
            <textarea
              value={settings.preference.text}
              maxLength={500}
              disabled={!settings.preference.enabled}
              placeholder="例如：喜欢深色、简约的搭配，希望显得干练一些。"
              onChange={event =>
                updatePreference({ text: event.target.value })
              }
            />
          </label>

          <div className="condition-subtitle">
            风格偏好
          </div>

          <div className="condition-tags">
            {STYLE_TAGS.map(tag => (
              <button
                type="button"
                key={tag}
                disabled={!settings.preference.enabled}
                aria-pressed={settings.preference.styleTags.includes(tag)}
                onClick={() => toggleStyle(tag)}
              >
                {tag}
              </button>
            ))}
          </div>

          <div className="condition-subtitle">
            参考图片（最多 6 张）
          </div>

          <div className="condition-references">
            {settings.preference.imageIds.map(id => (
              <ReferencePreview
  key={id}
  id={id}
  load={loadImage}
  disabled={!settings.preference.enabled}
  onRemove={() => void onRemoveImage(id)}
/>
            ))}

            {settings.preference.imageIds.length < 6 && (
              <label className="condition-upload">
                <span>{uploading ? '上传中…' : '+ 添加图片'}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={!settings.preference.enabled || uploading}
                  onChange={event => {
                    const file = event.target.files?.[0];
                    void upload(file);
                    event.target.value = '';
                  }}
                />
              </label>
            )}
          </div>

          {uploadError && (
            <p role="alert">{uploadError}</p>
          )}
        </div>
      </section>

      {/* 4. 本次场景 */}
      <section className="condition-section">
        <ConditionSwitch
          label="本次场景"
          description="告诉 AI 这次穿搭的使用场景"
          checked={settings.scene.enabled}
          onChange={enabled => updateScene({ enabled })}
        />

        <div
          className="condition-content"
          aria-disabled={!settings.scene.enabled}
          data-disabled={!settings.scene.enabled}
        >
          <div className="condition-tags">
            {SCENE_TAGS.map(tag => (
              <button
                type="button"
                key={tag}
                disabled={!settings.scene.enabled}
                aria-pressed={settings.scene.selected === tag}
                onClick={() =>
                  updateScene({
                    selected:
                      settings.scene.selected === tag ? null : tag
                  })
                }
              >
                {tag}
              </button>
            ))}
          </div>

          <label>
            自定义补充
            <input
              value={settings.scene.custom}
              maxLength={100}
              disabled={!settings.scene.enabled}
              placeholder="例如：朋友聚会后去看电影"
              onChange={event =>
                updateScene({ custom: event.target.value })
              }
            />
          </label>
        </div>
      </section>

      <p className="conditions-tip">
        修改开关或填写内容后，请点击「生成穿搭」应用。
      </p>
    </div>
  );
}
