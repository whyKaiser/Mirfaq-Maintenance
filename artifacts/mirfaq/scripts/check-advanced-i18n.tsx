import { strict as assert } from 'node:assert';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LanguageProvider } from '../src/context/LanguageContext';
import { useAdvancedText } from '../src/context/advanced-translations';

function Labels() {
  const t=useAdvancedText();
  return <p>{[t('العقارات'),t('الوحدات'),t('المستخدمون'),t('الاشتراك والفوترة'),t('تعذر حفظ التغيير'),t('اسم مسجل غير معروف')].join('|')}</p>;
}
const original=globalThis.localStorage;
for (const [selected,expected] of [['en','Properties|Units|Users|Subscription and billing|Could not save the change.|اسم مسجل غير معروف'],['ar','العقارات|الوحدات|المستخدمون|الاشتراك والفوترة|تعذر حفظ التغيير|اسم مسجل غير معروف']] as const) {
  Object.defineProperty(globalThis,'localStorage',{value:{getItem:()=>selected},configurable:true});
  assert.equal(renderToStaticMarkup(<LanguageProvider><Labels /></LanguageProvider>),`<p>${expected}</p>`);
}
Object.defineProperty(globalThis,'localStorage',{value:original,configurable:true});
console.log('PASS: English/Arabic advanced labels, errors, and original-content fallback');
