let templateOptions = [];

// Load templates and then contacts (for main CRM page)
async function loadTemplates() {
  const res = await fetch('/api/templates');
  const templates = await res.json();
  templateOptions = templates;
  const select = document.getElementById('newTemplate');
  if (select) {
    select.innerHTML = templates.map(t => `<option value="${t.value}">${t.label}</option>`).join('');
  }
  await loadContacts();
}

// Load contacts (for main CRM page)
async function loadContacts() {
  const status = document.getElementById('statusFilter')?.value || '';
  const date = document.getElementById('dateFilter')?.value || '';
  const query = new URLSearchParams();
  if (status) query.append('status', status);
  if (date) query.append('date', date);

  const res = await fetch(`/api/contacts?${query.toString()}`);
  const contacts = await res.json();
  const tbody = document.querySelector('#contactsTable tbody');
  if (!tbody) return;
  tbody.innerHTML = '';

  contacts.forEach(contact => {
    const tr = document.createElement('tr');
    const scheduled = (contact.sendDate || contact.sendTime) ? `${contact.sendDate || ''}${contact.sendTime ? ' ' + contact.sendTime : ''}` : '';
    // Use CSS classes for grid layout and better spacing
    tr.innerHTML = `
      <td class="contact-name">${contact.firstName}</td>
      <td class="contact-email">${contact.email}</td>
      <td class="contact-template">
      <div class="template-actions">
        <select class="template-select" data-id="${contact.id}">
        ${templateOptions.map(t =>
          `<option value="${t.value}" ${contact.template === t.value ? 'selected' : ''}>${t.label}</option>`
        ).join('')}
        </select>
        <div class="template-btns">
        <button class="send-btn" data-id="${contact.id}">Send</button>
        <button class="edit-send-btn" data-id="${contact.id}">Edit & Send</button>
        </div>
      </div>
      </td>
      <td class="contact-status">
      <select class="status-select" data-id="${contact.id}">
        <option value="Not Contacted" ${contact.status === 'Not Contacted' ? 'selected' : ''}>Not Contacted</option>
        <option value="Followed Up" ${contact.status === 'Followed Up' ? 'selected' : ''}>Followed Up</option>
        <option value="Contacted" ${contact.status === 'Contacted' ? 'selected' : ''}>First Contact</option>
        <option value="No longer interested" ${contact.status === 'No longer interested' ? 'selected' : ''}>No longer interested</option>
        <option value="Achieved" ${contact.status === 'Achieved' ? 'selected' : ''}>Achieved</option>
        <option value="In Progress" ${contact.status === 'In Progress' ? 'selected' : ''}>In Progress</option>
      </select>
      </td>
      <td class="note-cell">${contact.note}</td>
      <td class="contact-scheduled">${scheduled}</td>
      <td class="contact-actions">
      <div class="action-btns">
        <button class="send-test-btn" data-id="${contact.id}">Send Test</button>
        <button class="edit-contact-btn" data-id="${contact.id}">Edit</button>
        <button class="delete-contact-btn" data-id="${contact.id}">Delete</button>
        ${(contact.sendDate || contact.sendTime) ? `<button class="cancel-schedule-btn" data-id="${contact.id}">Cancel Scheduled Email</button>` : ''}
      </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Update a single field for a contact
async function updateField(id, field, value) {
  await fetch(`/api/contacts/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ [field]: value })
  });
}

// Export contacts to CSV
function exportToCSV() {
  const rows = [['Name','Email','Template','Status','Note','Send Date']];
  document.querySelectorAll('#contactsTable tbody tr').forEach(row => {
    const cols = Array.from(row.querySelectorAll('td')).map(td => td.querySelector('input')?.value || td.textContent);
    rows.push(cols);
  });
  const csv = rows.map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'contacts_export.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// Import contacts from CSV
function importFromCSV() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.csv';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const rows = text.split('\n').map(row => row.split(',').map(cell => cell.trim()));
    if (rows.length < 2) return alert('CSV must have at least one data row.');
    const header = rows[0].map(h => h.toLowerCase());
    const getIndex = (name) => header.indexOf(name.toLowerCase());
    const contacts = rows.slice(1).filter(row => row.length > 1 && row[0]).map(row => ({
      firstName: row[getIndex('name')] || '',
      email: row[getIndex('email')] || '',
      template: row[getIndex('template')] || '',
      status: row[getIndex('status')] || 'Not Contacted',
      note: row[getIndex('note')] || '',
      sendDate: row[getIndex('send date')] || ''
    }));
    await fetch('/api/contacts/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(contacts)
    });
    loadContacts();
    alert('Contacts imported successfully!');
  };
  input.click();
}

// Add a new contact
async function addContact() {
  const contact = {
    firstName: document.getElementById('newName')?.value || '',
    email: document.getElementById('newEmail')?.value || '',
    template: document.getElementById('newTemplate')?.value || '',
    note: document.getElementById('newNote')?.value || '',
    sendDate: document.getElementById('newDate')?.value || '',
    sendTime: document.getElementById('newTime')?.value || ''
  };
  await fetch('/api/contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(contact)
  });
  ['newName', 'newEmail', 'newTemplate', 'newNote', 'newDate', 'newTime'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  loadContacts();
}

// Load logs for logs.html
async function loadLogs() {
  const res = await fetch('/api/logs');
  const logs = await res.json();
  let tbody = document.querySelector('#logsTable tbody');
  if (!tbody) {
    tbody = document.createElement('tbody');
    document.getElementById('logsTable').appendChild(tbody);
  }
  tbody.innerHTML = '';
  logs.forEach(log => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${log.email}</td>
      <td>${log.template}</td>
      <td>${log.sentAt}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Add notification UI
function showNotification(message, type = 'info') {
  let notif = document.getElementById('notificationBar');
  if (!notif) {
    notif = document.createElement('div');
    notif.id = 'notificationBar';
    notif.style.position = 'fixed';
    notif.style.top = '18px';
    notif.style.right = '24px';
    notif.style.zIndex = 2000;
    notif.style.background = '#1976d2';
    notif.style.color = '#fff';
    notif.style.padding = '0.7rem 1.5rem';
    notif.style.borderRadius = '24px';
    notif.style.boxShadow = '0 2px 8px rgba(0,0,0,0.12)';
    notif.style.fontWeight = 'bold';
    notif.style.display = 'flex';
    notif.style.alignItems = 'center';
    notif.innerHTML = '<span style="font-size:1.3em;margin-right:0.7em;">📤</span><span id="notifMsg"></span>';
    document.body.appendChild(notif);
  }
  notif.style.background = type === 'success' ? '#43a047' : (type === 'error' ? '#e53935' : '#1976d2');
  notif.querySelector('#notifMsg').textContent = message;
  notif.style.opacity = 1;
  notif.style.display = 'flex';
  setTimeout(() => {
    notif.style.transition = 'opacity 0.7s';
    notif.style.opacity = 0;
    setTimeout(() => { notif.style.display = 'none'; notif.style.transition = ''; }, 800);
  }, 3500);
}

// Event listeners
document.addEventListener('change', async function (e) {
  if (e.target.classList.contains('status-select')) {
    const id = e.target.dataset.id;
    const newStatus = e.target.value;
    await updateField(id, 'status', newStatus);
  }
  if (e.target.classList.contains('template-select')) {
    const id = e.target.dataset.id;
    const newTemplate = e.target.value;
    await updateField(id, 'template', newTemplate);
  }
});

document.addEventListener('click', async function (e) {
  if (e.target.classList.contains('send-btn')) {
    const id = e.target.dataset.id;
    e.target.disabled = true;
    e.target.textContent = 'Sending...';
    try {
      const res = await fetch(`/api/send/${id}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showNotification('Email sent!', 'success');
        alert(`✅ Email sent for contact ID ${id}`);
      } else {
        showNotification('Error sending email', 'error');
        alert(`❌ Error: ${data.error}`);
      }
    } catch (err) {
      showNotification('Network error', 'error');
      alert(`❌ Network error: ${err.message}`);
    } finally {
      e.target.disabled = false;
      e.target.textContent = 'Send';
    }
  }
});

document.addEventListener('click', async function (e) {
  if (e.target.classList.contains('edit-send-btn')) {
    const id = e.target.dataset.id;
    // Fetch the rendered email preview from your backend
    const res = await fetch(`/api/email-preview/${id}`);
    const html = await res.text();
    document.getElementById('emailEditor').value = html;
    document.getElementById('emailModal').style.display = 'block';
    document.getElementById('sendEditedEmailBtn').onclick = async function() {
      const editedHtml = document.getElementById('emailEditor').value;
      await fetch(`/api/send/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customHtml: editedHtml })
      });
      document.getElementById('emailModal').style.display = 'none';
      alert('Custom email sent!');
    };
  }
});

document.addEventListener('click', async function (e) {
  if (e.target.classList.contains('delete-contact-btn')) {
    const id = e.target.dataset.id;
    if (!confirm('Are you sure you want to delete this contact?')) return;
    e.target.disabled = true;
    try {
      const res = await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        loadContacts();
      } else {
        alert(`❌ Error: ${data.error}`);
      }
    } catch (err) {
      alert(`❌ Network error: ${err.message}`);
    }
  }
});

document.addEventListener('click', async function (e) {
  if (e.target.classList.contains('edit-contact-btn')) {
    const id = e.target.dataset.id;
    // Find the contact in the current table (or fetch if needed)
    const row = e.target.closest('tr');
    document.getElementById('editContactId').value = id;
    document.getElementById('editName').value = row.children[0].textContent;
    document.getElementById('editEmail').value = row.children[1].textContent;
    document.getElementById('editNote').value = row.children[4].textContent;
    // Scheduled Send column may have both date and time
    const scheduled = row.children[5].textContent.trim();
    const [editDate, editTime] = scheduled.split(' ');
    document.getElementById('editDate').value = editDate || '';
    document.getElementById('editTime').value = editTime || '';
    document.getElementById('editContactModal').style.display = 'block';
  }
});

// Handle edit contact form submission
const editContactForm = document.getElementById('editContactForm');
if (editContactForm) {
  editContactForm.onsubmit = async function (e) {
    e.preventDefault();
    const id = document.getElementById('editContactId').value;
    const firstName = document.getElementById('editName').value;
    const email = document.getElementById('editEmail').value;
    const note = document.getElementById('editNote').value;
    const sendDate = document.getElementById('editDate').value;
    const sendTime = document.getElementById('editTime').value;
    await fetch(`/api/contacts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName, email, note, sendDate, sendTime })
    });
    document.getElementById('editContactModal').style.display = 'none';
    loadContacts();
  };
}

// Only add these listeners if the elements exist (for main CRM page)
if (document.getElementById('statusFilter')) {
  document.getElementById('statusFilter').addEventListener('change', loadContacts);
}
if (document.getElementById('dateFilter')) {
  document.getElementById('dateFilter').addEventListener('change', loadContacts);
}

// On page load, decide which page we're on
window.onload = () => {
  if (document.getElementById('logsTable')) {
    loadLogs();
  } else {
    loadTemplates();
  }
};