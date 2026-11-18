/* Лёгкая проверка основного сценария без браузера и внешних зависимостей.
   Запуск: node tests/smoke-test.cjs */
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

class Element {
  constructor(name = '') {
    this.name = name; this.value = ''; this.checked = false; this.hidden = false;
    this.textContent = ''; this.children = []; this.disabled = false;
    this.selectionStart = 0; this.selectionEnd = 0;
    this.classList = { add() {}, remove() {}, toggle() {} };
    this.listeners = {};
  }
  addEventListener(event, handler) { (this.listeners[event] ??= []).push(handler); }
  emit(event) { for (const handler of this.listeners[event] || []) handler({ target: this }); }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = [...items]; }
  focus() {}
  select() {}
  setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
}
const elements = new Map();
const get = id => { if (!elements.has(id)) elements.set(id, new Element(id)); return elements.get(id); };
const data = new Map();
const ctx = {
  document: { getElementById: get, createElement: kind => new Element(kind),
    addEventListener() {}, body: new Element('body') },
  navigator: { onLine: true }, window: { addEventListener() {}, isSecureContext: false },
  location: { protocol: 'file:', hostname: '' },
  localStorage: { getItem: key => data.get(key) ?? null, setItem: (key,value) => data.set(key,value) },
  setTimeout, clearTimeout, console, confirm: () => true,
  URL, Blob, Date, Math,
};
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../app.js'),'utf8'), ctx);
assert.match(get('resultText').value, /мастер-класс по чтению/);
assert.match(get('tableCount').textContent, /3 стр/);

get('rawData').value = 'Имя;Стаж\nАнна;5 лет\nМарк;3 года';
get('rawData').emit('input');
get('patternInput').value = '{Имя} работает {Стаж}.';
get('patternInput').emit('input');
get('introInput').value = '';
get('introInput').emit('input');
get('outroInput').value = '';
get('outroInput').emit('input');
assert.equal(get('resultText').value, 'Анна работает 5 лет.\n\nМарк работает 3 года.');
assert.equal(get('validationMessage').hidden, true);

get('patternInput').value = 'Здравствуйте, {Имя}! Должность: {Должность}.';
get('patternInput').emit('input');
assert.equal(get('validationMessage').hidden, false);
assert.match(get('validationMessage').textContent, /\{Должность\}/);

get('patternInput').value = '{№}. {Имя}';
get('patternInput').emit('input');
assert.equal(get('resultText').value, '1. Анна\n\n2. Марк');
get('numberRows').checked = true;
get('numberRows').emit('change');
assert.match(get('resultText').value, /^1\. 1\. Анна/); // нумерация и явное поле {№} могут сочетаться

get('numberRows').checked = false;
get('numberRows').emit('change');
get('rawData').value = 'Заголовок,Примечание\n"Имя, фамилия","текст с ""кавычками"""';
get('rawData').emit('input');
get('patternInput').value = '{Заголовок}: {Примечание}';
get('patternInput').emit('input');
assert.equal(get('resultText').value, 'Имя, фамилия: текст с "кавычками"');

get('rawData').value = 'Группа\tПодгруппа\tСобытие\nА\t1\tСеминар\nА\t1\tЛекция\nА\t2\tТурнир\nА\t1\tСеминар';
get('rawData').emit('input');
get('patternInput').value = '{Группа}: {Событие|уникальные} ({КоличествоВГруппе})';
get('patternInput').emit('input');
get('groupBySelect').value = 'Группа';
get('groupBySelect').emit('change');
get('groupBySecondSelect').value = 'Подгруппа';
get('groupBySecondSelect').emit('change');
assert.equal(get('resultText').value, 'А: Семинар и Лекция (3)\n\nА: Турнир (1)');

get('newTemplateButton').emit('click');
assert.equal(get('templateName').value, 'Мой новый шаблон');
get('templateName').value = 'Тестовый шаблон';
get('templateName').emit('input');
assert.equal(get('templateSelect').children.at(-1).textContent, 'Тестовый шаблон');
get('rawData').value = '<script>\tИмя\nalert(1)\tТест';
get('rawData').emit('input');
assert.equal(get('tablePreview').children[0].name, 'table');
console.log('Smoke tests: OK (CSV/TSV, шаблоны, группировка по двум столбцам, уникальные значения, валидация)');
