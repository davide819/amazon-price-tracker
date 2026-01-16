const puppeteer = require('puppeteer');
const { google } = require('googleapis');

// ASINs to track
const ASINS = [
  'B0DT6LG363',
  'B09FKZR5FW'
];

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;

async function scrapeAmazon(asin) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  await page.setViewport({ width: 1366, height: 768 });
  
  try {
    await page.goto(`https://www.amazon.co.uk/dp/${asin}`, {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    await page.waitForSelector('#productTitle', { timeout: 10000 });
    
    const data = await page.evaluate(() => {
      const titleEl = document.querySelector('#productTitle');
      const title = titleEl ? titleEl.textContent.trim() : 'Title not found';
      const priceWhole = document.querySelector('.a-price-whole');
      const priceFraction = document.querySelector('.a-price-fraction');
      
      let price = 'Price not found';
      if (priceWhole) {
        price = '£' + priceWhole.textContent.replace(',', '').trim();
        if (priceFraction) price += priceFraction.textContent.trim();
      }
      
      return { title, price };
    });
    
    await browser.close();
    return { asin, ...data, status: 'OK' };
  } catch (error) {
    await browser.close();
    return { asin, title: 'Error', price: 'Error', status: error.message };
  }
}

async function updateGoogleSheet(results) {
  // ✅ FIXED: Use OIDC auth automatically (no credentials file)
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  
  const sheets = google.sheets({ version: 'v4', auth });
  
  const rows = results.map(r => [
    r.asin,
    r.title.substring(0, 150),
    r.price,
    new Date().toISOString(),
    r.status
  ]);
  
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Sheet1!A2:E' + (results.length + 1),
    valueInputOption: 'USER_ENTERED',
    resource: { values: rows }
  });
  
  console.log('Sheet updated successfully');
}

async function main() {
  console.log('Starting scrape at', new Date().toISOString());
  
  const results = [];
  
  for (const asin of ASINS) {
    console.log('Scraping', asin);
    const data = await scrapeAmazon(asin);
    console.log(data);
    results.push(data);
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));
  }
  
  await updateGoogleSheet(results);
  console.log('Done');
}

main().catch(console.error);
