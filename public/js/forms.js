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
