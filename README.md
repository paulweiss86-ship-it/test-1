# Robert Force

A working personal-CRM prototype, built as a single self-contained HTML file.
Open `index.html` in any browser — no build step, no install, no server.

It's styled after Salesforce Lightning (the blue global header, the app tab
bar, record pages with a path component and related lists) but repurposed for
something personal: **Robert keeping up with his friends in Thailand.**

## The idea

Robert has friends scattered across Bangkok, Chiang Mai, Koh Tao and Phuket,
and he's the kind of person who means to stay in touch and then suddenly it's
been two months. This is the CRM that fixes that — an address book that
actually keeps up with him. The seeded records are warm and a little funny:
the host-family cat has been replaced by a diving dog named Bubbles, and there
is a genuine reminder to "wish Su a happy birthday (do NOT be late again)."

## What it does

| Area | What works |
| --- | --- |
| **Home** | The two things that matter most up top: **who needs a catch-up** (friends not heard from in 30+ days, with a one-tap "Reached out" button) and **birthdays coming up**. Plus plans-by-stage, new-people-by-city, reminders and open favours |
| **Friends** | The core people, grouped into circles, with closeness, how they met, how to reach them, and a live "last talked" column that flags who's gone quiet |
| **Circles** | How Robert knows a group — Bangkok Rooftop Crew, Koh Tao Dive Buddies, the cooking-class gang — each with its friends and shared plans |
| **Plans** | Meetups being organized, as a pipeline: Idea → Suggested → Date Set → Confirmed → Met Up. List view *and* a **Kanban board** — drag between stages on desktop, tap **Move** on touch |
| **New People** | Someone Robert just met, moving toward friendship, with a **Make a Friend** action that files them into a circle |
| **Reminders** | Personal to-dos with overdue highlighting; tick to complete anywhere |
| **Favours** | Help going either way ("Robert helps" / "Friend helps Robert"), with status and priority |
| **Trips** | Robert's trips to Thailand, with real budgets and spend tracking |
| **Reports** | Friends by city, closeness breakdown, plans by stage, favours by status, a "who Robert has been neglecting" leaderboard, and trip spending |
| **Everywhere** | Global search across friends/circles/plans/people/favours, create/edit/delete on every object, log a chat, add a note, birthday & catch-up alerts in the bell, and dark mode |

## The "database"

`seed()` builds the dataset and it's persisted to `localStorage`. Every action
writes back, so changes survive a refresh. "Last talked" dates and birthdays
are generated relative to today, so the catch-up and birthday features always
have something live to show. **Reset demo data** restores the originals.

Because storage is per-browser, anyone you send this to gets their own clean
copy and can't disturb yours.

## Design notes

- Salesforce-derived palette: brand `#0176D3`, deep navy `#032D60`, sky tint
  `#EAF5FE` on a `#F3F3F3` page ground, with semantic colours for
  closeness/status and per-object icon accents.
- Source Sans 3 for the UI, IBM Plex Mono for reference IDs.
- Fully responsive: below 720px the nav becomes scrollable tabs, tables
  restructure into labelled cards, and the Kanban scrolls horizontally.
- Light and dark themes, both defined through CSS custom properties.

## Verified

Driven with Playwright across 15 routes at desktop (1440px) and mobile (390px):
no runtime errors, no horizontal overflow, and the full interaction set —
search, catch-up "reached out", reminder completion, Kanban drag-and-drop,
record creation, chat logging, favour status path, person→friend conversion,
persistence across reload, theme toggle and reset — exercised end to end.
