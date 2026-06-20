import { applyI18n, initLangSelector, getLang, t } from './i18n.js';

applyI18n();
initLangSelector();

document.title = t('feat.title');
