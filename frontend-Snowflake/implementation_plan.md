# Snowflake Excel Loader Front-End Implementation Plan

The goal is to build a modern, intuitive, and responsive web application (front end) that allows users to seamlessly upload Excel files, validate the data, and load it into Snowflake. The platform will serve two main roles: Users and Admins, providing dashboards, validation feedback, and an integrated AI chatbot.

This plan focuses purely on developing the front-end architecture and UI using `React 18`, `TypeScript`, `Vite`, `Tailwind CSS`, `React Query`, `Recharts`, and `Axios` as outlined in the specifications.

## User Review Required

> [!IMPORTANT]
> The backend and database (FastAPI, PostgreSQL, Snowflake) are mentioned in the specifications, but since this task is specifically for the **front end**, I will implement everything using **mocked data** initially. This will allow us to see the layout, interactions, and dashboards without waiting for the backend to be fully complete. 
> Please confirm if this approach is okay!

## Proposed Changes

We will generate a new Vite + React + TypeScript project at `C:\Users\PE\.gemini\antigravity\scratch\snowflake-loader-web`.

### Global Setup and Configuration
- **Vite & Tailwind**: Next-generation frontend tooling set up with Tailwind CSS for rapid styling and a modern look.
- **Routing**: `react-router-dom` to manage paths between Admin and User scopes.
- **State & Data Fetching**: `React Query` for managing remote state (even mock state) and `Axios` for HTTP clients.

---

### Layouts & Shared Components
The foundation of the UI, giving it a premium feel with glassmorphism, dynamic sidebars, and fluid animations.

#### [NEW] `src/layouts/MainLayout.tsx`
The primary layout wrapping all pages. Includes the sidebar navigation and top app bar with the user profile & notification center (bell icon).

#### [NEW] `src/components/Navigation/Sidebar.tsx`
Adaptive sidebar that changes options based on the authenticated role (Admin vs. User).

#### [NEW] `src/components/Chatbot/AIChatbotBubble.tsx`
A floating chatbot component anchored to the bottom-right corner of the screen across all pages. Includes chat history rendering, typing indicators, and plain-English database translation mock views.

---

### User Pages
Pages specifically tailored for standard users loading data.

#### [NEW] `src/pages/user/UploadCenter.tsx`
Houses the `react-dropzone` implementation. Contains visual states for drag-over, uploading, and error handling. Followed by a Smart Preview of parsed Excel tables.

#### [NEW] `src/pages/user/UserDashboard.tsx`
A personal analytics page utilizing `Recharts` to show their success rate, data quality scores over time, and activity history.

#### [NEW] `src/pages/user/ImportHistory.tsx`
A data table showcasing personal uploads with quick action buttons to "Rollback" or view error details.

#### [NEW] `src/pages/user/Profile.tsx` & `src/pages/user/Feedback.tsx`
Forms to update personal info and a simple ticketing UI to submit feedback to admins.

---

### Admin Pages
Pages containing advanced controls and system-wide visibility.

#### [NEW] `src/pages/admin/AdminDashboard.tsx` & `src/pages/admin/GlobalImports.tsx`
Platform-wide metrics using Recharts (total volume, failure rates, peak usage). Global data table showing all user imports with advanced filtering.

#### [NEW] `src/pages/admin/UserManagement.tsx`
A clean data grid to manage users, reset passwords, change roles, and modify activation status.

#### [NEW] `src/pages/admin/AuditLog.tsx`
A read-only table displaying timestamped platform actions for security and tracking.

## Open Questions

> [!WARNING]
> 1. **Mock Data**: Since the FastAPI backend is not yet available, I will simulate API responses (e.g., successful uploads, validation row errors, dashboard metrics) to make the UI interactive. Is this acceptable for now?
> 2. **Design Preferences**: Do you have a specific color scheme or brand colors (e.g., specific blues for Snowflake) you'd like me to use? Otherwise, I will use a premium modern aesthetic (dark mode sleek UI or clean corporate light mode).
> 3. **Recharts instead of PowerBI**: The specs mention Power BI but refer to Recharts in the free tool list. I will build the dashboards directly in the React application using Recharts as requested. Does that sound good?

## Verification Plan

### Automated / Browser Checks
- Run `npm run dev` to serve the application locally.
- Validate drag-and-drop file mechanisms respond correctly (visually) without crashing.
- Ensure the Chatbot toggle opens and closes correctly on all pages.

### Manual Verification
- We will click through the Admin and User flows together.
- Verify Recharts render appropriately for data visualization. 
- Ensure the app is responsive and looks premium.
