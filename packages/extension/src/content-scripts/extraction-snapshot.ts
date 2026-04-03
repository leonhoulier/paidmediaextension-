import { EntityLevel, Platform } from '@media-buying-governance/shared';
import { getMetaFieldPathsForEntityLevel } from '../adapters/meta/meta-field-specs.js';
import { META_FIELD_SELECTORS, peekFieldElement } from '../adapters/meta/meta-selectors.js';
import { GOOGLE_FIELD_SELECTORS, queryByChain, queryWithShadowDom } from '../adapters/google/google-selectors.js';

const VALUE_PREVIEW_LIMIT = 96;

export interface ExtractionSnapshotField {
  fieldPath: string;
  hasValue: boolean;
  selectorConfigured: boolean;
  selectorFound: boolean | null;
  valuePreview: string;
  valueType: 'null' | 'string' | 'number' | 'boolean' | 'array' | 'object';
}

export interface ExtractionSnapshot {
  platform: Platform;
  capturedAt: string;
  totalFields: number;
  extractedFields: number;
  selectorHits: number;
  missingWithSelector: number;
  missingWithoutSelector: number;
  fields: ExtractionSnapshotField[];
}

export function buildExtractionSnapshot(
  platform: Platform,
  fieldValues: Record<string, unknown>,
  options?: {
    entityLevel?: EntityLevel;
  },
): ExtractionSnapshot {
  const fields = getSnapshotFields(platform, fieldValues, options).sort((a, b) =>
    a.fieldPath.localeCompare(b.fieldPath),
  );

  return {
    platform,
    capturedAt: new Date().toISOString(),
    totalFields: fields.length,
    extractedFields: fields.filter((field) => field.hasValue).length,
    selectorHits: fields.filter((field) => field.selectorFound === true).length,
    missingWithSelector: fields.filter(
      (field) => !field.hasValue && field.selectorFound === true,
    ).length,
    missingWithoutSelector: fields.filter(
      (field) => !field.hasValue && field.selectorFound === false,
    ).length,
    fields,
  };
}

export function formatSnapshotValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'string') {
    return truncate(value);
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }

  try {
    return truncate(JSON.stringify(value));
  } catch {
    return truncate(String(value));
  }
}

function getSnapshotFields(
  platform: Platform,
  fieldValues: Record<string, unknown>,
  options?: {
    entityLevel?: EntityLevel;
  },
): ExtractionSnapshotField[] {
  switch (platform) {
    case Platform.META:
      return buildMetaSnapshotFields(fieldValues, options?.entityLevel);
    case Platform.GOOGLE_ADS:
      return buildGoogleSnapshotFields(fieldValues);
    default:
      return Object.keys(fieldValues).map((fieldPath) =>
        createSnapshotField(fieldPath, fieldValues[fieldPath], false, null),
      );
  }
}

function buildMetaSnapshotFields(
  fieldValues: Record<string, unknown>,
  entityLevel?: EntityLevel,
): ExtractionSnapshotField[] {
  const relevantFields = entityLevel
    ? new Set(getMetaFieldPathsForEntityLevel(entityLevel))
    : null;
  const configuredFields = new Set(
    META_FIELD_SELECTORS
      .map((config) => config.fieldPath)
      .filter((fieldPath) => !relevantFields || relevantFields.has(fieldPath)),
  );
  const fieldPaths = new Set([
    ...configuredFields,
    ...Object.keys(fieldValues).filter(
      (fieldPath) => !relevantFields || relevantFields.has(fieldPath),
    ),
  ]);

  return Array.from(fieldPaths).map((fieldPath) => {
    const selectorConfigured = configuredFields.has(fieldPath);
    const selectorFound = selectorConfigured ? peekFieldElement(fieldPath) !== null : null;

    return createSnapshotField(
      fieldPath,
      fieldValues[fieldPath],
      selectorConfigured,
      selectorFound,
    );
  });
}

function buildGoogleSnapshotFields(
  fieldValues: Record<string, unknown>,
): ExtractionSnapshotField[] {
  const configuredFields = new Set(Object.keys(GOOGLE_FIELD_SELECTORS));
  const fieldPaths = new Set([...configuredFields, ...Object.keys(fieldValues)]);

  return Array.from(fieldPaths).map((fieldPath) => {
    const selectorEntry = GOOGLE_FIELD_SELECTORS[fieldPath];
    const selectorConfigured = Boolean(selectorEntry);
    const selectorFound = selectorEntry
      ? (selectorEntry.shadowDom
          ? queryWithShadowDom(selectorEntry.selectors)
          : queryByChain(document, selectorEntry.selectors)) !== null
      : null;

    return createSnapshotField(
      fieldPath,
      fieldValues[fieldPath],
      selectorConfigured,
      selectorFound,
    );
  });
}

function createSnapshotField(
  fieldPath: string,
  value: unknown,
  selectorConfigured: boolean,
  selectorFound: boolean | null,
): ExtractionSnapshotField {
  const hasValue = value !== null && value !== undefined;

  return {
    fieldPath,
    hasValue,
    selectorConfigured,
    selectorFound,
    valuePreview: formatSnapshotValue(value),
    valueType: getValueType(value),
  };
}

function getValueType(
  value: unknown,
): ExtractionSnapshotField['valueType'] {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return 'array';
  }

  switch (typeof value) {
    case 'string':
      return 'string';
    case 'number':
    case 'bigint':
      return 'number';
    case 'boolean':
      return 'boolean';
    default:
      return 'object';
  }
}

function truncate(value: string): string {
  if (value.length <= VALUE_PREVIEW_LIMIT) {
    return value;
  }

  return `${value.slice(0, VALUE_PREVIEW_LIMIT - 1)}...`;
}
