# Approval Workflow - System Diagram

## Overview
This document visualizes the complete approval request workflow for the SECOND_APPROVER enforcement mode.

---

## Workflow Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         APPROVAL REQUEST WORKFLOW                        │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────┐                                              ┌──────────────┐
│              │                                              │              │
│   BUYER      │                                              │   ADMIN      │
│ (Extension)  │                                              │  (Portal)    │
│              │                                              │              │
└──────┬───────┘                                              └──────┬───────┘
       │                                                             │
       │ 1. Create campaign                                          │
       │    Budget: $150,000                                         │
       │                                                             │
       │ 2. Rule violation detected                                 │
       │    Rule: "Budget > $100k requires approval"                │
       │    Enforcement: SECOND_APPROVER                            │
       │                                                             │
       │ 3. Show approval modal                                     │
       │    "Select approver: [Dropdown]"                           │
       │                                                             │
       │ 4. POST /api/v1/extension/approval/request                 │
       │    {                                                        │
       │      ruleId: "...",                                        │
       │      approverId: "admin-uuid",                             │
       │      campaignSnapshot: {                                   │
       │        name: "High Budget Campaign",                       │
       │        budget: 150000,                                     │
       │        objective: "CONVERSIONS"                            │
       │      }                                                     │
       │    }                                                        │
       │                                                             │
       ▼                                                             │
┌──────────────────────────────────────────────────────────────┐          │
│                         BACKEND                               │          │
│  ┌─────────────────────────────────────────────────────────┐ │          │
│  │ ApprovalService.create()                                 │ │          │
│  │  ✓ Validate approver exists                             │ │          │
│  │  ✓ Validate approver is admin/super_admin               │ │          │
│  │  ✓ Validate buyer ≠ approver                            │ │          │
│  │  ✓ Validate rule exists                                 │ │          │
│  │  ✓ Create approval_requests record                      │ │          │
│  │    status: "approval_pending"                           │ │          │
│  └─────────────────────────────────────────────────────────┘ │          │
└──────────────────────────────────────────────────────────────┘          │
       │                                                             │
       │ 5. Return { id: "request-uuid", status: "pending" }        │
       │                                                             │
       │ 6. Show "Waiting for approval..." UI                       │
       │    [Cancel Request]                                         │
       │                                                             │
       │ 7. Poll every 5s:                                          │
       │    GET /api/v1/extension/approval/requests/:id             │
       │                                                             │
       │                                                             │ 8. GET /api/v1/admin/approval/requests?status=pending
       │                                                             │
       │                                                             ▼
       │                                              ┌──────────────────────────────┐
       │                                              │ Approver Inbox               │
       │                                              │  • High Budget Campaign      │
       │                                              │    Buyer: John Doe          │
       │                                              │    Budget: $150,000         │
       │                                              │    Rule: Budget > $100k     │
       │                                              │    [Approve] [Reject]       │
       │                                              └──────────────────────────────┘
       │                                                             │
       │                                                             │ 9. PUT /api/v1/admin/approval/requests/:id
       │                                                             │    {
       │                                                             │      status: "approved",
       │                                                             │      comment: "Budget justified for Q1"
       │                                                             │    }
       │                                                             │
       ▼                                                             ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                         BACKEND                                           │
│  ┌─────────────────────────────────────────────────────────────────────┐ │
│  │ ApprovalService.updateStatus()                                      │ │
│  │  ✓ Verify current user is assigned approver                        │ │
│  │  ✓ Verify status is still "approval_pending"                       │ │
│  │  ✓ Update status to "approved"                                     │ │
│  │  ✓ Set resolvedAt timestamp                                        │ │
│  │  ✓ Store comment                                                   │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
       │                                                             │
       │ 10. Return { status: "approved", resolvedAt: "..." }       │
       │                                                             │
       │ 11. Poll detects status change                             │
       │     Status: "approved"                                      │
       │                                                             │
       │ 12. Hide "Waiting for approval" UI                         │
       │     Allow campaign creation                                │
       │     Show success: "Approved by Sarah Admin"                │
       │                                                             │
       ▼                                                             ▼
  Campaign Created                                          Inbox Updated
```

---

## Alternative Flows

### Flow 2: Rejection

```
Admin clicks [Reject]
  │
  └─> PUT /api/v1/admin/approval/requests/:id
       { status: "rejected", comment: "ROI plan needed" }
  │
  └─> Extension polls, detects "rejected"
  │
  └─> Show error: "Request rejected: ROI plan needed"
  │
  └─> Block campaign creation
```

### Flow 3: Buyer Cancellation

```
Buyer clicks [Cancel Request]
  │
  └─> DELETE /api/v1/extension/approval/requests/:id
  │
  └─> Backend soft-deletes (status: "rejected", comment: "Cancelled by buyer")
  │
  └─> Hide "Waiting for approval" UI
  │
  └─> Return to campaign form
```

---

## State Machine

```
┌─────────────────┐
│ APPROVAL_PENDING│
└────────┬────────┘
         │
         ├─────────────┐
         │             │
         ▼             ▼
    ┌─────────┐   ┌─────────┐
    │APPROVED │   │REJECTED │
    └─────────┘   └─────────┘

Transitions:
• PENDING → APPROVED: Admin approves
• PENDING → REJECTED: Admin rejects OR buyer cancels
• APPROVED → (terminal state)
• REJECTED → (terminal state)
```

---

## Database Schema

```sql
approval_requests
├── id (UUID, PK)
├── organization_id (UUID, FK → organizations.id)
├── buyer_id (UUID, FK → users.id)
├── approver_id (UUID, FK → users.id)
├── rule_id (UUID, FK → rules.id)
├── entity_snapshot (JSONB) -- Campaign data at time of request
├── status (ENUM: 'approval_pending', 'approved', 'rejected')
├── comment (TEXT, nullable) -- Approver's comment
├── requested_at (TIMESTAMP)
└── resolved_at (TIMESTAMP, nullable)

Indexes:
• organization_id
• buyer_id
• approver_id
• status
```

---

## API Endpoints

### Extension (Buyer) Endpoints

| Method | Endpoint | Purpose |
|:--|:--|:--|
| POST | `/api/v1/extension/approval/request` | Create approval request |
| GET | `/api/v1/extension/approval/requests/:id` | Poll request status |
| DELETE | `/api/v1/extension/approval/requests/:id` | Cancel pending request |

**Auth:** `X-Extension-Token: <buyer-token>`

### Admin (Approver) Endpoints

| Method | Endpoint | Purpose |
|:--|:--|:--|
| GET | `/api/v1/admin/approval/requests` | List approver inbox |
| PUT | `/api/v1/admin/approval/requests/:id` | Approve/reject |

**Auth:** `Authorization: Bearer <firebase-jwt>`

**Roles:** `admin`, `super_admin`

---

## Security Validations

1. **Approver must be admin/super_admin** (not buyer or viewer)
2. **Buyer cannot approve own requests** (approverId ≠ buyerId)
3. **Only assigned approver can approve** (request.approverId === currentUser.uid)
4. **Only pending requests can be modified**
5. **All queries scoped to organizationId** (multi-tenancy)

---

## Example Request/Response

### Create Approval Request

**Request:**
```http
POST /api/v1/extension/approval/request
X-Extension-Token: abc123def456
Content-Type: application/json

{
  "ruleId": "550e8400-e29b-41d4-a716-446655440000",
  "approverId": "660e8400-e29b-41d4-a716-446655440001",
  "campaignSnapshot": {
    "name": "Q1 Brand Campaign",
    "budget": 150000,
    "objective": "CONVERSIONS",
    "startDate": "2026-03-01",
    "endDate": "2026-03-31"
  }
}
```

**Response:**
```json
{
  "id": "770e8400-e29b-41d4-a716-446655440002",
  "organizationId": "880e8400-e29b-41d4-a716-446655440003",
  "buyerId": "990e8400-e29b-41d4-a716-446655440004",
  "approverId": "660e8400-e29b-41d4-a716-446655440001",
  "ruleId": "550e8400-e29b-41d4-a716-446655440000",
  "entitySnapshot": {
    "name": "Q1 Brand Campaign",
    "budget": 150000,
    "objective": "CONVERSIONS",
    "startDate": "2026-03-01",
    "endDate": "2026-03-31"
  },
  "status": "pending",
  "requestedAt": "2026-02-08T10:30:00Z"
}
```

### Approve Request

**Request:**
```http
PUT /api/v1/admin/approval/requests/770e8400-e29b-41d4-a716-446655440002
Authorization: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "status": "approved",
  "comment": "Budget is justified for Q1 marketing goals. Approved."
}
```

**Response:**
```json
{
  "id": "770e8400-e29b-41d4-a716-446655440002",
  "organizationId": "880e8400-e29b-41d4-a716-446655440003",
  "buyerId": "990e8400-e29b-41d4-a716-446655440004",
  "approverId": "660e8400-e29b-41d4-a716-446655440001",
  "ruleId": "550e8400-e29b-41d4-a716-446655440000",
  "entitySnapshot": {
    "name": "Q1 Brand Campaign",
    "budget": 150000,
    "objective": "CONVERSIONS",
    "startDate": "2026-03-01",
    "endDate": "2026-03-31"
  },
  "status": "approved",
  "comment": "Budget is justified for Q1 marketing goals. Approved.",
  "requestedAt": "2026-02-08T10:30:00Z",
  "resolvedAt": "2026-02-08T10:45:00Z"
}
```

---

## Integration Points

### Backend ✅ COMPLETE
- All 5 endpoints implemented
- Business logic validated
- Integration tests passing

### Admin Portal (TODO)
- Create `/admin/approvals` page
- Show pending requests table
- Approve/Reject buttons
- Filter by status

### Extension (TODO)
- Detect `enforcement: 'second_approver'` violations
- Show approval modal
- Poll request status
- Handle approval/rejection

---

**Diagram Version:** 1.0
**Last Updated:** February 8, 2026
