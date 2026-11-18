/* Автономное чтение значений XLSX (без вычисления формул). JSZip включён локально. */
(() => {
  'use strict';
  function nodes(parent, name) {
    return Array.from(parent.getElementsByTagNameNS('*', name));
  }
  function child(parent, name) {
    return Array.from(parent.children || []).find(el => el.localName === name) || null;
  }
  function text(node) { return node ? node.textContent || '' : ''; }
  function parseXML(source, filename) {
    const doc = new DOMParser().parseFromString(source, 'application/xml');
    if (nodes(doc, 'parsererror').length || doc.documentElement.localName === 'parsererror') {
      throw new Error('Неправильная структура XML в ' + filename);
    }
    return doc;
  }
  function colIndex(address) {
    const letters = String(address || '').match(/^[A-Za-z]+/);
    if (!letters) return -1;
    let value = 0;
    for (const c of letters[0].toUpperCase()) value = value * 26 + c.charCodeAt(0) - 64;
    return value - 1;
  }
  function cellValue(cell, sharedStrings) {
    const type = cell.getAttribute('t') || '';
    if (type === 'inlineStr') {
      const inline = child(cell, 'is');
      return inline ? nodes(inline, 't').map(text).join('') : '';
    }
    const v = text(child(cell, 'v'));
    if (type === 's') return sharedStrings[Number(v)] ?? '';
    if (type === 'b') return v === '1' ? 'Истина' : 'Ложь';
    if (type === 'e') return v;
    return v;
  }
  function normalizePath(path) {
    const parts = [];
    for (const segment of path.replace(/^\/+/, '').split('/')) {
      if (segment === '..') parts.pop();
      else if (segment && segment !== '.') parts.push(segment);
    }
    return parts.join('/');
  }
  function encodeDelimited(value) {
    const cell = String(value ?? '');
    return /[\t\r\n"]/.test(cell) ? '"' + cell.replace(/"/g, '""') + '"' : cell;
  }
  async function readZipString(zip, path, optional = false) {
    const item = zip.file(path);
    if (!item) {
      if (optional) return '';
      throw new Error('В файле Excel отсутствует ' + path);
    }
    if (item._data?.uncompressedSize > 12 * 1024 * 1024) throw Error('Лист Excel слишком большой для мобильного устройства');
    return item.async('string');
  }
  async function xlsxToTSV(file) {
    if (typeof JSZip === 'undefined') throw new Error('Компонент чтения Excel не загружен');
    if (file.size > 8 * 1024 * 1024) throw new Error('Файл Excel больше 8 МБ');
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const book = parseXML(await readZipString(zip, 'xl/workbook.xml'), 'xl/workbook.xml');
    const rels = parseXML(await readZipString(zip, 'xl/_rels/workbook.xml.rels'), 'workbook.xml.rels');
    const sheets = nodes(book, 'sheet');
    if (!sheets.length) throw new Error('В книге нет листов');
    const firstSheet = sheets.find(s => s.getAttribute('state') !== 'hidden' && s.getAttribute('state') !== 'veryHidden') || sheets[0];
    const relationId = firstSheet.getAttribute('r:id') || firstSheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id');
    const relation = nodes(rels, 'Relationship').find(r => r.getAttribute('Id') === relationId);
    if (!relation || relation.getAttribute('TargetMode') === 'External') throw new Error('Не найден внутренний лист Excel');
    const target = relation.getAttribute('Target') || '';
    const sheetPath = normalizePath(target.startsWith('/') ? target : 'xl/' + target);
    if (!sheetPath.startsWith('xl/')) throw new Error('Некорректный путь к листу');
    const sheetXml = parseXML(await readZipString(zip, sheetPath), sheetPath);
    const stringsXml = await readZipString(zip, 'xl/sharedStrings.xml', true);
    const strings = stringsXml ? nodes(parseXML(stringsXml, 'sharedStrings.xml'), 'si').map(si => nodes(si, 't').map(text).join('')) : [];
    const rows = [];
    let maxCol = -1;
    const xmlRows = nodes(sheetXml, 'sheetData').flatMap(data => Array.from(data.children).filter(el => el.localName === 'row'));
    if (xmlRows.length > 5000) throw new Error('В листе больше 5000 строк');
    for (const xmlRow of xmlRows) {
      const row = [];
      let nextCol = 0;
      for (const c of Array.from(xmlRow.children).filter(el => el.localName === 'c')) {
        const col = colIndex(c.getAttribute('r'));
        const idx = col >= 0 ? col : nextCol;
        if (idx > 99) throw new Error('Поддерживаются таблицы не шире 100 столбцов');
        row[idx] = cellValue(c, strings);
        nextCol = idx + 1;
        maxCol = Math.max(maxCol, idx);
      }
      if (row.some(v => String(v ?? '').trim() !== '')) rows.push(row);
    }
    if (!rows.length) throw new Error('Первый лист книги не содержит данных');
    const width = Math.max(1, maxCol + 1);
    return {
      sheetName: firstSheet.getAttribute('name') || 'Лист 1',
      sheetsCount: sheets.length,
      rowCount: rows.length,
      raw: rows.map(row => Array.from({length: width}, (_,i) => encodeDelimited(row[i])).join('\t')).join('\n')
    };
  }
  window.xlsxToTSV = xlsxToTSV;
})();
