/**
 * Google Ads Platform Adapter
 *
 * Public API for the Google Ads DOM adapter. Exports the adapter class,
 * field extraction utilities, selector constants, and wizard step types.
 */

// Main adapter
export { GoogleAdsAdapter, WizardStep } from './google-adapter.js';

// Field extraction
export {
  extractAllFieldValues,
  extractFieldValuesViaRemoteEval,
  getCampaignName,
  getCampaignType,
  getBudgetValue,
  getBiddingStrategy,
  getGeoTargets,
  getLanguages,
  getBrandSafety,
  getStartDate,
  getEndDate,
  getAdGroupName,
  getCpcBid,
  getHeadlines,
  getDescriptions,
  getFinalUrl,
  getDisplayPath,
  buildBatchEvalQuery,
  sendRemoteEvalQuery,
} from './google-fields.js';

// Selectors and DOM utilities
export {
  GOOGLE_FIELD_SELECTORS,
  GOOGLE_INJECTION_SELECTORS,
  KNOWN_SHADOW_HOSTS,
  queryByChain,
  queryAllByChain,
  queryWithShadowDom,
  queryAllWithShadowDom,
  findElementByText,
  findButtonByText,
  closestAncestor,
} from './google-selectors.js';

// Types
export type {
  SelectorChain,
  FieldSelectorEntry,
  InjectionSelectorEntry,
} from './google-selectors.js';
