# Email Cold Outreach CRM

A personal CRM web app for managing cold outreach campaigns, scheduling and
sending emails, and tracking contact engagement.

## Features

- Add, edit, and delete contacts
- Assign email templates and personal notes to each contact
- Schedule emails by date and time (with default send time of 10:00 AM if only
  date is set)
- Send emails manually or automatically (scheduled emails sent in the
  background)
- View and manage scheduled emails (edit/cancel)
- Log of all sent emails
- Import/export contacts via CSV
- Modern, user-friendly web UI

## How It Works

- The backend is powered by Node.js, Express, and SQLite.
- The frontend is a single-page app (HTML/CSS/JS) served from the `public/`
  folder.
- Scheduled emails are sent automatically by the server in the background (no
  need for a separate script).
- Email sending uses SendGrid (API key required in `.env`).

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Set up your `.env` file with SendGrid credentials:
   ```env
   SENDGRID_API_KEY=your_sendgrid_api_key
   SENDGRID_FROM_EMAIL=your_verified_sender@example.com
   TEST_EMAIL_TO=your_test_email@example.com
   ```
3. Start the server:
   ```bash
   node server.cjs
   ```
4. Open your browser to [http://localhost:3002](http://localhost:3002)

## Notes

- Scheduled emails are sent at the scheduled date and time, or 10:00 AM if only
  a date is set.
- All sent emails are logged in both the database and `scripts/sent_log.json`.
- You can view the email send log at `/logs.html`.

---

MIT License
