// Form validation helpers. Each field has an error element with id "<field id>-error".
import { t } from './i18n.js';

export function showFieldError(field, message) {
  const error = document.getElementById(`${field.id}-error`);
  field.setAttribute('aria-invalid', 'true');
  if (error) {
    error.textContent = message;
    error.hidden = false;
  }
}

export function clearFieldError(field) {
  const error = document.getElementById(`${field.id}-error`);
  field.removeAttribute('aria-invalid');
  if (error) {
    error.textContent = '';
    error.hidden = true;
  }
}

// validators: { fieldName: (trimmedValue) => '' if valid, or an i18n key for the error }
// Shows every error, focuses the first invalid field, and returns true when all are valid.
export function validateForm(form, validators) {
  let firstInvalid = null;
  for (const [name, validate] of Object.entries(validators)) {
    const field = form.elements[name];
    const errorKey = validate(field.value.trim());
    if (errorKey) {
      showFieldError(field, t(errorKey));
      firstInvalid ??= field;
    } else {
      clearFieldError(field);
    }
  }
  firstInvalid?.focus();
  return !firstInvalid;
}

// Removes a field's error as soon as the user starts fixing it
export function clearErrorsOnInput(form) {
  form.addEventListener('input', (event) => {
    if (event.target.getAttribute('aria-invalid') === 'true') clearFieldError(event.target);
  });
}

export const required = (value) => (value ? '' : 'form.errors.required');

// Palestinian mobile numbers: 059/056 + 7 digits, optionally with +970 / +972 / 00970
const PHONE_PATTERN = /^(?:(?:\+|00)?97[02]|0)5[69]\d{7}$/;
// "@yourstore", "yourstore" or an instagram.com/yourstore link
const INSTAGRAM_PATTERN = /^(?:@?[\w.]{1,30}|(?:https?:\/\/)?(?:www\.)?instagram\.com\/[\w.]{1,30}\/?(?:\?.*)?)$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const MIN_PASSWORD = 8;

export const phone = (value) => {
  if (!value) return 'form.errors.required';
  return PHONE_PATTERN.test(value.replace(/[\s\-()]/g, '')) ? '' : 'form.errors.phone';
};
export const instagram = (value) => (!value || INSTAGRAM_PATTERN.test(value) ? '' : 'form.errors.instagram');
export const email = (value) => {
  if (!value) return 'form.errors.required';
  return EMAIL_PATTERN.test(value) ? '' : 'form.errors.email';
};
export const password = (value) => {
  if (!value) return 'form.errors.required';
  return value.length >= MIN_PASSWORD ? '' : 'form.errors.passwordShort';
};

// Disables a submit button while a request runs, and shows e.g. "Sending…"
export function setBusy(button, busy, busyText) {
  if (busy) {
    button.dataset.label ??= button.textContent;
    button.textContent = busyText;
  } else if (button.dataset.label) {
    button.textContent = button.dataset.label;
  }
  button.disabled = busy;
}

// Shows (or hides, with an empty message) a form-wide message element
export function showMessage(element, message) {
  element.textContent = message;
  element.hidden = !message;
}
