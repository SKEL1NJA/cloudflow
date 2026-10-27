import { workflowDefinitionSchema } from '@cloudflow/shared';
import { get, set, type FieldErrors, type Resolver } from 'react-hook-form';
import { convertForm, type WorkflowFormValues } from './form-values';

export interface IssueLike {
  path: readonly PropertyKey[];
  message: string;
  code?: string | undefined;
  issues?: readonly { message: string }[] | undefined;
}

export function isIssueLike(value: unknown): value is IssueLike {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return Array.isArray(candidate.path) && typeof candidate.message === 'string';
}

export function messageOf(issue: IssueLike): string {
  return issue.code === 'invalid_key'
    ? (issue.issues?.[0]?.message ?? issue.message)
    : issue.message;
}

export function toFormPath(issue: IssueLike, values: WorkflowFormValues): string {
  const [root, index, section, field, rest, leaf] = issue.path;

  if (issue.path.length === 0) return 'root';
  if (root !== 'steps') return issue.path.map(String).join('.');
  if (typeof index !== 'number') return 'steps.root';

  const base = `steps.${index}`;
  if (section === undefined) return `${base}.type`;
  if (section !== 'config') return `${base}.${String(section)}`;
  if (field === undefined) return `${base}.root`;

  if (field === 'headers') {
    if (typeof rest !== 'string') return `${base}.headers.root`;
    const row =
      values.steps[index]?.headers.findIndex((header) => header.name.trim() === rest) ?? -1;
    if (row < 0) return `${base}.headers.root`;
    return `${base}.headers.${row}.${issue.code === 'invalid_key' ? 'name' : 'value'}`;
  }

  if (field === 'mappings') {
    if (typeof rest !== 'number') return `${base}.mappings.root`;
    return `${base}.mappings.${rest}.${typeof leaf === 'string' ? leaf : 'target'}`;
  }

  return `${base}.${String(field)}`;
}

export const workflowResolver: Resolver<WorkflowFormValues> = (values) => {
  const { payload, problems } = convertForm(values);
  const errors: Record<string, unknown> = {};

  const add = (path: string, type: string, message: string) => {
    if (path !== '' && get(errors, path) === undefined) set(errors, path, { type, message });
  };

  for (const problem of problems) add(problem.path, 'form', problem.message);

  const result = workflowDefinitionSchema.safeParse(payload);
  if (!result.success) {
    for (const issue of result.error.issues) {
      add(toFormPath(issue, values), issue.code, messageOf(issue));
    }
  }

  if (Object.keys(errors).length === 0) return { values, errors: {} };
  return { values: {}, errors: errors as FieldErrors<WorkflowFormValues> };
};
