import { useId, useRef, useState } from 'react';
import { ArrowUpRight, Check, CirclePlus, MapPin, Package, Save } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import type { Task, TaskAction } from '@relay-miden/shared';
import { PrioritySelector } from './PrioritySelector';
import {
  actionOptions,
  createInitialDraft,
  draftToCreateInput,
  draftToUpdateInput,
  taskToDraft,
  validateDraft,
  type DraftErrors,
  type TaskDraft,
} from '../../lib/task-form';
import { readableDatabaseError } from '../../db/errors';
import { taskRepository } from '../../db/task-repository';

export interface TaskFormProps {
  quick?: boolean;
  task?: Task;
  onSaved?: (task: Task) => void;
  onCancel?: () => void;
}

export function TaskForm({ quick = false, task, onSaved, onCancel }: TaskFormProps) {
  const id = useId();
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState<TaskDraft>(() =>
    task ? taskToDraft(task) : createInitialDraft(quick),
  );
  const [errors, setErrors] = useState<DraftErrors>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [saveError, setSaveError] = useState('');

  function update<K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage('');
    setSaveError('');
    if (key in errors) setErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function submit() {
    const nextErrors = validateDraft(draft);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      const first = Object.keys(nextErrors)[0];
      formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }

    setSaving(true);
    setSaveError('');
    try {
      if (task) {
        const saved = await taskRepository.updateTask(task.id, draftToUpdateInput(draft));
        setMessage('Changes saved on this device.');
        onSaved?.(saved);
      } else {
        const saved = await taskRepository.createTask(draftToCreateInput(draft));
        if (quick) {
          setDraft(createInitialDraft(true));
          setMessage(`“${saved.title}” saved on this device.`);
          onSaved?.(saved);
        } else {
          navigate(`/tasks/${saved.id}`, {
            replace: true,
            state: { notice: 'Task saved on this device.' },
          });
        }
      }
    } catch (error) {
      setSaveError(readableDatabaseError(error));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className={`panel p-4 md:p-5 ${quick ? '' : 'max-w-xl'}`}>
      {quick && (
        <div className="panel-heading mb-4">
          <h2>Create Quick Task</h2>
          <Link
            to="/create"
            aria-label="Open full task form"
            className="flex min-h-9 min-w-9 items-center justify-end"
          >
            <ArrowUpRight size={16} />
          </Link>
        </div>
      )}
      {task && <h2 className="mb-4 text-base font-semibold">Edit task</h2>}
      <form
        ref={formRef}
        noValidate
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className="field" htmlFor={`${id}-action`}>
          Task Type
          <div className="relative">
            <Package
              size={20}
              className="pointer-events-none absolute left-3 top-3 text-warning"
              aria-hidden="true"
            />
            <select
              id={`${id}-action`}
              name="action"
              className="control pl-10"
              value={draft.action}
              onChange={(event) => update('action', event.target.value as TaskAction)}
            >
              {actionOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </label>

        <label className="field" htmlFor={`${id}-title`}>
          Task Title
          <input
            id={`${id}-title`}
            name="title"
            className="control"
            required
            maxLength={120}
            placeholder="What needs to be done?"
            value={draft.title}
            onChange={(event) => update('title', event.target.value)}
            aria-invalid={Boolean(errors.title)}
            aria-describedby={errors.title ? `${id}-title-error` : undefined}
          />
        </label>
        {errors.title && (
          <p id={`${id}-title-error`} className="-mt-2 text-xs text-danger" role="alert">
            {errors.title}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <label className="field" htmlFor={`${id}-quantity`}>
            Quantity <span className="font-normal text-muted">(optional)</span>
            <input
              id={`${id}-quantity`}
              name="quantity"
              inputMode="numeric"
              type="number"
              min="1"
              max="100000"
              step="1"
              className="control"
              value={draft.quantity}
              onChange={(event) => update('quantity', event.target.value)}
              aria-invalid={Boolean(errors.quantity)}
              aria-describedby={errors.quantity ? `${id}-quantity-error` : undefined}
            />
          </label>
          <label className="field" htmlFor={`${id}-unit`}>
            Unit
            <input
              id={`${id}-unit`}
              name="unit"
              className="control"
              maxLength={40}
              placeholder="Bottles"
              value={draft.unit}
              onChange={(event) => update('unit', event.target.value)}
              aria-invalid={Boolean(errors.unit)}
              aria-describedby={errors.unit ? `${id}-unit-error` : undefined}
            />
          </label>
        </div>
        {(errors.quantity || errors.unit) && (
          <p
            id={errors.quantity ? `${id}-quantity-error` : `${id}-unit-error`}
            className="-mt-2 text-xs text-danger"
            role="alert"
          >
            {errors.quantity ?? errors.unit}
          </p>
        )}

        <label className="field" htmlFor={`${id}-location`}>
          Location
          <div className="relative">
            <MapPin
              size={17}
              className="pointer-events-none absolute left-3 top-3.5"
              aria-hidden="true"
            />
            <input
              id={`${id}-location`}
              name="location"
              className="control pl-9"
              required
              maxLength={160}
              value={draft.location}
              onChange={(event) => update('location', event.target.value)}
              aria-invalid={Boolean(errors.location)}
              aria-describedby={errors.location ? `${id}-location-error` : undefined}
            />
          </div>
        </label>
        {errors.location && (
          <p id={`${id}-location-error`} className="-mt-2 text-xs text-danger" role="alert">
            {errors.location}
          </p>
        )}

        <PrioritySelector
          name={`${id}-priority`}
          value={draft.priority}
          onChange={(value) => update('priority', value)}
        />

        <label className="field" htmlFor={`${id}-description`}>
          Description <span className="font-normal text-muted">(optional)</span>
          <textarea
            id={`${id}-description`}
            name="description"
            rows={quick ? 2 : 4}
            className="control resize-y"
            placeholder="Add details that will help someone complete this task…"
            value={draft.description}
            maxLength={1000}
            onChange={(event) => update('description', event.target.value)}
            aria-invalid={Boolean(errors.description)}
            aria-describedby={errors.description ? `${id}-description-error` : undefined}
          />
        </label>
        {errors.description && (
          <p id={`${id}-description-error`} className="-mt-2 text-xs text-danger" role="alert">
            {errors.description}
          </p>
        )}

        <div className={task ? 'grid grid-cols-2 gap-3' : ''}>
          {task && (
            <button type="button" className="button-secondary w-full" onClick={onCancel}>
              Cancel
            </button>
          )}
          <button type="submit" className="button-primary w-full" disabled={saving}>
            {task ? <Save size={18} /> : <CirclePlus size={18} />}
            {saving ? 'Saving locally…' : task ? 'Save Changes' : 'Create Task'}
          </button>
        </div>
        {!task && (
          <p className="text-center text-[10px] leading-relaxed text-muted">
            Saved privately in IndexedDB on this device.
          </p>
        )}
        {message && (
          <p
            role="status"
            className="flex items-center gap-2 border-t border-line pt-4 text-sm text-brand"
          >
            <Check size={16} /> {message}
          </p>
        )}
        {saveError && (
          <p role="alert" className="border-t border-line pt-4 text-sm text-danger">
            {saveError}
          </p>
        )}
      </form>
    </section>
  );
}
