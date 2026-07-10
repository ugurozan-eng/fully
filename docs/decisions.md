# Technical & Design Decisions

## 1. Next.js App Router
* **Decision:** Next.js (App Router, version 14+) with React.
* **Rationale:** Since the project requires server-side interactions like Vercel Postgres integration, Next.js provides a robust framework. App Router allows us to build API routes or Server Actions easily while keeping page load speeds high.

## 2. Vercel Postgres Database
* **Decision:** Vercel Postgres (relational SQL database).
* **Rationale:** Relational data schemas fit SQL queries extremely well. We can easily perform queries like matching budgets:
  `SELECT * FROM leads WHERE budget >= $1 AND is_alert_active = true`
  Vercel Postgres offers a free tier which Neon backs.

## 3. Styling & Themes
* **Decision:** Vanilla CSS with CSS Custom Properties (Variables) for theme switching.
* **Themes available:**
  1. **Option A (Midnight Neon):** Deep dark purple backgrounds (`#0d0b18`), neon violet and pink accents, glassmorphic container cards.
  2. **Option B (Forest & Ocean):** Rich deep emerald green background (`#061a14`), glowing teal and mint gradient highlights, sleek clean borders.
* **Implementation:** The client can toggle themes via a header switch. The app applies the selected theme by setting the `data-theme` attribute on the `<html>` or `<body>` element.
* **Rationale:** Meets the modern aesthetic guidelines to wow the user's wife while maintaining clean, maintainable, and high-performance CSS. Removed WebKit backdrop-filter blurs to prevent memory leaks and safari crashes.

## 4. WhatsApp Reporting Integration
* **Decision:** Client-side WhatsApp deep links (`https://wa.me/` or `https://api.whatsapp.com/send`).
* **Rationale:** A full WhatsApp API integration requires business validation, paid templates, and setup. A client-side deep link is free, requires no setup, is reliable, and lets the user preview/edit the message before sending it.

## 5. QR Code Generation
* **Decision:** Dynamic generation using `qrcode.react` package.
* **Rationale:** Safe, fast, renders as SVGs or canvas, and is easily customizable with custom colors matching the active theme.

## 6. Stacking Context (Z-Index) Fix for Filter Dropdowns
* **Decision:** Dynamically apply `zIndex: 1000` to the header cell (`<th>`) when its popover filter is open.
* **Rationale:** Due to CSS stacking context rendering, a fixed layout overlay (`zIndex: 998`) used for click-outside closing was rendering on top of the popovers (`zIndex: 999`) because the parent table had no explicit stacking context. Elevating the active `<th>` to `zIndex: 1000` solves this cleanly and keeps checkboxes clickable.

## 7. Segregation of Active and Sold Properties
* **Decision:** Remove the delete action from the Portföy & Daire Yönetimi table, replace with `is_sold` checkbox, and display sold properties in a separate, styled table at the bottom.
* **Rationale:** Deleting properties removes valuable transaction history. Storing properties with `is_sold: true` preserves transaction logs while cleanly separating active inventory from past sales, and prevents them from appearing in the Matchmaker.

## 8. Removal of Default Room Selection in Input Forms
* **Decision:** Initialize `room_count` as an empty string `''` rather than `'2+1'` on new customer form rendering and resets.
* **Rationale:** Hardcoding `'2+1'` as a default value caused accidental submissions where room counts were left unselected, polluting the CRM data. Defaulting to an empty selection forces explicit input.
