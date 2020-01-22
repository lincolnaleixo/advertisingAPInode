/* eslint-disable no-loop-func */
/* eslint-disable no-nested-ternary */
const puppeteer = require('puppeteer-extra');
const pluginStealth = require('puppeteer-extra-plugin-stealth');
const pluginUA = require('puppeteer-extra-plugin-anonymize-ua');
const jsonfile = require('jsonfile');
const fs = require('fs');
const ini = require('ini');
const JsonFind = require('json-find');
const rimraf = require('rimraf');
const moment = require('moment-timezone');
const csv = require('csvtojson');
const Alerts = require('../lib/alerts.js/index.js');
const MwsReports = require('./mws-reports.js');

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

// const moment = require('moment-timezone');

class ProductSearch {

	constructor() {

		puppeteer.use(pluginStealth());
		puppeteer.use(pluginUA());

		this.config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'));

		this.keywordsToSearch = this.config.app.PRODUCT_SEARCH_KEYWORDS.split(',');
		this.quantityKeywordsToSearch = this.config.app.PRODUCT_SEARCH_QUANTITY_KEYWORDS;
		this.searchType = this.config.app.PRODUCT_SEARCH_TYPE;
		this.timeFrameToSearch = this.config.app.PRODUCT_SEARCH_TIMEFRAME;
		this.departmentToSearch = this.config.app.PRODUCT_SEARCH_DEPARTMENT;
		this.ignoreWords = this.config.app.PRODUCT_SEARCH_IGNORE_WORDS;

		this.mwsReports = new MwsReports();
		this.sellerCentralUser = this.config.credentials.SELLER_CENTRAL_ID;
		this.sellerCentralPass = this.config.credentials.SELLER_CENTRAL_PASS;

		this.dir = '.';
		this.downloadPath = `${this.dir}/downloads`;
		this.amazonCookiesPath = `${this.dir}/cookies/amazon.com`;
		this.sellerCentralCookiesPath = `${this.dir}/cookies/sellerCentral`;
		this.pageType = 'clean';
		this.browser = '';
		this.page = '';

		this.userAgents = [
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/77.0.3865.90 Safari/537.36',
			'Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/66.0.3359.117 Safari/537.36',
			'Mozilla/5.0 (Windows NT 6.1; WOW64; rv:54.0) Gecko/20100101 Firefox/54.0',
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36',
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:66.0) Gecko/20100101 Firefox/66.0',
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:67.0) Gecko/20100101 Firefox/67.0',
		];

	}

	syncProductSearch = async () => {

		// const alerts = new Alerts();

		let keywordsToSearch;

		this.pageType = 'clean';

		if (this.searchType === 'config') {

			keywordsToSearch = this.config.app.PRODUCT_SEARCH_KEYWORDS;

		} else if (this.searchType === 'brandAnalytics') {

			keywordsToSearch = await this.selectBrandAnalyticsKeywords();

		}

		for (let i = 0; i < this.quantityKeywordsToSearch; i += 1) {

			const keywordToSearch = keywordsToSearch[i];

			console.log(`(${i + 1}/${this.quantityKeywordsToSearch}) Syncing info for keyword: ${keywordToSearch}`);
			const date = await moment().tz('UTC').format('YYYY-MM-DD-HH:mm:ss');
			const searchResult = await this.getFirstPageInfo(keywordToSearch);
			const opportunityScore = await this.calculateOpportunityScore(searchResult);
			console.log('Saving result on database');
			// await jsonfile.writeFile(`database/${keyword}_${date}.json`, resultInfo, { spaces: 2 });
			await jsonfile
				.writeFile(
					`database/product-search/${keywordToSearch.trim().replace(' ', '_')}.json`,
					{
						...{ searchDate: date },
						...{ opportunityScore },
						...searchResult,
					},
					{ spaces: 2 },
				);
			console.log('Saved');
			// alerts.sendTelegramMessage(`Opportunity Score for keyword ${keywordToSearch}: ${opportunityScore}`);
			await sleep(3000);

		}

	}

	setCookies = async (pageType) => {

		let previousSession = '';

		previousSession = pageType === 'amazon'
			? fs.existsSync(this.amazonCookiesPath)
			: fs.existsSync(this.sellerCentralCookiesPath);

		if (previousSession) {

			const content = pageType === 'amazon'
				? fs.readFileSync(this.amazonCookiesPath)
				: fs.readFileSync(this.sellerCentralCookiesPath);

			const cookiesArr = JSON.parse(content);

			if (cookiesArr.length !== 0) {

				for (const cookie of cookiesArr) {

					await this.page.setCookie(cookie);

				}

				// console.log('Session has been loaded in the browser');

				return this.page;

			}

		}

		return false;

	}

	saveCookies = async (pageType) => {

		try {

			const cookiesObject = await this.page.cookies();

			await jsonfile.writeFileSync(
				(pageType === 'amazon'
					? this.amazonCookiesPath
					: this.sellerCentralCookiesPath), cookiesObject, { spaces: 2 },
			);

			// await jsonfile.writeFileSync(this.amazonCookiesPath, cookiesObject, { spaces: 2 });

			// console.log('Cookies saved');

		} catch (error) {

			console.log(error);

		}

	}

	setBrowser = async () => {

		const isDevelopmentEnv = process.env.NODE_ENV === 'DEVELOPMENT';

		const args = [
			'--disable-gpu',
			'--disable-setuid-sandbox',
			'--disable-dev-shm-usage',
			'--force-device-scale-factor',
			'--ignore-certificate-errors',
			'--no-sandbox',
			'--mute-audio',
			'--disable-translate',
			'--disable-features=site-per-process',
		];

		this.browser = await puppeteer.launch({
			headless: !isDevelopmentEnv,
			devtools: false,
			dumpio: isDevelopmentEnv,
			ignoreHTTPSErrors: !isDevelopmentEnv,
			slowMo: 250,
			timeout: isDevelopmentEnv ? 10000 : 60000,
			defaultViewport: {
				width: 1920,
				height: 1080,
			},
			args,
		});

	}

	setPage = async (pageType) => {

		this.page = await this.browser.newPage();
		this.page.on('dialog', async (dialog) => {

			await dialog.accept();

		});
		if (this.type === 'clean') {

			await this.page.setRequestInterception(true);

			this.page.on('request', (request) => {

				if (
					request.resourceType() === 'image'
					|| request.resourceType() === 'font'
				) {

					request.abort();

				} else {

					request.continue();

				}

			});

		} else if (this.type === 'veryClean') {

			await this.page.setRequestInterception(true);

			this.page.on('request', (request) => {

				if (
					request.resourceType() === 'image'
					|| request.resourceType() === 'script'
					|| request.resourceType() === 'stylesheet'
					|| request.resourceType() === 'font'
				) {

					request.abort();

				} else {

					request.continue();

				}

			});

		}

		await this.page._client.send('Page.setDownloadBehavior', {
			behavior: 'allow',
			downloadPath: this.downloadPath,
		});

		const min = 0;
		const max = this.userAgents.length;
		const random = parseInt(Math.random() * (+max - +min) + +min, 10);
		await this.page.setUserAgent(this.userAgents[random]);
		await this.setCookies(pageType);

	}

	closestValue = async (array, value) => {

		let result;
		let lastDelta;

		array.some((item) => {

			const delta = Math.abs(value - item);
			if (delta >= lastDelta) {

				return true;

			}

			result = item;
			lastDelta = delta;

		});

		return result;

	}

	getFirstPageInfo = async (keyword) => {

		try {

			console.log(`Getting first page listing info for keyword: ${keyword}`);

			await this.setBrowser();
			await this.setPage('amazon');

			let url = `https://www.amazon.com/s?k=${keyword.replace(' ', '+')}`;
			await this.page.goto(url, {
				waitUntil: ['networkidle0', 'load', 'domcontentloaded'],
			});

			const resultsQuantity = await this.page.evaluate(() => parseInt(document.querySelector('.sg-col-inner span:nth-child(1)').innerText.split('of')[1].replace('results for', '').replace('over', '').replace(',', '').trim(), 10));

			const productsInfo = await this.page.evaluate(() => Array.from(
				document.querySelectorAll('.s-result-list > div:not(.AdHolder):not(.s-flex-geom):not(.s-border-top-overlap):not([data-asin=""])'),
			).map((item) => ({
				asin: item.getAttribute('data-asin'),
				countReviews: item.querySelector('.a-row.a-size-small span:nth-child(2)') !== null
					? parseInt(item.querySelector('.a-row.a-size-small span:nth-child(2)').getAttribute('aria-label').replace(',', ''), 10)
					: 'N/A',
				ratingReviews: item.querySelector('.a-row.a-size-small span:nth-child(1)') !== null
					? parseFloat(item.querySelector('.a-row.a-size-small span:nth-child(1)').getAttribute('aria-label').replace(' out of 5 stars', ''))
					: 'N/A',
				title: item.querySelector('.a-color-base.a-text-normal').innerText,
				price: (item.querySelector('.a-offscreen') !== null
					? parseFloat(item.querySelector('.a-offscreen').innerText.replace('$', ''))
					: item.querySelector('.a-row.a-size-base.a-color-secondary > .a-color-base') !== null
						? parseFloat(item.querySelector('.a-row.a-size-base.a-color-secondary > .a-color-base').innerText.replace('$', ''))
						: 0),
			})));

			// getting ranks, quantity images and quantity bullets
			for (let i = 0; i < productsInfo.length; i += 1) {

				const { asin } = productsInfo[i];
				console.log(`(${i + 1}/${productsInfo.length}) Getting detailed info for ASIN ${asin}`);

				// getting rank (BSR)
				const response = await this.mwsReports.getDetailProductInfoMWS(asin);

				if (response !== false) {

					if (JsonFind(response).checkKey('Rank') !== false) {

						const object = JsonFind(response).findValues('Rank');
						const rank = parseInt(object.Rank, 10);
						productsInfo[i].rank = rank;

					} else {

						productsInfo[i].rank = 'N/A';

					}

				}

				// TODO ver se da para atualizar script para pegar quando tem mais de 7 imagens
				// (quando tem mais de 7 fica escondido)
				// getting images, videos and bullets count
				url = `https://www.amazon.com/dp/${asin}`;
				await this.page.goto(url, {
					waitUntil: ['networkidle0', 'load', 'domcontentloaded'],
				});
				const asinDetailedInfo = await this.page.evaluate(() => ({ imagesCount: document.querySelectorAll('#altImages ul li.imageThumbnail').length, videosCount: document.querySelectorAll('#altImages ul li.videoThumbnail').length, bulletsCount: document.querySelectorAll('#feature-bullets ul li:not(.aok-hidden)').length }));

				productsInfo[i] = { ...productsInfo[i], ...asinDetailedInfo };

				// console.log('Sleeping for one second');
				// await sleep(1);

			}

			await this.saveCookies('amazon');
			await this.page.close();
			await this.browser.close();

			return { resultsQuantity, productsInfo };

		} catch (error) {

			console.log(`Error on getFirstPageInfo: ${error}`);
			const pathToSaveScreenshot = `${this.dir}/logs/screenshots/getFirstPageInfo_${await moment().tz('America/Los_Angeles').format('YYYY-MM-DDTHH-mm-ss-SSS')}_error.png`;
			await this.page.screenshot({ path: pathToSaveScreenshot, fullPage: true });
			console.log(`Screenshot saved: ${pathToSaveScreenshot}`);

		}

		return false;

	}

	syncKeywordsFromBrandAnalytics = async () => {

		try {

			console.log('Syncing keywords from brand analytics');

			const brandAnalyticsKeywords = await this.getKeywordsFromBrandAnalytics();

			console.log('Saving keywords on database');
			// const date = await moment().tz('UTC').format('YYYY_MM_DD');

			await jsonfile
				.writeFile(
					'database/product-search/brand_analytics_keywords.json',
					brandAnalyticsKeywords,
					{ spaces: 2 },
				);
			console.log('Saved');

		} catch (error) {

			console.log(`Error on getKeywordsFromBrandAnalytics: ${error}`);

		}

	}

	getKeywordsFromBrandAnalytics = async () => {

		try {

			console.log('Getting keywords from brand analytics');

			await rimraf.sync(this.downloadPath);

			if (await this.loginAmazonSellerCentral()) {

				await this.adjustingParametersOnBrandAnalytics(this.page);
				await this.requestingReportDownloadOnBrandAnalytics(this.page);

				await this.waitReportGenerateFromAmazon(this.page);
				const filePath = await this.waitForDownloadFileToFinish();

				const keywords = await this.getKeywordsFromFile(filePath);
				const keywordsFiltered = await this.filterKeywordsByIgnoreWordsList(keywords);

				await this.page.close();
				await this.browser.close();

				return keywordsFiltered;

			}

		} catch (error) {

			console.log(`Error on getKeywordsFromBrandAnalytics: ${error}`);

		}

		return false;

	}

	selectBrandAnalyticsKeywords = async () => {

		try {

			const brandAnalyticsKeywords = await jsonfile
				.readFile('./database/product-search/brand_analytics_keywords.json');

			return brandAnalyticsKeywords;

		} catch (error) {

			console.log(`Error on selectKeywordsFromBrandAnalytics: ${error}`);

		}

		return false;

	}

	loginAmazonSellerCentral = async () => {

		try {

			console.log('Login in into Seller Central');

			await this.setBrowser();
			await this.setPage('sellerCentral');

			const url = 'https://sellercentral.amazon.com/analytics/dashboard/searchTerms';

			await this.page.goto(url, {
				waitUntil: ['networkidle0', 'load', 'domcontentloaded'],
			});

			if (this.page.url() !== url) {

				while (true) {

					// asking password again
					if (await this.page.$('input[id="ap_email"]') === null) {

						console.log('Login page without email, typing password');
						await this.page.waitForSelector('input[id="ap_password"]');

						console.log('Typing password');
						await this.page.focus('input[id="ap_password"]');
						await this.page.type('input[id="ap_password"]', this.sellerCentralPass);

						console.log('Clicking on keep me signed in');
						await this.miniChill();
						await this.page.click('input[name="rememberMe"]');

						console.log('Clicking on sign-in');
						await this.chill();
						await Promise.all([
							this.page.click('input[id="signInSubmit"]'),
							this.page.waitForNavigation({ waitUntil: 'networkidle0' }),
						]);

					} if (await this.page.$('input[id="ap_email"]') !== null) {

						console.log('Typing email');
						await this.page.waitForSelector('input[id="ap_email"]');

						await this.page.focus('input[id="ap_email"]');
						await this.page.type('input[id="ap_email"]', this.sellerCentralUser);
						console.log('Typing password');
						await this.page.focus('input[id="ap_password"]');
						await this.page.type('input[id="ap_password"]', this.sellerCentralPass);

						console.log('Clicking on keep me signed in');
						await this.miniChill();
						await this.page.click('input[name="rememberMe"]');

						console.log('Clicking on sign-in');
						await this.chill();
						await Promise.all([
							this.page.click('input[id="signInSubmit"]'),
							this.page.waitForNavigation({ waitUntil: 'networkidle0' }),
						]);

					} if (await this.page.$('input[id="auth-mfa-otpcode"]') !== null) {

						console.log('Login page with otp code, can not continue, aborting...');

						return false;

					}

					if (this.page.url() === url) break;

				}

			}

			await this.saveCookies('sellerCentral');

			return true;

		} catch (error) {

			console.log(`Error on login to seller central: ${error.stack}`);

			if (error.message === 'Unexpected end of JSON input') {

				console.log('Something wrong with the cookies, place new cookies on the folder and try again');

			} if (error.message.indexOf('Navigation Timeout Exceeded') > -1) {

				console.log('Navigation Timeout Exceeded. Waiting 30 seconds and trying again');
				await sleep(30000);
				await this.loginSellerCentral();

			}

			const pathToSaveScreenshot = `${this.dir}/screenshots/${await moment().tz('America/Los_Angeles').format('YYYY-MM-DDTHH-mm-ss-SSS')}_error.png`;
			await this.page.screenshot({ path: pathToSaveScreenshot });
			console.log(`Screenshot saved: ${pathToSaveScreenshot}`);

		}

		return false;

	}

	adjustingParametersOnBrandAnalytics = async () => {

		try {

			console.log('Adjusting parameters inside brand analytics');

			console.log('Clicking on Report range dropdown');

			await this.click("Array.from(document.querySelectorAll('.awsui-button')).find(item => item.outerText.indexOf('Reporting Range') > -1)");
			await this.miniChill();

			console.log(`Choosing timeFrame: ${this.timeFrameToSearch}`);

			await this.click(`Array.from(document.querySelectorAll('.awsui-button-dropdown-item > a')).find(item => item.outerText.indexOf('${this.timeFrameToSearch}') >-1)`);
			await this.miniChill();

			console.log(`Choosing department: ${this.departmentToSearch}`);

			await this.click("Array.from(document.querySelectorAll('.awsui-button')).find(item => item.outerText.indexOf('Department') > -1)");
			await this.miniChill();

			await this.click(`Array.from(document.querySelectorAll('.awsui-button-dropdown-item > a')).find(item => item.outerText === '${this.departmentToSearch}')`);
			await this.chill();

			console.log('Clicking apply');

			const selector = '.fixedDataTableLayout_main.public_fixedDataTable_main';
			await this.clickAndWaitForSelector(selector, "Array.from(document.querySelectorAll('button')).find(item => item.outerText === 'Apply')");

		} catch (error) {

			console.log(`Error on adjustingParametersOnBrandAnalytics: ${error}`);

		}

	}

	requestingReportDownloadOnBrandAnalytics = async () => {

		try {

			console.log('Clicking on download dropdown');

			await this.click("Array.from(document.querySelectorAll('button')).find(item => item.outerText === 'Download')");
			await this.miniChill();

			console.log('Clicking to download .csv');

			await this.click("Array.from(document.querySelectorAll('.awsui-button-dropdown-item > a')).find(item => item.outerText.indexOf('CSV') > -1)");
			await this.chill();

			console.log('Checking if there is a modal (more than 1m keywords) to confirm');

			if (await this.page.$('.i90-modal') !== null) {

				console.log('There is a modal, clicking it to confirm');
				await this.page.click("Array.from(document.querySelectorAll('.a-button-inner')).find(item => item.outerText.indexOf('1M Rows') > -1).querySelector('input')");

			} else {

				console.log('No modal, moving on');

			}

		} catch (error) {

			console.log(`Error on requestingReportDownloadOnBrandAnalytics: ${error}`);

		}

	}

	waitReportGenerateFromAmazon = async () => {

		try {

			const selector = "Array.from(document.querySelectorAll('span')).find(item => item.outerText === 'Download in Progress')";

			while (await this.page.evaluate(selector) !== undefined) {

				console.log('Report is being generated, waiting 5 seconds and checking again');
				await sleep(5000);

			}

			console.log('Report completed');

			return true;

		} catch (error) {

			console.log(`Error on waitReportGenerateFromAmazon: ${error}`);

		}

		return false;

	}

	waitForDownloadFileToFinish = async () => {

		try {

			console.log('Downloading file to server');

			let fileNamePath;

			while (true) {

				const files = await fs.readdirSync(this.downloadPath);
				files.forEach((file) => {

					fileNamePath = `${this.downloadPath}/${file}`;

				});

				if (files.length === 0 || fileNamePath.indexOf('.crdownload') > -1) {

					console.log('Still downloading to server, waiting 5 seconds and check again');
					// console.log(fileNamePath);
					await sleep(5000);

				} else {

					console.log('Download to server finished');

					return fileNamePath;

				}

			}

		} catch (error) {

			console.log(`Error on waitForDownloadFileToFinish: ${error.stack}`);
			console.log('Sleeping for 5 seconds and trying again');
			await sleep(5000);
			await this.waitForDownloadFileToFinish();

		}

		return false;

	}

	getKeywordsFromFile = async (fileNamePath) => {

		try {

			// console.log(`fileNamePath: ${fileNamePath}`);

			const jsonArray = await csv().fromFile(fileNamePath);
			jsonArray.shift();

			const keywords = jsonArray.map((item) => Object.values(item)[1]);
			// const searchVolume = jsonArray.map(item => Object.values(item)[2]);
			console.log('Deleting report, no needed anymore');
			await fs.unlink(fileNamePath);

			return keywords;

		} catch (error) {

			console.log(`Error on getKeywordsFromFile: ${error}`);

			return false;

		}

	}

	filterKeywordsByIgnoreWordsList = async (keywords) => {

		try {

			console.log('Filtering keywords by brand analytics rules');

			const ignoreWordsList = this.ignoreWords.split(',');

			let keywordsFiltered = keywords;

			for (let i = 0; i < ignoreWordsList.length; i += 1) {

				const ignoreWord = ignoreWordsList[i];
				keywordsFiltered = keywordsFiltered.filter((item) => item.indexOf(ignoreWord) === -1);

			}

			return keywordsFiltered;

		} catch (error) {

			console.log(`Error on filterKeywordsByIgnoreWordsList ${error}`);

		}

		return false;

	}

	chill = async () => {

		const min = 2000;
		const max = 7000;
		const random = Math.floor(Math.random() * (+max - +min)) + +min;

		console.log(`Sleeping for ${random} ms`);
		await sleep(random);

		if (this.page !== undefined) {

			await this.page.mouse
				.move(
					Math.floor(Math.random() * (+this.page.viewport().width - +1)) + +1,
					Math.floor(Math.random() * (+this.page.viewport().height - +1)) + +1,
				);

			await this.page.mouse
				.move(
					Math.floor(Math.random() * (+this.page.viewport().width - +1)) + +1,
					Math.floor(Math.random() * (+this.page.viewport().height - +1)) + +1,
				);

		}

	}

	miniChill = async () => {

		const min = 350;
		const max = 1050;
		const random = Math.floor(Math.random() * (+max - +min)) + +min;

		console.log(`Sleeping for ${random} ms`);
		await sleep(random);

		await this.page.mouse
			.move(
				Math.floor(Math.random() * (+this.page.viewport().width - +1)) + +1,
				Math.floor(Math.random() * (+this.page.viewport().height - +1)) + +1,
			);

		await this.page.mouse
			.move(
				Math.floor(Math.random() * (+this.page.viewport().width - +1)) + +1,
				Math.floor(Math.random() * (+this.page.viewport().height - +1)) + +1,
			);

	}

	click = async (element) => {

		try {

			console.log(`Clicking element ${element}`);

			await this.page.evaluate(`(async() => {
				${element}.click()
			})()`);

		} catch (error) {

			console.log(`Error on click: ${error.stack}`);

		}

	}

	clickAndWaitForSelector = async (selector, element) => {

		try {

			console.log(`Clicking and waiting selector ${selector} finished load`);

			await this.page.evaluate(`(async() => {
				${element}.click()
			})()`);

			await this.page.waitForSelector(selector);

		} catch (error) {

			console.log(`Error on click: ${error.stack}`);

		}

	}

	calculateOpportunityScore = async (searchResultInfo) => {

		let score = [];

		const { resultsQuantity, productsInfo } = searchResultInfo;

		try {

			const reviewsAvgRules = {
				200: 0,
				150: 1,
				100: 2,
				50: 3,
				25: 4,
				0: 5,
			};

			const reviewsRatingRules = {
				5: 0,
				4: 1,
				3: 2,
				2: 3,
				1: 4,
				0: 5,
			};

			const titleRules = {
				200: 0,
				180: 1,
				150: 2,
				100: 3,
				50: 4,
				10: 5,
			};

			const resultsQuantityRules = {
				1000: 0,
				700: 1,
				500: 2,
				300: 3,
				100: 4,
				0: 5,
			};

			const imagesCountRules = {
				9: 1,
				7: 2,
				5: 3,
				3: 4,
				1: 5,
			};

			const videoCountRules = {
				1: 0,
				0: 5,
			};

			const bulletsCountRules = {
				5: 0,
				4: 1,
				3: 2,
				2: 3,
				1: 4,
				0: 5,
			};

			const avgCountReviews = parseInt(
				productsInfo
					.reduce((total, a) => (
						a.countReviews !== 'N/A'
							? a.countReviews
							: 0
					) + total, 0) / productsInfo.length, 10,
			);

			const avgRatingReviews = (
				productsInfo
					.reduce((total, a) => (
						a.ratingReviews !== 'N/A'
							? a.ratingReviews
							: 0
					) + total, 0) / productsInfo.length
			).toFixed(2);

			const avgTitleChars = parseInt(
				productsInfo
					.reduce((total, a) => a.title.length + total, 0) / productsInfo.length, 10,
			);

			const avgImagesCount = (
				productsInfo
					.reduce((total, a) => (
						a.imagesCount !== 'N/A'
							? a.imagesCount
							: 0
					) + total, 0) / productsInfo.length
			).toFixed(2);

			const avgVideosCount = (
				productsInfo
					.reduce((total, a) => (
						a.videosCount !== 'N/A'
							? a.videosCount
							: 0
					) + total, 0) / productsInfo.length
			).toFixed(2);

			const avgBulletsCount = (
				productsInfo
					.reduce((total, a) => (
						a.bulletsCount !== 'N/A'
							? a.bulletsCount
							: 0
					) + total, 0) / productsInfo.length
			).toFixed(2);

			score.push(reviewsAvgRules[
				await this.closestValue(Object.keys(reviewsAvgRules), avgCountReviews)
			]);

			score.push(reviewsRatingRules[
				await this.closestValue(Object.keys(reviewsRatingRules), parseFloat(avgRatingReviews))
			]);

			score.push(titleRules[
				await this.closestValue(Object.keys(titleRules), avgTitleChars)
			]);

			score.push(resultsQuantityRules[
				await this.closestValue(Object.keys(resultsQuantityRules), resultsQuantity)
			]);

			score.push(imagesCountRules[
				await this.closestValue(Object.keys(imagesCountRules), avgImagesCount)
			]);

			score.push(videoCountRules[
				await this.closestValue(Object.keys(videoCountRules), avgVideosCount)
			]);

			score.push(bulletsCountRules[
				await this.closestValue(Object.keys(bulletsCountRules), avgBulletsCount)
			]);

			score = (score.reduce((total, a) => a + total, 0) / score.length).toFixed(2);

			return score;

		} catch (error) {

			console.log(`Error on calculateOpportunityScore: ${error}`);

			return false;

		}

	}

}

module.exports = ProductSearch;
