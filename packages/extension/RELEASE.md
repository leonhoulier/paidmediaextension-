# Release Process

Complete guide for building, testing, and releasing the Media Buying Governance Chrome extension.

---

## 1. Pre-Release Checklist

Complete all items before submitting to the Chrome Web Store.

### Infrastructure
- [ ] Production backend deployed and healthy (`curl https://mbg-backend-[HASH]-uc.a.run.app/healthz` returns 200)
- [ ] Production admin portal deployed and accessible
- [ ] Firebase Auth configured for production domains
- [ ] Cloud SQL database migrated to latest schema
- [ ] First organization and admin user created via `seed-production.ts`

### Extension
- [ ] `.env.production` updated with actual backend and admin portal URLs
- [ ] `manifest.prod.json` version number updated for this release
- [ ] All unit tests passing (`pnpm test`)
- [ ] Production build succeeds (`pnpm build:prod`)
- [ ] `dist.zip` size verified (under 20 MB uncompressed)
- [ ] Extension loaded locally from `dist/` and manually tested
- [ ] Selector validation complete (see `SELECTOR-VALIDATION.md`)

### Testing
- [ ] Full production test plan completed (see `PRODUCTION-TEST-PLAN.md`)
- [ ] All 10 tests passing on production backend
- [ ] Screenshots taken on real Meta Ads Manager and Google Ads

### Listing Materials
- [ ] Chrome Web Store listing prepared (see `CHROME-WEB-STORE.md`)
- [ ] Privacy policy hosted at a public URL
- [ ] Icon assets created (16x16, 48x48, 128x128)
- [ ] Screenshots formatted at 1280x800 or 640x400

---

## 2. Version Numbering

Follow semantic versioning: `MAJOR.MINOR.PATCH`

| Bump | When | Examples |
|:--|:--|:--|
| **MAJOR** | Breaking changes | New manifest version, removed features, incompatible API changes |
| **MINOR** | New features | New platform support (e.g., TikTok Ads), new rule types, new UI components |
| **PATCH** | Bug fixes | Selector updates, styling fixes, error handling improvements |

### Version Locations

Update the version in **both** files:
1. `manifest.prod.json` > `"version"` field
2. `package.json` > `"version"` field (keep in sync)

### Changelog

Maintain a changelog entry for each release. Recommended format:

```
## [1.0.1] - 2026-02-15

### Fixed
- Updated Meta Ads Manager campaign name field selector
- Fixed SSE reconnection delay after network interruption

### Changed
- Improved budget validation banner positioning
```

---

## 3. Build Production Bundle

```bash
cd packages/extension

# 1. Update version in manifest.prod.json (if needed)
#    Edit "version": "X.Y.Z" in manifest.prod.json

# 2. Update .env.production with actual URLs (if not already done)
#    VITE_API_BASE_URL=https://mbg-backend-ACTUAL-HASH-uc.a.run.app
#    VITE_ADMIN_PORTAL_URL=http://ACTUAL.CDN.IP

# 3. Run production build
pnpm build:prod

# Output:
#   dist/           - Production build output (load unpacked for testing)
#   dist.zip        - Packaged for Chrome Web Store upload
```

### Build Output Verification

After building, verify:

```bash
# Check dist.zip exists and note its size
ls -la dist.zip

# Verify manifest in dist/ is the production variant
cat dist/manifest.json | grep '"name"'
# Should output: "name": "Media Buying Governance"

# Verify no localhost references in built JS
grep -r "localhost" dist/ || echo "No localhost references found (good)"

# Verify source maps are NOT included
find dist/ -name "*.map" | wc -l
# Should output: 0
```

---

## 4. Upload to Chrome Web Store

### First-Time Setup

1. Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Pay the one-time $5 developer registration fee (if not already registered)
3. Verify your developer identity

### Upload Process

1. Navigate to the [Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Click **"New Item"**
3. Click **"Upload"** and select `dist.zip`
4. Wait for the upload to process (usually a few seconds)

### Fill in Listing Details

Use the information from `CHROME-WEB-STORE.md`:

1. **Store Listing tab:**
   - Extension name: `Media Buying Governance`
   - Short description (paste from CHROME-WEB-STORE.md section 2)
   - Detailed description (paste from CHROME-WEB-STORE.md section 3)
   - Category: `Productivity`
   - Language: `English (United States)`
   - Upload screenshots (1280x800 or 640x400)

2. **Privacy tab:**
   - Privacy policy URL: (your hosted privacy policy URL)
   - Single purpose description (paste from CHROME-WEB-STORE.md section 9)
   - Permission justifications (from CHROME-WEB-STORE.md section 9)
   - Check "This extension does not use remote code"
   - Data usage disclosures:
     - Does not sell data to third parties
     - Does not transfer data for unrelated purposes
     - Does not transfer data for creditworthiness determination

3. **Distribution tab:**
   - Visibility: **Private** (unlisted) for initial release
   - Regions: All regions (or restrict to your organization's regions)

4. Click **"Submit for Review"**

### Updating an Existing Listing

For subsequent releases:

1. Navigate to the [Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Click on the existing "Media Buying Governance" item
3. Click **"Package"** tab
4. Click **"Upload new package"**
5. Select the new `dist.zip`
6. Update the listing details if needed (description, screenshots)
7. Click **"Submit for Review"**

---

## 5. Review Process

### Timeline
- Chrome Web Store review typically takes **1-3 business days**
- Complex extensions (with `scripting` permission) may take longer
- First submission often takes longer than updates

### Monitoring
- Monitor the email associated with your developer account
- Check the Developer Dashboard for status updates
- Possible statuses: `Pending review`, `Published`, `Rejected`

### If Rejected

Common rejection reasons and fixes:

| Reason | Fix |
|:--|:--|
| Missing permission justification | Add detailed justification in Privacy tab for each permission |
| Privacy policy incomplete | Ensure privacy policy covers all data collection and includes contact info |
| Single purpose not clear | Rewrite single purpose description to be more specific |
| Remote code execution | Ensure no `eval()`, `new Function()`, or remote script loading in extension code |
| Missing host permission justification | Explain why each host permission is needed |

After addressing feedback:
1. Make the necessary changes
2. Rebuild: `pnpm build:prod`
3. Re-upload and re-submit

---

## 6. Post-Release Verification

After Chrome Web Store approval and publication:

### Immediate (within 1 hour)

1. **Install from Chrome Web Store**
   - Use the Chrome Web Store link (not "Load unpacked")
   - Verify the extension installs without errors
   - Verify the extension icon appears in the toolbar

2. **Run Smoke Tests**
   - Pair with production backend
   - Navigate to Meta Ads Manager
   - Verify validation UI appears
   - Navigate to Google Ads
   - Verify validation UI appears

### First 24 Hours

3. **Monitor Error Tracking**
   - Check Cloud Logging for backend errors related to extension API calls
   - Check for elevated 4xx/5xx response rates on compliance endpoints
   - Monitor for SSE connection failures

4. **Monitor Selector Telemetry**
   - Check Console logs for selector miss warnings
   - If selectors break, update via admin portal (no extension re-publish needed)

5. **Monitor User Feedback**
   - Check for user-reported issues via internal channels
   - Collect feedback on validation accuracy and UI placement

### First Week

6. **Review Compliance Data**
   - Check admin portal compliance dashboard for data completeness
   - Verify compliance events are being logged correctly
   - Check for unexpected patterns (e.g., all rules failing = likely a selector issue)

---

## 7. Rollback Procedure

If critical issues are discovered after release:

### Severity Assessment

| Severity | Example | Action |
|:--|:--|:--|
| **Critical** | Extension crashes on all pages, data loss | Immediate unpublish |
| **High** | Validation UI does not appear on one platform | Patch release within 24 hours |
| **Medium** | One rule type evaluates incorrectly | Patch release within 1 week |
| **Low** | Minor styling issue | Include in next scheduled release |

### Rollback Steps (Critical/High Severity)

1. **Unpublish current version**
   - Go to Developer Dashboard
   - Click on the extension
   - Click "Unpublish" (this removes it from the store but does not uninstall from existing users)

2. **Notify users**
   - Send email notification to affected organization admins
   - Post notice in internal communication channels
   - If possible, push a notification via the admin portal

3. **Re-publish previous stable version**
   - Retrieve the previous `dist.zip` from version control or build artifacts
   - Upload and publish the previous version
   - This triggers an auto-update for existing users (within ~5 hours)

4. **Fix and re-release**
   - Identify and fix the root cause
   - Run full test plan (PRODUCTION-TEST-PLAN.md)
   - Bump the patch version
   - Build, upload, and submit for review

### Emergency: Force Update for Users

Chrome extensions auto-update every ~5 hours. If faster propagation is needed:
- Users can manually update: `chrome://extensions` > "Update" button
- Communicate the manual update step to affected users

---

## 8. Updating Selectors Without Full Release

One of the key architecture benefits: **selectors are not hardcoded in the extension.**

### How Selector Updates Work

1. Selectors are stored in rule configuration (in the backend database)
2. Rules are synced to the extension via SSE or polling
3. The extension reads selectors from the rule cache at runtime
4. Updating a selector in the admin portal propagates to all extensions within 5 minutes

### When to Use This Approach

- Meta Ads Manager changes its DOM structure (happens frequently)
- Google Ads updates field class names or IDs
- A new field type needs validation support

### Process

1. Identify the broken selector (check extension Console logs for selector miss warnings)
2. Inspect the ad platform DOM to find the new selector
3. Update the selector in the admin portal rule builder
4. Verify the update propagates to the extension (check IndexedDB cache)
5. Verify the validation UI reappears on the ad platform

### Limitations

Some selectors are used by the platform adapters for structural detection (e.g., "is this the campaign creation page?"). These are hardcoded in:
- `src/adapters/meta/meta-adapter.ts`
- `src/adapters/google/google-adapter.ts`

Updates to these structural selectors require a new extension release.

---

## 9. Icon Assets

### Required Sizes

| Size | Purpose | File |
|:--|:--|:--|
| 16x16 | Browser toolbar icon | `src/icons/icon16.png` |
| 48x48 | Extension management page (`chrome://extensions`) | `src/icons/icon48.png` |
| 128x128 | Chrome Web Store listing and install dialog | `src/icons/icon128.png` |

### Design Guidelines

- **Concept:** Shield icon representing governance and protection
- **Primary color:** Blue (#2563EB or similar) for trust and professionalism
- **Accent color:** Green (#16A34A or similar) for compliance/success state
- **Background:** Transparent (PNG with alpha channel)
- **Style:** Clean, minimal, recognizable at 16x16
- **Avoid:** Text in the icon (unreadable at small sizes), gradients (may look poor at 16x16)

### Design Suggestions

Option A: Shield with checkmark
- Blue shield outline
- Green checkmark inside the shield
- Conveys "verified compliance"

Option B: Shield with bar chart
- Blue shield outline
- Small ascending bar chart inside (representing campaign score)
- Conveys "measured governance"

Option C: Circular badge
- Blue circle with white shield silhouette
- Resembles a trust badge or seal
- Conveys "certified compliant"

### Creating Icons

You can create icons using:
- **Figma** (free): Design at 128x128, export at all three sizes
- **AI image generators**: Prompt "minimalist shield icon, blue and green, transparent background, 128x128 PNG"
- **Icon libraries**: Start from a shield icon in Heroicons, Lucide, or Material Icons and customize colors

### Current Placeholder Icons

The repository includes placeholder icons at `src/icons/`. Replace these with production-quality icons before submitting to the Chrome Web Store.

---

## 10. CI/CD Integration (Future)

For automated releases, consider adding a GitHub Actions workflow:

```yaml
# .github/workflows/extension-release.yml
name: Extension Release

on:
  push:
    tags:
      - 'extension-v*'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install
      - run: pnpm --filter @media-buying-governance/shared build
      - run: pnpm --filter @media-buying-governance/extension build:prod
      - uses: actions/upload-artifact@v4
        with:
          name: extension-dist
          path: packages/extension/dist.zip
```

### Chrome Web Store API (Automated Upload)

For fully automated releases, use the [Chrome Web Store Publish API](https://developer.chrome.com/docs/webstore/using_webstore_api/):

1. Create OAuth2 credentials in Google Cloud Console
2. Use `chrome-webstore-upload` npm package
3. Add upload step to CI/CD pipeline

This is optional and recommended only after the manual release process is validated.

---

## Quick Reference

### Commands

```bash
# Development build (with dev manifest)
pnpm build

# Production build (with prod manifest + zip)
pnpm build:prod

# Run tests
pnpm test

# Clean build artifacts
pnpm clean

# Type check
pnpm typecheck
```

### Key Files

| File | Purpose |
|:--|:--|
| `manifest.json` | Development manifest (localhost URLs) |
| `manifest.prod.json` | Production manifest (Cloud Run URLs) |
| `.env.production` | Production environment variables (fill in after deployment) |
| `esbuild.config.mjs` | Build script (supports `--manifest` and `--env` flags) |
| `dist/` | Build output directory (load unpacked from here) |
| `dist.zip` | Chrome Web Store upload package |
| `CHROME-WEB-STORE.md` | Listing materials for Chrome Web Store |
| `PRODUCTION-TEST-PLAN.md` | Step-by-step production testing guide |
| `SELECTOR-VALIDATION.md` | Selector health tracking |
