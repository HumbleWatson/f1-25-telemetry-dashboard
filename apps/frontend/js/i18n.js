(function () {
  'use strict';

  var translations = {};
  var currentLang = localStorage.getItem('png_lang') || 'en';

  function fetchTranslations() {
    return fetch('/static/i18n/translations.json')
      .then(function (r) {
        if (!r.ok) throw new Error('Failed to load translations');
        return r.json();
      })
      .then(function (data) {
        translations = data;
        applyLang();
      })
      .catch(function (err) {
        console.error('i18n: failed to load translations', err);
      });
  }

  function applyLang() {
    document.documentElement.lang = currentLang;
    window.dispatchEvent(new CustomEvent('i18n:change', { detail: { lang: currentLang } }));
  }

  window.__ = function (key, params) {
    var value = key.split('.').reduce(function (o, k) {
      return (o && typeof o === 'object' && k in o) ? o[k] : null;
    }, translations[currentLang]);
    if (value == null) {
      value = key.split('.').reduce(function (o, k) {
        return (o && typeof o === 'object' && k in o) ? o[k] : null;
      }, translations.en);
    }
    if (value == null) return key;
    if (!params) return value;
    return value.replace(/\{(\w+)\}/g, function (_, k) {
      return params[k] != null ? params[k] : '{' + k + '}';
    });
  };

  window.i18n = {
    setLang: function (lang) {
      if (lang === currentLang) return;
      currentLang = lang;
      localStorage.setItem('png_lang', lang);
      applyLang();
    },
    getLang: function () {
      return currentLang;
    },
    getAvailableLangs: function () {
      return Object.keys(translations);
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fetchTranslations);
  } else {
    fetchTranslations();
  }
})();
