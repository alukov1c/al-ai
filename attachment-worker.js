process.once('message', (workerData) => {
(async () => {
  const buffer = Buffer.from(workerData.buffer, 'base64');
  let text;
  if (['.docx','.xlsx','.pptx'].includes(workerData.extension)) {
    const zip = await require('jszip').loadAsync(buffer);
    const entries = Object.values(zip.files);
    const expanded = entries.reduce((sum, entry) => sum + (entry._data?.uncompressedSize || 0), 0);
    if (entries.length > 3000 || expanded > 20000000) throw new Error('Dokument sadrži previše podataka. Priložite manji dokument.');
  }
  if (workerData.extension === '.pdf') {
    if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Datoteka nije ispravan PDF.');
    const { PDFParse } = require('pdf-parse');
    const parser = new PDFParse({ data: buffer, isEvalSupported: false });
    try { text = (await parser.getText()).text; } finally { await parser.destroy(); }
  } else if (workerData.extension === '.docx') {
    text = (await require('mammoth').extractRawText({ buffer }, { externalFileAccess: false })).value;
  } else if (workerData.extension === '.xlsx') {
    const workbook = new (require('exceljs').Workbook)();
    await workbook.xlsx.load(buffer);
    const lines = [];
    let size = 0;
    workbook.eachSheet((sheet) => {
      lines.push('Radni list: ' + sheet.name);
      sheet.eachRow((row) => {
        const values = [];
        row.eachCell({ includeEmpty: true }, (cell) => {
          const value = cell.value;
          values.push(value && typeof value === 'object' && 'formula' in value ? String(value.result ?? '[Formula bez sačuvanog rezultata: ' + value.formula + ']') : cell.text);
        });
        const line = values.join(' | ');
        size += line.length;
        if (size > 40000) throw new Error('Dokument sadrži više od 40.000 znakova. Priložite kraći deo.');
        lines.push(line);
      });
    });
    text = lines.join('\n');
  } else if (workerData.extension === '.pptx') {
    const zip = await require('jszip').loadAsync(buffer);
    const { XMLParser } = require('fast-xml-parser');
    const parser = new XMLParser({ ignoreAttributes:false, parseTagValue:false });
    const presentation = parser.parse(await zip.file('ppt/presentation.xml').async('string'));
    const rels = parser.parse(await zip.file('ppt/_rels/presentation.xml.rels').async('string')).Relationships.Relationship;
    const array = (value) => value ? (Array.isArray(value) ? value : [value]) : [];
    const paths = new Map(array(rels).filter(r => r['@_TargetMode'] !== 'External').map(r => [r['@_Id'], r['@_Target']]));
    const slides = array(presentation['p:presentation']['p:sldIdLst']['p:sldId']);
    const lines = [];
    for (const [index, slide] of slides.entries()) {
      const target = paths.get(slide['@_r:id']);
      const name = target?.startsWith('/') ? target.slice(1) : require('node:path').posix.normalize('ppt/' + target);
      const entry = zip.file(name);
      if (!entry) throw new Error('Missing slide');
      const xml = await entry.async('string');
      const values = [];
      const walk = (node) => {
        if (!node || typeof node !== 'object') return;
        for (const [key, value] of Object.entries(node)) {
          if (key === 'a:t') for (const item of array(value)) values.push(typeof item === 'object' ? item['#text'] || '' : item);
          else if (Array.isArray(value)) value.forEach(walk);
          else walk(value);
        }
      };
      walk(parser.parse(xml));
      lines.push('Slajd ' + (index + 1) + '\n' + values.join('\n'));
    }
    text = lines.join('\n\n');
  } else {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    if (text.includes('\0')) throw new Error('Očekuje se tekstualna UTF-8 datoteka.');
  }
  text = text.replace(/\u0000/g, '').trim();
  if (!text || (workerData.extension === '.pdf' && !text.replace(/--\s*\d+\s+of\s+\d+\s*--/g, '').trim())) throw new Error('Nema čitljivog teksta. Za skenirani dokument potreban je OCR.');
  if (text.length > 40000) throw new Error('Dokument sadrži više od 40.000 znakova. Priložite kraći deo.');
  process.send({ text });
})().catch((error) => process.send({ error: /^(Datoteka nije|Očekuje se|Nema čitljivog|Dokument sadrži)/.test(error.message) ? error.message : 'Dokument nije moguće pročitati. Možda je oštećen ili zaštićen lozinkom.' }));

});
