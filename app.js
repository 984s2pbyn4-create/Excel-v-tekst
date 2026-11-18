/* Таблица → Текст. Автономный конструктор отчётов; JSZip поставляется в комплекте. */
(() => {
  'use strict';

  const STORAGE_KEY = 'table-to-text-pwa-state-v1';
  const EXAMPLE_DATA = [
    'Дата\tМесто\tМероприятие\tУчастники\tИтог',
    '12.11.2026\tбиблиотека № 5\tмастер-класс по чтению\t18 человек\tподготовлены рекомендации',
    '14.11.2026\tшкола № 12\tнаучный семинар\t25 учащихся\tпредставлены 8 проектов',
    '17.11.2026\tцентр творчества\tтворческая встреча\t32 участника\tорганизована выставка работ'
  ].join('\n');

  const STARTER_TEMPLATES = [
    {
      id: 'starter-narrative',
      name: 'Связный рассказ о мероприятиях',
      intro: 'В отчётный период состоялись следующие мероприятия.',
      pattern: '{Дата} состоялось мероприятие «{Мероприятие}» (место проведения — {Место}). В нём приняли участие {Участники}. По итогам мероприятия {Итог}.',
      outro: 'Всего описано мероприятий: {Количество}.'
    },
    {
      id: 'starter-short',
      name: 'Краткая сводка',
      intro: 'Сведения о проведённых мероприятиях:',
      pattern: 'Мероприятие «{Мероприятие}» прошло {Дата}. Место проведения: {Место}. Участники: {Участники}. Результат: {Итог}.',
      outro: 'Общее количество записей — {Количество}.'
    },
    {
      id: 'starter-numbered',
      name: 'Отчёт с нумерацией',
      intro: 'Ниже приводятся описания мероприятий по порядку.',
      pattern: 'Запись {№}: {Дата} проведено мероприятие «{Мероприятие}» в следующем месте: {Место}. Число участников: {Участники}. Итог: {Итог}.',
      outro: ''
    },
    {
      id: 'starter-grouped',
      name: 'Общий отчёт по месту',
      intro: 'Сводка по местам проведения:',
      pattern: 'В {Место} организованы мероприятия: {Мероприятие|уникальные}. Всего записей: {КоличествоВГруппе}.',
      outro: 'Всего мероприятий: {Количество}.',
      groupBy: 'Место', groupBySecond: ''
    }
  ];

  const $ = id => document.getElementById(id);
  const ui = {
    connectionStatus: $('connectionStatus'), connectionText: $('connectionText'),
    raw: $('rawData'), delimiter: $('delimiterSelect'), headers: $('hasHeaders'),
    importButton: $('importButton'), fileInput: $('fileInput'),
    exampleButton: $('exampleButton'), clearButton: $('clearButton'),
    tablePreview: $('tablePreview'), tableCount: $('tableCount'), previewNote: $('previewNote'),
    templateSelect: $('templateSelect'), newTemplate: $('newTemplateButton'),
    duplicateTemplate: $('duplicateTemplateButton'), deleteTemplate: $('deleteTemplateButton'),
    templateName: $('templateName'), intro: $('introInput'), pattern: $('patternInput'),
    outro: $('outroInput'), fields: $('fieldChips'), groupBy: $('groupBySelect'), groupBySecond: $('groupBySecondSelect'),
    numberRows: $('numberRows'), separateParagraphs: $('separateParagraphs'),
    result: $('resultText'), outputCount: $('outputCount'), validation: $('validationMessage'),
    copyButton: $('copyButton'), downloadButton: $('downloadButton'), shareButton: $('shareButton'),
    exportBackup: $('exportBackupButton'), importBackup: $('importBackupButton'),
    backupInput: $('backupInput'), offlineHint: $('offlineHint'), toast: $('toast')
  };

  const clone = value => JSON.parse(JSON.stringify(value));
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const freshState = () => ({
    raw: EXAMPLE_DATA, delimiter: 'auto', hasHeaders: true,
    numberRows: false, separateParagraphs: true,
    templates: clone(STARTER_TEMPLATES), selectedId: 'starter-narrative'
  });
  const idGenerator = () => 'custom-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  const validTemplate = t => isObject(t) && typeof t.id === 'string' && typeof t.name === 'string' &&
    typeof t.intro === 'string' && typeof t.pattern === 'string' && typeof t.outro === 'string';

  function normalizeState(source) {
    const state = freshState();
    if (!isObject(source)) return state;
    if (typeof source.raw === 'string') state.raw = source.raw;
    if (['auto', 'tab', 'semicolon', 'comma'].includes(source.delimiter)) state.delimiter = source.delimiter;
    for (const k of ['hasHeaders', 'numberRows', 'separateParagraphs']) {
      if (typeof source[k] === 'boolean') state[k] = source[k];
    }
    if (Array.isArray(source.templates)) {
      const safeTemplates = source.templates.filter(validTemplate).slice(0, 150).map(t => ({
        id: t.id.slice(0, 120), name: t.name.slice(0, 100),
        intro: t.intro.slice(0, 10000), pattern: t.pattern.slice(0, 20000), outro: t.outro.slice(0, 10000),
        groupBy: typeof t.groupBy === 'string' ? t.groupBy.slice(0, 150) : '',
        groupBySecond: typeof t.groupBySecond === 'string' ? t.groupBySecond.slice(0, 150) : ''
      }));
      if (safeTemplates.length) state.templates = safeTemplates;
    }
    if (typeof source.selectedId === 'string' && state.templates.some(t => t.id === source.selectedId)) {
      state.selectedId = source.selectedId;
    } else state.selectedId = state.templates[0].id;
    return state;
  }

  let state = freshState();
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored !== null) state = normalizeState(JSON.parse(stored));
  } catch (err) { console.warn('Не удалось прочитать сохранённые данные:', err); }

  let table = { columns: [], rows: [] };
  let saveTimer;
  let toastTimer;
  let canWorkOffline = false;

  function toast(message) {
    ui.toast.textContent = message;
    ui.toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('visible'), 2800);
  }

  function saveNow() {
    clearTimeout(saveTimer);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (err) {
      console.warn('Автосохранение не удалось:', err);
      toast('Недостаточно места для автосохранения. Сохраните резервную копию.');
    }
  }
  function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 250); }

  // Обрабатывает кавычки, многострочные поля и двойные кавычки в CSV/TSV.
  function parseDelimited(raw, delimiter) {
    const input = raw.replace(/^\uFEFF/, '');
    const records = [];
    let row = [], cell = '', inQuotes = false;
    for (let i = 0; i < input.length; i++) {
      const c = input[i];
      if (c === '"') {
        if (inQuotes && input[i + 1] === '"') { cell += '"'; i++; }
        else if (inQuotes) inQuotes = false;
        else if (cell === '') inQuotes = true;
        else cell += '"';
      } else if (!inQuotes && c === delimiter) {
        row.push(cell); cell = '';
      } else if (!inQuotes && (c === '\n' || c === '\r')) {
        row.push(cell); records.push(row); row = []; cell = '';
        if (c === '\r' && input[i + 1] === '\n') i++;
      } else cell += c;
    }
    row.push(cell);
    records.push(row);
    return records.filter(record => record.some(value => value.trim() !== ''));
  }

  function chooseDelimiter(raw) {
    if (state.delimiter === 'tab') return '\t';
    if (state.delimiter === 'semicolon') return ';';
    if (state.delimiter === 'comma') return ',';
    const candidates = ['\t', ';', ','];
    // Оценка числа столбцов и одинаковой ширины первых строк.
    const sample = raw.slice(0, 12000);
    let best = '\t', bestScore = -Infinity;
    for (const delimiter of candidates) {
      const rows = parseDelimited(sample, delimiter).slice(0, 12);
      if (!rows.length) continue;
      const counts = rows.map(row => row.length);
      const multi = counts.filter(n => n > 1).length;
      const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
      const spread = Math.max(...counts) - Math.min(...counts);
      const score = multi * 10 + avg - spread * 4;
      if (multi > 0 && score > bestScore) { bestScore = score; best = delimiter; }
    }
    return best;
  }

  function getTable(raw) {
    if (!raw.trim()) return { columns: [], rows: [] };
    const records = parseDelimited(raw, chooseDelimiter(raw));
    if (!records.length) return { columns: [], rows: [] };
    const width = Math.max(...records.map(record => record.length));
    const sourceHeaders = state.hasHeaders ? records.shift() : [];
    const used = new Set();
    const columns = Array.from({ length: width }, (_, i) => {
      const original = state.hasHeaders ? (sourceHeaders[i] || '').trim() : '';
      const base = original || `Столбец ${i + 1}`;
      let label = base, suffix = 2;
      while (used.has(label)) label = `${base} (${suffix++})`;
      used.add(label);
      return label;
    });
    return { columns, rows: records.map(record => columns.map((_, i) => (record[i] || '').trim())) };
  }

  function renderTable() {
    ui.tablePreview.replaceChildren();
    if (!table.columns.length) {
      const holder = document.createElement('div');
      holder.className = 'empty-placeholder';
      const symbol = document.createElement('span'); symbol.className = 'empty-symbol'; symbol.textContent = '▦';
      const label = document.createElement('span'); label.textContent = 'Здесь появятся столбцы и строки';
      holder.append(symbol, label); ui.tablePreview.append(holder);
      ui.tableCount.textContent = 'Нет данных';
      ui.previewNote.textContent = 'Можно вставить данные из электронной таблицы.';
      return;
    }
    const grid = document.createElement('table');
    const thead = document.createElement('thead'), headerRow = document.createElement('tr');
    for (const title of table.columns) {
      const th = document.createElement('th'); th.scope = 'col'; th.textContent = title; headerRow.append(th);
    }
    thead.append(headerRow); grid.append(thead);
    const tbody = document.createElement('tbody');
    table.rows.slice(0, 6).forEach(row => {
      const tr = document.createElement('tr');
      row.forEach(value => { const td = document.createElement('td'); td.textContent = value || '—'; tr.append(td); });
      tbody.append(tr);
    });
    grid.append(tbody); ui.tablePreview.append(grid);
    ui.tableCount.textContent = `${table.rows.length} стр. · ${table.columns.length} стлб.`;
    ui.previewNote.textContent = table.rows.length > 6 ? `Показаны первые 6 из ${table.rows.length} строк.` : `Всего строк: ${table.rows.length}.`;
  }

  function getSelectedTemplate() { return state.templates.find(t => t.id === state.selectedId) || state.templates[0]; }

  function renderTemplateSelect() {
    ui.templateSelect.replaceChildren();
    state.templates.forEach(t => {
      const option = document.createElement('option');
      option.value = t.id; option.textContent = t.name || '(Без названия)';
      ui.templateSelect.append(option);
    });
    ui.templateSelect.value = state.selectedId;
    ui.deleteTemplate.disabled = state.templates.length <= 1;
  }

  function showTemplateInputs() {
    const current = getSelectedTemplate();
    ui.templateName.value = current.name;
    ui.intro.value = current.intro;
    ui.pattern.value = current.pattern;
    ui.outro.value = current.outro;
    renderTemplateSelect();
    renderGroupControls();
  }

  function renderGroupControls() {
    const current = getSelectedTemplate();
    for (const [element, currentValue] of [[ui.groupBy, current.groupBy || ''], [ui.groupBySecond, current.groupBySecond || '']]) {
      const emptyOption = element === ui.groupBy ? 'Без группировки' : 'Не используется';
      element.replaceChildren();
      const first = document.createElement('option'); first.value = ''; first.textContent = emptyOption; element.append(first);
      for (const col of table.columns) {
        const option = document.createElement('option'); option.value = col; option.textContent = col; element.append(option);
      }
      element.value = table.columns.includes(currentValue) ? currentValue : '';
    }
    ui.groupBySecond.disabled = !ui.groupBy.value;
  }

  function insertField(fieldName) {
    const element = ui.pattern;
    const token = '{' + fieldName + '}';
    const start = element.selectionStart, end = element.selectionEnd;
    const text = element.value;
    element.value = text.slice(0, start) + token + text.slice(end);
    element.focus(); element.setSelectionRange(start + token.length, start + token.length);
    getSelectedTemplate().pattern = element.value;
    saveSoon(); renderResult();
  }

  function renderFields() {
    ui.fields.replaceChildren();
    if (!table.columns.length) {
      const label = document.createElement('span'); label.className = 'muted';
      label.textContent = 'Загрузите таблицу, чтобы увидеть поля.'; ui.fields.append(label);
    } else {
      for (const title of table.columns) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'field-chip'; button.textContent = `{${title}}`;
        button.title = `Вставить поле ${title} в предложение`;
        button.addEventListener('click', () => insertField(title));
        ui.fields.append(button);
        const uniqueButton = document.createElement('button');
        uniqueButton.type = 'button'; uniqueButton.className = 'field-chip special';
        uniqueButton.textContent = `{${title}|уникальные}`;
        uniqueButton.title = `Вставить перечень разных значений поля «${title}»`;
        uniqueButton.addEventListener('click', () => insertField(title + '|уникальные'));
        ui.fields.append(uniqueButton);
      }
    }
    const special = document.createElement('button');
    special.type = 'button'; special.className = 'field-chip special'; special.textContent = '{№}';
    special.title = 'Вставить номер строки';
    special.addEventListener('click', () => insertField('№'));
    ui.fields.append(special);
  }

  function humanList(values) {
    if (!values.length) return '—';
    if (values.length === 1) return values[0];
    return values.slice(0, -1).join(', ') + ' и ' + values[values.length - 1];
  }

  function renderResult() {
    const current = getSelectedTemplate();
    const columns = table.columns;
    const indexByColumn = new Map(columns.map((column, i) => [column, i]));
    const invalid = new Set();
    const count = table.rows.length;
    const groupBy = indexByColumn.has(current.groupBy) ? current.groupBy : '';
    const groupBySecond = groupBy && indexByColumn.has(current.groupBySecond) && current.groupBySecond !== groupBy ? current.groupBySecond : '';

    const grouped = [];
    if (groupBy) {
      const groupsByKey = new Map();
      for (const row of table.rows) {
        const key = JSON.stringify([row[indexByColumn.get(groupBy)], groupBySecond ? row[indexByColumn.get(groupBySecond)] : null]);
        if (!groupsByKey.has(key)) {
          const group = [];
          groupsByKey.set(key, group);
          grouped.push(group);
        }
        groupsByKey.get(key).push(row);
      }
    } else {
      for (const row of table.rows) grouped.push([row]);
    }

    function resolve(text, groupRows, index) {
      return text.replace(/\{([^{}]+)\}/g, (source, rawExpression) => {
        const [field, modifier = 'первое'] = rawExpression.split('|').map(s => s.trim());
        if (field === 'Количество') return String(count);
        if (field === 'КоличествоГрупп') return String(grouped.length);
        if (field === 'КоличествоВГруппе') return String(groupRows.length);
        if (field === '№') return String(index + 1);
        if (indexByColumn.has(field) && groupRows.length) {
          const position = indexByColumn.get(field);
          const values = groupRows.map(row => row[position]).filter(value => value !== '');
          if (modifier === 'первое') return values[0] || '—';
          if (modifier === 'уникальные') return humanList([...new Set(values)]);
          if (modifier === 'все') return humanList(values);
          if (modifier === 'число') return String(new Set(values).size);
        }
        invalid.add(rawExpression.trim());
        return `⟦нет поля: ${rawExpression.trim()}⟧`;
      });
    }

    if (count === 0 || !current.pattern.trim()) {
      ui.result.value = '';
      ui.outputCount.textContent = '0 слов';
      ui.validation.hidden = true;
      updateResultButtons();
      return;
    }

    const parts = [];
    if (current.intro.trim()) parts.push(resolve(current.intro.trim(), [], 0));
    const rowTexts = grouped.map((groupRows, i) => {
      const text = resolve(current.pattern.trim(), groupRows, i);
      return (state.numberRows ? `${i + 1}. ` : '') + text;
    });
    parts.push(rowTexts.join(state.separateParagraphs ? '\n\n' : '\n'));
    if (current.outro.trim()) parts.push(resolve(current.outro.trim(), [], 0));
    ui.result.value = parts.join('\n\n');
    const words = (ui.result.value.match(/\S+/g) || []).length;
    ui.outputCount.textContent = `${grouped.length} абз. · ${words} слов · ${ui.result.value.length} симв.`;
    if (invalid.size) {
      ui.validation.hidden = false;
      ui.validation.textContent = 'В шаблоне есть неизвестные поля или режимы: ' +
        [...invalid].map(key => `{${key}}`).join(', ') + '. Проверьте названия столбцов и модификаторы.';
    } else ui.validation.hidden = true;
    updateResultButtons();
  }

  function updateResultButtons() {
    const disabled = !ui.result.value;
    ui.copyButton.disabled = disabled;
    ui.downloadButton.disabled = disabled;
    ui.shareButton.disabled = disabled;
  }

  function rebuildData() {
    table = getTable(state.raw);
    renderTable(); renderFields(); renderGroupControls(); renderResult();
  }

  function syncForm() {
    ui.raw.value = state.raw;
    ui.delimiter.value = state.delimiter;
    ui.headers.checked = state.hasHeaders;
    ui.numberRows.checked = state.numberRows;
    ui.separateParagraphs.checked = state.separateParagraphs;
    showTemplateInputs(); rebuildData();
  }

  ui.raw.addEventListener('input', () => {
    state.raw = ui.raw.value; rebuildData(); saveSoon();
  });
  ui.delimiter.addEventListener('change', () => {
    state.delimiter = ui.delimiter.value; rebuildData(); saveNow();
  });
  ui.headers.addEventListener('change', () => {
    state.hasHeaders = ui.headers.checked; rebuildData(); saveNow();
  });
  ui.numberRows.addEventListener('change', () => {
    state.numberRows = ui.numberRows.checked; renderResult(); saveNow();
  });
  ui.separateParagraphs.addEventListener('change', () => {
    state.separateParagraphs = ui.separateParagraphs.checked; renderResult(); saveNow();
  });

  ui.importButton.addEventListener('click', () => ui.fileInput.click());
  ui.fileInput.addEventListener('change', async () => {
    const file = ui.fileInput.files?.[0];
    if (!file) return;
    try {
      const isExcel = file.name.toLowerCase().endsWith('.xlsx');
      if (file.size > (isExcel ? 8 : 4) * 1024 * 1024) throw Error('Файл слишком большой для мобильного устройства');
      let detail = '';
      if (isExcel) {
        const result = await window.xlsxToTSV(file);
        state.raw = result.raw;
        state.delimiter = 'tab';
        state.hasHeaders = true;
        detail = ` (лист «${result.sheetName}»${result.sheetsCount > 1 ? ', первый из ' + result.sheetsCount : ''})`;
      } else {
        state.raw = await file.text();
        state.delimiter = file.name.toLowerCase().endsWith('.tsv') ? 'tab' : 'auto';
      }
      ui.raw.value = state.raw;
      ui.delimiter.value = state.delimiter;
      ui.headers.checked = state.hasHeaders;
      rebuildData(); saveNow();
      toast(`Загружен файл: ${file.name}${detail}`);
    } catch (err) { console.error(err); toast(err.message || 'Не удалось прочитать файл'); }
    finally { ui.fileInput.value = ''; }
  });
  ui.exampleButton.addEventListener('click', () => {
    state.raw = EXAMPLE_DATA; state.delimiter = 'auto'; state.hasHeaders = true;
    ui.raw.value = state.raw; ui.delimiter.value = state.delimiter; ui.headers.checked = true;
    rebuildData(); saveNow(); toast('Пример загружен');
  });
  ui.clearButton.addEventListener('click', () => {
    if (!state.raw.trim() || confirm('Очистить текущую таблицу? Сохранённые шаблоны останутся.')) {
      state.raw = ''; ui.raw.value = ''; rebuildData(); saveNow(); toast('Таблица очищена');
    }
  });

  ui.groupBy.addEventListener('change', () => {
    getSelectedTemplate().groupBy = ui.groupBy.value;
    if (!ui.groupBy.value) getSelectedTemplate().groupBySecond = '';
    renderGroupControls(); renderResult(); saveNow();
  });
  ui.groupBySecond.addEventListener('change', () => {
    getSelectedTemplate().groupBySecond = ui.groupBySecond.value;
    renderResult(); saveNow();
  });

  ui.templateSelect.addEventListener('change', () => {
    state.selectedId = ui.templateSelect.value; showTemplateInputs(); renderResult(); saveNow();
  });
  for (const [id, key] of [['templateName', 'name'], ['intro', 'intro'], ['pattern', 'pattern'], ['outro', 'outro']]) {
    ui[id].addEventListener('input', () => {
      getSelectedTemplate()[key] = ui[id].value;
      if (key === 'name') renderTemplateSelect();
      renderResult(); saveSoon();
    });
  }
  ui.newTemplate.addEventListener('click', () => {
    const template = { id: idGenerator(), name: 'Мой новый шаблон', intro: '', pattern: '', outro: '', groupBy: '', groupBySecond: '' };
    state.templates.push(template); state.selectedId = template.id;
    showTemplateInputs(); renderResult(); saveNow(); ui.templateName.focus(); ui.templateName.select();
    toast('Новый шаблон создан');
  });
  ui.duplicateTemplate.addEventListener('click', () => {
    const template = { ...clone(getSelectedTemplate()), id: idGenerator() };
    template.name = (template.name.slice(0, 85) || 'Шаблон') + ' — копия';
    state.templates.push(template); state.selectedId = template.id;
    showTemplateInputs(); renderResult(); saveNow();
    toast('Копия шаблона создана');
  });
  ui.deleteTemplate.addEventListener('click', () => {
    if (state.templates.length <= 1) { toast('Нельзя удалить единственный шаблон'); return; }
    if (!confirm(`Удалить шаблон «${getSelectedTemplate().name}»?`)) return;
    state.templates = state.templates.filter(t => t.id !== state.selectedId);
    state.selectedId = state.templates[0].id;
    showTemplateInputs(); renderResult(); saveNow(); toast('Шаблон удалён');
  });

  async function copyText(value) {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      try { await navigator.clipboard.writeText(value); return true; } catch (_) { /* fallback */ }
    }
    const target = ui.result;
    const previous = target.value;
    target.value = value;
    target.focus(); target.select();
    let okay = false;
    try { okay = document.execCommand('copy'); } catch (_) { /* not supported */ }
    target.value = previous;
    if (okay) target.setSelectionRange(0, 0);
    return okay;
  }

  function downloadText(name, contents, type) {
    const blob = new Blob([contents], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = name;
    document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 45000);
  }
  function fileDate() { return new Date().toISOString().slice(0, 10); }

  ui.copyButton.addEventListener('click', async () => {
    const success = await copyText(ui.result.value);
    toast(success ? 'Текст скопирован' : 'Не удалось скопировать. Выделите текст вручную.');
  });
  ui.downloadButton.addEventListener('click', () => {
    downloadText(`tekst-${fileDate()}.txt`, '\uFEFF' + ui.result.value, 'text/plain;charset=utf-8');
    toast('Текст подготовлен для сохранения');
  });
  ui.shareButton.addEventListener('click', async () => {
    if (navigator.share) {
      try { await navigator.share({ title: 'Текст по шаблону', text: ui.result.value }); }
      catch (err) { if (err.name !== 'AbortError') toast('Не удалось открыть меню отправки'); }
    } else {
      const success = await copyText(ui.result.value);
      toast(success ? 'Текст скопирован — вставьте его в нужное приложение' : 'Выделите текст для отправки вручную');
    }
  });

  ui.exportBackup.addEventListener('click', () => {
    downloadText(`tablica-v-tekst-backup-${fileDate()}.json`, JSON.stringify({
      format: 'table-to-text-backup', version: 1, exportedAt: new Date().toISOString(), state
    }, null, 2), 'application/json;charset=utf-8');
    toast('Резервная копия создана');
  });
  ui.importBackup.addEventListener('click', () => ui.backupInput.click());
  ui.backupInput.addEventListener('change', async () => {
    const file = ui.backupInput.files?.[0];
    if (!file) return;
    try {
      if (file.size > 5 * 1024 * 1024) throw Error('Слишком большой файл резервной копии');
      const payload = JSON.parse(await file.text());
      if (payload.format !== 'table-to-text-backup' || payload.version !== 1 ||
        !isObject(payload.state) || !Array.isArray(payload.state.templates)) {
        throw Error('Неизвестный формат резервной копии');
      }
      if (!confirm('Восстановить таблицу и шаблоны? Текущие данные на этом устройстве будут заменены.')) return;
      state = normalizeState(payload.state);
      syncForm(); saveNow(); toast('Резервная копия восстановлена');
    } catch (err) { toast(err.message || 'Не удалось восстановить копию'); }
    finally { ui.backupInput.value = ''; }
  });

  // Сеть требуется только для первой загрузки с GitHub Pages. Все ресурсы PWA кэшируются локально.
  function updateNetworkStatus() {
    const isOffline = navigator.onLine === false;
    ui.connectionStatus.classList.toggle('offline', isOffline);
    ui.connectionText.textContent = isOffline ? 'Работает без интернета' :
      (canWorkOffline ? 'Готово к работе офлайн' : 'Подключено к интернету');
  }
  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveNow();
  });
  window.addEventListener('pagehide', saveNow);
  syncForm(); updateNetworkStatus();

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then(() => navigator.serviceWorker.ready)
      .then(() => {
        canWorkOffline = true;
        updateNetworkStatus();
        ui.offlineHint.textContent = 'Файлы приложения сохранены для автономной работы. Для надёжности проверьте запуск без сети.';
      })
      .catch(err => {
        console.warn('Не удалось настроить автономную работу:', err);
        ui.offlineHint.textContent = 'Офлайн-режим пока не настроен. Убедитесь, что сайт открыт по HTTPS.';
      });
  } else {
    ui.offlineHint.textContent = 'Откройте приложение через GitHub Pages по HTTPS, чтобы включить автономную работу.';
  }
})();
