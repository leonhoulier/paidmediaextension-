# Approval Request Flow Implementation

This document describes the implementation of the Extension Approval Request Flow (Task #37).

## Overview

The approval request flow enables the SECOND_APPROVER enforcement mode, which requires a designated approver to review and approve campaign changes that violate specific rules before they can be published.

## Architecture

### Components

1. **API Client** (`src/api/client.ts`)
   - `createApprovalRequest()` - Creates a new approval request
   - `getApprovalRequestStatus()` - Polls for approval status
   - `cancelApprovalRequest()` - Cancels a pending request
   - Uses `fetchWithToken()` for authenticated requests with Extension Token

2. **Approval Pending Modal** (`src/components/approval-pending-modal.ts`)
   - Shadow DOM component displayed when approval is required
   - Shows approver name and email
   - Polls backend every 5 seconds for status updates
   - Handles approved/rejected/cancelled outcomes
   - Auto-destroys on completion

3. **Platform Adapters**
   - **Meta Adapter** (`src/adapters/meta/meta-adapter.ts`)
   - **Google Adapter** (`src/adapters/google/google-adapter.ts`)
   - Both implement `handleApprovalRequest()` method
   - Integrated into validation interception flow

### Flow Diagram

```
User clicks Publish
       ↓
Adapter intercepts click
       ↓
Evaluate rules
       ↓
SECOND_APPROVER violation detected?
       ↓ YES
Create approval request (POST /api/v1/extension/approval/request)
       ↓
Store request ID in chrome.storage.local
       ↓
Show ApprovalPendingModal
       ↓
Poll status every 5s (GET /api/v1/extension/approval/requests/:id)
       ↓
Status changes?
   ├─ APPROVED → Remove block, allow publish
   ├─ REJECTED → Show error, keep blocked
   └─ User cancels → DELETE request, dismiss modal
```

## Backend API Endpoints

The following endpoints are used (implemented in Task #33):

- `POST /api/v1/extension/approval/request`
  - Creates an approval request
  - Uses ExtensionTokenGuard for authentication
  - Request body: `{ ruleId, entitySnapshot }`
  - Response: `{ requestId }`

- `GET /api/v1/extension/approval/requests/:id`
  - Gets approval request status
  - Uses ExtensionTokenGuard
  - Response: `{ id, status, comment? }`

- `DELETE /api/v1/extension/approval/requests/:id`
  - Cancels an approval request
  - Uses ExtensionTokenGuard

## Usage in Adapters

### Meta Adapter Example

```typescript
// In setupValidationInterception():
const secondApprover = this.evaluationResults.filter(
  (r) => !r.passed && r.enforcement === EnforcementMode.SECOND_APPROVER,
);

if (secondApprover.length > 0) {
  document.body.classList.add('governance-creation-blocked');
  this.handleApprovalRequest(secondApprover[0]);
  return;
}

// handleApprovalRequest creates the request and shows the modal
```

### Key Implementation Details

1. **Blocking Mechanism**
   - Adds `governance-creation-blocked` class to `document.body`
   - Capture-phase event listener prevents default click behavior
   - Modal polling happens in background

2. **Persistence**
   - Approval requests stored in `chrome.storage.local`
   - Key format: `approval_{requestId}`
   - Enables resuming polling after extension reload

3. **Cleanup**
   - Modal auto-destroys on approved/rejected/cancelled
   - Polling interval cleared on destroy
   - Storage entry removed on completion

4. **Error Handling**
   - Network errors during polling logged but don't stop polling
   - Missing approver ID logs error and unblocks
   - Failed API requests show user notification

## Rule Configuration

For a rule to use SECOND_APPROVER enforcement, it must have:

```typescript
{
  enforcement: EnforcementMode.SECOND_APPROVER,
  approverId: 'user-id-of-approver', // Added in backend Task #33
}
```

The `approverId` field is used to determine who receives the approval request notification.

## Testing

Run the approval flow tests:

```bash
cd packages/extension
pnpm test approval-flow.test.ts
```

Test coverage includes:
- ✅ API client methods
- ✅ Modal rendering
- ✅ Polling behavior
- ✅ Status change handling (approved/rejected)
- ✅ Cancel functionality
- ✅ Cleanup on destroy
- ✅ Storage persistence

## Future Enhancements

1. **Toast Notifications**
   - Replace console logging with visual toast component
   - Show approval granted/rejected messages

2. **Batch Approvals**
   - Handle multiple SECOND_APPROVER violations in one request
   - Show list of pending approvals in modal

3. **Offline Support**
   - Queue approval requests when offline
   - Retry on reconnection

4. **Real-time Updates**
   - Use WebSocket/SSE instead of polling
   - Instant notification when approver responds

5. **Approval History**
   - Show recent approval requests in extension popup
   - Link to admin portal approval dashboard

## Related Tasks

- Task #33: Backend API endpoints for approval requests (prerequisite)
- Task #34: Admin portal approval dashboard
- Task #35: Email notifications for approvers
- Task #36: Approval request lifecycle management

## Files Modified

### New Files
- `packages/extension/src/api/client.ts`
- `packages/extension/src/components/approval-pending-modal.ts`
- `packages/extension/test/approval-flow.test.ts`

### Modified Files
- `packages/extension/src/components/theme.ts` (added clock icon)
- `packages/extension/src/adapters/meta/meta-adapter.ts`
- `packages/extension/src/adapters/google/google-adapter.ts`

## Status

✅ Task #37 Complete

All approval request functionality has been implemented and tested. The extension can now:
- Detect SECOND_APPROVER rule violations
- Create approval requests via the backend API
- Display approval pending modal to the user
- Poll for status updates every 5 seconds
- Handle approved/rejected/cancelled outcomes
- Persist pending requests across extension reloads
