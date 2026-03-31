/**
 * Automated Field Validation Test Suite
 *
 * This script uses Chrome MCP to automatically test all 18 core Meta Ads Manager
 * field extractors in real Meta UI. Results are written to TEST-RESULTS.md.
 *
 * Prerequisites:
 * - Chrome MCP server running with extension loaded
 * - Meta Ads Manager test account accessible
 * - Extension paired with backend
 *
 * Usage:
 *   pnpm test:meta-fields
 *
 * @module automated-field-validation
 */

import * as fs from 'fs/promises';
import * as path from 'path';

// ─── Test Configuration ───────────────────────────────────────────────────────

/** Base URL for Meta Ads Manager */
const META_ADS_MANAGER_URL = 'https://adsmanager.facebook.com/adsmanager';

/** Test account ID (from environment or config) */
const TEST_ACCOUNT_ID = process.env.META_TEST_ACCOUNT_ID || 'act_123456789';

/** Screenshot output directory */
const SCREENSHOTS_DIR = path.join(__dirname, '../screenshots');

/** Test results output file */
const TEST_RESULTS_FILE = path.join(__dirname, '../TEST-RESULTS.md');

// ─── Field Test Definitions ───────────────────────────────────────────────────

/**
 * The 18 core Meta Ads Manager fields to validate.
 * Organized by entity level (Campaign, Ad Set, Ad).
 */
interface FieldTest {
  /** Field path (e.g., 'campaign.name') */
  fieldPath: string;
  /** Human-readable field name */
  displayName: string;
  /** Entity level (campaign, ad_set, ad) */
  entityLevel: 'campaign' | 'ad_set' | 'ad';
  /** URL path to navigate to this field (relative to adsmanager base) */
  urlPath: string;
  /** Steps to navigate to the field within the page */
  navigationSteps: string[];
  /** Expected selector strategies (from meta-selectors.ts) */
  selectorStrategies: string[];
  /** Whether this field is high-risk (identified in plan) */
  highRisk: boolean;
  /** Risk notes (if high-risk) */
  riskNotes?: string;
}

const FIELD_TESTS: FieldTest[] = [
  // ── Campaign Level Fields ────────────────────────────────────────────────
  {
    fieldPath: 'campaign.name',
    displayName: 'Campaign Name',
    entityLevel: 'campaign',
    urlPath: '/manage/campaigns/create',
    navigationSteps: [
      'Click "Create" button',
      'Select campaign objective (e.g., Traffic)',
      'Click "Continue"',
      'Campaign name field should be visible',
    ],
    selectorStrategies: [
      'aria-label: input[aria-label*="Campaign name"]',
      'data-testid: [data-testid*="campaign-name"] input',
      'heuristic: find input near "Campaign name" label',
    ],
    highRisk: false,
  },
  {
    fieldPath: 'campaign.objective',
    displayName: 'Campaign Objective',
    entityLevel: 'campaign',
    urlPath: '/manage/campaigns/create',
    navigationSteps: [
      'Click "Create" button',
      'Objective selection screen should appear',
      'Radio buttons for objectives visible',
    ],
    selectorStrategies: [
      'aria-label: input[aria-label*="objective" i][type="radio"][checked]',
      'role: [role="radiogroup"] input[type="radio"][checked]',
      'heuristic: find checked radio in objective section',
    ],
    highRisk: false,
  },
  {
    fieldPath: 'campaign.budget_type',
    displayName: 'Campaign Budget Type',
    entityLevel: 'campaign',
    urlPath: '/manage/campaigns/create',
    navigationSteps: [
      'Click "Create" button',
      'Select objective',
      'Click "Continue"',
      'Scroll to "Campaign budget optimization" section',
      'Budget type radio buttons should be visible',
    ],
    selectorStrategies: [
      'aria-label: input[aria-label*="budget" i][type="radio"][checked]',
      'role: [role="radiogroup"] input[aria-checked="true"]',
    ],
    highRisk: true,
    riskNotes: 'Targets <select> but real UI uses custom dropdown. May fail.',
  },
  {
    fieldPath: 'campaign.budget_value',
    displayName: 'Campaign Budget Value',
    entityLevel: 'campaign',
    urlPath: '/manage/campaigns/create',
    navigationSteps: [
      'Click "Create" button',
      'Select objective',
      'Click "Continue"',
      'Scroll to "Campaign budget" section',
      'Budget input field should be visible',
    ],
    selectorStrategies: [
      'aria-label: input[aria-label*="budget" i][type="text"]',
      'placeholder: input[placeholder*="enter amount" i]',
    ],
    highRisk: true,
    riskNotes: 'type="text" constraint may not match type="number" in real UI.',
  },
  {
    fieldPath: 'campaign.cbo_enabled',
    displayName: 'Campaign Budget Optimization Enabled',
    entityLevel: 'campaign',
    urlPath: '/manage/campaigns/create',
    navigationSteps: [
      'Click "Create" button',
      'Select objective',
      'Click "Continue"',
      'Find "Advantage campaign budget" toggle',
    ],
    selectorStrategies: [
      'aria-label: input[aria-label*="campaign budget" i][type="checkbox"]',
      'role: [role="switch"][aria-checked="true"]',
    ],
    highRisk: false,
  },

  // ── Ad Set Level Fields ──────────────────────────────────────────────────
  {
    fieldPath: 'ad_set.name',
    displayName: 'Ad Set Name',
    entityLevel: 'ad_set',
    urlPath: '/manage/campaigns/create',
    navigationSteps: [
      'Complete campaign setup',
      'Click "Next" to ad set level',
      'Ad set name field should be visible',
    ],
    selectorStrategies: [
      'aria-label: input[aria-label*="Ad set name" i]',
      'placeholder: input[placeholder*="ad set name" i]',
    ],
    highRisk: false,
  },
  {
    fieldPath: 'ad_set.targeting.geo_locations',
    displayName: 'Geo Locations (Targeting)',
    entityLevel: 'ad_set',
    urlPath: '/manage/campaigns/create',
    navigationSteps: [
      'Complete campaign setup',
      'Click "Next" to ad set level',
      'Scroll to "Locations" section',
      'Location selector should be visible',
    ],
    selectorStrategies: [
      'aria-label: [aria-label*="Location" i]',
      'heuristic: find input near "Locations" heading',
    ],
    highRisk: false,
  },
  {
    fieldPath: 'ad_set.targeting.age_range',
    displayName: 'Age Range (Targeting)',
    entityLevel: 'ad_set',
    urlPath: '/manage/campaigns/create',
    navigationSteps: [
      'Complete campaign setup',
      'Click "Next" to ad set level',
      'Scroll to "Age" section',
      'Age dropdowns should be visible',
    ],
    selectorStrategies: [
      'aria-label: [aria-label*="Age" i]',
    ],
    highRisk: true,
    riskNotes: 'Mock uses <input type="number">, real UI likely custom dropdown.',
  },
  {
    fieldPath: 'ad_set.targeting.genders',
    displayName: 'Genders (Targeting)',
    entityLevel: 'ad_set',
    urlPath: '/manage/campaigns/create',
    navigationSteps: [
      'Complete campaign setup',
      'Click "Next" to ad set level',
      'Scroll to "Gender" section',
      'Gender checkboxes should be visible',
    ],
    selectorStrategies: [
      'aria-label: [aria-label*="Gender" i]',
    ],
    highRisk: false,
  },
  {
    fieldPath: 'ad_set.targeting.languages',
    displayName: 'Languages (Targeting)',
    entityLevel: 'ad_set',
    urlPath: '/manage/campaigns/create',
    navigationSteps: [
      'Complete campaign setup',
      'Click "Next" to ad set level',
      'Scroll to "Languages" section (if available)',
    ],
    selectorStrategies: [
      'aria-label: [aria-label*="Language" i]',
    ],
    highRisk: false,
  },
  {
    fieldPath: 'ad_set.targeting.custom_audiences',
    displayName: 'Custom Audiences (Targeting)',
    entityLevel: 'ad_set',
    urlPath: '/manage/campaigns/create',
    navigationSteps: [
      'Complete campaign setup',
      'Click "Next" to ad set level',
      'Scroll to "Custom Audiences" section',
      'Click "Add Custom Audience"',
    ],
    selectorStrategies: [
      'aria-label: [aria-label*="Custom audience" i]',
    ],
    highRisk: true,
    riskNotes: 'No selector registry entry. Relies on speculative query.',
  },
  {
    fieldPath: 'ad_set.placements',
    displayName: 'Placements',
    entityLevel: 'ad_set',
    urlPath: '/manage/campaigns/create',
    navigationSteps: [
      'Complete campaign setup',
      'Click "Next" to ad set level',
      'Scroll to "Placements" section',
      'Manual/Automatic placement toggle visible',
    ],
    selectorStrategies: [
      'aria-label: [aria-label*="Placement" i]',
    ],
    highRisk: false,
  },
  {
    fieldPath: 'ad_set.schedule.start_date',
    displayName: 'Start Date (Schedule)',
    entityLevel: 'ad_set',
    urlPath: '/manage/campaigns/create',
    navigationSteps: [
      'Complete campaign setup',
      'Click "Next" to ad set level',
      'Scroll to "Schedule" section',
      'Start date picker should be visible',
    ],
    selectorStrategies: [
      'aria-label: [aria-label*="Start date" i]',
    ],
    highRisk: false,
  },
  {
    fieldPath: 'ad_set.schedule.end_date',
    displayName: 'End Date (Schedule)',
    entityLevel: 'ad_set',
    urlPath: '/manage/campaigns/create',
    navigationSteps: [
      'Complete campaign setup',
      'Click "Next" to ad set level',
      'Scroll to "Schedule" section',
      'Click "Set end date" if toggle exists',
      'End date picker should be visible',
    ],
    selectorStrategies: [
      'aria-label: [aria-label*="End date" i]',
    ],
    highRisk: false,
  },

  // ── Ad/Creative Level Fields ─────────────────────────────────────────────
  {
    fieldPath: 'ad.name',
    displayName: 'Ad Name',
    entityLevel: 'ad',
    urlPath: '/manage/campaigns/create',
    navigationSteps: [
      'Complete campaign and ad set setup',
      'Click "Next" to ad level',
      'Ad name field should be visible',
    ],
    selectorStrategies: [
      'aria-label: input[aria-label*="Ad name" i]',
      'placeholder: input[placeholder*="ad name" i]',
    ],
    highRisk: false,
  },
  {
    fieldPath: 'ad.creative.destination_url',
    displayName: 'Destination URL (Creative)',
    entityLevel: 'ad',
    urlPath: '/manage/campaigns/create',
    navigationSteps: [
      'Complete campaign and ad set setup',
      'Click "Next" to ad level',
      'Scroll to "Website URL" section',
      'URL input field should be visible',
    ],
    selectorStrategies: [
      'aria-label: input[aria-label*="Website URL" i]',
    ],
    highRisk: false,
  },
  {
    fieldPath: 'ad.creative.cta_type',
    displayName: 'Call-to-Action Type (Creative)',
    entityLevel: 'ad',
    urlPath: '/manage/campaigns/create',
    navigationSteps: [
      'Complete campaign and ad set setup',
      'Click "Next" to ad level',
      'Scroll to "Call to action" dropdown',
    ],
    selectorStrategies: [
      'aria-label: [aria-label*="Call to action" i]',
    ],
    highRisk: false,
  },
  {
    fieldPath: 'ad.creative.page_id',
    displayName: 'Facebook Page (Creative)',
    entityLevel: 'ad',
    urlPath: '/manage/campaigns/create',
    navigationSteps: [
      'Complete campaign and ad set setup',
      'Click "Next" to ad level',
      'Scroll to "Identity" section',
      'Page selector should be visible',
    ],
    selectorStrategies: [
      'aria-label: [aria-label*="Facebook Page" i]',
      'placeholder: input[placeholder*="page" i]',
    ],
    highRisk: false,
  },
];

// ─── Test Result Interfaces ───────────────────────────────────────────────────

interface FieldTestResult {
  fieldPath: string;
  displayName: string;
  success: boolean;
  strategyUsed?: 'require' | 'remoteEval' | 'fiber' | 'dom';
  extractedValue?: unknown;
  uiValue?: unknown;
  valuesMatch?: boolean;
  durationMs: number;
  error?: string;
  screenshotPath?: string;
  timestamp: number;
}

// ─── Test Execution ───────────────────────────────────────────────────────────

/**
 * Main test execution function.
 *
 * NOTE: This is a template script. In a real implementation with Chrome MCP,
 * you would use the Chrome MCP tools to:
 * 1. Navigate to Meta Ads Manager
 * 2. Click through UI elements
 * 3. Trigger field extraction
 * 4. Capture screenshots
 *
 * Since we don't have direct Chrome MCP access in this context, this script
 * provides the structure and can be executed by Claude Code with Chrome MCP.
 */
async function runFieldValidationTests(): Promise<void> {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Meta Ads Manager Field Extraction Validation Test Suite  ');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Create screenshots directory
  await fs.mkdir(SCREENSHOTS_DIR, { recursive: true });

  const results: FieldTestResult[] = [];

  // Test each field
  for (const fieldTest of FIELD_TESTS) {
    console.log(`\n▶ Testing: ${fieldTest.displayName} (${fieldTest.fieldPath})`);
    console.log(`  Entity Level: ${fieldTest.entityLevel}`);
    console.log(`  High Risk: ${fieldTest.highRisk ? 'YES' : 'no'}`);
    if (fieldTest.riskNotes) {
      console.log(`  Risk Notes: ${fieldTest.riskNotes}`);
    }

    const result = await testField(fieldTest);
    results.push(result);

    // Display result
    if (result.success) {
      console.log(`  ✅ PASS - Extracted via ${result.strategyUsed}`);
      console.log(`  Duration: ${result.durationMs.toFixed(0)}ms`);
      if (result.valuesMatch !== undefined) {
        console.log(`  Values Match: ${result.valuesMatch ? 'YES' : 'NO'}`);
      }
    } else {
      console.log(`  ❌ FAIL - ${result.error}`);
    }
  }

  // Generate TEST-RESULTS.md
  await generateTestReport(results);

  // Print summary
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Test Summary');
  console.log('═══════════════════════════════════════════════════════════\n');

  const passCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;
  const successRate = ((passCount / results.length) * 100).toFixed(1);

  console.log(`Total Tests: ${results.length}`);
  console.log(`Passed: ${passCount} (${successRate}%)`);
  console.log(`Failed: ${failCount}`);
  console.log(`\nResults written to: ${TEST_RESULTS_FILE}`);
  console.log(`Screenshots saved to: ${SCREENSHOTS_DIR}/`);
}

/**
 * Test a single field.
 *
 * This function would use Chrome MCP tools to:
 * 1. Navigate to the field location
 * 2. Get the UI value (ground truth)
 * 3. Trigger extension field extraction
 * 4. Compare values
 * 5. Take screenshot
 *
 * @param fieldTest - The field test configuration
 * @returns Test result
 */
async function testField(fieldTest: FieldTest): Promise<FieldTestResult> {
  const startTime = performance.now();

  try {
    // TODO: Implement with Chrome MCP
    // 1. Navigate to field location
    // await chrome_navigate({ url: `${META_ADS_MANAGER_URL}${fieldTest.urlPath}?act=${TEST_ACCOUNT_ID}` });

    // 2. Execute navigation steps
    // for (const step of fieldTest.navigationSteps) {
    //   // Execute step using Chrome MCP (clicks, waits, etc.)
    // }

    // 3. Get UI value (ground truth)
    // const uiValue = await getFieldValueFromUI(fieldTest.fieldPath);

    // 4. Trigger extension field extraction
    // const extractedValue = await triggerExtensionExtraction(fieldTest.fieldPath);

    // 5. Compare values
    // const valuesMatch = uiValue === extractedValue.value;

    // 6. Take screenshot
    // const screenshotPath = `${SCREENSHOTS_DIR}/${fieldTest.fieldPath.replace(/\./g, '_')}.png`;
    // await chrome_screenshot({ path: screenshotPath });

    const durationMs = performance.now() - startTime;

    // Placeholder result (replace with actual Chrome MCP implementation)
    return {
      fieldPath: fieldTest.fieldPath,
      displayName: fieldTest.displayName,
      success: false,
      error: 'Chrome MCP implementation pending',
      durationMs,
      timestamp: Date.now(),
    };
  } catch (error) {
    const durationMs = performance.now() - startTime;

    return {
      fieldPath: fieldTest.fieldPath,
      displayName: fieldTest.displayName,
      success: false,
      error: error instanceof Error ? error.message : String(error),
      durationMs,
      timestamp: Date.now(),
    };
  }
}

/**
 * Generate the TEST-RESULTS.md report.
 *
 * @param results - Array of test results
 */
async function generateTestReport(results: FieldTestResult[]): Promise<void> {
  const passCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;
  const successRate = ((passCount / results.length) * 100).toFixed(1);

  const strategyBreakdown = results
    .filter((r) => r.success && r.strategyUsed)
    .reduce((acc, r) => {
      acc[r.strategyUsed!] = (acc[r.strategyUsed!] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

  let markdown = `# Meta Ads Manager Field Extraction Test Results

**Test Run Date:** ${new Date().toISOString()}
**Total Fields Tested:** ${results.length}
**Success Rate:** ${successRate}% (${passCount}/${results.length})
**Failed:** ${failCount}

---

## Summary

| Metric | Value |
|--------|-------|
| Total Tests | ${results.length} |
| Passed | ✅ ${passCount} |
| Failed | ❌ ${failCount} |
| Success Rate | ${successRate}% |
| Target | ≥ 95% (17+ fields) |

### Extraction Strategy Breakdown

| Strategy | Count | Percentage |
|----------|-------|------------|
`;

  for (const [strategy, count] of Object.entries(strategyBreakdown)) {
    const percentage = ((count / passCount) * 100).toFixed(1);
    markdown += `| ${strategy} | ${count} | ${percentage}% |\n`;
  }

  markdown += `\n---

## Detailed Results

`;

  // Group by entity level
  const byCampaign = results.filter((r) => FIELD_TESTS.find((f) => f.fieldPath === r.fieldPath)?.entityLevel === 'campaign');
  const byAdSet = results.filter((r) => FIELD_TESTS.find((f) => f.fieldPath === r.fieldPath)?.entityLevel === 'ad_set');
  const byAd = results.filter((r) => FIELD_TESTS.find((f) => f.fieldPath === r.fieldPath)?.entityLevel === 'ad');

  markdown += `### Campaign Level Fields (${byCampaign.length})\n\n`;
  markdown += generateResultsTable(byCampaign);

  markdown += `\n### Ad Set Level Fields (${byAdSet.length})\n\n`;
  markdown += generateResultsTable(byAdSet);

  markdown += `\n### Ad Level Fields (${byAd.length})\n\n`;
  markdown += generateResultsTable(byAd);

  markdown += `\n---

## High-Risk Fields Analysis

The following fields were identified as high-risk in the implementation plan:

`;

  const highRiskResults = results.filter((r) => {
    const fieldTest = FIELD_TESTS.find((f) => f.fieldPath === r.fieldPath);
    return fieldTest?.highRisk;
  });

  for (const result of highRiskResults) {
    const fieldTest = FIELD_TESTS.find((f) => f.fieldPath === result.fieldPath)!;
    const status = result.success ? '✅ PASS' : '❌ FAIL';

    markdown += `### ${status} ${result.displayName}\n\n`;
    markdown += `- **Field Path:** \`${result.fieldPath}\`\n`;
    markdown += `- **Risk Notes:** ${fieldTest.riskNotes}\n`;
    markdown += `- **Strategy Used:** ${result.strategyUsed || 'N/A'}\n`;
    markdown += `- **Duration:** ${result.durationMs.toFixed(0)}ms\n`;
    if (!result.success) {
      markdown += `- **Error:** ${result.error}\n`;
    }
    if (result.screenshotPath) {
      markdown += `- **Screenshot:** [View](${result.screenshotPath})\n`;
    }
    markdown += `\n`;
  }

  markdown += `---

## Recommendations

`;

  if (passCount >= 17) {
    markdown += `✅ **Success Rate Meets Target (≥95%)**\n\n`;
    markdown += `The field extraction system is production-ready. All critical fields extract successfully.\n\n`;
  } else {
    markdown += `⚠️ **Success Rate Below Target (<95%)**\n\n`;
    markdown += `The following fields require selector fixes before production deployment:\n\n`;

    const failedFields = results.filter((r) => !r.success);
    for (const result of failedFields) {
      markdown += `- **${result.displayName}** (\`${result.fieldPath}\`): ${result.error}\n`;
    }
  }

  markdown += `\n### Next Steps

1. **Review Failed Fields:** Investigate selector strategies for failed fields
2. **Update Selectors:** Fix selectors in \`meta-selectors.ts\` based on real UI structure
3. **Re-run Tests:** Execute test suite again to verify fixes
4. **Update Telemetry:** Monitor field extraction success rates in production via popup dashboard

---

## Test Environment

- **Chrome Version:** ${process.env.CHROME_VERSION || 'Unknown'}
- **Extension Version:** 1.0.0
- **Meta Test Account:** ${TEST_ACCOUNT_ID}
- **Test Execution Mode:** ${process.env.TEST_MODE || 'Automated'}

---

*Generated on ${new Date().toLocaleString()} by automated-field-validation.ts*
`;

  await fs.writeFile(TEST_RESULTS_FILE, markdown, 'utf-8');
}

/**
 * Generate a results table for a group of fields.
 */
function generateResultsTable(results: FieldTestResult[]): string {
  let table = `| Field | Status | Strategy | Duration | Notes |\n`;
  table += `|-------|--------|----------|----------|-------|\n`;

  for (const result of results) {
    const status = result.success ? '✅' : '❌';
    const strategy = result.strategyUsed || 'N/A';
    const duration = `${result.durationMs.toFixed(0)}ms`;
    const notes = result.error || (result.valuesMatch === false ? 'Values mismatch' : '-');

    table += `| \`${result.fieldPath}\` | ${status} | ${strategy} | ${duration} | ${notes} |\n`;
  }

  return table;
}

// ─── Script Entry Point ───────────────────────────────────────────────────────

if (require.main === module) {
  runFieldValidationTests()
    .then(() => {
      console.log('\n✅ Test suite completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Test suite failed:', error);
      process.exit(1);
    });
}

export { runFieldValidationTests, FIELD_TESTS, FieldTest, FieldTestResult };
