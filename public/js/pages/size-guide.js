import { startPage } from '../layout.js';
import { t } from '../i18n.js';
import { whatsappLink } from '../utils.js';

startPage(() => {
  document.getElementById('size-help').href = whatsappLink(t('sizeGuide.whatsappMessage'));
});
