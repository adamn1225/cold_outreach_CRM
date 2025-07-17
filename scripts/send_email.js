const fs = require('fs');
const path = require('path');
const sgMail = require('@sendgrid/mail');
const prompt = require('prompt-sync')({ sigint: true });
const minimist = require('minimist');
const chalk = require('chalk');

require('dotenv').config();

const senderName = 'Noah';
const senderEmail = process.env.SENDGRID_FROM_EMAIL;

const subjectMap = {
    'motorhome_followup.html': 'RV Hauling - Great Connecting with You',
    'heavy_haulers.html': 'Construction Equipment Haul - Great Connecting with You',
    'agriculture_equipment_followup.html': 'Agricultural Hauling - Great Connecting with You',
    'been_a_while.html': 'Been a While - Let’s Reconnect',
    'general_followup.html': 'Quick Follow-Up - Let’s Connect',
    're_engagement.html': 'Hey, just resurfacing in case you lost my contact info',
    'final_check.html': 'Happy to reconnect later if needed',
  };

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// CLI args
const args = minimist(process.argv.slice(2));
let templateName = args.template;

// If no template passed, list available ones
if (!templateName) {
    const templateDir = path.join(__dirname, 'templates');
    const templates = fs.readdirSync(templateDir).filter(f => f.endsWith('.html'));
  
    console.log('\nAvailable Templates:');
  
    templates.forEach((tpl, i) => {
      let colorFn = chalk.white;
  
      if (tpl.includes('agriculture')) {
        colorFn = chalk.green;
      } else if (tpl.includes('construction')) {
        colorFn = chalk.yellow;
      } else if (tpl.includes('motorhome')) {
        colorFn = chalk.cyan;
      } else if (tpl.includes('been_a_while')) {
        colorFn = chalk.magenta;
      } else if (tpl.includes('general_followup')) {
        colorFn = chalk.blue;
      } else if (tpl.includes('re_engagement')) {
        colorFn = chalk.red;
      } else if (tpl.includes('final_check')) {
        colorFn = chalk.gray;
      }
  
      console.log(`${i + 1}. ${colorFn(tpl)}`);
    });
  
    const choice = parseInt(prompt('Choose a template by number: ').trim());
    if (isNaN(choice) || choice < 1 || choice > templates.length) {
    console.error('❌ Invalid selection. Exiting.');
    process.exit(1);
    }
    const selected = templates[choice - 1];
    if (!selected) {
      console.error('❌ Invalid selection. Exiting.');
      process.exit(1);
    }
    templateName = selected;
  }

  if (!subjectMap[templateName]) {
    console.error(`❌ No subject found for template "${templateName}". Check subjectMap.`);
    process.exit(1);
  }

const to = prompt('Recipient email: ').trim();
const firstName = prompt('Recipient first name: ').trim();

// Load and render HTML
const templatePath = path.join(__dirname, '..', 'templates', templateName);
if (!fs.existsSync(templatePath)) {
  console.error(`❌ Template not found: ${templatePath}`);
  process.exit(1);
}
let html = fs.readFileSync(templatePath, 'utf-8');

const replacements = { firstName, senderName, senderEmail };
for (const [key, value] of Object.entries(replacements)) {
  html = html.replace(new RegExp(`{{\\s*${key}\\s*}}`, 'g'), value);
}

const subject = subjectMap[templateName];

// 🧪 Preview
console.log('\n📧 Preview Email');
console.log('------------------------------------');
console.log(`To: ${to}`);
console.log(`From: ${senderEmail}`);
console.log(`Subject: ${subject}`);
console.log('------------------------------------');
console.log(html.slice(0, 800)); // truncate preview
console.log('... (truncated)\n');

const confirm = prompt('Send this email? (y/N): ').toLowerCase();
if (confirm !== 'y') {
  console.log('❌ Cancelled.');
  process.exit(0);
}

const msg = {
  to,
  from: senderEmail,
  subject,
  html,
};

sgMail
  .send(msg)
  .then(() => {
    console.log(`✅ Email sent to ${to}`);

    const logEntry = {
      to,
      subject,
      template: templateName,
      timestamp: new Date().toISOString(),
      firstName,
    };

    const logPath = path.join(__dirname, 'scripts', 'sent_log.json');
    let existing = [];

    if (fs.existsSync(logPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
      } catch {
        console.warn('⚠️ Could not parse existing log, creating fresh.');
      }
    }

    existing.push(logEntry);
    fs.writeFileSync(logPath, JSON.stringify(existing, null, 2));
  })
  .catch(error => {
    console.error('❌ Send failed:', error.response?.body || error.message);
  });
