// Policies, Terms and Privacy pages. The text lives in the i18n files under
// legal.<doc>.sections; <body data-doc="..."> says which document to show.
// Each section: { "id", "title", "body": ["paragraph", ...], "list": ["item", ...], "after": ["paragraph", ...] }
import { startPage } from '../layout.js';
import { CONTACT } from '../config.js';
import { tRaw } from '../i18n.js';
import { escapeHtml } from '../utils.js';

// Contact details come from config.js, so they stay in one place.
// <bdi> keeps the number/address left-to-right inside Arabic text, and on one line.
const fill = (text) => escapeHtml(text)
  .replace('{email}', `<bdi class="nowrap"><a class="text-link" href="mailto:${CONTACT.email}">${CONTACT.email}</a></bdi>`)
  .replace('{whatsapp}', `<bdi class="nowrap" dir="ltr">${CONTACT.whatsappDisplay}</bdi>`);

startPage(() => {
  const sections = tRaw(`legal.${document.body.dataset.doc}.sections`) ?? [];

  document.getElementById('legal-root').innerHTML = sections.map((section) => `
    <section class="legal-section reveal" id="${section.id}" aria-labelledby="${section.id}-title">
      <h2 class="section-title legal-section__title" id="${section.id}-title">${escapeHtml(section.title)}</h2>
      <div class="legal-section__body prose">
        ${(section.body ?? []).map((paragraph) => `<p>${fill(paragraph)}</p>`).join('')}
        ${section.list ? `<ul class="legal-list">${section.list.map((item) => `<li>${fill(item)}</li>`).join('')}</ul>` : ''}
        ${(section.after ?? []).map((paragraph) => `<p>${fill(paragraph)}</p>`).join('')}
      </div>
    </section>`).join('');

  // The sections didn't exist when the browser tried to jump to #exchange, so jump now
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
});
