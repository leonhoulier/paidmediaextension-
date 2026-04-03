/**
 * Meta Ads Manager Platform Adapter
 *
 * Barrel export for the Meta Ads Manager DOM adapter module.
 *
 * @module adapters/meta
 */

// Main adapter class
export { MetaAdapter } from './meta-adapter.js';

// Field extraction
export {
  extractAllFieldValues,
  getCampaignName,
  getCampaignObjective,
  getCampaignBudgetType,
  getCampaignBudgetValue,
  getCampaignCBOEnabled,
  getAdSetName,
  getGeoLocations,
  getAgeRange,
  getGenders,
  getLanguages,
  getCustomAudiences,
  getPlacements,
  getScheduleStartDate,
  getScheduleEndDate,
  getAdName,
  getDestinationUrl,
  getCTAType,
  getPageId,
  getSupportedFieldPaths,
  getReactFiberProps,
  findReactComponentProps,
  findReactComponentState,
  extractFiberPropByPath,
  RemoteEvalBatcher,
  getRemoteEvalBatcher,
  destroyRemoteEvalBatcher,
} from './meta-fields.js';

// Field registry metadata
export {
  getMetaFieldSpec,
  getMetaFieldSpecs,
  getMetaFieldPaths,
  getMetaFieldPathsForEntityLevel,
  getMetaFieldPathsForTier,
  getMetaFieldTier,
  getMetaDomFieldPaths,
  getMetaDomAliasMap,
  getMetaRequireFieldMap,
  getMetaRemoteEvalConfig,
  getMetaRemoteEvalConfigMap,
} from './meta-field-specs.js';

// Selectors and injection points
export {
  findElement,
  findFieldElement,
  findElementByTextContent,
  findElementByProximity,
  getInjectionPointForField,
  getSelectorConfig,
  META_FIELD_SELECTORS,
  PUBLISH_BUTTON_SELECTORS,
} from './meta-selectors.js';

// Types
export type {
  MetaFieldSpec,
  MetaFieldTier,
  MetaRequireFieldMapping,
  MetaRemoteEvalConfig,
} from './meta-field-specs.js';
export type {
  SelectorMethod,
  SelectorStrategy,
  FieldSelectorConfig,
} from './meta-selectors.js';
