# PrintQ

PrintQ is a Next.js print shop queue application. Customers scan a short-lived QR code, upload PDF or image files, choose print settings, preview the order total, and submit jobs to a Supabase-backed print queue. Shop admins can sign in to track jobs, mark them completed, remove uploaded files, and download earnings reports.

## Features

- Secure QR-gated customer upload flow
- PDF, JPG, PNG, and WEBP uploads up to 25 MB
- Up to 3 documents per order
- Per-document print settings:
  - Paper size: A4, A3, Letter, Legal
  - Portrait or landscape orientation
  - Black and white or color pricing
  - Copies, page ranges, pages per side, and two-sided options
  - Aadhaar front/back row layout for selected PDF pages
- Automatic PDF page counting and selected-page PDF generation
- Supabase Storage upload to the `print-queue` bucket
- Supabase `print_jobs` queue records with customer tokens and pricing
- Admin dashboard with live queue, daily totals, completed-job cleanup, and CSV export
- Monthly reports page with PDF and CSV downloads

## Tech Stack

- Next.js 16
- React 19
- Tailwind CSS 4
- Supabase JavaScript client
- pdf-lib
- ESLint

## Getting Started

### Prerequisites

- Node.js 20 or newer
- npm
- A Supabase project with Auth, Database, and Storage configured

### Installation

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env.local
```

If `.env.example` does not exist yet, create `.env.local` manually with the variables below.

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
NEXT_PUBLIC_DEFAULT_SHOP_ID=main-counter
QR_ACCESS_SECRET=replace_with_a_strong_shared_secret
```

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Required | Description |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL used by the client app. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key used for client-side Auth, Storage, and database access. |
| `NEXT_PUBLIC_DEFAULT_SHOP_ID` | No | Fallback shop id when a `shop` query parameter is not present. Defaults to `main-counter`. |
| `QR_ACCESS_SECRET` | Yes | Server-side secret used to verify signed QR upload links. |

## Supabase Requirements

The app expects:

- A Storage bucket named `print-queue`
- Supabase Auth enabled for admin password login
- A `print_jobs` table for active print queue rows
- A `completed_print_jobs` table or view for daily report summaries
- An RPC function named `cleanup_completed_print_jobs`

The code reads and writes fields such as `shop_id`, `customer_name`, `file_path`, `original_file_name`, `file_size`, `file_type`, `page_count`, `total_print_pages`, `copies`, `paper_size`, `orientation`, `color_mode`, `two_sided`, `pages_per_side`, `page_range`, `document_number`, `order_document_count`, `price_per_page`, `total_amount`, `notes`, `queue_number`, `customer_token`, `status`, `completed_at`, and `storage_deleted_at`.

Make sure Row Level Security policies allow customers to create print jobs and upload files, while admin users can read and update queue/report data.

## QR Upload Access

Customer uploads require a signed URL with these query parameters:

```text
/?shop=main-counter&qr_expires=UNIX_SECONDS&qr_nonce=RANDOM_NONCE&qr_sig=SIGNATURE
```

The signature is an HMAC-SHA256 of:

```text
shop.qr_expires.qr_nonce
```

using `QR_ACCESS_SECRET`, encoded as base64url. QR links can expire up to 30 minutes in the future.

## Routes

| Route | Purpose |
| --- | --- |
| `/` | Customer upload form, preview, and success screen. Requires valid QR parameters. |
| `/admin` | Admin sign-in and print queue dashboard. |
| `/admin/monthly-reports` | Monthly earnings reports with PDF and CSV downloads. |
| `/api/qr-access/verify` | Server route that validates signed QR upload links. |

## Available Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
```

## Deployment

This app can be deployed to Vercel or any platform that supports Next.js. Add the same environment variables in the hosting provider, configure Supabase Auth/Storage/RLS for production, and use HTTPS URLs when generating QR codes.

## Project Structure

```text
app/                  Next.js app routes and API handlers
components/           Customer upload, admin dashboard, reports, and shared UI
lib/supabase.js       Supabase client configuration
public/logo/          PrintQ logo asset
utils/printUtils.js   PDF, page selection, pricing, and file helpers
```
