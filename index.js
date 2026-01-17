const puppeteer = require('puppeteer');
const { google } = require('googleapis');

// Configuration
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = 'Sheet1';

async function getAsinsFromSheet(sheets) {
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A2:A`,  // Column A, starting from row 2 (skip header)
  });
  
  const rows = response.data.values || [];
  // Filter out empty rows and get just the ASIN values
  const asins = rows.map(row => row[0]).filter(asin => asin && asin.trim() !== '');
  
  console.log(`Found ${asins.length} ASINs in sheet:`, asins);
  return asins;
}

async function scrapeAmazonPrice(browser, asin) {
  const page = await browser.newPage();
  
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
  
  try {
    const url = `https://www.amazon.co.uk/dp/${asin}`;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    
    await page.waitForSelector('#productTitle', { timeout: 10000 });
    
    const data = await page.evaluate(() => {
      const titleEl = document.querySelector('#productTitle');
      const title = titleEl ? titleEl.textContent.trim() : 'Title not found';
      
      const priceWhole = document.querySelector('.a-price-whole');
      const priceFraction = document.querySelector('.a-price-fraction');
      
      let price = 'Price not found';
      if (priceWhole) {
        price = '£' + priceWhole.textContent.replace(',', '').trim();
        if (priceFraction) {
          price += priceFraction.textContent.trim();
        }
      }
      
      return { title, price };
    });
    
    await page.close();
    return { asin, ...data, status: 'OK' };
    
  } catch (error) {
    await page.close();
    return { asin, title: 'Error', price: 'Error', status: error.message };
  }
}

async function updateGoogleSheet(sheets, data) {
  const timestamp = new Date().toISOString();
  const rows = data.map(item => [
    item.asin,
    item.title.substring(0, 150),
    item.price,
    timestamp,
    item.status
  ]);
  
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A2:E${rows.length + 1}`,
    valueInputOption: 'USER_ENTERED',
    resource: { values: rows }
  });
  
  console.log('Sheet updated successfully');
}

async function main() {
  console.log('Starting Amazon price scraper...');
  
  // Set up Google Sheets auth
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  
  const sheets = google.sheets({ version: 'v4', auth });
  
  // Get ASINs from the sheet
  const asins = await getAsinsFromSheet(sheets);
  
  if (asins.length === 0) {
    console.log('No ASINs found in sheet. Add ASINs to column A.');
    return;
  }
  
  // Launch browser
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const results = [];
  
  for (const asin of asins) {
    console.log(`Scraping ${asin}...`);
    const data = await scrapeAmazonPrice(browser, asin);
    results.push(data);
    console.log(`  ${data.title.substring(0, 50)}... - ${data.price}`);
    
    // Random delay between requests (2-4 seconds)
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));
  }
  
  await browser.close();
  
  // Update sheet with results
  await updateGoogleSheet(sheets, results);
  
  console.log('Done!');
}

main().catch(console.error);
