const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const sgMail = require('@sendgrid/mail');
require('dotenv').config();

const app = express();
const dbPath = path.join(__dirname, 'crm.sqlite');
const db = new sqlite3.Database(dbPath);

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

db.serialize(() => {
  // Add sendTime column for scheduled email support
  db.run(`CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    firstName TEXT,
    email TEXT,
    template TEXT,
    note TEXT,
    sendDate TEXT,
    sendTime TEXT,
    status TEXT DEFAULT 'Not Contacted'
  )`);

  // Add sendTime column if it doesn't exist (for migrations)
  db.get("PRAGMA table_info(contacts)", (err, info) => {
    if (err) return;
    db.all("PRAGMA table_info(contacts)", (err, columns) => {
      if (err) return;
      const hasSendTime = columns.some(col => col.name === 'sendTime');
      if (!hasSendTime) {
        db.run('ALTER TABLE contacts ADD COLUMN sendTime TEXT');
      }
    });
  });

  db.run(`CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT,
    template TEXT,
    sentAt TEXT
  )`);
});

// API Endpoints
app.get('/api/contacts', (req, res) => {
  const { status, date, time } = req.query;
  let query = `SELECT * FROM contacts`;
  const params = [];

  if (status || date || time) {
    const conditions = [];
    if (status) {
      conditions.push(`status = ?`);
      params.push(status);
    }
    if (date) {
      conditions.push(`sendDate = ?`);
      params.push(date);
    }
    if (time) {
      conditions.push(`sendTime = ?`);
      params.push(time);
    }
    query += ' WHERE ' + conditions.join(' AND ');
  }

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.post('/api/contacts', (req, res) => {
  const { firstName, email, template, note, sendDate, sendTime } = req.body;
  db.run(
    `INSERT INTO contacts (firstName, email, template, note, sendDate, sendTime) VALUES (?, ?, ?, ?, ?, ?)`,
    [firstName, email, template, note, sendDate, sendTime],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: this.lastID });
    }
  );
});

app.get('/api/templates', (req, res) => {
  const templatesDir = path.join(__dirname, 'templates');
  fs.readdir(templatesDir, (err, files) => {
    if (err) return res.status(500).json({ error: 'Unable to read templates directory' });

    const htmlFiles = files.filter(file => file.endsWith('.html'));
    const displayTemplates = htmlFiles.map(file => {
      const name = file.replace('.html', '');
      const label = name
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      return { value: file, label };
    });

    res.json(displayTemplates);
  });
});

app.patch('/api/contacts/:id', (req, res) => {
  const { firstName, email, status, note, sendDate, sendTime, template } = req.body; // now includes sendTime
  const fields = [];
  const params = [];

  if (firstName !== undefined) { fields.push('firstName = ?'); params.push(firstName); }
  if (email !== undefined) { fields.push('email = ?'); params.push(email); }
  if (status !== undefined) { fields.push('status = ?'); params.push(status); }
  if (note !== undefined) { fields.push('note = ?'); params.push(note); }
  if (sendDate !== undefined) { fields.push('sendDate = ?'); params.push(sendDate); }
  if (sendTime !== undefined) { fields.push('sendTime = ?'); params.push(sendTime); }
  if (template !== undefined) { fields.push('template = ?'); params.push(template); }

  if (fields.length === 0) return res.json({ updated: 0 });

  params.push(req.params.id);

  db.run(
    `UPDATE contacts SET ${fields.join(', ')} WHERE id = ?`,
    params,
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ updated: this.changes });
    }
  );
});

app.delete('/api/contacts/:id', (req, res) => {
  db.run('DELETE FROM contacts WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ success: false, error: err.message });
    res.json({ success: true, deleted: this.changes });
  });
});

app.get('/api/logs', (req, res) => {
  db.all('SELECT email, template, sentAt FROM logs ORDER BY sentAt DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

app.get('/api/email-preview/:id', (req, res) => {
  const id = req.params.id;
  db.get(`SELECT * FROM contacts WHERE id = ?`, [id], (err, row) => {
    if (err || !row) return res.status(404).send('Not found');

    // FIX: Use row.template and correct path
    const templatePath = path.join(__dirname, 'templates', row.template);
    if (!fs.existsSync(templatePath)) return res.status(404).send('Template not found');

    let html = fs.readFileSync(templatePath, 'utf-8');
    html = html.replace(/{{\s*firstName\s*}}/g, row.firstName || '')
               .replace(/{{\s*senderName\s*}}/g, 'Noah')
               .replace(/{{\s*senderEmail\s*}}/g, process.env.SENDGRID_FROM_EMAIL || '')
               .replace(/{{\s*personalNote\s*}}/g, row.note || '');

    res.send(html);
  });
});

app.post('/api/send-test/:id', (req, res) => {
  const id = req.params.id;
  db.get(`SELECT * FROM contacts WHERE id = ?`, [id], async (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'Contact not found' });

    const templatePath = path.join(__dirname, 'templates', row.template);
    if (!fs.existsSync(templatePath)) return res.status(404).json({ error: 'Template not found' });

    let html = fs.readFileSync(templatePath, 'utf-8');
    html = html.replace(/{{\s*firstName\s*}}/g, row.firstName || '')
               .replace(/{{\s*senderName\s*}}/g, 'Noah')
               .replace(/{{\s*senderEmail\s*}}/g, process.env.SENDGRID_FROM_EMAIL || '')
               .replace(/{{\s*personalNote\s*}}/g, row.note || '');

    const subject = `Test Email: ${row.template}`;
    console.log('Sending test to:', process.env.TEST_EMAIL_TO);
    console.log('From:', process.env.SENDGRID_FROM_EMAIL);
    try {
      await sgMail.send({
        to: process.env.TEST_EMAIL_TO,
        from: process.env.SENDGRID_FROM_EMAIL, 
        subject,
        html
      });
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
});

app.post('/api/send/:id', (req, res) => {
  const id = req.params.id;
  db.get('SELECT * FROM contacts WHERE id = ?', [id], async (err, row) => {
    if (err || !row) return res.status(404).json({ error: 'Contact not found' });

    const templatePath = path.join(__dirname, 'templates', row.template);
    if (!fs.existsSync(templatePath)) return res.status(404).json({ error: 'Template not found' });

    // Use customHtml if provided, otherwise render the template as usual
    let html;
    if (req.body && req.body.customHtml) {
      html = req.body.customHtml;
    } else {
      html = fs.readFileSync(templatePath, 'utf-8');
      html = html.replace(/{{\s*firstName\s*}}/g, row.firstName || '')
                 .replace(/{{\s*senderName\s*}}/g, 'Noah')
                 .replace(/{{\s*senderEmail\s*}}/g, process.env.SENDGRID_FROM_EMAIL || '')
                 .replace(/{{\s*personalNote\s*}}/g, row.note || '');
    }

    // You can customize the subject as needed
    const templateName = row.template
      .replace('.html', '')
      .replace(/_/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
    const subject = `${templateName} - Great to connect with you ${row.firstName}`;

    try {
      await sgMail.send({
        to: row.email,
        from: process.env.SENDGRID_FROM_EMAIL,
        subject,
        html
      });
      db.run(
        'INSERT INTO logs (email, template, sentAt) VALUES (?, ?, ?)',
        [row.email, row.template, new Date().toISOString()]
      );
      // Optionally log the sent email
      const logPath = path.join(__dirname, 'scripts', 'sent_log.json');
      let logs = [];
      if (fs.existsSync(logPath)) {
        try {
          logs = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
        } catch {}
      }
      logs.push({
        to: row.email,
        firstName: row.firstName,
        template: row.template,
        subject,
        timestamp: new Date().toISOString()
      });
      fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));

      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
});

// === Scheduled Email Sender (runs in background) ===
const SCHEDULED_EMAIL_INTERVAL_MS = 60 * 1000; // check every 1 minute

function isDue(sendDate, sendTime) {
  if (!sendDate && !sendTime) return false;
  const now = new Date();
  if (!sendDate) return false;
  // Default time to 10:00 if only date is set
  const effectiveTime = sendTime && sendTime !== '' ? sendTime : '10:00';
  const scheduled = new Date(`${sendDate}T${effectiveTime}`);
  return now >= scheduled;
}

async function sendScheduledEmails() {
  db.all('SELECT * FROM contacts WHERE (sendDate IS NOT NULL AND sendDate != "") OR (sendTime IS NOT NULL AND sendTime != "")', [], async (err, contacts) => {
    if (err) return console.error('Scheduled email query error:', err);
    for (const row of contacts) {
      const to = row.email?.trim();
      const firstName = row.firstName?.trim();
      const templateName = row.template?.trim();
      const note = row.note?.trim() || '';
      const sendDate = row.sendDate?.trim();
      const sendTime = row.sendTime?.trim();
      // Only send if at least one of sendDate or sendTime is set (not empty)
      if ((!sendDate && !sendTime) || (!sendDate && sendTime === '')) continue;
      if (!to || !firstName || !templateName) continue;
      if (!isDue(sendDate, sendTime)) continue;
      // Check if already sent (logs table)
      const alreadySent = await new Promise(res => {
        db.get('SELECT 1 FROM logs WHERE email = ? AND template = ? AND sentAt >= ? LIMIT 1', [to, templateName, sendDate || ''], (err, found) => {
          res(!!found);
        });
      });
      if (alreadySent) continue;
      // Prepare and send email
      const templatePath = path.join(__dirname, 'templates', templateName);
      if (!fs.existsSync(templatePath)) continue;
      let html = fs.readFileSync(templatePath, 'utf-8');
      html = html.replace(/{{\s*firstName\s*}}/g, firstName || '')
                 .replace(/{{\s*senderName\s*}}/g, 'Noah')
                 .replace(/{{\s*senderEmail\s*}}/g, process.env.SENDGRID_FROM_EMAIL || '')
                 .replace(/{{\s*personalNote\s*}}/g, note || '');
      const templateDisplay = templateName.replace('.html', '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const subject = `${templateDisplay} - Great to connect with you ${firstName}`;
      try {
        await sgMail.send({ to, from: process.env.SENDGRID_FROM_EMAIL, subject, html });
        db.run('INSERT INTO logs (email, template, sentAt) VALUES (?, ?, ?)', [to, templateName, new Date().toISOString()]);
        console.log(`✅ Scheduled email sent to ${to}`);
      } catch (err) {
        console.error(`❌ Failed to send scheduled email to ${to}:`, err.response?.body || err.message);
      }
    }
  });
}
setInterval(sendScheduledEmails, SCHEDULED_EMAIL_INTERVAL_MS);

app.listen(3002, () => {
  console.log('✅ CRM API running at http://localhost:3002');
});
