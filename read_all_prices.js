const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const files = fs.readdirSync(__dirname);
const excelFile = files.find(f => f.includes('GELEN') && f.endsWith('.xlsx'));
const filepath = path.join(__dirname, excelFile);
const workbook = XLSX.readFile(filepath);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

const headers = data[0].map(h => String(h || '').trim());
console.log('Headers:', headers);

const priceIdx = headers.indexOf('FİYAT');
console.log('Price Column Index:', priceIdx);

const rowsWithPrice = [];
for (let i = 1; i < data.length; i++) {
  const row = data[i];
  const price = row[priceIdx];
  const parsel = row[0];
  const bag = row[1];
  const status = row[headers.indexOf('Portfoy Kimde')];
  if (price !== undefined && String(price).trim() !== '') {
    rowsWithPrice.push({
      line: i + 1,
      parsel,
      bag,
      status,
      price,
      type: typeof price
    });
  }
}

console.log('\n--- Rows with Price ---');
console.log(`Found ${rowsWithPrice.length} rows with a price:`);
console.log(rowsWithPrice);
