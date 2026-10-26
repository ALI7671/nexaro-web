// Contact: channel list plus a form that opens WhatsApp with the message filled in.
import { startPage, renderIcons } from '../layout.js';
import { CONTACT } from '../config.js';
import { t } from '../i18n.js';
import { validateForm, clearErrorsOnInput, required } from '../forms.js';
import { escapeHtml, whatsappLink } from '../utils.js';

startPage(() => {
  renderChannels();

  const form = document.getElementById('contact-form');
  const note = document.getElementById('contact-opened');
  clearErrorsOnInput(form);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!validateForm(form, { name: required, message: required })) return;

    const message = t('contact.whatsappMessage', {
      name: form.elements.name.value.trim(),
      message: form.elements.message.value.trim(),
    });
    window.open(whatsappLink(message), '_blank', 'noopener');
    note.textContent = t('contact.opened');
    note.hidden = false;
  });
});

function renderChannels() {
  const channels = [
    { icon: 'chat', label: t('contact.whatsapp'), value: CONTACT.whatsappDisplay, href: whatsappLink(t('contact.whatsappHello')), ltr: true },
    { icon: 'instagram', label: t('contact.instagram'), value: `@${CONTACT.instagram}`, href: `https://www.instagram.com/${CONTACT.instagram}`, ltr: true },
    { icon: 'mail', label: t('contact.email'), value: CONTACT.email, href: `mailto:${CONTACT.email}`, ltr: true },
    { icon: 'pin', label: t('contact.location'), value: t('contact.locationValue') },
    { icon: 'clock', label: t('contact.hours'), value: t('contact.hoursValue') },
  ];

  const list = document.getElementById('contact-channels');
  list.innerHTML = channels.map((channel) => {
    const value = `<span class="contact-list__value"${channel.ltr ? ' dir="ltr"' : ''}>${escapeHtml(channel.value)}</span>`;
    const external = channel.href?.startsWith('http') ? ' target="_blank" rel="noopener"' : '';
    return `
      <li>
        <span data-icon="${channel.icon}"></span>
        <div>
          <span class="contact-list__label">${escapeHtml(channel.label)}</span>
          ${channel.href ? `<a class="contact-list__link" href="${channel.href}"${external}>${value}</a>` : value}
        </div>
      </li>`;
  }).join('');
  renderIcons(list);
}
