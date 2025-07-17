const { OpenAI } = require('openai');
require('dotenv').config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Generate a personalized sentence for the email body
 */
async function generatePersonalNote(note, context = '') {
  try {
    const prompt = `
You are helping a freight broker write a brief, friendly personalized line for a sales email based on a note about the client. 
Keep it in first person. Be specific, not generic. Don't sound like AI.

Note: "${note}"
Context: "${context}"

Return only one sentence.
`;

    const completion = await openai.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'gpt-4',
      temperature: 0.7,
    });

    return completion.choices[0].message.content.trim();
  } catch (err) {
    console.warn('⚠️ AI personal note generation failed:', err.message);
    return '';
  }
}

/**
 * Generate a personalized subject line based on the template + note
 */
async function rewriteSubject(templateSubject, note) {
  try {
    const prompt = `
You are helping a freight broker rewrite an email subject line to feel more personal and relevant based on a note about the lead.
Avoid sounding robotic or overly formal. Subject line should still reflect the core service.

Original subject: "${templateSubject}"
Note about client: "${note}"

Return just the rewritten subject line.
`;

    const completion = await openai.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'gpt-4',
      temperature: 0.7,
    });

    return completion.choices[0].message.content.trim();
  } catch (err) {
    console.warn('⚠️ AI subject rewrite failed:', err.message);
    return templateSubject;
  }
}

module.exports = {
  generatePersonalNote,
  rewriteSubject,
};
