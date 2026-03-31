# Chrome Web Store Listing Materials

This document contains all the information needed to publish the Media Buying Governance extension to the Chrome Web Store.

---

## 1. Extension Name

```
Media Buying Governance
```

## 2. Short Description (132 characters max)

```
Prevent media buying errors with real-time validation rules injected directly into Meta Ads Manager and Google Ads.
```

Character count: 114

## 3. Detailed Description

```
Media Buying Governance is a Chrome extension that prevents costly media buying errors by injecting real-time validation rules, naming convention enforcement, and compliance checks directly into ad platform UIs during campaign creation.

WHO IT'S FOR

Media Buying Governance is built for:

- Media buyers who need guardrails to prevent campaign setup errors
- Media operations teams responsible for enforcing standards across multiple buyers
- Agencies managing campaigns for multiple clients with different compliance requirements
- Brand safety teams that need to ensure sensitive categories are excluded

HOW IT WORKS

The extension pairs with an admin portal where your organization's compliance team defines rules, naming conventions, budget thresholds, targeting constraints, and brand safety requirements. Once paired, the extension syncs these rules in real time and injects validation UI directly into the campaign creation flow on supported ad platforms.

No manual checking. No post-launch audits. Rules are enforced at the point of creation.

KEY FEATURES

Validation Banners
Color-coded banners appear directly below campaign fields (name, budget, targeting) showing pass/fail status with clear remediation instructions. Red banners indicate violations; green banners confirm compliance.

Naming Convention Enforcement
Define naming templates (e.g., "Brand_Region_Campaign-Type_YYYY-MM") and the extension validates campaign names in real time with color-coded badges showing which segments pass and which need correction.

Budget Confirmation
For high-value campaigns, require the buyer to re-type the budget amount to prevent typos. A confirmation modal ensures the budget was entered intentionally, not accidentally.

Targeting Constraints
Enforce geographic, demographic, and placement targeting rules. The extension validates that campaigns meet minimum or maximum audience criteria and flags violations before the campaign can be published.

Brand Safety Enforcement
Automatically check that sensitive content categories, placement exclusions, and inventory filters are properly configured according to your organization's brand safety policy.

Campaign Score Widget
A circular progress ring (0-100) appears in the corner of the campaign creation page, giving buyers an at-a-glance view of overall compliance. The score updates in real time as fields are modified.

Guidelines Sidebar
A collapsible floating panel lists all applicable rules organized by category (naming, budget, targeting, brand safety). Each rule shows a live pass/fail badge that updates as the buyer modifies campaign settings.

Creation Blocker
For critical rules, the extension can overlay the "Publish" or "Create" button with a blocker modal that lists all unmet requirements. The campaign cannot be published until all blocking rules are satisfied.

Comment Prompts
Require buyers to leave a justification comment (minimum 10 characters) for specific setup decisions before the campaign can proceed. Comments are logged to the compliance dashboard for audit trails.

SUPPORTED PLATFORMS

- Meta Ads Manager (adsmanager.facebook.com, business.facebook.com)
- Google Ads (ads.google.com)

PRIVACY & SECURITY

Media Buying Governance is built with privacy and security as core principles:

- No personally identifiable information (PII) is stored client-side
- No ad creative content is collected or transmitted
- No cross-website tracking
- All API communication uses TLS encryption
- Extension authentication uses cryptographically bound, revocable tokens
- Data is scoped to your organization with multi-tenant isolation
- No third-party analytics or tracking libraries
- Rule cache is stored locally with a 5-minute TTL and automatically refreshed

GETTING STARTED

1. Your organization admin sets up the admin portal and creates compliance rules
2. Install the extension and enter the pairing token provided by your admin
3. Navigate to Meta Ads Manager or Google Ads
4. Start creating campaigns - validation rules appear automatically

For questions or support, contact your organization admin or visit the admin portal.
```

## 4. Screenshots Required

Screenshots must be 1280x800 or 640x400 pixels. Take these AFTER deploying the production backend and testing on real ad platforms.

### Screenshot 1: Extension Popup (Connected State)
- **What to capture:** The extension popup after successful pairing
- **Key elements:** Organization name, admin email, last sync timestamp, "Force Refresh" button, sidebar toggle, connection status indicator
- **How to take:** Click the extension icon in Chrome toolbar while paired

### Screenshot 2: Meta Ads Manager - Validation Banner
- **What to capture:** A red validation banner below the campaign name field
- **Key elements:** Red banner with error icon, naming template hint, the invalid campaign name in the input field
- **How to take:** Navigate to Meta Ads Manager campaign creation, enter a name that violates a naming convention rule

### Screenshot 3: Meta Ads Manager - Guidelines Sidebar
- **What to capture:** The floating guidelines sidebar panel
- **Key elements:** Collapsible categories (Naming, Budget, Targeting, Brand Safety), pass/fail badges on each rule, overall category status
- **How to take:** Open sidebar via extension popup toggle or the floating sidebar button

### Screenshot 4: Google Ads - Campaign Score Widget
- **What to capture:** The circular campaign score widget showing a high score
- **Key elements:** Circular progress ring, numeric score (e.g., 100/100), green color indicating full compliance
- **How to take:** Navigate to Google Ads campaign creation with all rules passing

### Screenshot 5: Meta Ads Manager - Creation Blocker Modal
- **What to capture:** The blocker overlay preventing campaign publish
- **Key elements:** Semi-transparent overlay, modal listing unmet blocking rules, disabled "Publish" button behind the overlay
- **How to take:** Violate a blocking-mode rule and attempt to publish

### Screenshot 6: Admin Portal - Rule Builder
- **What to capture:** The 5-step rule builder wizard in the admin portal
- **Key elements:** Step indicators, rule type selection, platform selector, enforcement mode options, preview
- **How to take:** Log in to admin portal, click "Create Rule", navigate through wizard steps

## 5. Privacy Policy

### Inline Privacy Policy

```
MEDIA BUYING GOVERNANCE - PRIVACY POLICY

Last Updated: [DATE]

1. INTRODUCTION

Media Buying Governance ("the Extension") is a Chrome extension that injects
compliance validation rules into ad platform user interfaces. This privacy
policy explains what data we collect, how we use it, and how we protect it.

2. DATA WE COLLECT

2.1 Extension Token
- An opaque, revocable authentication token stored in Chrome local storage
- Used to authenticate the extension with your organization's backend
- Does not contain any personally identifiable information

2.2 Rule Cache
- Compliance rules defined by your organization, cached in IndexedDB
- Automatically refreshed every 5 minutes
- Stored entirely on your local device

2.3 Compliance Events
- Campaign field values (names, budgets, targeting selections)
- Rule pass/fail status for each validated field
- Timestamps of validation checks
- Sent to your organization's backend API for compliance reporting

3. DATA WE DO NOT COLLECT

- No personally identifiable information (PII)
- No ad creative content (images, videos, copy)
- No browsing history outside of supported ad platforms
- No cross-website tracking or fingerprinting
- No data shared with third-party analytics or advertising services

4. HOW WE USE YOUR DATA

4.1 Compliance Events
Compliance events are used solely for organizational compliance reporting.
Your organization admin can view aggregated compliance data in the admin
portal to identify common violations and improve campaign setup processes.

4.2 Data Scope
All data is scoped to your organization through multi-tenant isolation.
Your organization's data is never visible to other organizations.

5. DATA RETENTION

- Rule Cache: 5-minute TTL, automatically refreshed
- Compliance Events: 90 days (configurable by your organization admin)
- Extension Token: Until manually revoked or extension is uninstalled

6. DATA SECURITY

- All API communication is encrypted using TLS 1.3
- Extension tokens are cryptographically bound to your organization
- No data is transmitted to any third party
- Backend infrastructure runs on Google Cloud Platform with SOC 2
  compliant security controls

7. YOUR RIGHTS

- You can disconnect the extension at any time via the popup menu
- Disconnecting removes the extension token and clears the rule cache
- Contact your organization admin to request deletion of compliance events

8. CHANGES TO THIS POLICY

We may update this privacy policy from time to time. Changes will be
communicated through the extension update process.

9. CONTACT

For privacy-related questions, contact your organization administrator
or email: [SUPPORT_EMAIL]
```

### Privacy Policy URL

Host this privacy policy at one of:
- `https://storage.googleapis.com/mbg-admin-portal-[SUFFIX]/privacy-policy.html`
- A dedicated page on your company website
- A GitHub Pages URL

The Chrome Web Store requires a publicly accessible privacy policy URL.

## 6. Category

```
Productivity
```

## 7. Language

```
English (United States)
```

## 8. Visibility

```
Private (Unlisted)
```

Set to "Private" for initial release. Only users with the direct Chrome Web Store link can install the extension. Switch to "Public" after completing beta testing and receiving positive feedback.

## 9. Additional Chrome Web Store Fields

### Single Purpose Description
```
This extension injects real-time compliance validation rules into ad platform
campaign creation interfaces (Meta Ads Manager and Google Ads) to prevent
media buying errors.
```

### Permissions Justification

| Permission | Justification |
|:--|:--|
| `storage` | Store extension pairing token and user preferences |
| `activeTab` | Detect when the user navigates to a supported ad platform |
| `alarms` | Schedule periodic rule cache refresh (every 60 seconds) |
| `scripting` | Dynamically inject content scripts into ad platform pages |

### Host Permissions Justification

| Host Pattern | Justification |
|:--|:--|
| `https://adsmanager.facebook.com/*` | Inject validation UI into Meta Ads Manager |
| `https://business.facebook.com/*` | Inject validation UI into Meta Business Suite |
| `https://ads.google.com/*` | Inject validation UI into Google Ads |
| `https://mbg-backend-*-uc.a.run.app/*` | Communicate with organization backend API |

## 10. Icon Assets Required

See the "Icon Assets" section in RELEASE.md for detailed requirements.

## 11. Pre-Submission Checklist

- [ ] Screenshots taken on real ad platforms (1280x800 or 640x400)
- [ ] Privacy policy hosted at a public URL
- [ ] Icon assets created (16x16, 48x48, 128x128)
- [ ] `dist.zip` built with `pnpm build:prod`
- [ ] Extension tested against production backend (see PRODUCTION-TEST-PLAN.md)
- [ ] All permissions justifications reviewed
- [ ] Detailed description proofread (under 16,000 character limit)
- [ ] Short description under 132 character limit
