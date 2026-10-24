import { useId, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Check, CirclePlus, Eye, MapPin, Package, Save } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import {
  TASK_ACTION_CODES,
  TASK_ITEM_CODES,
  TASK_UNIT_CODES,
  type StructuredTaskInstruction,
  type Task,
  type TaskAction,
  type TaskActionCode,
  type TaskItemCode,
  type TaskUnitCode,
} from '@relay-miden/shared';
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
import { useLanguage } from '../../hooks/use-language';

export interface TaskFormProps {
  quick?: boolean;
  task?: Task;
  onSaved?: (task: Task) => void;
  onCancel?: () => void;
}

const UNIT_TEXT_MAP: Record<string, TaskUnitCode> = {
  bottle: 'BOTTLE',
  bottles: 'BOTTLE',
  കുപ്പി: 'BOTTLE',
  പാട്ടിൽ: 'BOTTLE',
  பாட்டில்: 'BOTTLE',
  packet: 'PACKET',
  packets: 'PACKET',
  പാക്കറ്റ്: 'PACKET',
  பாக்கெட்: 'PACKET',
  box: 'BOX',
  boxes: 'BOX',
  പെട്ടി: 'BOX',
  பெட்டி: 'BOX',
  bag: 'BAG',
  bags: 'BAG',
  സഞ്ചി: 'BAG',
  பை: 'BAG',
  liter: 'LITER',
  liters: 'LITER',
  ലിറ്റർ: 'LITER',
  லிட்டர்: 'LITER',
  kilogram: 'KILOGRAM',
  kilograms: 'KILOGRAM',
  kg: 'KILOGRAM',
  കിലോഗ്രാം: 'KILOGRAM',
  கிலோகிராம்: 'KILOGRAM',
  piece: 'PIECE',
  pieces: 'PIECE',
  എണ്ണം: 'PIECE',
  எண்ணிக்கை: 'PIECE',
  person: 'PERSON',
  persons: 'PERSON',
  people: 'PERSON',
  ആളുകൾ: 'PERSON',
  ஆட்கள்: 'PERSON',
};

export function TaskForm({ quick = false, task, onSaved, onCancel }: TaskFormProps) {
  const id = useId();
  const navigate = useNavigate();
  const formRef = useRef<HTMLFormElement>(null);
  const { dict, language, formatTask } = useLanguage();

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
    if (key in errors) {
      setErrors((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
  }

  // Live formatted instruction preview in the current language
  const instructionPreview = useMemo(() => {
    if (draft.mode !== 'structured') return '';
    const instruction: StructuredTaskInstruction = {
      schemaVersion: 1,
      actionCode: draft.actionCode,
      ...(draft.itemCode ? { itemCode: draft.itemCode as TaskItemCode } : {}),
      ...(draft.quantity.trim() ? { quantity: Number(draft.quantity) } : {}),
      ...(draft.unitCode ? { unitCode: draft.unitCode as TaskUnitCode } : {}),
      ...(draft.location.trim() ? { locationText: draft.location.trim() } : {}),
      ...(draft.notes.trim() || draft.description.trim()
        ? { additionalNotes: (draft.notes || draft.description).trim() }
        : {}),
    };
    return formatTask(instruction);
  }, [
    draft.mode,
    draft.actionCode,
    draft.itemCode,
    draft.quantity,
    draft.unitCode,
    draft.location,
    draft.notes,
    draft.description,
    formatTask,
  ]);

  async function submit() {
    const candidateDraft = { ...draft };
    if (candidateDraft.mode === 'structured') {
      if (!candidateDraft.title.trim() && candidateDraft.location.trim()) {
        candidateDraft.title = instructionPreview;
      }
      if (candidateDraft.description.trim() && !candidateDraft.notes.trim()) {
        candidateDraft.notes = candidateDraft.description.trim();
      }
      if (candidateDraft.unit.trim() && !candidateDraft.unitCode) {
        const matched = UNIT_TEXT_MAP[candidateDraft.unit.trim().toLowerCase()];
        if (matched) candidateDraft.unitCode = matched;
      }
    }

    const nextErrors = validateDraft(candidateDraft);
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
        const saved = await taskRepository.updateTask(
          task.id,
          draftToUpdateInput(candidateDraft, language),
        );
        setMessage(dict.form.savedNotice);
        onSaved?.(saved);
      } else {
        const saved = await taskRepository.createTask(draftToCreateInput(candidateDraft, language));
        if (quick) {
          setDraft(createInitialDraft(true));
          setMessage(dict.form.savedNamedNotice(saved.title));
          onSaved?.(saved);
        } else {
          navigate(`/tasks/${saved.id}`, {
            replace: true,
            state: { notice: dict.form.createdNotice },
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
      {task && (
        <h2 className="mb-4 text-base font-semibold">
          {task.instruction ? dict.form.modeStructured : dict.task.detailsTitle} —{' '}
          {dict.task.editButton}
        </h2>
      )}

      {/* Mode switcher: Structured Template vs Free Text */}
      {!task && !quick && (
        <div className="mb-4">
          <div className="flex rounded-md border border-line bg-surface p-1">
            <button
              type="button"
              className={`flex-1 rounded py-1.5 text-xs font-medium transition-colors ${
                draft.mode === 'structured'
                  ? 'bg-brand text-[var(--color-on-primary)]'
                  : 'text-muted hover:text-foreground'
              }`}
              onClick={() => update('mode', 'structured')}
            >
              {dict.form.modeStructured}
            </button>
            <button
              type="button"
              className={`flex-1 rounded py-1.5 text-xs font-medium transition-colors ${
                draft.mode === 'custom'
                  ? 'bg-brand text-[var(--color-on-primary)]'
                  : 'text-muted hover:text-foreground'
              }`}
              onClick={() => {
                setDraft((prev) => ({
                  ...prev,
                  ...createInitialDraft(quick),
                  mode: 'custom',
                }));
              }}
            >
              {dict.form.modeCustom}
            </button>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
            {draft.mode === 'structured' ? dict.form.modeDescription : ''}
          </p>
        </div>
      )}

      <form
        ref={formRef}
        noValidate
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {draft.mode === 'structured' ? (
          <>
            {/* Structured Action Dropdown */}
            <div className="field">
              <label htmlFor={`${id}-actionCode`}>{dict.form.actionLabel}</label>
              <div className="relative">
                <Package
                  size={20}
                  className="pointer-events-none absolute left-3 top-3 text-warning"
                  aria-hidden="true"
                />
                <select
                  id={`${id}-actionCode`}
                  name="actionCode"
                  className="control pl-10"
                  value={draft.actionCode}
                  onChange={(e) => update('actionCode', e.target.value as TaskActionCode)}
                >
                  {TASK_ACTION_CODES.map((code) => (
                    <option key={code} value={code}>
                      {dict.actions[code] ?? code}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Structured Item Dropdown */}
            <div className="field">
              <label htmlFor={`${id}-itemCode`}>
                {dict.form.itemLabel}{' '}
                <span className="font-normal text-muted">{dict.form.optionalTag}</span>
              </label>
              <select
                id={`${id}-itemCode`}
                name="itemCode"
                className="control"
                value={draft.itemCode}
                onChange={(e) => update('itemCode', e.target.value as TaskItemCode)}
              >
                <option value="">{dict.form.itemPlaceholder}</option>
                {TASK_ITEM_CODES.map((code) => (
                  <option key={code} value={code}>
                    {dict.items[code] ?? code}
                  </option>
                ))}
              </select>
            </div>

            {/* Task Title Input */}
            <div className="field">
              <label htmlFor={`${id}-title`}>{dict.form.titleLabel}</label>
              <input
                id={`${id}-title`}
                name="title"
                className="control"
                required
                maxLength={120}
                placeholder={instructionPreview || dict.form.titlePlaceholder}
                value={draft.title}
                onChange={(event) => update('title', event.target.value)}
                aria-invalid={Boolean(errors.title)}
                aria-describedby={errors.title ? `${id}-title-error` : undefined}
              />
            </div>
            {errors.title && (
              <p id={`${id}-title-error`} className="-mt-2 text-xs text-danger" role="alert">
                {errors.title}
              </p>
            )}

            {/* Quantity and Unit Controls */}
            <div className="grid grid-cols-2 gap-3">
              <div className="field">
                <label htmlFor={`${id}-quantity`}>
                  {dict.form.quantityLabel}{' '}
                  <span className="font-normal text-muted">{dict.form.optionalTag}</span>
                </label>
                <input
                  id={`${id}-quantity`}
                  name="quantity"
                  inputMode="numeric"
                  type="number"
                  min="1"
                  max="100000"
                  step="1"
                  placeholder={dict.form.quantityPlaceholder}
                  className="control"
                  value={draft.quantity}
                  onChange={(e) => update('quantity', e.target.value)}
                  aria-invalid={Boolean(errors.quantity)}
                  aria-describedby={errors.quantity ? `${id}-quantity-error` : undefined}
                />
              </div>

              <div className="field">
                <label htmlFor={`${id}-unit`}>{dict.form.unitLabel}</label>
                <div className="grid grid-cols-[1fr_auto] gap-1.5">
                  <input
                    id={`${id}-unit`}
                    name="unit"
                    className="control"
                    placeholder="Bottles"
                    value={draft.unit}
                    onChange={(e) => {
                      const text = e.target.value;
                      const matchedCode = UNIT_TEXT_MAP[text.trim().toLowerCase()];
                      setDraft((prev) => ({
                        ...prev,
                        unit: text,
                        unitCode: matchedCode ?? prev.unitCode,
                      }));
                      if (errors.unit) {
                        setErrors((prev) => {
                          const next = { ...prev };
                          delete next.unit;
                          return next;
                        });
                      }
                    }}
                    aria-invalid={Boolean(errors.unit)}
                    aria-describedby={errors.unit ? `${id}-unit-error` : undefined}
                  />
                  <select
                    id={`${id}-unitCode`}
                    name="unitCode"
                    aria-label="Unit code selection"
                    className="control max-w-28 px-1 text-xs"
                    value={draft.unitCode}
                    onChange={(e) => {
                      const nextVal = e.target.value as TaskUnitCode;
                      setDraft((prev) => ({
                        ...prev,
                        unitCode: nextVal,
                        unit: nextVal ? (dict.units[nextVal] ?? nextVal) : prev.unit,
                      }));
                      if (errors.unit) {
                        setErrors((prev) => {
                          const next = { ...prev };
                          delete next.unit;
                          return next;
                        });
                      }
                    }}
                  >
                    <option value="">{dict.form.unitPlaceholder}</option>
                    {TASK_UNIT_CODES.map((code) => (
                      <option key={code} value={code}>
                        {dict.units[code] ?? code}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
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

            {/* Location Input */}
            <div className="field">
              <label htmlFor={`${id}-location`}>{dict.form.locationLabel}</label>
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
                  placeholder={dict.form.locationPlaceholder}
                  value={draft.location}
                  onChange={(e) => update('location', e.target.value)}
                  aria-invalid={Boolean(errors.location)}
                  aria-describedby={errors.location ? `${id}-location-error` : undefined}
                />
              </div>
            </div>
            {errors.location && (
              <p id={`${id}-location-error`} className="-mt-2 text-xs text-danger" role="alert">
                {errors.location}
              </p>
            )}

            {/* Priority Selector */}
            <PrioritySelector
              name={`${id}-priority`}
              value={draft.priority}
              onChange={(value) => update('priority', value)}
            />

            {/* Live Instruction Preview Box */}
            <div className="rounded-lg border border-line bg-surface p-3.5">
              <div className="flex items-center gap-2 text-brand">
                <Eye size={16} />
                <span className="text-xs font-semibold">{dict.form.livePreviewLabel}</span>
              </div>
              <p className="mt-2 text-sm font-medium leading-relaxed">
                {instructionPreview || dict.form.livePreviewEmpty}
              </p>
            </div>

            {/* Description / Additional Notes (with untranslated warning) */}
            <div className="field">
              <label htmlFor={`${id}-description`}>
                {dict.form.descriptionLabel}{' '}
                <span className="font-normal text-muted">{dict.form.optionalTag}</span>
              </label>
              <textarea
                id={`${id}-description`}
                name="description"
                rows={quick ? 2 : 3}
                className="control resize-y"
                placeholder={dict.form.descriptionPlaceholder}
                value={draft.notes || draft.description}
                maxLength={1000}
                onChange={(e) => {
                  const val = e.target.value;
                  setDraft((prev) => ({ ...prev, notes: val, description: val }));
                  if (errors.notes) {
                    setErrors((prev) => {
                      const next = { ...prev };
                      delete next.notes;
                      return next;
                    });
                  }
                }}
                aria-invalid={Boolean(errors.notes || errors.description)}
              />
              <span className="text-[10px] text-muted">{dict.form.untranslatedNoteNotice}</span>
            </div>
          </>
        ) : (
          <>
            {/* Free-text / Custom Mode */}
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
                      {dict.legacyActions[option.value] ?? option.label}
                    </option>
                  ))}
                </select>
              </div>
            </label>

            <label className="field" htmlFor={`${id}-title`}>
              {dict.form.titleLabel}
              <input
                id={`${id}-title`}
                name="title"
                className="control"
                required
                maxLength={120}
                placeholder={dict.form.titlePlaceholder}
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
              <label className="field" htmlFor={`${id}-quantity-custom`}>
                {dict.form.quantityLabel}{' '}
                <span className="font-normal text-muted">{dict.form.optionalTag}</span>
                <input
                  id={`${id}-quantity-custom`}
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
              <label className="field" htmlFor={`${id}-unit-custom`}>
                {dict.form.unitLabel}
                <input
                  id={`${id}-unit-custom`}
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

            <label className="field" htmlFor={`${id}-location-custom`}>
              {dict.form.locationLabel}
              <div className="relative">
                <MapPin
                  size={17}
                  className="pointer-events-none absolute left-3 top-3.5"
                  aria-hidden="true"
                />
                <input
                  id={`${id}-location-custom`}
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
              {dict.form.descriptionLabel}{' '}
              <span className="font-normal text-muted">{dict.form.optionalTag}</span>
              <textarea
                id={`${id}-description`}
                name="description"
                rows={quick ? 2 : 4}
                className="control resize-y"
                placeholder={dict.form.descriptionPlaceholder}
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
          </>
        )}

        {/* Action Buttons */}
        <div className={task ? 'grid grid-cols-2 gap-3' : ''}>
          {task && (
            <button type="button" className="button-secondary w-full" onClick={onCancel}>
              {dict.form.cancelButton}
            </button>
          )}
          <button type="submit" className="button-primary w-full" disabled={saving}>
            {task ? <Save size={18} /> : <CirclePlus size={18} />}
            {saving
              ? dict.form.savingButton
              : task
                ? dict.form.saveChangesButton
                : dict.form.createTaskButton}
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
