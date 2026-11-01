// For Stores page: benefits and steps are in the HTML. Applying happens on
// /store-signup (account + application, saved in Supabase); this script only
// fills in the WhatsApp links for store owners who prefer to talk first.
import { startPage } from '../layout.js';
import { t } from '../i18n.js';
import { whatsappLink } from '../utils.js';

startPage(() => {
  const link = whatsappLink(t('forStores.whatsappMessage'));
  document.getElementById('stores-whatsapp').href = link;
  document.getElementById('apply-whatsapp').href = link;
});
