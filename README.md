# Robert Force

A working CRM prototype, built as a single self-contained HTML file. Open
`index.html` in any browser — no build step, no install, no server.

It is styled after Salesforce Lightning (the blue global header, the app tab
bar, record pages with a path component and related lists) and demonstrates
the activities a CRM is actually bought for.

## The demo domain

Robert Force runs an **international student-exchange agency**: Thai students
go abroad for a semester or an academic year, host families and partner
schools take them in, and each placement is an opportunity moving through a
pipeline. The seeded records are affectionate about how that job really goes —
the cat that annexed the guest bed, the suitcase that was 80% instant noodles.

## What it does

| Area | What works |
| --- | --- |
| **Dashboard** | KPI tiles, pipeline funnel by stage, closed-business summary, lead source donut and status breakdown, open tasks, cases needing attention, activity feed |
| **Leads** | List with search / filter / sort, status path, qualification notes, and **Convert** — which creates an Account, a Contact and a Placement in one step |
| **Accounts** | Partner schools, host families, agencies and sponsors, each with related contacts, placements and cases |
| **Contacts** | Students, host parents and coordinators, linked to their account |
| **Placements** | The opportunity pipeline. List view *and* a **Kanban board** — drag cards between stages on desktop, tap **Move** on touch. Stage changes are logged automatically |
| **Tasks** | Open and completed, with overdue highlighting; tick to complete anywhere in the app |
| **Cases** | Support tickets with status path, priority and origin |
| **Campaigns** | Budget, spend, leads, conversion and ROI |
| **Reports** | Pipeline by destination country, expected close by month, cases by status, campaign return, weighted forecast detail |
| **Everywhere** | Global search across five objects, create/edit/delete on every object, log a call, post a note, toast confirmations, notification tray, dark mode |

## The "database"

`seed()` builds the dataset and it is persisted to `localStorage` under
`robertforce.db.v1`. Every action writes back to it, so changes survive a
refresh. Dates are generated relative to today, so the demo never looks stale.
**Reset demo data** on the home page restores the original records.

Because storage is per-browser, anyone you send this to gets their own clean
copy and cannot disturb yours.

## Design notes

- Salesforce-derived palette: brand `#0176D3`, deep navy `#032D60`, sky tint
  `#EAF5FE` on a `#F3F3F3` page ground, with SLDS semantic colours and
  per-object icon accents.
- Source Sans 3 for the UI (the closest free relative of Salesforce Sans),
  IBM Plex Mono for record IDs and numeric columns.
- Fully responsive: below 720px the nav becomes scrollable tabs, tables
  restructure into labelled cards, and the Kanban scrolls horizontally.
- Light and dark themes, both defined through CSS custom properties.

## Verified

Driven with Playwright across 15 routes at desktop (1440px) and mobile (390px):
no runtime errors, no horizontal overflow, and the full interaction set —
search, task completion, drag-and-drop, record creation, activity logging,
editing, lead conversion, persistence across reload, theme toggle and reset —
exercised end to end.
