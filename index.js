const puppeteer = require('puppeteer');
const { google } = require('googleapis');

// Configuration
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = 'Sheet1';

// ASINs to track (add more as needed)
const ASINS = [
    'B0DT6LG363',
    'B09FKZR5FW'
  ];

async function scrapeAmazonPrice(browser, asin) {
    const page = await browser.newPage();

  // Set realistic user agent
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
        const url = `https://www.amazon.co.uk/dp/${asin}`;
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      // Wait for price element
      await page.waitForSelector('#productTitle', { timeout: 10000 });

      // Extract data
      const data = await page.evaluate(() => {
              const titleEl = document.querySelector('#productTitle');
              const title = titleEl ? titleEl.textContent.trim() : 'Title not found';

                                             // Try multiple price selectors
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

async function updateGoogleSheet(data) {
    // Auth using service account
  async function updateGoogleSheet(data) {
  const auth = new google.auth.GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });

  const sheets = google.sheets({ version: 'v4', auth });

  const sheets = google.sheets({ version: 'v4', auth });

  // Prepare rows
  const timestamp = new Date().toISOString();
    const rows = data.map(item => [
          item.asin,
          item.title.substring(0, 150),
          item.price,
          timestamp,
          item.status
        ]);

  // Clear existing data (except header) and write new
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

  const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const results = [];

  for (const asin of ASINS) {
        console.log(`Scraping ${asin}...`);
        const data = await scrapeAmazonPrice(browser, asin);
        results.push(data);
        console.log(`  ${data.title.substring(0, 50)}... - ${data.price}`);

      // Random delay between requests
      await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));
  }

  await browser.close();

  // Update Google Sheet
  await updateGoogleSheet(results);

  console.log('Done!');
}

main().catch(console.error);
