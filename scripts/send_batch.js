// Updated send_batch.js using SQLite instead of CSV
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const sgMail = require('@sendgrid/mail');
const minimist = require('minimist');
const { generatePersonalNote, rewriteSubject } = require('../lib/ai_helper');
require('dotenv').config();

const dbPath = path.join(__dirname, '../crm.sqlite');
const db = new sqlite3.Database(dbPath);

const senderName = 'Noah';
const senderEmail = process.env.SENDGRID_FROM_EMAIL;
const subjectMap = {
  'motorhome_followup.html': 'RV Hauling - Great Connecting with You',
  'construction_equipment_followup.html': 'Construction Equipment Haul - Great Connecting with You',
  'agriculture_equipment_followup.html': 'Agricultural Hauling - Great Connecting with You',
  'been_a_while.html': 'Been a While - Let’s Reconnect',
  'general_followup.html': 'Quick Follow-Up - Let’s Connect',
  're_engagement.html': 'Hey, just resurfacing in case you lost my contact info',
  'final_check.html': 'Happy to reconnect later if needed'
};

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const args = minimist(process.argv.slice(2));
const useAI = !!args.ai;
const isScheduled = !!args.schedule;
const dryRun = !!args['dry-run'];

const logPath = path.join(__dirname, 'scripts', 'sent_log.json');
let log = [];
if (fs.existsSync(logPath)) {
  try {
    log = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
  } catch {
    console.warn('⚠️ Could not parse existing log. Starting fresh.');
  }
}

function isDue(sendDate, sendTime) {
  if (!sendDate && !sendTime) return true;
  const now = new Date();
  if (!sendDate) return true;
  // If no time, treat as due if date is today or earlier
  if (!sendTime) {
    const today = now.toISOString().split('T')[0];
    return sendDate <= today;
  }
  // If both date and time, check full datetime
  const scheduled = new Date(`${sendDate}T${sendTime}`);
  return now >= scheduled;
}

function fetchContacts(callback) {
  let query = 'SELECT * FROM contacts';
  const params = [];

  if (isScheduled) {
    query += ' WHERE sendDate IS NULL OR sendDate <= date("now")';
  }

  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('❌ Failed to query contacts:', err);
      process.exit(1);
    }
    callback(rows);
  });
}

function alreadySent(to, template) {
  return log.some(entry => entry.to === to && entry.template === template);
}

fetchContacts(async contacts => {
  for (const row of contacts) {
    const to = row.email?.trim();
    const firstName = row.firstName?.trim();
    const templateName = row.template?.trim();
    const note = row.note?.trim() || '';
    const sendDate = row.sendDate?.trim();
    const sendTime = row.sendTime?.trim();

    if (!to || !firstName || !templateName) {
      console.warn(`⚠️ Skipping incomplete row: ${JSON.stringify(row)}`);
      continue;
    }

    if (isScheduled && !isDue(sendDate, sendTime)) {
      console.log(`⏳ Not sending to ${to} — scheduled for ${sendDate}${sendTime ? ' ' + sendTime : ''}`);
      continue;
    }

    if (alreadySent(to, templateName)) {
      console.warn(`⚠️ Already sent to ${to} with ${templateName}, skipping.`);
      continue;
    }

    const subjectRaw = subjectMap[templateName];
    if (!subjectRaw) {
      console.warn(`⚠️ No subject found for template "${templateName}", skipping ${to}`);
      continue;
    }

    const templatePath = path.join(__dirname, '..', 'templates', templateName);
    if (!fs.existsSync(templatePath)) {
      console.warn(`⚠️ Template not found: ${templatePath}, skipping ${to}`);
      continue;
    }

    let html = fs.readFileSync(templatePath, 'utf-8');
    let subject = subjectRaw;
    let personalNote = '';

    if (useAI && note) {
      subject = await rewriteSubject(subjectRaw, note);
      personalNote = await generatePersonalNote(note);
    }

    const replacements = {
      firstName,
      senderName,
      senderEmail,
      personalNote
    };

    for (const [key, value] of Object.entries(replacements)) {
      html = html.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), value);
    }

    if (dryRun) {
      console.log(`🚫 DRY RUN: Would send to ${to} — Subject: "${subject}"`);
      continue;
    }

    const msg = {
      to,
      from: senderEmail,
      subject,
      html
    };

    try {
      await sgMail.send(msg);
      console.log(`✅ Sent to ${to}`);
      log.push({ to, firstName, template: templateName, subject, timestamp: new Date().toISOString() });
    } catch (err) {
      console.error(`❌ Failed to send to ${to}:`, err.response?.body || err.message);
    }
  }

  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  console.log('📄 Batch complete. Log updated.');
});
