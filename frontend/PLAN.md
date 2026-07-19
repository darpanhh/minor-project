# EduGuard AI — Frontend Implementation Plan

## Project Overview

**EduGuard AI** is an Online Exam Proctoring System with AI-powered monitoring. This plan covers the Next.js frontend architecture, component hierarchy, state management, authentication flow, API integration strategy, and a phased development roadmap.

---

## 1. Folder Structure

```
frontend/
├── app/
│   ├── (auth)/                    # Auth route group (no sidebar/navbar)
│   │   ├── login/
│   │   │   └── page.tsx
│   │   ├── register/
│   │   │   └── page.tsx
│   │   └── forgot-password/
│   │       └── page.tsx
│   ├── (dashboard)/               # Authenticated route group
│   │   ├── layout.tsx             # Shared dashboard layout (Sidebar + Navbar)
│   │   ├── page.tsx               # Role-based redirect (student/teacher)
│   │   ├── student/
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx
│   │   │   ├── exams/
│   │   │   │   ├── page.tsx
│   │   │   │   └── [examId]/
│   │   │   │       ├── page.tsx          # Exam taking
│   │   │   │       └── verify/
│   │   │   │           └── page.tsx      # Identity verification
│   │   │   └── results/
│   │   │       ├── page.tsx
│   │   │       └── [resultId]/
│   │   │           └── page.tsx
│   │   └── teacher/
│   │       ├── dashboard/
│   │       │   └── page.tsx
│   │       ├── exams/
│   │       │   ├── page.tsx
│   │       │   ├── create/
│   │       │   │   └── page.tsx
│   │       │   └── [examId]/
│   │       │       ├── page.tsx          # Exam details
│   │       │       ├── edit/
│   │       │       │   └── page.tsx
│   │       │       └── proctoring/
│   │       │           └── page.tsx      # Live proctoring dashboard
│   │       ├── results/
│   │       │   ├── page.tsx
│   │       │   └── [resultId]/
│   │       │       └── page.tsx
│   │       └── suspicious/
│   │           └── page.tsx
│   └── layout.tsx
├── api/
│   └── auth/
│       └── [...nextauth]/
│           └── route.ts
├── components/
│   ├── ui/                    # shadcn/ui primitives
│   ├── shared/                # Shared app components
│   ├── student/               # Student-specific components
│   └── teacher/               # Teacher-specific components
├── hooks/
├── lib/
│   ├── api.ts                 # Axios instance
│   ├── utils.ts               # cn() helper
│   └── validations.ts         # Zod schemas
├── providers/
│   ├── auth-provider.tsx
│   ├── query-provider.tsx
│   └── theme-provider.tsx
├── services/
│   ├── auth.service.ts
│   ├── exam.service.ts
│   ├── result.service.ts
│   ├── proctor.service.ts
│   └── user.service.ts
├── store/
│   └── auth-store.ts          # Zustand or context
├── types/
│   ├── auth.ts
│   ├── exam.ts
│   ├── result.ts
│   ├── proctor.ts
│   └── user.ts
├── middleware.ts              # Next.js middleware for route protection
└── utils/
    ├── cn.ts
    └── format.ts
```

---

## 2. Route Structure

```
/                               → Redirect to /login or /dashboard (based on auth)
/login                          → Student/Teacher login
/register                       → Registration
/forgot-password                → Password reset

/(dashboard)                    → Authenticated layout (Navbar + Sidebar)
├── /dashboard                  → Role-based redirect
├── /student/dashboard          → Student dashboard (upcoming exams, recent results)
├── /student/exams              → Available exams list
├── /student/exams/[examId]     → Exam taking page (with proctoring)
├── /student/exams/[examId]/verify → Identity verification before exam
├── /student/results            → Student results list
├── /student/results/[resultId] → Single result detail
├── /teacher/dashboard          → Teacher analytics overview
├── /teacher/exams              → Teacher exam management
├── /teacher/exams/create       → Create new exam
├── /teacher/exams/[examId]     → Exam detail/edit
├── /teacher/exams/[examId]/edit → Edit exam
├── /teacher/exams/[examId]/proctoring → Live proctoring dashboard
├── /teacher/results            → All results
├── /teacher/results/[resultId] → Single result with proctoring logs
└── /teacher/suspicious         → Suspicious activity review
```

---

## 3. Component Hierarchy

```
RootLayout
├── AuthLayout (login, register, forgot-password)
│   └── AuthForm (shared form wrapper)
│       ├── LoginForm
│       ├── RegisterForm
│       └── ForgotPasswordForm
│
└── DashboardLayout (authenticated)
    ├── Navbar (top bar with logo, nav links, notifications, avatar)
    ├── Sidebar (desktop sidebar with nav items)
    ├── BottomNav (mobile-only bottom navigation)
    └── Main Content Area
        ├── StudentDashboard
        │   ├── StatisticCard (upcoming exams, pending results, etc.)
        │   ├── ExamCard (list of upcoming exams)
        │   └── RecentResultsList
        │
        ├── TeacherDashboard
        │   ├── StatisticCard (avg score, highest, lowest, flags)
        │   ├── ScoreDistributionChart
        │   ├── AIInsightsPanel
        │   └── StudentPerformanceTable
        │
        ├── ExamModule
        │   ├── ExamListPage
        │   │   └── ExamCard[]
        │   ├── ExamCreatePage
        │   │   ├── GeneralInfoSection
        │   │   ├── SchedulingSection
        │   │   ├── QuestionManagementSection
        │   │   │   ├── QuestionCard[]
        │   │   │   └── EmptyQuestionState
        │   │   └── ProctoringSettingsSection
        │   ├── ExamDetailPage
        │   ├── ExamEditPage
        │   ├── ExamTakingPage
        │   │   ├── Timer
        │   │   ├── QuestionCard
        │   │   ├── WebcamPreview (proctoring overlay)
        │   │   └── ProctoringAlertBanner
        │   └── ExamProctoringPage (teacher live view)
        │
        ├── IdentityVerificationPage
        │   ├── WebcamPreview
        │   ├── VerificationChecklist
        │   └── ProctoringStatusFeed
        │
        └── ResultsModule
            ├── ResultCard[]
            ├── ResultDetailPage
            └── SuspiciousActivityCard[]
```

---

## 4. Shared UI Components (shadcn/ui + Custom)

### shadcn/ui Primitives to Install
- `Button`
- `Input`
- `Label`
- `Card` (Card, CardHeader, CardTitle, CardContent, CardFooter)
- `Select`
- `Dialog`
- `Sheet` (for mobile sidebar)
- `Table`
- `Badge`
- `Avatar`
- `Tabs`
- `Progress`
- `Skeleton`
- `Toast` / `Sonner`
- `Tooltip`
- `Separator`
- `ScrollArea`
- `Checkbox`
- `RadioGroup`
- `Textarea`
- `Form` (react-hook-form + zod integration)
- `Alert`
- `Pagination`

### Custom Shared Components

| Component | Props | Description |
|---|---|---|
| `Navbar` | `user`, `notifications` | Top bar with logo, nav links, notification bell, avatar |
| `Sidebar` | `role`, `activePath` | Desktop sidebar with role-based nav items |
| `BottomNav` | `activePath` | Mobile-only bottom navigation bar |
| `ExamCard` | `exam`, `role` | Card showing exam title, date, status, action button |
| `QuestionCard` | `question`, `index`, `onAnswer` | Question display with options, used in exam taking |
| `Timer` | `duration`, `onTimeUp` | Countdown timer with visual warning at low time |
| `WebcamPreview` | `stream`, `status` | Live webcam feed with AI overlay frame |
| `VerificationChecklist` | `checks[]`, `allComplete` | Step-by-step verification status list |
| `AlertBanner` | `type`, `message`, `dismissible` | Top banner for warnings, errors, success |
| `StatusIndicator` | `status`, `label` | Dot + label for camera/mic/face status |
| `StatisticCard` | `title`, `value`, `icon`, `trend`, `color` | Summary metric card |
| `ResultCard` | `result` | Score, status, integrity percentage |
| `SuspiciousActivityCard` | `activity` | Flag details with timestamp, type, severity |
| `ProctoringStatusFeed` | `logs[]` | Monospaced AI log feed overlay |
| `ScoreDistributionChart` | `data` | Bar chart for score distribution |
| `StudentPerformanceTable` | `students[]` | Sortable table with search |
| `AIInsightsPanel` | `insights[]` | Colored insight cards with severity |
| `EmptyState` | `icon`, `title`, `description`, `actions` | Reusable empty state placeholder |
| `BreadcrumbNav` | `items[]` | Breadcrumb navigation |
| `Pagination` | `page`, `totalPages`, `onChange` | Page navigation |
| `SearchInput` | `placeholder`, `onSearch` | Search with icon |
| `ThemeToggle` | — | Light/dark mode toggle |
| `NotificationBell` | `count` | Notification dropdown |
| `UserAvatar` | `name`, `image`, `size` | Avatar with initials fallback |
| `LoadingSpinner` | `size` | Reusable spinner |
| `PageHeader` | `title`, `description`, `actions` | Page title area with breadcrumb |
| `DraftModeBadge` | — | Pulse badge for draft mode |
| `ProctoringSettingsCard` | `settings` | AI proctoring config display |
| `SuspiciousActivityTable` | `activities[]` | Table of flagged activities |
| `AIInsightCard` | `type`, `title`, `description` | Colored insight card with left border |
| `BentoGrid` | `children` | 12-column grid layout wrapper |
| `FormSection` | `title`, `icon`, `children` | Card wrapper for form sections |
| `StatusBadge` | `status` | Passed/Failed/Flagged badge |
| `IntegrityScore` | `score`, `status` | Verified/warning icon + percentage |
| `PaginationBar` | `page`, `total`, `onChange` | Table pagination |
| `MobileBottomNav` | `items[]` | Fixed bottom nav for mobile |
| `Footer` | — | Site footer with links |
| `ProctoringOverlay` | — | Face detection frame overlay on webcam |
| `AIMonitoringFeed` | `logs[]` | Scrolling monospaced log feed |
| `SkeletonCard` | — | Loading skeleton for cards |
| `ConfirmDialog` | — | Confirmation modal |
| `FileUpload` | — | Drag-and-drop file upload |
| `RichTextEditor` | — | For question descriptions |
```

---

## 5. Feature-Based Folder Organization

```
components/
├── ui/                    # shadcn/ui generated components
│   ├── button.tsx
│   ├── input.tsx
│   ├── card.tsx
│   ├── badge.tsx
│   ├── avatar.tsx
│   ├── select.tsx
│   ├── dialog.tsx
│   ├── sheet.tsx
│   ├── table.tsx
│   ├── tabs.tsx
│   ├── progress.tsx
│   ├── skeleton.tsx
│   ├── toast.tsx
│   ├── tooltip.tsx
│   ├── separator.tsx
│   ├── scroll-area.tsx
│   ├── checkbox.tsx
│   ├── radio-group.tsx
│   ├── textarea.tsx
│   ├── form.tsx
│   ├── alert.tsx
│   ├── pagination.tsx
│   └── sonner.tsx
│
├── shared/                     # Shared app components
│   ├── Navbar.tsx
│   ├── Sidebar.tsx
│   ├── BottomNav.tsx
│   ├── Footer.tsx
│   ├── PageHeader.tsx
│   ├── BreadcrumbNav.tsx
│   ├── StatisticCard.tsx
│   ├── StatusBadge.tsx
│   ├── StatusIndicator.tsx
│   ├── AlertBanner.tsx
│   ├── LoadingSpinner.tsx
│   ├── EmptyState.tsx
│   ├── SearchInput.tsx
│   ├── PaginationBar.tsx
│   ├── ThemeToggle.tsx
│   ├── NotificationBell.tsx
│   ├── UserAvatar.tsx
│   ├── DraftModeBadge.tsx
│   ├── SkeletonCard.tsx
│   ├── ConfirmDialog.tsx
│   └── FileUpload.tsx
│
├── student/
│   ├── ExamCard.tsx
│   ├── UpcomingExamsList.tsx
│   └── RecentResultsList.tsx
│
├── teacher/
│   ├── StatisticCard.tsx
│   ├── ScoreDistributionChart.tsx
│   ├── AIInsightsPanel.tsx
│   ├── AIInsightCard.tsx
│   ├── StudentPerformanceTable.tsx
│   ├── SuspiciousActivityTable.tsx
│   └── SuspiciousActivityCard.tsx
│
├── exam/
│   ├── ExamCard.tsx
│   ├── QuestionCard.tsx
│   ├── Timer.tsx
│   ├── QuestionManagement.tsx
│   ├── EmptyQuestionState.tsx
│   ├── GeneralInfoSection.tsx
│   ├── SchedulingSection.tsx
│   ├── ProctoringSettingsCard.tsx
│   └── DraftModeBadge.tsx
│
├── verification/
│   ├── WebcamPreview.tsx
│   ├── VerificationChecklist.tsx
│   ├── VerificationStep.tsx
│   ├── ProctoringStatusFeed.tsx
│   └── FaceDetectionOverlay.tsx
│
└── results/
    ├── ResultCard.tsx
    ├── SuspiciousActivityCard.tsx
    ├── ScoreDistributionChart.tsx
    ├── AIInsightsPanel.tsx
    ├── AIInsightCard.tsx
    ├── StudentPerformanceTable.tsx
    └── SuspiciousActivityTable.tsx
```

---

## 6. State Management Strategy

| State Type | Solution | Details |
|---|---|---|
| **Server State** | TanStack Query | All API data fetching, caching, invalidation |
| **Auth State** | Zustand store + Next.js middleware | JWT token in localStorage/httpOnly cookie, user object |
| **Form State** | React Hook Form + Zod | All forms (login, register, exam create, etc.) |
| **UI State** | React useState/useReducer | Modals, toggles, timers, local UI state |
| **Webcam State** | React ref + custom hook | `useWebcam` hook for media stream management |
| **Proctoring State** | Zustand store | Real-time proctoring events, flags, logs |

### Zustand Stores

```
stores/
├── auth-store.ts          # user, token, login/logout actions
├── proctor-store.ts       # proctoring events, flags, isMonitoring
└── ui-store.ts            # sidebar open, theme, notifications
```

---

## 7. Authentication Flow

```
1. User visits /login
2. Submits credentials (email + password)
3. POST /api/auth/login → FastAPI returns { access_token, refresh_token, user }
4. Store tokens:
   - access_token → Zustand store (memory) + httpOnly cookie via Next.js API route
   - refresh_token → httpOnly cookie
5. Next.js middleware checks token on every protected route request
6. On 401 → attempt refresh token → if fails, redirect to /login
7. On logout → clear tokens → redirect to /login
```

### Middleware Protection

```typescript
// middleware.ts
// Checks for JWT token in cookies
// If no token → redirect to /login
// If token present → decode role → allow/deny based on route group
// Student routes: /student/*
// Teacher routes: /teacher/*
// Public routes: /login, /register, /forgot-password
```

---

## 8. API Integration Strategy

### Axios Instance (`lib/api.ts`)

```typescript
// Base Axios instance with:
// - baseURL from env NEXT_PUBLIC_API_URL
// - Request interceptor: attach Authorization header
// - Response interceptor: handle 401 → refresh token → retry
// - Error interceptor: normalize error responses
```

### TanStack Query Hooks

```
hooks/
├── useAuth.ts          # useLogin, useRegister, useLogout, useMe
├── useExams.ts         # useExams, useExam, useCreateExam, useUpdateExam, useDeleteExam
├── useQuestions.ts     # useQuestions, useCreateQuestion, useUpdateQuestion, useDeleteQuestion
├── useResults.ts       # useResults, useResult, useStudentResults
├── useProctoring.ts    # useProctoringSession, useProctoringLogs
├── useUsers.ts         # useStudents, useStudentDetail
└── useDashboard.ts     # useStudentDashboard, useTeacherDashboard
```

---

## 9. Protected Routes

### Middleware Strategy (`middleware.ts`)

```typescript
// Next.js middleware runs on every request
// 1. Extract token from cookies
// 2. If no token → redirect to /login
// 3. If token expired → attempt refresh → if fail → redirect to /login
// 4. Decode JWT → extract role
// 5. Check route pattern:
//    - /student/* → role must be "student"
//    - /teacher/* → role must be "teacher"
//    - /login, /register → redirect to dashboard if already authenticated
// 6. If role mismatch → redirect to appropriate dashboard or 403
```

### Route Protection Matrix

| Route | Auth Required | Role Required |
|---|---|---|
| `/login` | No | — |
| `/register` | No | — |
| `/forgot-password` | No | — |
| `/student/*` | Yes | student |
| `/teacher/*` | Yes | teacher |
| `/api/*` | Yes (via middleware) | any authenticated |

---

## 9. Authentication Flow

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Login Page  │────▶│  POST /auth  │────▶│  JWT Issued  │
│  /login      │     │  /login      │     │  + Refresh    │
└─────────────┘     └──────────────┘     └──────┬───────┘
                                                 │
                                                 ▼
┌──────────────────────────────────────────────────────────┐
│  Store access_token in Zustand + httpOnly cookie          │
│  Store refresh_token in httpOnly cookie                   │
│  Decode JWT → extract role (student/teacher)              │
│  Redirect to /student/dashboard or /teacher/dashboard     │
└──────────────────────────────────────────────────────────┘
```

---

## 10. Student Workflow

```
1. Login → /student/dashboard
2. Dashboard shows:
   - Upcoming exams (cards with countdown)
   - Recent results
   - Quick stats
3. Click exam card → /student/exams/[examId]/verify
4. Identity verification page:
   - Webcam activates
   - Camera check ✓
   - Audio check ✓
   - Face match ✓
   - Room scan ✓
   - All checks pass → "Start Exam" enabled
5. Click "Start Exam" → /student/exams/[examId]
6. Exam page:
   - Timer counting down
   - Questions displayed one at a time or paginated
   - Webcam preview (small PiP) with proctoring overlay
   - AI monitoring running in background
   - Tab switch detection → alert banner
7. Submit exam → confirmation → redirect to results
8. View results → /student/results/[resultId]
```

---

## 11. Teacher Workflow

```
1. Login → /teacher/dashboard
2. Dashboard shows:
   - Summary stats (avg score, highest, lowest, flags)
   - Score distribution chart
   - AI insights panel
   - Recent student performance table
3. Manage exams → /teacher/exams
   - View all exams
   - Create new exam → /teacher/exams/create
   - Edit exam → /teacher/exams/[examId]/edit
   - View exam details → /teacher/exams/[examId]
4. Create exam flow:
   - General info (title, subject, marks, description)
   - Scheduling (date, time, duration)
   - Question management (add/edit/reorder/import)
   - AI proctoring settings (face verify, tab lockout, etc.)
   - Save as draft or publish
5. View proctoring → /teacher/exams/[examId]/proctoring
   - Live webcam feeds (grid)
   - Real-time alerts
   - Session logs
6. View results → /teacher/results
   - Score distribution chart
   - Student performance table
   - AI insights panel
7. Review suspicious activity → /teacher/suspicious
   - Flagged sessions
   - Evidence (screenshots, logs)
   - Mark as reviewed / dismiss
```

---

## 12. Verification Workflow

```
1. Student clicks "Start Exam" on an exam card
2. Redirected to /student/exams/[examId]/verify
3. Webcam activates (useWebcam hook)
4. Verification checks run sequentially:
   a. Camera Access → check if webcam stream is active
   b. Audio Check → check if microphone is accessible
   c. Identity Match → POST /api/proctor/verify-face (future AI)
   d. Room Scan → POST /api/proctor/scan-room (future AI)
5. Each check shows: pending → in-progress (spinner) → complete (checkmark)
6. All checks pass → "Start Exam" button enabled
7. Click "Start Exam" → navigate to /student/exams/[examId]
```

---

## 12. Verification Workflow

```
┌─────────────────────────────────────────────────────────┐
│  /student/exams/[examId]/verify                           │
│                                                          │
│  ┌─────────────────────┐   ┌──────────────────────────┐  │
│  │  Webcam Preview     │   │  Verification Checklist  │  │
│  │                     │   │                          │  │
│  │  ┌─────────────┐    │   │  ✓ Camera Access         │  │
│  │  │ Face Frame  │    │   │  ✓ Audio Check           │  │
│  │  │ Overlay     │    │   │  ✓ Identity Match        │  │
│  │  └─────────────┘    │   │  ⟳ Room Scan...          │  │
│  │                     │   │                          │  │
│  │  [Camera OK] [Face] │   │  [Start Exam]            │  │
│  └─────────────────────┘   └──────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

---

## 13. Exam Workflow

```
Teacher:
1. Create exam → /teacher/exams/create
   - Fill general info (title, subject, marks, description)
   - Set scheduling (date, start/end time, duration)
   - Add questions (manual or import from bank)
   - Configure AI proctoring settings
   - Save as draft or publish
2. Published exam appears in student dashboard
3. Monitor exam → /teacher/exams/[examId]/proctoring
   - View live sessions
   - See real-time flags
   - Review suspicious activity

Student:
1. View upcoming exams → /student/exams
2. Click exam → /student/exams/[examId]/verify
3. Complete identity verification
4. Start exam → /student/exams/[examId]
5. Answer questions within time limit
6. Submit exam → confirmation screen
7. View result → /student/results/[resultId]
```

---

## 14. Result Workflow

```
Student:
1. Navigate to /student/results
2. See list of completed exams with scores
3. Click result → /student/results/[resultId]
4. View:
   - Score and grade
   - Question-by-question breakdown
   - Time spent
   - Integrity score
   - Proctoring summary (no flags / warnings)

Teacher:
1. Navigate to /teacher/results
2. See overview:
   - Average score, highest, lowest
   - Score distribution chart
   - AI insights panel
3. Search/filter students
4. Click student → /teacher/results/[resultId]
5. View:
   - Student's score breakdown
   - Proctoring log
   - Suspicious activity timeline
   - Screenshot evidence (future)
   - AI integrity score
6. Actions: flag for review, dismiss flag, export report
```

---

## 15. Future AI Integration Points

### 1. Face Verification

| Aspect | Detail |
|---|---|
| **API Endpoint** | `POST /api/proctor/verify-face` |
| **Request Body** | `{ exam_id: string, image: base64 }` |
| **Expected Response** | `{ verified: boolean, confidence: number, landmarks: number, message: string }` |
| **Loading State** | Spinner on VerificationChecklist step, "Verifying identity..." text |
| **Error Handling** | Retry button if confidence < threshold; fallback to manual verification |

### 2. Face Recognition

| Aspect | Detail |
|---|---|
| **API Endpoint** | `POST /api/proctor/recognize-face` |
| **Request Body** | `{ exam_id: string, student_id: string, image: base64 }` |
| **Expected Response** | `{ matched: boolean, confidence: number, student_id: string, message: string }` |
| **Loading State** | Face detection overlay scanning animation, "Matching identity..." |
| **Error Handling** | "Face not recognized" alert → retry or contact proctor |

### 3. Multiple Person Detection

| Aspect | Detail |
|---|---|
| **API Endpoint** | `POST /api/proctor/detect-persons` |
| **Request Body** | `{ exam_session_id: string, image: base64 }` |
| **Expected Response** | `{ person_count: number, persons_detected: Array<{bbox, confidence}>, alert: boolean }` |
| **Loading State** | Scanning indicator on webcam overlay |
| **Error Handling** | Alert banner "Multiple persons detected" → pause exam → notify proctor |

### 4. Mobile Phone Detection

| Aspect | Detail |
|---|---|
| **API Endpoint** | `POST /api/proctor/detect-phone` |
| **Request Body** | `{ exam_session_id: string, image: base64 }` |
| **Expected Response** | `{ phone_detected: boolean, confidence: number, bbox?: {x,y,w,h} }` |
| **Loading State** | Scanning indicator on webcam overlay |
| **Error Handling** | Alert banner "Mobile phone detected" → log to cheating log → notify proctor |

### 5. Looking Away Detection

| Aspect | Detail |
|---|---|
| **API Endpoint** | `POST /api/proctor/detect-gaze` |
| **Request Body** | `{ exam_session_id: string, image: base64 }` |
| **Expected Response** | `{ looking_away: boolean, gaze_direction: string, duration_ms: number, confidence: number }` |
| **Loading State** | Gaze tracking indicator on webcam overlay |
| **Error Handling** | Warning banner after threshold exceeded → log to cheating log |

### 6. No Person Detection

| Aspect | Detail |
|---|---|
| **API Endpoint** | `POST /api/proctor/detect-person` |
| **Request Body** | `{ exam_session_id: string, image: base64 }` |
| **Expected Response** | `{ person_present: boolean, confidence: number }` |
| **Loading State** | Person detection indicator on webcam overlay |
| **Error Handling** | Alert banner "No person detected" → pause exam → notify proctor |

### 7. Tab Switching Detection

| Aspect | Detail |
|---|---|
| **API Endpoint** | Client-side only (no API needed) |
| **Implementation** | `visibilitychange` event listener + `blur` event |
| **Expected Response** | N/A — client-side event → log to server via `POST /api/proctor/log-event` |
| **Loading State** | N/A |
| **Error Handling** | Alert banner "Tab switch detected" → log count → notify proctor after threshold |

### 8. Voice Detection

| Aspect | Detail |
|---|---|
| **API Endpoint** | `POST /api/proctor/detect-voice` |
| **Request Body** | `{ exam_session_id: string, audio_chunk: base64 }` |
| **Expected Response** | `{ voice_detected: boolean, confidence: number, duration_ms: number }` |
| **Loading State** | Audio level indicator on webcam overlay |
| **Error Handling** | Alert banner "Voice detected" → log to cheating log |

### 9. Cheating Log Generation

| Aspect | Detail |
|---|---|
| **API Endpoint** | `POST /api/proctor/log-event` |
| **Request Body** | `{ exam_session_id: string, event_type: string, severity: string, metadata: object, timestamp: string }` |
| **Expected Response** | `{ logged: boolean, event_id: string }` |
| **Loading State** | N/A (fire-and-forget) |
| **Error Handling** | Queue failed logs locally and retry |

### 10. Screenshot Capture

| Aspect | Detail |
|---|---|
| **API Endpoint** | `POST /api/proctor/capture-screenshot` |
| **Request Body** | `{ exam_session_id: string, image: base64, timestamp: string }` |
| **Expected Response** | `{ captured: boolean, screenshot_id: string, url: string }` |
| **Loading State** | Camera shutter animation |
| **Error Handling** | Retry on failure; store locally and upload when connection restores |

### 11. Live Webcam Streaming

| Aspect | Detail |
|---|---|
| **API Endpoint** | `WebSocket /ws/proctor/{exam_session_id}` |
| **Expected Response** | Bidirectional stream: client sends frames, server returns detection events |
| **Loading State** | "Connecting to proctoring service..." overlay |
| **Error Handling** | Reconnect on disconnect; alert "Proctoring connection lost" |

---

## 16. Design System (from UI Examples)

### Color Palette

```
primary:        #004ac6
primary-container: #2563eb
on-primary:     #ffffff
on-primary-container: #eeefff
primary-fixed:  #dbe1ff
primary-fixed-dim: #b4c5ff

secondary:      #505f76
secondary-container: #d0e1fb
secondary-fixed: #d3e4fe
on-secondary:   #ffffff

surface:        #faf8ff
surface-dim:    #d2d9f4
surface-container: #eaedff
surface-container-low: #f2f3ff
surface-container-lowest: #ffffff
surface-container-high: #e2e7ff
surface-container-highest: #dae2fd
surface-bright: #faf8ff
surface-variant: #dae2fd

on-surface:     #131b2e
on-surface-variant: #434655

error:          #ba1a1a
error-container: #ffdad6
on-error:       #ffffff

outline:        #737686
outline-variant: #c3c6d7

inverse-surface: #283044
inverse-on-surface: #eef0ff
inverse-primary: #b4c5ff
```

### Typography

| Token | Font | Size | Weight | Line Height |
|---|---|---|---|---|
| `headline-lg` | Inter | 30px | 700 | 36px |
| `headline-lg-mobile` | Inter | 24px | 700 | 32px |
| `headline-md` | Inter | 20px | 600 | 28px |
| `body-md` | Inter | 16px | 400 | 24px |
| `body-sm` | Inter | 14px | 400 | 20px |
| `label-caps` | Geist | 12px | 600 | 16px |
| `code-mono` | Geist | 14px | 400 | 20px |

### Spacing System

```
xs: 8px    sm: 12px    md: 16px    lg: 24px    xl: 32px
base: 4px  gutter: 12px  container-margin: 16px
```

### Border Radius

```
DEFAULT: 4px    lg: 8px    xl: 12px    full: 9999px
```

---

## 16. Tailwind CSS v4 Configuration

Since the project uses Tailwind CSS v4 (with `@tailwindcss/postcss`), the custom theme should be defined in `globals.css` using `@theme` directive:

```css
@import "tailwindcss";

@theme {
  --color-primary: #004ac6;
  --color-primary-container: #2563eb;
  --color-on-primary: #ffffff;
  --color-on-primary-container: #eeefff;
  --color-primary-fixed: #dbe1ff;
  --color-primary-fixed-dim: #b4c5ff;
  --color-on-primary-fixed: #00174b;
  --color-on-primary-fixed-variant: #003ea8;
  --color-inverse-primary: #b4c5ff;

  --color-secondary: #505f76;
  --color-secondary-container: #d0e1fb;
  --color-secondary-fixed: #d3e4fe;
  --color-secondary-fixed-dim: #b7c8e1;
  --color-on-secondary: #ffffff;
  --color-on-secondary-container: #54647a;
  --color-on-secondary-fixed: #0b1c30;
  --color-on-secondary-fixed-variant: #38485d;

  --color-tertiary: #525657;
  --color-tertiary-container: #6b6e70;
  --color-tertiary-fixed: #e0e3e5;
  --color-tertiary-fixed-dim: #c4c7c9;
  --color-on-tertiary: #ffffff;
  --color-on-tertiary-container: #eff1f3;
  --color-on-tertiary-fixed: #191c1e;
  --color-on-tertiary-fixed-variant: #444749;

  --color-error: #ba1a1a;
  --color-error-container: #ffdad6;
  --color-on-error: #ffffff;
  --color-on-error-container: #93000a;

  --color-surface: #faf8ff;
  --color-surface-dim: #d2d9f4;
  --color-surface-bright: #faf8ff;
  --color-surface-container-lowest: #ffffff;
  --color-surface-container-low: #f2f3ff;
  --color-surface-container: #eaedff;
  --color-surface-container-high: #e2e7ff;
  --color-surface-container-highest: #dae2fd;
  --color-surface-variant: #dae2fd;

  --color-on-surface: #131b2e;
  --color-on-surface-variant: #434655;

  --color-outline: #737686;
  --color-outline-variant: #c3c6d7;

  --color-inverse-surface: #283044;
  --color-inverse-on-surface: #eef0ff;
  --color-inverse-primary: #b4c5ff;

  --color-background: #faf8ff;
  --color-on-background: #131b2e;

  --font-headline-lg-mobile: Inter, sans-serif;
  --font-body-sm: Inter, sans-serif;
  --font-body-md: Inter, sans-serif;
  --font-label-caps: Geist, sans-serif;
  --font-headline-lg: Inter, sans-serif;
  --font-code-mono: Geist, monospace;
  --font-headline-md: Inter, sans-serif;

  --text-headline-lg-mobile: 24px;
  --text-headline-lg-mobile--line-height: 32px;
  --text-headline-lg-mobile--letter-spacing: -0.01em;
  --text-headline-lg-mobile--font-weight: 700;

  --text-body-sm: 14px;
  --text-body-sm--line-height: 20px;

  --text-body-md: 16px;
  --text-body-md--line-height: 24px;

  --text-label-caps: 12px;
  --text-label-caps--line-height: 16px;
  --text-label-caps--letter-spacing: 0.05em;
  --text-label-caps--font-weight: 600;

  --text-headline-lg: 30px;
  --text-headline-lg--line-height: 36px;
  --text-headline-lg--letter-spacing: -0.02em;
  --text-headline-lg--font-weight: 700;

  --text-code-mono: 14px;
  --text-code-mono--line-height: 20px;

  --text-headline-md: 20px;
  --text-headline-md--line-height: 28px;
  --text-headline-md--font-weight: 600;

  --spacing-xs: 8px;
  --spacing-sm: 12px;
  --spacing-md: 16px;
  --spacing-lg: 24px;
  --spacing-xl: 32px;
  --spacing-base: 4px;
  --spacing-gutter: 12px;
  --spacing-container-margin: 16px;

  --radius-lg: 8px;
  --radius-xl: 12px;
}
```

---

## 17. Dependencies to Install

```bash
# UI & Icons
npx shadcn@latest init
npx shadcn@latest add button input card badge avatar select dialog sheet table tabs progress skeleton toast tooltip separator scroll-area checkbox radio-group textarea form alert pagination

npm install lucide-react

# Forms & Validation
npm install react-hook-form @hookform/resolvers zod

# HTTP & Data Fetching
npm install axios @tanstack/react-query

# State Management
npm install zustand

# Date Handling
npm install date-fns

# Webcam
npm install react-webcam
```

---

## 18. Development Roadmap

### Milestone 1: Authentication
**Duration:** 3-4 days

**Tasks:**
- [ ] Install all dependencies (shadcn/ui, lucide-react, axios, react-hook-form, zod, tanstack query, zustand, date-fns, react-webcam)
- [ ] Configure Tailwind CSS v4 theme in `globals.css` with EduGuard color palette
- [ ] Add Inter and Geist fonts via next/font/google
- [ ] Create `lib/utils.ts` with `cn()` helper
- [ ] Create `lib/api.ts` — Axios instance with interceptors
- [ ] Create `types/auth.ts` — User, LoginRequest, RegisterRequest, AuthResponse
- [ ] Create `services/auth.service.ts` — login, register, logout, refresh, getMe
- [ ] Create `store/auth-store.ts` — Zustand store for auth state
- [ ] Create `providers/auth-provider.tsx` — Auth context wrapper
- [ ] Create `providers/query-provider.tsx` — TanStack Query provider
- [ ] Create `hooks/useAuth.ts` — Auth hooks
- [ ] Build Login page (`/login`) with React Hook Form + Zod validation
- [ ] Build Register page (`/register`)
- [ ] Build Forgot Password page (`/forgot-password`)
- [ ] Create `middleware.ts` for route protection
- [ ] Create `(auth)/layout.tsx` — Auth layout (centered card, no sidebar)
- [ ] Create `(dashboard)/layout.tsx` — Dashboard layout (Navbar + Sidebar + BottomNav)

### Milestone 2: Student Dashboard
**Duration:** 2-3 days

**Tasks:**
- [ ] Create `(dashboard)/layout.tsx` with Navbar, Sidebar, BottomNav
- [ ] Build `Navbar` component (logo, nav links, notification bell, avatar)
- [ ] Build `Sidebar` component (role-based navigation items)
- [ ] Build `BottomNav` component (mobile-only)
- [ ] Build `Footer` component
- [ ] Build `StatisticCard` component
- [ ] Build `ExamCard` component (student view)
- [ ] Build `EmptyState` component
- [ ] Build `PageHeader` component
- [ ] Build `SearchInput` component
- [ ] Build `PaginationBar` component
- [ ] Build `StatusBadge` component
- [ ] Build `UserAvatar` component
- [ ] Build `NotificationBell` component
- [ ] Build `ThemeToggle` component
- [ ] Create `/student/dashboard` page
- [ ] Create `/student/exams` page (exam listing)
- [ ] Create `/student/results` page (results listing)

### Milestone 3: Teacher Dashboard
**Duration:** 2-3 days

**Tasks:**
- [ ] Build `StatisticCard` component (teacher variant with color-coded icons)
- [ ] Build `ScoreDistributionChart` component (bar chart placeholder)
- [ ] Build `AIInsightsPanel` component
- [ ] Build `AIInsightCard` component (colored left border)
- [ ] Build `StudentPerformanceTable` component (sortable, searchable)
- [ ] Build `SuspiciousActivityTable` component
- [ ] Build `SuspiciousActivityCard` component
- [ ] Build `PaginationBar` component
- [ ] Create `/teacher/dashboard` page
- [ ] Create `/teacher/exams` page (exam management list)
- [ ] Create `/teacher/results` page
- [ ] Create `/teacher/suspicious` page

### Milestone 4: Exam Module
**Duration:** 3-4 days

**Tasks:**
- [ ] Build `GeneralInfoSection` component (title, subject, marks, description)
- [ ] Build `SchedulingSection` component (date, start/end time, duration)
- [ ] Build `QuestionManagement` component (add/edit/reorder/delete questions)
- [ ] Build `QuestionCard` component (question text, options, correct answer)
- [ ] Build `EmptyQuestionState` component
- [ ] Build `ProctoringSettingsCard` component
- [ ] Build `DraftModeBadge` component
- [ ] Build `BreadcrumbNav` component
- [ ] Build `Timer` component
- [ ] Build `QuestionCard` (exam-taking variant with option selection)
- [ ] Create `/teacher/exams/create` page
- [ ] Create `/teacher/exams/[examId]` page
- [ ] Create `/teacher/exams/[examId]/edit` page
- [ ] Create `/student/exams` page
- [ ] Create `/student/exams/[examId]` page (exam taking)

### Milestone 5: Identity Verification UI
**Duration:** 2 days

**Tasks:**
- [ ] Create `useWebcam` hook (media stream management)
- [ ] Build `WebcamPreview` component (with face frame overlay)
- [ ] Build `VerificationChecklist` component
- [ ] Build `VerificationStep` component (icon, label, status)
- [ ] Build `ProctoringStatusFeed` component (monospaced AI log)
- [ ] Build `FaceDetectionOverlay` component (corner brackets)
- [ ] Build `StatusIndicator` component (dot + label)
- [ ] Create `/student/exams/[examId]/verify` page
- [ ] Simulate verification flow (camera → audio → face → room)
- [ ] Wire up "Start Exam" button → navigate to exam page

### Milestone 6: Results
**Duration:** 2 days

**Tasks:**
- [ ] Build `ResultCard` component
- [ ] Build `SuspiciousActivityCard` component
- [ ] Build `ScoreDistributionChart` component (bar chart)
- [ ] Build `AIInsightsPanel` component
- [ ] Build `AIInsightCard` component
- [ ] Build `StudentPerformanceTable` component
- [ ] Build `SuspiciousActivityTable` component
- [ ] Build `IntegrityScore` component
- [ ] Create `/student/results` page
- [ ] Create `/student/results/[resultId]` page
- [ ] Create `/teacher/results` page
- [ ] Create `/teacher/results/[resultId]` page
- [ ] Create `/teacher/suspicious` page

### Milestone 7: API Integration
**Duration:** 3-4 days

**Tasks:**
- [ ] Create all service files (`services/*.service.ts`)
- [ ] Create all TanStack Query hooks (`hooks/use*.ts`)
- [ ] Create all TypeScript types (`types/*.ts`)
- [ ] Create Zod validation schemas (`lib/validations.ts`)
- [ ] Wire up login/register forms to real API
- [ ] Wire up student dashboard to real API
- [ ] Wire up teacher dashboard to real API
- [ ] Wire up exam CRUD to real API
- [ ] Wire up exam taking (fetch questions, submit answers)
- [ ] Wire up results to real API
- [ ] Wire up identity verification to real API
- [ ] Add loading skeletons for all data-fetching states
- [ ] Add error boundaries and error states
- [ ] Add toast notifications for success/error feedback

### Milestone 8: AI Integration
**Duration:** 3-4 days

**Tasks:**
- [ ] Create `services/proctor.service.ts` — all AI API calls
- [ ] Create `hooks/useProctoring.ts` — WebSocket connection + event handling
- [ ] Create `store/proctor-store.ts` — real-time proctoring state
- [ ] Integrate Face Verification API into verification flow
- [ ] Integrate Face Recognition API
- [ ] Integrate Multiple Person Detection (periodic polling)
- [ ] Integrate Mobile Phone Detection (periodic polling)
- [ ] Integrate Looking Away Detection (periodic polling)
- [ ] Integrate No Person Detection (periodic polling)
- [ ] Implement Tab Switching Detection (client-side)
- [ ] Implement Voice Detection (client-side audio capture + API)
- [ ] Implement Cheating Log Generation (fire-and-forget)
- [ ] Implement Screenshot Capture (periodic canvas capture)
- [ ] Implement Live Webcam Streaming (WebSocket)
- [ ] Build teacher's live proctoring dashboard
- [ ] Add real-time alert notifications
- [ ] Add proctoring session replay (future)
```

---

## 18. Key Design Patterns from UI Examples

### Bento Grid Layout
The teacher analytics page uses a 12-column grid (`grid-cols-12`) with cards spanning different column counts. This pattern should be used consistently for dashboard layouts.

### Card Hover Effects
```css
card.addEventListener('mouseenter', () => {
    card.style.transform = 'translateY(-2px)';
    card.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
});
```

### Pulse Animation
```css
.proctor-pulse {
    animation: pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
```

### Shimmer Effect
```css
.shimmer {
    background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
    background-size: 200% 100%;
    animation: shimmer 2s infinite;
}
```

### Input Focus Micro-interaction
```typescript
input.addEventListener('focus', () => {
    input.parentElement.querySelector('label')?.classList.add('text-primary');
});
input.addEventListener('blur', () => {
    input.parentElement.querySelector('label')?.classList.remove('text-primary');
});
```

---

## 19. Key Implementation Notes

### Tailwind v4 Migration
- Use `@theme` directive in `globals.css` (not `tailwind.config.js`)
- Use `@import "tailwindcss"` instead of `@tailwind` directives
- Custom colors are defined as CSS variables in `@theme`
- Font families, font sizes, spacing, and border radius are all defined in `@theme`

### Material Symbols
- Use `<span className="material-symbols-outlined" data-icon="icon_name">icon_name</span>`
- Load from Google Fonts CDN in `layout.tsx` `<head>`
- Font variation settings: `font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24`

### Lucide Icons (Alternative)
- Import individual icons: `import { Shield, User, Bell } from "lucide-react"`
- Use as React components: `<Shield className="text-primary" />`
- Prefer Lucide for interactive elements, Material Symbols for decorative/static

### Animations
- `proctor-pulse`: pulse-ring animation for live indicators
- `shimmer`: shimmer effect for loading states
- `pulse-dot`: pulsing dot for status indicators
- Card hover: translateY(-2px) + shadow transition
- Button active: scale(0.95) on click
- Input focus: ring + border color transition

---

## 19. API Endpoints (Expected from FastAPI Backend)

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/login` | Login with email + password |
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/logout` | Invalidate refresh token |
| GET | `/api/auth/me` | Get current user profile |

### Exams
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/exams` | List exams (filterable by role) |
| POST | `/api/exams` | Create exam (teacher) |
| GET | `/api/exams/{id}` | Get exam details |
| PUT | `/api/exams/{id}` | Update exam (teacher) |
| DELETE | `/api/exams/{id}` | Delete exam (teacher) |
| PATCH | `/api/exams/{id}/publish` | Publish exam |
| GET | `/api/exams/{id}/questions` | Get exam questions |
| POST | `/api/exams/{id}/questions` | Add question |
| PUT | `/api/exams/{id}/questions/{qid}` | Update question |
| DELETE | `/api/exams/{id}/questions/{qid}` | Delete question |

### Results
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/results` | List results (filtered by role) |
| GET | `/api/results/{id}` | Get result detail |
| GET | `/api/results/{id}/questions` | Question-by-question breakdown |
| GET | `/api/results/{id}/proctoring-logs` | Proctoring event logs |

### Proctoring
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/proctor/verify-face` | Face verification |
| POST | `/api/proctor/recognize-face` | Face recognition |
| POST | `/api/proctor/detect-persons` | Multiple person detection |
| POST | `/api/proctor/detect-phone` | Mobile phone detection |
| POST | `/api/proctor/detect-gaze` | Looking away detection |
| POST | `/api/proctor/detect-person` | No person detection |
| POST | `/api/proctor/detect-voice` | Voice detection |
| POST | `/api/proctor/log-event` | Log cheating event |
| POST | `/api/proctor/capture-screenshot` | Capture screenshot |
| WS | `/ws/proctor/{session_id}` | Live webcam streaming |

### Users
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/users/students` | List students (teacher) |
| GET | `/api/users/students/{id}` | Student detail (teacher) |
| GET | `/api/users/me` | Current user profile |
| PUT | `/api/users/me` | Update profile |

### Dashboard
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/dashboard/student` | Student dashboard data |
| GET | `/api/dashboard/teacher` | Teacher dashboard data |

---

## 20. TypeScript Types

### `types/auth.ts`
```typescript
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'student' | 'teacher';
  avatar?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  role: 'student' | 'teacher';
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: User;
}
```

### `types/exam.ts`
```typescript
export interface Exam {
  id: string;
  title: string;
  subject: string;
  description: string;
  total_marks: number;
  date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  status: 'draft' | 'published' | 'in_progress' | 'completed';
  created_by: string;
  created_at: string;
  questions?: Question[];
  proctoring_settings?: ProctoringSettings;
}

export interface Question {
  id: string;
  exam_id: string;
  text: string;
  type: 'mcq' | 'true_false' | 'short_answer';
  options?: string[];
  correct_answer: string;
  marks: number;
  order: number;
}

export interface CreateExamRequest {
  title: string;
  subject: string;
  description: string;
  total_marks: number;
  date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  questions: CreateQuestionRequest[];
  proctoring_settings?: ProctoringSettings;
}

export interface CreateQuestionRequest {
  text: string;
  type: 'mcq' | 'true_false' | 'short_answer';
  options?: string[];
  correct_answer: string;
  marks: number;
}

export interface ProctoringSettings {
  face_verification: boolean;
  tab_lockout: 'off' | 'moderate' | 'strict';
  voice_detection: boolean;
  multiple_person_detection: boolean;
  phone_detection: boolean;
  gaze_detection: boolean;
}
```

### `types/result.ts`
```typescript
export interface ExamResult {
  id: string;
  exam_id: string;
  exam_title: string;
  student_id: string;
  student_name: string;
  score: number;
  total_marks: number;
  percentage: number;
  time_spent_minutes: number;
  status: 'passed' | 'failed' | 'under_review';
  integrity_score: number;
  submitted_at: string;
}

export interface QuestionResult {
  question_id: string;
  question_text: string;
  student_answer: string;
  correct_answer: string;
  is_correct: boolean;
  marks_obtained: number;
  marks_total: number;
}

export interface ProctoringLog {
  id: string;
  event_type: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: string;
  screenshot_url?: string;
}
```

### `types/proctor.ts`
```typescript
export interface ProctoringEvent {
  id: string;
  exam_session_id: string;
  event_type: 'tab_switch' | 'face_verification' | 'multiple_persons' | 'phone_detected' | 'gaze_away' | 'no_person' | 'voice_detected';
  severity: 'info' | 'warning' | 'critical';
  message: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
  screenshot_url?: string;
}

export interface ProctoringSession {
  id: string;
  exam_id: string;
  student_id: string;
  status: 'active' | 'completed' | 'flagged' | 'terminated';
  started_at: string;
  ended_at?: string;
  integrity_score: number;
  events: ProctoringEvent[];
}

export interface FaceVerificationResult {
  verified: boolean;
  confidence: number;
  landmarks: number;
  message: string;
}

export interface PersonDetectionResult {
  person_present: boolean;
  person_count: number;
  persons_detected?: Array<{ bbox: number[]; confidence: number }>;
  alert: boolean;
}

export interface GazeDetectionResult {
  looking_away: boolean;
  gaze_direction: string;
  duration_ms: number;
  confidence: number;
}

export interface PhoneDetectionResult {
  phone_detected: boolean;
  confidence: number;
  bbox?: number[];
}

export interface VoiceDetectionResult {
  voice_detected: boolean;
  confidence: number;
  duration_ms: number;
}
```

---

## 21. Reusable Component Specifications

### ExamCard
```
Props: { exam: Exam; role: 'student' | 'teacher'; onAction?: () => void }
States: default, loading (skeleton), disabled (expired)
Renders: title, subject, date, duration, status badge, action button
```

### QuestionCard
```
Props: { question: Question; index: number; selectedAnswer?: string; onAnswer: (answer: string) => void; showCorrect?: boolean }
States: unanswered, selected, correct (review), incorrect (review)
Renders: question number, text, options (radio/checkbox), marks
```

### Timer
```
Props: { duration_minutes: number; onTimeUp: () => void; paused?: boolean }
States: running, warning (<5 min), expired
Renders: MM:SS countdown, progress bar, color change at warning
```

### WebcamPreview
```
Props: { stream?: MediaStream; status: 'inactive' | 'active' | 'error'; showOverlay?: boolean; overlayType?: 'face' | 'none' }
States: inactive (placeholder), active (live feed), error (fallback)
Renders: video element, face frame overlay, status indicators
```

### VerificationChecklist
```
Props: { checks: Array<{ id, label, description, status: 'pending' | 'in_progress' | 'complete' | 'error' }> }
States: pending, in_progress, complete, error
Renders: List of steps with icon, label, description, status indicator
```

### AlertBanner
```
Props: { type: 'info' | 'warning' | 'error' | 'success'; message: string; dismissible?: boolean; onDismiss?: () => void }
Renders: Colored banner with icon, message, optional dismiss button
```

### StatusIndicator
```
Props: { status: 'active' | 'inactive' | 'warning' | 'error'; label: string; pulse?: boolean }
Renders: Colored dot + label text, optional pulse animation
```

### StatisticCard
```
Props: { title: string; value: string | number; icon: ReactNode; trend?: string; trendDirection?: 'up' | 'down'; color?: 'primary' | 'error' }
Renders: Card with title, large value, icon, optional trend indicator
```

### Timer
```
Props: { duration_minutes: number; onTimeUp: () => void; paused?: boolean }
States: running, warning (<5 min → red), expired
Renders: MM:SS countdown, circular or linear progress, color transition
```

### WebcamPreview
```
Props: { stream?: MediaStream; status: 'inactive' | 'active' | 'error'; showFaceOverlay?: boolean; showStatusIndicators?: boolean; children?: ReactNode }
States: inactive (placeholder image), active (live feed), error (fallback)
Renders: <video> element, face detection frame overlay, status badges, optional children overlay
```

### VerificationChecklist
```
Props: { checks: VerificationCheck[]; onComplete: () => void }
Renders: List of VerificationStep components, "Start Exam" button when all complete
```

### AlertBanner
```
Props: { type: 'info' | 'warning' | 'error' | 'success'; message: string; dismissible?: boolean; onDismiss?: () => void; action?: { label: string; onClick: () => void } }
Renders: Colored banner with icon, message, optional action button
```

### StatisticCard
```
Props: { title: string; value: string | number; icon: ReactNode; trend?: string; trendDirection?: 'up' | 'down'; color?: 'primary' | 'error' | 'default' }
Renders: Card with title, large value, icon, optional trend indicator
```

### ResultCard
```
Props: { result: ExamResult; role: 'student' | 'teacher' }
Renders: Exam title, score, percentage, status badge, integrity score, time spent, action button
```

### SuspiciousActivityCard
```
Props: { activity: ProctoringEvent; onReview?: () => void; onDismiss?: () => void }
Renders: Event type icon, severity badge, timestamp, description, action buttons
```

---

## 22. Animation & Interaction Patterns

| Pattern | Implementation | Usage |
|---|---|---|
| Pulse ring | `@keyframes pulse-ring` | Live/recording indicators |
| Shimmer | `@keyframes shimmer` | Loading states |
| Card hover | `translateY(-2px)` + `shadow-md` | Dashboard cards |
| Button press | `active:scale-95` | All buttons |
| Input focus | `focus:ring-2 focus:ring-primary/20` | All form inputs |
| Spinner | `animate-spin` | Loading states |
| Fade in | `animate-in fade-in` (Tailwind) | Page transitions |
| Slide up | `animate-in slide-in-from-bottom` | Modal/dialog entries |

---

## 23. Environment Variables

```
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:8000/api
NEXT_PUBLIC_WS_URL=ws://localhost:8000/ws
```

---

## 24. Performance Considerations

- Use Next.js App Router with server components where possible (static pages)
- Use `next/dynamic` for heavy components (webcam, charts)
- TanStack Query for caching and deduplication of API requests
- Lazy load the proctoring WebSocket connection
- Use `react-webcam` with optimal resolution (640x480) for proctoring
- Debounce AI detection API calls (every 3-5 seconds, not every frame)
- Implement virtual scrolling for large student lists
- Use `next/image` for optimized image loading
- Code-split by route using Next.js automatic code splitting

---

## 25. Error Handling Strategy

| Layer | Strategy |
|---|---|
| **API Layer** | Axios interceptor normalizes errors → throws typed error |
| **TanStack Query** | `onError` callback → toast notification |
| **React Hook Form** | Zod validation → field-level errors |
| **React Error Boundary** | Catch rendering errors → fallback UI |
| **Global** | `_error.tsx` page for unhandled errors |
| **WebSocket** | Auto-reconnect with exponential backoff |

### Error Response Shape (Expected from FastAPI)
```typescript
interface ApiError {
  detail: string;
  status_code: number;
  errors?: Record<string, string[]>;  // field-level validation errors
}
```

---

## 26. File-by-File Implementation Order

### Phase 1: Foundation
```
1. globals.css          → Tailwind v4 theme with EduGuard palette
2. lib/utils.ts         → cn() helper
3. lib/api.ts           → Axios instance with interceptors
4. types/*.ts           → All TypeScript types
5. lib/validations.ts   → Zod schemas
```

### Phase 2: Auth
```
6. providers/query-provider.tsx
7. store/auth-store.ts
8. services/auth.service.ts
9. hooks/useAuth.ts
10. app/(auth)/layout.tsx
11. app/(auth)/login/page.tsx
12. app/(auth)/register/page.tsx
13. app/(auth)/forgot-password/page.tsx
14. middleware.ts
```

### Phase 3: Dashboard Layout
```
15. app/globals.css (full theme)
16. app/layout.tsx (fonts + providers)
17. components/shared/Navbar.tsx
18. components/shared/Sidebar.tsx
19. components/shared/BottomNav.tsx
20. components/shared/Footer.tsx
21. components/shared/UserAvatar.tsx
22. components/shared/NotificationBell.tsx
23. components/shared/ThemeToggle.tsx
24. components/shared/PageHeader.tsx
25. components/shared/BreadcrumbNav.tsx
26. components/shared/StatisticCard.tsx
27. components/shared/StatusBadge.tsx
28. components/shared/StatusIndicator.tsx
29. components/shared/AlertBanner.tsx
30. components/shared/LoadingSpinner.tsx
31. components/shared/EmptyState.tsx
32. components/shared/SearchInput.tsx
33. components/shared/PaginationBar.tsx
34. components/shared/ConfirmDialog.tsx
35. app/(dashboard)/layout.tsx
```

### Phase 4: Student Features
```
36. components/student/ExamCard.tsx
37. components/student/UpcomingExamsList.tsx
38. components/student/RecentResultsList.tsx
39. app/(dashboard)/student/dashboard/page.tsx
40. app/(dashboard)/student/exams/page.tsx
41. app/(dashboard)/student/results/page.tsx
42. app/(dashboard)/student/results/[resultId]/page.tsx
```

### Phase 5: Teacher Features
```
43. components/teacher/StatisticCard.tsx
44. components/teacher/ScoreDistributionChart.tsx
45. components/teacher/AIInsightsPanel.tsx
46. components/teacher/AIInsightCard.tsx
47. components/teacher/StudentPerformanceTable.tsx
48. components/teacher/SuspiciousActivityTable.tsx
49. components/teacher/SuspiciousActivityCard.tsx
50. app/(dashboard)/teacher/dashboard/page.tsx
51. app/(dashboard)/teacher/exams/page.tsx
52. app/(dashboard)/teacher/results/page.tsx
53. app/(dashboard)/teacher/results/[resultId]/page.tsx
54. app/(dashboard)/teacher/suspicious/page.tsx
```

### Phase 6: Exam Module
```
55. components/exam/GeneralInfoSection.tsx
56. components/exam/SchedulingSection.tsx
57. components/exam/QuestionManagement.tsx
58. components/exam/QuestionCard.tsx
59. components/exam/EmptyQuestionState.tsx
60. components/exam/ProctoringSettingsCard.tsx
61. components/exam/DraftModeBadge.tsx
62. components/exam/Timer.tsx
63. app/(dashboard)/teacher/exams/create/page.tsx
64. app/(dashboard)/teacher/exams/[examId]/page.tsx
65. app/(dashboard)/teacher/exams/[examId]/edit/page.tsx
66. app/(dashboard)/teacher/exams/[examId]/proctoring/page.tsx
67. app/(dashboard)/student/exams/[examId]/page.tsx
```

### Phase 7: Identity Verification
```
68. hooks/useWebcam.ts
69. components/verification/WebcamPreview.tsx
70. components/verification/VerificationChecklist.tsx
71. components/verification/VerificationStep.tsx
72. components/verification/ProctoringStatusFeed.tsx
73. components/verification/FaceDetectionOverlay.tsx
74. app/(dashboard)/student/exams/[examId]/verify/page.tsx
```

### Phase 8: Results
```
75. components/results/ResultCard.tsx
76. components/results/SuspiciousActivityCard.tsx
77. components/results/ScoreDistributionChart.tsx
78. components/results/AIInsightsPanel.tsx
79. components/results/AIInsightCard.tsx
80. components/results/StudentPerformanceTable.tsx
81. components/results/SuspiciousActivityTable.tsx
82. app/(dashboard)/student/results/[resultId]/page.tsx
83. app/(dashboard)/teacher/results/[resultId]/page.tsx
```

### Phase 8: API Integration
```
84. services/auth.service.ts
85. services/exam.service.ts
86. services/result.service.ts
87. services/proctor.service.ts
88. services/user.service.ts
89. hooks/useAuth.ts
90. hooks/useExams.ts
91. hooks/useResults.ts
92. hooks/useProctoring.ts
93. hooks/useUsers.ts
94. hooks/useDashboard.ts
95. Update all pages to use real API data
96. Add loading skeletons
97. Add error states
98. Add toast notifications
```

### Phase 9: AI Integration
```
99. services/proctor.service.ts (AI endpoints)
100. hooks/useProctoring.ts (WebSocket + polling)
101. store/proctor-store.ts
102. Integrate face verification into verification flow
103. Integrate face recognition
104. Integrate multiple person detection
105. Integrate mobile phone detection
106. Integrate looking away detection
107. Integrate no person detection
108. Implement tab switching detection (client-side)
109. Implement voice detection
110. Implement cheating log generation
111. Implement screenshot capture
112. Implement live webcam streaming (WebSocket)
113. Build teacher's live proctoring dashboard
114. Add real-time alert notifications
```

---

## 27. Key Architectural Decisions

1. **Next.js App Router** — Use route groups `(auth)` and `(dashboard)` for layout separation
2. **Server Components by default** — Only add `'use client'` where interactivity is needed
3. **Zustand over Context** — For auth and proctoring state (simpler, less re-renders)
4. **TanStack Query for all API data** — Automatic caching, refetching, optimistic updates
5. **React Hook Form + Zod** — All forms use this pattern for type-safe validation
6. **shadcn/ui** — As the base component library, customized with EduGuard theme
7. **Material Symbols + Lucide** — Material Symbols for status/iconic elements, Lucide for interactive UI
8. **WebSocket for live proctoring** — Real-time bidirectional communication
9. **Polling for AI detections** — Every 3-5 seconds for non-real-time features
10. **Feature-based folder structure** — Components grouped by domain (student, teacher, exam, verification, results)

---

## 27. Theme Configuration (Tailwind v4)

The `globals.css` file should be updated to include the full EduGuard AI theme using the `@theme` directive. The theme includes:

- **Colors**: Full EduGuard palette (primary, secondary, tertiary, surface, error, outline, inverse)
- **Fonts**: Inter (headlines/body), Geist (labels/code) — loaded via `next/font/google`
- **Font Sizes**: headline-lg (30px), headline-md (20px), body-md (16px), body-sm (14px), label-caps (12px), code-mono (14px)
- **Spacing**: xs (8px), sm (12px), md (16px), lg (24px), xl (32px), base (4px), gutter (12px), container-margin (16px)
- **Border Radius**: DEFAULT (4px), lg (8px), xl (12px), full (9999px)

The `globals.css` should NOT contain any custom CSS classes — all styling is done via Tailwind utility classes. Animations (pulse, shimmer) can be defined in `globals.css` using `@keyframes`.

---

## 28. Key Animations (globals.css)

```css
@keyframes pulse-ring {
  0% { transform: scale(0.95); opacity: 1; }
  50% { transform: scale(1.05); opacity: 0.5; }
  100% { transform: scale(0.95); opacity: 1; }
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
```

---

## 29. Next Steps After Plan Approval

1. Install all dependencies
2. Configure Tailwind v4 theme in `globals.css`
3. Set up shadcn/ui
4. Create all type definitions
5. Build auth system (Milestone 1)
6. Proceed through milestones sequentially
7. Each milestone should produce working, testable features
8. Run `npm run lint` and `npm run build` after each milestone
