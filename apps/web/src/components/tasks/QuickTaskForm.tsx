import { useId, useRef, useState } from 'react';
import { ArrowUpRight, CirclePlus, MapPin, Package, Check } from 'lucide-react';
import { Link } from 'react-router';
import { PrioritySelector } from './PrioritySelector';
import { initialDraft, validateDraft, type TaskDraft, type DraftErrors } from '../../lib/task-form';

export function QuickTaskForm({ quick = false }: { quick?: boolean }) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [draft, setDraft] = useState<TaskDraft>({ ...initialDraft });
  const [errors, setErrors] = useState<DraftErrors>({});
  const [preview, setPreview] = useState<TaskDraft | null>(null);
  function update<K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
    setPreview(null);
    if (key in errors) setErrors((current) => ({ ...current, [key]: undefined }));
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
      <form
        ref={formRef}
        noValidate
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const nextErrors = validateDraft(draft);
          setErrors(nextErrors);
          if (Object.keys(nextErrors).length) {
            setPreview(null);
            const first = Object.keys(nextErrors)[0];
            formRef.current?.querySelector<HTMLInputElement>(`[name="${first}"]`)?.focus();
            return;
          }
          setPreview({ ...draft, location: draft.location.trim() });
        }}
      >
        <label className="field" htmlFor={`${id}-type`}>
          Task Type
          <div className="relative">
            <Package
              size={20}
              className="pointer-events-none absolute left-3 top-3 text-warning"
              aria-hidden="true"
            />
            <select
              id={`${id}-type`}
              className="control pl-10"
              value={draft.type}
              onChange={(event) => update('type', event.target.value)}
            >
              {[
                'Deliver supplies',
                'Medical assistance',
                'Report an issue',
                'Volunteer support',
              ].map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </div>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="field" htmlFor={`${id}-quantity`}>
            Quantity
            <input
              id={`${id}-quantity`}
              name="quantity"
              inputMode="numeric"
              type="number"
              min="1"
              max="100000"
              step="1"
              required
              className="control"
              value={draft.quantity}
              onChange={(event) => update('quantity', event.target.value)}
              aria-invalid={Boolean(errors.quantity)}
              aria-describedby={errors.quantity ? `${id}-quantity-error` : undefined}
            />
          </label>
          <label className="field" htmlFor={`${id}-unit`}>
            Unit
            <select
              id={`${id}-unit`}
              className="control"
              value={draft.unit}
              onChange={(event) => update('unit', event.target.value)}
            >
              {['Bottles', 'Packets', 'Blankets', 'Volunteers', 'Reports', 'Items'].map((unit) => (
                <option key={unit}>{unit}</option>
              ))}
            </select>
          </label>
        </div>
        {errors.quantity && (
          <p id={`${id}-quantity-error`} className="-mt-2 text-xs text-danger" role="alert">
            {errors.quantity}
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
        <label className="field" htmlFor={`${id}-notes`}>
          Notes (optional)
          <textarea
            id={`${id}-notes`}
            name="notes"
            rows={quick ? 2 : 3}
            className="control resize-y"
            placeholder="Optional — e.g. near the main gate, needed within 1 hour…"
            value={draft.notes}
            maxLength={500}
            onChange={(event) => update('notes', event.target.value)}
            aria-invalid={Boolean(errors.notes)}
            aria-describedby={errors.notes ? `${id}-notes-error` : undefined}
          />
        </label>
        {errors.notes && (
          <p id={`${id}-notes-error`} className="-mt-2 text-xs text-danger" role="alert">
            {errors.notes}
          </p>
        )}
        <button type="submit" className="button-primary w-full">
          <CirclePlus size={18} />
          Create Task
        </button>
        <p className="text-center text-[10px] leading-relaxed text-muted">
          Preview only. Tasks are not saved in Phase 1.
        </p>
        {preview && (
          <div role="status" className="border-t border-line pt-4">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Check size={16} />
              Task preview ready — not saved
            </p>
            <p className="mt-2 break-words text-xs leading-relaxed text-muted">
              {preview.type} · {preview.quantity} {preview.unit.toLowerCase()}
              <br />
              {preview.location} · {preview.priority} priority
            </p>
            <p className="mt-2 text-xs text-muted">
              This preview disappears when you leave or refresh.
            </p>
          </div>
        )}
      </form>
    </section>
  );
}
