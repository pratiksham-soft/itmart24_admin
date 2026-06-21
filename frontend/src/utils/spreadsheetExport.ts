type CellValue = string | number | boolean | null | undefined;

type ExportRow = Record<string, CellValue>;

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeCsvValue(value: CellValue) {
  const normalized = value == null ? "" : String(value);
  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

function downloadBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

function getColumns(rows: ExportRow[]) {
  const columns = new Set<string>();
  for (const row of rows) {
    Object.keys(row).forEach((key) => columns.add(key));
  }
  return Array.from(columns);
}

export function downloadCsv(filename: string, rows: ExportRow[]) {
  const columns = getColumns(rows);
  const lines = [
    columns.map((column) => escapeCsvValue(column)).join(","),
    ...rows.map((row) =>
      columns.map((column) => escapeCsvValue(row[column])).join(",")
    ),
  ];
  const csvContent = `\uFEFF${lines.join("\r\n")}`;
  downloadBlob(new Blob([csvContent], { type: "text/csv;charset=utf-8;" }), filename);
}

function buildSharedStrings(values: string[]) {
  const items = values
    .map((value) => `<si><t xml:space="preserve">${escapeXml(value)}</t></si>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${values.length}" uniqueCount="${values.length}">${items}</sst>`;
}

function getColumnName(index: number) {
  let current = index + 1;
  let name = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    current = Math.floor((current - 1) / 26);
  }
  return name;
}

function buildWorksheet(rows: ExportRow[], columns: string[], sharedStringLookup: Map<string, number>) {
  const allRows = [columns, ...rows.map((row) => columns.map((column) => row[column]))];

  const sheetRows = allRows
    .map((rowValues, rowIndex) => {
      const cells = rowValues
        .map((value, cellIndex) => {
          const ref = `${getColumnName(cellIndex)}${rowIndex + 1}`;

          if (typeof value === "number" && Number.isFinite(value)) {
            return `<c r="${ref}"><v>${value}</v></c>`;
          }

          if (typeof value === "boolean") {
            return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
          }

          const sharedIndex = sharedStringLookup.get(value == null ? "" : String(value)) ?? 0;
          return `<c r="${ref}" t="s"><v>${sharedIndex}</v></c>`;
        })
        .join("");

      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetRows}</sheetData>
</worksheet>`;
}

function buildWorkbook() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Guest Users" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;
}

function buildWorkbookRels() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>
</Relationships>`;
}

function buildRootRels() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function buildStyles() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function buildContentTypes() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
}

function buildCoreProps() {
  const created = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:creator>ITMart24 Admin</dc:creator>
  <cp:lastModifiedBy>ITMart24 Admin</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified>
</cp:coreProperties>`;
}

function buildAppProps() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>ITMart24 Admin</Application>
</Properties>`;
}

function createCrc32Table() {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let current = index;
    for (let bit = 0; bit < 8; bit += 1) {
      current = (current & 1) !== 0 ? 0xedb88320 ^ (current >>> 1) : current >>> 1;
    }
    table[index] = current >>> 0;
  }
  return table;
}

const CRC32_TABLE = createCrc32Table();

function crc32(bytes: Uint8Array) {
  let current = 0xffffffff;
  for (const byte of bytes) {
    current = CRC32_TABLE[(current ^ byte) & 0xff] ^ (current >>> 8);
  }
  return (current ^ 0xffffffff) >>> 0;
}

function getDosDateTime(date: Date) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    Math.floor(date.getSeconds() / 2);
  const dosDate =
    (((year - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0xf) << 5) |
    (date.getDate() & 0x1f);
  return { dosDate, dosTime };
}

type ZipEntry = {
  name: string;
  bytes: Uint8Array;
  crc: number;
  offset: number;
  dosDate: number;
  dosTime: number;
};

function writeUint16(target: Uint8Array, offset: number, value: number) {
  new DataView(target.buffer).setUint16(offset, value, true);
}

function writeUint32(target: Uint8Array, offset: number, value: number) {
  new DataView(target.buffer).setUint32(offset, value, true);
}

function buildZip(files: Array<{ name: string; content: string }>) {
  const encoder = new TextEncoder();
  const entries: ZipEntry[] = files.map((file) => {
    const bytes = encoder.encode(file.content);
    const { dosDate, dosTime } = getDosDateTime(new Date());
    return {
      name: file.name,
      bytes,
      crc: crc32(bytes),
      offset: 0,
      dosDate,
      dosTime,
    };
  });

  const localChunks: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const header = new Uint8Array(30 + nameBytes.length);
    writeUint32(header, 0, 0x04034b50);
    writeUint16(header, 4, 20);
    writeUint16(header, 6, 0);
    writeUint16(header, 8, 0);
    writeUint16(header, 10, entry.dosTime);
    writeUint16(header, 12, entry.dosDate);
    writeUint32(header, 14, entry.crc);
    writeUint32(header, 18, entry.bytes.length);
    writeUint32(header, 22, entry.bytes.length);
    writeUint16(header, 26, nameBytes.length);
    writeUint16(header, 28, 0);
    header.set(nameBytes, 30);

    entry.offset = offset;
    localChunks.push(header, entry.bytes);
    offset += header.length + entry.bytes.length;
  }

  const centralChunks: Uint8Array[] = [];
  let centralSize = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const header = new Uint8Array(46 + nameBytes.length);
    writeUint32(header, 0, 0x02014b50);
    writeUint16(header, 4, 20);
    writeUint16(header, 6, 20);
    writeUint16(header, 8, 0);
    writeUint16(header, 10, 0);
    writeUint16(header, 12, entry.dosTime);
    writeUint16(header, 14, entry.dosDate);
    writeUint32(header, 16, entry.crc);
    writeUint32(header, 20, entry.bytes.length);
    writeUint32(header, 24, entry.bytes.length);
    writeUint16(header, 28, nameBytes.length);
    writeUint16(header, 30, 0);
    writeUint16(header, 32, 0);
    writeUint16(header, 34, 0);
    writeUint16(header, 36, 0);
    writeUint32(header, 38, 0);
    writeUint32(header, 42, entry.offset);
    header.set(nameBytes, 46);
    centralChunks.push(header);
    centralSize += header.length;
  }

  const endRecord = new Uint8Array(22);
  writeUint32(endRecord, 0, 0x06054b50);
  writeUint16(endRecord, 4, 0);
  writeUint16(endRecord, 6, 0);
  writeUint16(endRecord, 8, entries.length);
  writeUint16(endRecord, 10, entries.length);
  writeUint32(endRecord, 12, centralSize);
  writeUint32(endRecord, 16, offset);
  writeUint16(endRecord, 20, 0);

  const totalSize =
    localChunks.reduce((sum, chunk) => sum + chunk.length, 0) +
    centralSize +
    endRecord.length;
  const output = new Uint8Array(totalSize);
  let pointer = 0;

  for (const chunk of localChunks) {
    output.set(chunk, pointer);
    pointer += chunk.length;
  }
  for (const chunk of centralChunks) {
    output.set(chunk, pointer);
    pointer += chunk.length;
  }
  output.set(endRecord, pointer);

  return output;
}

export function downloadXlsx(filename: string, rows: ExportRow[]) {
  const columns = getColumns(rows);
  const uniqueStrings = new Map<string, number>();
  const values: string[] = [];

  const addSharedString = (value: CellValue) => {
    const normalized = value == null ? "" : String(value);
    if (!uniqueStrings.has(normalized)) {
      uniqueStrings.set(normalized, values.length);
      values.push(normalized);
    }
  };

  columns.forEach(addSharedString);
  rows.forEach((row) => {
    columns.forEach((column) => {
      const value = row[column];
      if (!(typeof value === "number" && Number.isFinite(value)) && typeof value !== "boolean") {
        addSharedString(value);
      }
    });
  });

  const files = [
    { name: "[Content_Types].xml", content: buildContentTypes() },
    { name: "_rels/.rels", content: buildRootRels() },
    { name: "docProps/core.xml", content: buildCoreProps() },
    { name: "docProps/app.xml", content: buildAppProps() },
    { name: "xl/workbook.xml", content: buildWorkbook() },
    { name: "xl/_rels/workbook.xml.rels", content: buildWorkbookRels() },
    { name: "xl/styles.xml", content: buildStyles() },
    { name: "xl/sharedStrings.xml", content: buildSharedStrings(values) },
    {
      name: "xl/worksheets/sheet1.xml",
      content: buildWorksheet(rows, columns, uniqueStrings),
    },
  ];

  const zipBytes = buildZip(files);
  downloadBlob(
    new Blob([zipBytes], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    filename
  );
}
