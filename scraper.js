const puppeteer = require('puppeteer');
const { google } = require('googleapis');

// Configuration
const ASINS = process.env.ASINS ? process.env.ASINS.split(',') : ['B0DT6LG363', 'B09FKZR5FW'];
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = 'Sheet1';

async function scrapeAmazonPrice(browser, asin) {
    const page = await browser.newPage();

  // Set realistic headers
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
          'Accept-Language': 'en-GB,en;q=0.9',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    });

  try {
        await page.goto(`https://www.amazon.co.uk/dp/${asin}`, {
                waitUntil: 'networkidle2',
                timeout: 30000
        });

      // Wait for price to load
      await page.waitForSelector('#productTitle', { timeout: 10000 });

      const data = await page.evaluate(() => {
              const titleEl = document.querySelector('#productTitle');
              const title = titleEl ? titleEl.textContent.trim() : 'Title not found';

                                             // Try multiple price selectors
                                             const priceSelectors = [
                                                       '.a-price-whole',
                                                       '#priceblock_ourprice',
                                                       '#priceblock_dealprice',
                                                       '.a-offscreen'
                                                     ];

                                             let price = 'Price not found';
              for (const selector of priceSelectors) {
                        const el = document.querySelector(selector);
                        if (el) {
                                    const text = el.textContent.trim();
                                    if (text.match(/[0-9]/)) {
                                                  price = text.includes('£') ? text : '£' + text;
                                                  break;
                                    }
                        }
              }

                                             return { title, price };
      });

      await page.close();
        return { asin, ...data, status: 'OK', timestamp: new Date().toISOString() };

  } catch (error) {
        await page.close();
        return { asin, title: 'Error', price: 'Error', status: error.message, timestamp: new Date().toISOString() };
  }
}

async function updateGoogleSheet(data) {
    // Authenticate with Google Sheets API
  const auth = new google.auth.GoogleAuth({
        credentials: JSON.parse(process.env.GOOGLE_CREDENTIALS),
        scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });

  const sheets = google.sheets({ version: 'v4', auth });

  // Prepare rows: ASIN, Title, Price, Last Updated, Status
  const values = data.map(item => [
        item.asin,
        item.title.substring(0, 150),
        item.price,
        item.timestamp,
        item.status
      ]);

  // Update sheet starting from row 2 (after header)
  await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A2:E${data.length + 1}`,
        valueInputOption: 'USER_ENTERED',
        resource: { values }
  });

  console.log('Sheet updated successfully');
}

async function main() {
    console.log('Starting Amazon price scraper...');
    console.log('ASINs to scrape:', ASINS);

  const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const results = [];

  for (const asin of ASINS) {
        console.log(`Scraping ${asin}...`);
        const result = await scrapeAmazonPrice(browser, asin);
        console.log(`  Title: ${result.title.substring(0, 50)}...`);
        console.log(`  Price: ${result.price}`);
        results.push(result);

      // Delay between requests
      await new Promise(r => setTimeout(r, 2000));
  }

  await browser.close();

  if (SPREADSHEET_ID) {
        await updateGoogleSheet(results);
  } else {
        console.log('No SPREADSHEET_ID set, printing results:');
        console.log(JSON.stringify(results, null, 2));
  }
}

main().catch(console.error);
