/* eslint-disable no-restricted-properties */
const ini = require('ini')
const fetch = require('node-fetch')
const fs = require('fs')
const jsonfile = require('jsonfile')
const moment = require('moment-timezone')
const download = require('download')
const zlib = require('zlib')
const util = require('util')
const stream = require('stream')
const Products = require('../amazon-mws/products')

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
class Ads {

	constructor () {

		return (async () => {

			this.config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'))
			const { credentials } = this.config
			const { system } = this.config
			const { app } = this.config

			this.advertisingClientId = credentials.ADVERTISING_CLIENT_ID

			this.advertisingClientSecret = credentials.ADVERTISING_CLIENT_SECRET
			this.advertisingRefreshToken = credentials.ADVERTISING_REFRESH_TOKEN
			this.advertisingAccessToken = credentials.ADVERTISING_ACCESS_TOKEN
			this.advertisingProfileUsId = credentials.ADVERTISING_PROFILE_US_ID
			this.advertisingProfileCaId = credentials.ADVERTISING_PROFILE_CA_ID

			this.state = system.ADS_REQUEST_STATE
			this.applicationVersion = system.ADS_REQUEST_APP_VERSION
			this.token = system.ADS_REQUEST_TOKEN
			this.spDatabaseFilePath = app.ADS_SP_DATABASE_FILE_PATH
			this.backupPath = app.ADS_BACKUP_PATH
			this.tempPath = app.ADS_TEMP_PATH

			this.authorization = `Bearer ${this.advertisingAccessToken}`
			this.userAgent = `ConquerAmazon v${this.applicationVersion}`
			this.amazonApiVersion = 'v2'
			this.amazonEndPoint = `https://advertising-api.amazon.com/${this.amazonApiVersion}`
			this.reportParams = {}

			this.headers = {
				Authorization: this.authorization,
				'Content-Type': 'application/json',
				'Amazon-Advertising-API-ClientId': this.advertisingClientId,
				'User-Agent': this.userAgent,
				Accept: '*/*',
				'Cache-Control': 'no-cache',
				'Conquer-Token': this.token,
				'Content-Encoding': 'zlib',
			}

			// this.profiles = await this.selectProfiles();

			return this

		})()

	}

	updateHeaders = async () => {

		try {

			this.authorization = `Bearer ${this.advertisingAccessToken}`

			this.headers = {
				Authorization: this.authorization,
				'Content-Type': 'application/json',
				'Amazon-Advertising-API-ClientId': this.advertisingClientId,
				'User-Agent': this.userAgent,
				Accept: '*/*',
				'Cache-Control': 'no-cache',
				'Conquer-Token': this.token,
				'Content-Encoding': 'zlib',
			}

		} catch (error) {

			console.log(`Error on updateHeaders ${error}`)

		}

	};

	updateConfig = async () => {

		try {

			this.config.credentials.ADVERTISING_ACCESS_TOKEN = this.advertisingAccessToken

			await fs.writeFileSync('./config.ini', ini.stringify(this.config))

		} catch (error) {

			console.log(`Error on updateConfig ${error}`)

		}

	};

	selectProfiles = async () => {

		try {

			const profilesDatabase = './database/ads/profiles.json'
			if (!fs.existsSync(profilesDatabase)) await this.getProfiles()

			return await jsonfile.readFile(profilesDatabase)

		} catch (error) {

			console.log(`Error on getProfiles: ${error}`)

		}

		return false

	};

	getProfiles = async () => {

		try {

			let status = 0
			const apiUrl = 'https://advertising-api.amazon.com/v2/profiles'

			while (status !== 200) {

				const responseProfiles = await fetch(apiUrl, {
					method: 'GET',
					headers: this.headers,
				})

				if (responseProfiles.status === 401) {

					console.log('Not authenticated, refreshing token and trying again...',)
					await this.doRefreshToken()

				} else if (responseProfiles.status !== 200) {

					status = responseProfiles.status
					console.log('Error on requestProfiles')
					console.log(`Status Code: ${status}: ${responseProfiles.statusText}`)

				} else {

					const responseData = await responseProfiles.json()
					const sellerProfiles = responseData.filter((item) => item.accountInfo.type === 'seller',)

					return sellerProfiles

				}

			}

		} catch (error) {

			console.log(`Error on requestProfiles: ${error}`)

			return false

		}

		return false

	};

	getCampaigns = async (profileId) => {

		try {

			// const databaseName = 'campaigns';
			const apiUrl = 'https://advertising-api.amazon.com/v2/sp/campaigns/extended'

			while (true) {

				// const profile = this.profiles[i];
				this.headers['Amazon-Advertising-API-Scope'] = profileId

				const response = await fetch(apiUrl, {
					method: 'GET',
					headers: this.headers,
				})

				if (response.status === 401) {

					console.log('Not authenticated, refreshing token and trying again...',)
					await this.doRefreshToken()

				} else if (response.status !== 200) {

					const { status } = response
					console.log('Error on syncCampaigns')
					console.log(`Status Code: ${status}: ${response.statusText}`)

				} else {

					const responseData = await response.json()

					return responseData
					// const databaseFile = `./database/ads/${profile.countryCode}_${databaseName}.json`;

					// await jsonfile.writeFile(databaseFile, responseData, { spaces: 2 });

					// console.log(`${profile.countryCode} campaigns synced`);

					// break;

				}

			}

		} catch (error) {

			console.log(`Error on syncCampaigns: ${error}`)

			return false

		}

		// return false;

	};

	selectCampaigns = async (country, type) => {

		try {

			const database = `./database/ads/${country}_campaigns.json`
			let data = await jsonfile.readFile(database)

			if (type !== undefined) {

				data = data.filter((item) => item.targetingType === type)

			}

			return data

		} catch (error) {

			console.log(`Error on getCampaigns: ${error}`)

		}

		return false

	};

	getAdGroups = async (profileId) => {

		try {

			// const databaseName = 'adGroups';
			const apiUrl = 'https://advertising-api.amazon.com/v2/sp/adGroups/extended'

			while (true) {

				this.headers['Amazon-Advertising-API-Scope'] = profileId

				const response = await fetch(apiUrl, {
					method: 'GET',
					headers: this.headers,
				})

				if (response.status === 401) {

					console.log('Not authenticated, refreshing token and trying again...',)
					await this.doRefreshToken()

				} else if (response.status !== 200) {

					const { status } = response
					console.log('Error on syncAdGroups')
					console.log(`Status Code: ${status}: ${response.statusText}`)

				} else {

					const responseData = await response.json()

					return responseData
					// const databaseFile = `./database/ads/${profile.countryCode}_${databaseName}.json`;

					// await jsonfile.writeFile(databaseFile, responseData, { spaces: 2 });

					// console.log(`${profile.countryCode} adGroups synced`);

					// break;

				}

			}

		} catch (error) {

			console.log(`Error on syncAdGroups: ${error}`)

			return false

		}

		// return false;

	};

	selectAdGroups = async (country, type, status) => {

		try {

			const database = `./database/ads/${country}_adGroups.json`
			const data = await jsonfile.readFile(database)

			if (type !== undefined && status !== undefined) {

				let dataFiltered = ''
				const campaigns = await this.selectCampaigns(country, type)
				for (let i = 0; i < campaigns.length; i += 1) {

					const campaign = campaigns[i]
					dataFiltered = [ ...dataFiltered, ...data.filter((item) => item.campaignId === campaign.campaignId && item.state === status,), ]

				}

				return dataFiltered

			}

			return data

		} catch (error) {

			console.log(`Error on getAdGroups: ${error}`)

		}

		return false

	};

	getAdGroupsKeywords = async (profileId) => {

		try {

			// const databaseName = 'adGroupsKeywords';
			const apiUrl = 'https://advertising-api.amazon.com/v2/sp/keywords/extended'

			while (true) {

				this.headers['Amazon-Advertising-API-Scope'] = profileId

				const response = await fetch(apiUrl, {
					method: 'GET',
					headers: this.headers,
				})

				if (response.status === 401) {

					console.log('Not authenticated, refreshing token and trying again...',)
					await this.doRefreshToken()

				} else if (response.status !== 200) {

					const { status } = response
					console.log('Error on syncAdGroupsKeywords')
					console.log(`Status Code: ${status}: ${response.statusText}`)

				} else {

					const responseData = await response.json()

					return responseData
					// const databaseFile = `./database/ads/${profile.countryCode}_${databaseName}.json`;

					// await jsonfile.writeFile(databaseFile, responseData, { spaces: 2 });

					// console.log(`${profile.countryCode} adGroupsKeywords synced`);

					// break;

				}

			}

		} catch (error) {

			console.log(`Error on syncAdGroups: ${error}`)

			return false

		}

		// return false;

	};

	getAdGroupsNegativeKeywords = async (profileId) => {

		try {

			// const databaseName = 'adGroupsNegativeKeywords';
			const apiUrl = 'https://advertising-api.amazon.com/v2/sp/negativeKeywords/extended'

			while (true) {

				// const profile = this.profiles[i];

				this.headers['Amazon-Advertising-API-Scope'] = profileId

				const response = await fetch(apiUrl, {
					method: 'GET',
					headers: this.headers,
				})

				if (response.status === 401) {

					console.log('Not authenticated, refreshing token and trying again...',)
					await this.doRefreshToken()

				} else if (response.status !== 200) {

					const { status } = response
					console.log('Error on syncAdGroupsNegativeKeywords')
					console.log(`Status Code: ${status}: ${response.statusText}`)

				} else {

					const responseData = await response.json()

					return responseData
					// const databaseFile = `./database/ads/${profile.countryCode}_${databaseName}.json`;

					// await jsonfile.writeFile(databaseFile, responseData, { spaces: 2 });

					// console.log(
					// 	`${profile.countryCode} adGroups negative keywords synced`,
					// );

					// break;

				}

			}

		} catch (error) {

			console.log(`Error on syncAdGroupsNegativeKeywords: ${error}`)

			return false

		}

		// return false;

	};

	getCampaignsNegativeKeywords = async (profileId) => {

		try {

			// const databaseName = 'campaignsNegativeKeywords';
			const apiUrl = 'https://advertising-api.amazon.com/v2/sp/campaignNegativeKeywords/extended'

			while (true) {

				this.headers['Amazon-Advertising-API-Scope'] = profileId

				const response = await fetch(apiUrl, {
					method: 'GET',
					headers: this.headers,
				})

				if (response.status === 401) {

					console.log('Not authenticated, refreshing token and trying again...',)
					await this.doRefreshToken()

				} else if (response.status !== 200) {

					const { status } = response
					console.log('Error on syncCampaignNegativeKeywords')
					console.log(`Status Code: ${status}: ${response.statusText}`)
					break

				} else {

					const responseData = await response.json()

					return responseData

				}

			}

		} catch (error) {

			console.log(`Error on syncCampaignNegativeKeywords: ${error}`)

			return false

		}

		return false

	};

	getAdGroupsSuggestedKeywords = async (profileId, adGroupId) => {

		try {

			const apiUrl = `${this.amazonEndPoint}/sp/adGroups/${adGroupId}/suggested/keywords/extended?maxNumSuggestions=1000&suggestBids=yes`

			while (true) {

				this.headers['Amazon-Advertising-API-Scope'] = profileId

				const response = await fetch(apiUrl, {
					method: 'GET',
					headers: this.headers,
				})

				if (response.status === 401) {

					console.log('Not authenticated, refreshing token and trying again...',)
					await this.doRefreshToken()

				} else if (response.status !== 200 && response.status !== 422) {

					const { status } = response
					console.log('Error on getAdGroupsSuggestedKeywords')
					console.log(`Status Code: ${status}: ${response.statusText}`)
					break

				} else {

					const responseData = await response.json()

					if (responseData.details === 'Keywords data can not be null.') {

						console.log(`No suggested keywords for adGroup id ${adGroupId}`,)

						return []

					}

					return responseData

					// console.log(
					// 	`${profile.countryCode} suggested adGroupId ${adGroup.adGroupId} keywords synced`,
					// );

					// break;

				}

			}

		} catch (error) {

			console.log(`Error on syncSuggestedKeywordsByAdGroups: ${error}`)

			return false

		}

		return false

	};

	syncSuggestedKeywordsByAsins = async () => {

		// TODO fazer por country code (primeiro precisa ajudar o getAsins)
		try {

			const databaseName = 'suggestedKeywordsAsin'
			const products = new Products()

			// for (let i = 0; i < this.profiles.length; i += 1) {

			const profile = this.profiles.find((item) => item.countryCode === 'US')
			const asins = await products.getAsins('US')

			for (let j = 0; j < asins.length; j += 1) {

				const asin = asins[j]

				const apiUrl = `https://advertising-api.amazon.com/v2/sp/asins/${asin}/suggested/keywords?maxNumSuggestions=1000`

				while (true) {

					this.headers['Amazon-Advertising-API-Scope'] = profile.profileId

					const response = await fetch(apiUrl, {
						method: 'GET',
						headers: this.headers,
					})

					if (response.status === 401) {

						console.log('Not authenticated, refreshing token and trying again...',)
						await this.doRefreshToken()

					} else if (response.status !== 200 && response.status !== 422) {

						const { status } = response
						console.log('Error on syncSuggestedKeywordsByAsins')
						console.log(`Status Code: ${status}: ${response.statusText}`)

					} else {

						const databaseFile = `./database/ads/suggestedKeywords/asins/${profile.countryCode}_${asin}_${databaseName}.json`
						const responseData = await response.json()

						if (responseData.details === 'Keywords data can not be null.') {

							console.log(`No suggested keywords for ASIN ${asin}`)
							break

						} else if (responseData.details === undefined) {

							await jsonfile.writeFile(
								databaseFile, responseData, { spaces: 2, }
							)

							console.log(`${profile.countryCode} suggested asin ${asin} keywords synced`,)

							break

						} else {

							console.log(`Error on syncSuggestedKeywordsByAsins: ${responseData}`,)
							break

						}

					}

				}

			}

			// const apiUrl = `/v2/sp/adGroups/${adGroupId}/suggested/keywords/extended`;

			// }

		} catch (error) {

			console.log(`Error on syncSuggestedKeywordsByAsins: ${error}`)

			return false

		}

		return false

	};

	doRefreshToken = async () => {

		try {

			const params = new URLSearchParams()

			params.append('grant_type', 'refresh_token')
			params.append('client_id', this.advertisingClientId)
			params.append('refresh_token', this.advertisingRefreshToken)
			params.append('client_secret', this.advertisingClientSecret)
			params.append('state', this.state)

			const headers = {
				'Content-Type': 'application/x-www-form-urlencoded',
				charset: 'UTF-8',
				Accept: '*/*',
				'Cache-Control': 'no-cache',
				'Conquer-Token': this.token,
			}

			const response = await fetch('https://api.amazon.com/auth/o2/token', {
				method: 'post',
				headers,
				body: params,
			})

			const data = await response.json()

			if (response.status === 200 && response.statusText === 'OK') {

				this.advertisingAccessToken = data.access_token
				await this.updateHeaders()
				await this.updateConfig()

				console.log('Refreshed with success!')

			} else {

				if (
					data.error_description
					=== 'The request has an invalid grant parameter : code'
				) {

					console.log('Refresh token is not valid')

				} else {

					console.log(data)

				}

				console.log(`Status: ${response.status}`)
				console.log(`Text: ${response.statusText}`)

			}

		} catch (error) {

			console.log(`Error on doRefreshToken: ${error.stack}`)

		}

	};

	setReportOptions = async (type, date) => {

		switch (type) {

		case 'campaigns':
			this.reportParams = {
				reportDate: date,
				metrics: 'bidPlus,campaignName,campaignId,campaignStatus,campaignBudget,'
          + 'impressions,clicks,cost,portfolioId,portfolioName,'
          + 'attributedConversions1d,attributedConversions7d,attributedConversions14d,'
          + 'attributedConversions30d,attributedConversions1dSameSKU,'
          + 'attributedConversions7dSameSKU,attributedConversions14dSameSKU,'
          + 'attributedConversions30dSameSKU,attributedUnitsOrdered1d,attributedUnitsOrdered7d,'
          + 'attributedUnitsOrdered14d,attributedUnitsOrdered30d,attributedSales1d,'
          + 'attributedSales7d,attributedSales14d,attributedSales30d,attributedSales1dSameSKU,'
          + 'attributedSales7dSameSKU,attributedSales14dSameSKU,attributedSales30dSameSKU',
			}
			break
		case 'adGroups':
			this.reportParams = {
				reportDate: date,
				metrics: 'campaignName,adGroupName,adGroupId,'
            + 'impressions,clicks,cost,'
            + 'attributedConversions1d,attributedConversions7d,attributedConversions14d,attributedConversions30d,'
            + 'attributedConversions1dSameSKU,attributedConversions7dSameSKU,attributedConversions14dSameSKU,'
            + 'attributedConversions30dSameSKU,attributedUnitsOrdered1d,attributedUnitsOrdered7d,'
            + 'attributedUnitsOrdered14d,attributedUnitsOrdered30d,attributedSales1d,'
            + 'attributedSales7d,attributedSales14d,attributedSales30d,attributedSales1dSameSKU,'
            + 'attributedSales7dSameSKU,attributedSales14dSameSKU,attributedSales30dSameSKU',
			}
			break
		case 'keywords':
			this.reportParams = {
				reportDate: date,
				metrics: 'campaignName,campaignId,keywordId,keywordText,matchType,'
            + 'impressions,clicks,cost,'
            + 'attributedConversions1d,attributedConversions7d,attributedConversions14d,attributedConversions30d,'
            + 'attributedConversions1dSameSKU,attributedConversions7dSameSKU,attributedConversions14dSameSKU,attributedConversions30dSameSKU,'
            + 'attributedUnitsOrdered1d,attributedUnitsOrdered7d,attributedUnitsOrdered14d,attributedUnitsOrdered30d,'
            + 'attributedSales1d,attributedSales7d,attributedSales14d,attributedSales30d,'
            + 'attributedSales1dSameSKU,attributedSales7dSameSKU,attributedSales14dSameSKU,attributedSales30dSameSKU',
			}
			break
			// case 'searchTerms':
			//   this.reportParams = {
			//     segment: 'query',
			//     reportDate: date,
			//     metrics: 'campaignName,campaignId,keywordId,keywordText,matchType,'
			//       + 'impressions,clicks,cost,'
			//       + 'attributedConversions1d,attributedConversions7d
			// ,attributedConversions14d,attributedConversions30d,'
			//       + 'attributedConversions1dSameSKU,
			// attributedConversions7dSameSKU,
			// attributedConversions14dSameSKU,attributedConversions30dSameSKU,'
			//       + 'attributedUnitsOrdered1d,attributedUnitsOrdered7d,
			// attributedUnitsOrdered14d,attributedUnitsOrdered30d,'
			//       + 'attributedSales1d,attributedSales7d,attributedSales14d,attributedSales30d,'
			//       + 'attributedSales1dSameSKU,attributedSales7dSameSKU,
			// attributedSales14dSameSKU,attributedSales30dSameSKU',
			//   };
			//   break;
		case 'productAds':
			this.reportParams = {
				reportDate: date,
				metrics: 'campaignName,campaignId,adGroupName,adGroupId,'
            + 'impressions,clicks,cost,currency,asin,sku,'
            + 'attributedConversions1d,attributedConversions7d,attributedConversions14d,attributedConversions30d,'
            + 'attributedConversions1dSameSKU,attributedConversions7dSameSKU,attributedConversions14dSameSKU,attributedConversions30dSameSKU,'
            + 'attributedUnitsOrdered1d,attributedUnitsOrdered7d,attributedUnitsOrdered14d,attributedUnitsOrdered30d,'
            + 'attributedSales1d,attributedSales7d,attributedSales14d,attributedSales30d,'
            + 'attributedSales1dSameSKU,attributedSales7dSameSKU,attributedSales14dSameSKU,attributedSales30dSameSKU',
			}
			break
			// NOT yet ready on amazon documentation
			// case 'asins':
			//   this.reportParams = {
			//     reportDate: date,
			//     // campaignType: 'manual',
			//     metrics: 'campaignName,campaignId,adGroupName,adGroupId,keywordId,keywordText,'
			//         + 'asin,otherAsin,sku,currency,matchType,'
			//         + 'attributedUnitsOrdered1dOtherSKU,
			// attributedUnitsOrdered7dOtherSKU,
			// attributedUnitsOrdered14dOtherSKU,attributedUnitsOrdered30dOtherSKU,'
			//         + 'attributedSales1dOtherSKU,
			// attributedSales7dOtherSKU,attributedSales14dOtherSKU,
			// attributedSales30dOtherSKU',
			//   };
			//   break;
		case 'targets':
			this.reportParams = {
				reportDate: date,
				// campaignType: 'manual',
				metrics: 'campaignName,campaignId,targetId,targetingExpression,targetingText,targetingType,'
              + 'impressions,clicks,cost,'
              + 'attributedConversions1d,attributedConversions7d,attributedConversions14d,attributedConversions30d,'
              + 'attributedConversions1dSameSKU,attributedConversions7dSameSKU,attributedConversions14dSameSKU,attributedConversions30dSameSKU,'
              + 'attributedUnitsOrdered1d,attributedUnitsOrdered7d,attributedUnitsOrdered14d,attributedUnitsOrdered30d,'
              + 'attributedSales1d,attributedSales7d,attributedSales14d,attributedSales30d,'
              + 'attributedSales1dSameSKU,attributedSales7dSameSKU,attributedSales14dSameSKU,attributedSales30dSameSKU',
			}
			break
		default:
			break

		}

	}

	requestReport = async (type, date, profileId) => {

		try {

			while (true) {

				await this.setReportOptions(type, date)

				this.headers['Amazon-Advertising-API-Scope'] = profileId

				const response = await fetch(`https://advertising-api.amazon.com/v2/sp/${type}/report`, {
					method: 'POST',
					headers: this.headers,
					body: JSON.stringify(this.reportParams),
				})

				if (response.status === 401) {

					console.log('Not authenticated, refreshing token and trying again...')
					await this.doRefreshToken()
					continue

				} else if (response.status !== 202) {

					const { status } = response
					throw new Error(`Status Code: ${status}: ${response.statusText}`)

				}

				const responseData = await response.json()

				return {
					reportId: responseData.reportId,
					status: responseData.status 
				}

			}

		} catch (error) {

			console.log(`Error on requestReport: ${error}`)

			return false

		}

	}

	checkReportStatus = async (reportId, profileId) => {

		try {

			let status = 0

			this.headers['Amazon-Advertising-API-Scope'] = profileId

			const response = await fetch(`https://advertising-api.amazon.com/v2/reports/${reportId}`, {
				method: 'GET',
				headers: this.headers,
			})

			const data = await response.json()

			if (response.status === 401) {

				console.log('Not authenticated, refreshing token and trying again...')
				await this.doRefreshToken()

			} else if (response.status !== 200) {

				status = response.status
				throw new Error(`Status Code: ${status}: ${response.statusText}`)

			}

			return {
				reportId: data.reportId,
				status: data.status,
				location: data.location,
				fileSize: data.fileSize,
			}

		} catch (error) {

			console.log(`Error on checkReportStatus: ${error}`)

			return false

		}

	}

	waitForReport = async (reportResponse, profileId) => {

		try {

			const sleepTime = 5000

			while (true) {

				const response = await this.checkReportStatus(reportResponse.reportId, profileId)

				if (response.status === 'SUCCESS') return response

				await console.log(`Not ready, sleeping for ${sleepTime} ms and trying again`)
				await sleep(sleepTime)

			}

		} catch (error) {

			console.log(`Error on waitForReport: ${error}`)

			return false

		}

	}

	formatBytes = (a, b) => {

		if (a === 0) return '0 Bytes'
		const c = 1024
		const d = b || 2
		const e = [
			'Bytes',
			'KB',
			'MB',
			'GB',
			'TB',
			'PB',
			'EB',
			'ZB',
			'YB'
		]
		const f = Math.floor(Math.log(a) / Math.log(c))

		return `${parseFloat((a / Math.pow(c, f)).toFixed(d))} ${e[f]}`

	}

	downloadReport = async (reportInfo, options, profileId) => {

		try {

			console.log('Setting variables')
			let status = 0
			console.log('Getting environment path')
			const tempFilePathCompressed = `${this.tempPath}/${options.type}_${options.date}.json.gz`
			const tempFilePathUncompressed = `${this.tempPath}/${options.type}_${options.date}.json`

			this.headers['Amazon-Advertising-API-Scope'] = profileId

			console.log('Getting report url')

			const { url } = await fetch(reportInfo.location, {
				method: 'GET',
				headers: this.headers,
			})

			console.log('Getting report url file')

			const response = await fetch(url)

			await download(response.url)
				.on('response', () => {

					console.log(`Downloading report. Size: ${this.formatBytes(reportInfo.fileSize)}`)
					// console.log(`Size: ${scripts.formatBytes(res.headers['content-length'])}`);
					// res.on('data', data => bar.tick(data.length));

				})
				.then((data) => {

					fs.writeFileSync(tempFilePathCompressed, data)

				})

			console.log('Unzipping report and saving it')

			const readFile = await fs.createReadStream(tempFilePathCompressed)
			const gzip = await zlib.createGunzip()
			const writeUncompressedFile = await fs.createWriteStream(tempFilePathUncompressed)

			const pipelineUnzipFile = await util.promisify(stream.pipeline)
			await pipelineUnzipFile(
				readFile, gzip, writeUncompressedFile
			)
			console.log('Deleting compressed file')

			fs.unlinkSync(tempFilePathCompressed)

			if (response.status === 401) {

				console.log('Not authenticated, refreshing token and trying again...')
				await this.doRefreshToken()

			} else if (response.status !== 200) {

				status = response.status
				throw new Error(`Status Code: ${status}: ${response.statusText}`)

			}

			return tempFilePathUncompressed

		} catch (error) {

			console.log(`Error on downloadReport: ${error} : ${JSON.stringify(reportInfo)} | ${JSON.stringify(options)}`)

			return false

		}

	}

	getReport = async (options, profileId) => {

		try {

			console.log(`Requesting ads report ${options.type} date ${options.date}`)
			const requestResponse = await this.requestReport(
				options.type, options.date, profileId
			)
			const reportResponse = await this.waitForReport(requestResponse, profileId)
			const reportFile = await this.downloadReport(
				reportResponse, options, profileId
			)

			return jsonfile.readFileSync(reportFile)

		} catch (error) {

			console.log(`Error on getReport: ${error}`)

			return false

		}

	}

	saveReportAds = async (quantityDays, type) => {

		const MAX_TRIES = 5
		let tries = 1

		try {

			for (let index = 1; index <= quantityDays; index += 1) {

				const date = await moment()
					.subtract(index, 'days')
					.tz('America/Los_Angeles')
					.format('YYYYMMDD')
				const options = {
					date,
					type 
				}

				await this.getReport(options)

				await sleep(2000)

			}

			return true

		} catch (error) {

			console.log(JSON.stringify(error))

			if (tries === MAX_TRIES) {

				console.log(`Max tries reached (${MAX_TRIES}), aborting. QuantityDays: ${quantityDays} | type: ${type}`)

				return false

			}

			console.log(`[${tries}} Waiting 30 seconds and starting saving reports ads again. QuantityDays: ${quantityDays} | type: ${type}`)
			tries += 1
			await sleep(30000)
			await this.saveReportAds(quantityDays, type)
			console.log(`Finished saveReportAds ${type} with ${quantityDays} days`)

			return false

		}

	}

	syncAds = async (reportOptions) => {

		try {

			const ads = {}

			console.log('Getting ads profiles')
			const sellerProfiles = await this.getProfiles()
			ads.profiles = sellerProfiles

			for (let i = 0; i < ads.profiles.length; i += 1) {

				const profile = ads.profiles[i]
				console.log(`Getting advertising info for profile id ${profile.profileId}`)
				const [
					campaigns,
					adGroups,
					adGroupsKeywords,
					adGroupsNegativeKeywords,
					campaignsNegativeKeywords,
					campaignsReport,
				] = await Promise.all([
					this.getCampaigns(profile.profileId),
					this.getAdGroups(profile.profileId),
					this.getAdGroupsKeywords(profile.profileId),
					this.getAdGroupsNegativeKeywords(profile.profileId),
					this.getCampaignsNegativeKeywords(profile.profileId),
					this.getReport(reportOptions, profile.profileId),
				])

				ads.profiles[i].campaigns = campaigns

				for (let j = 0; j < campaigns.length; j += 1) {

					const campaign = campaigns[j]
					const campaignAdGroups = adGroups
						.filter((adGroup) => adGroup.campaignId === campaign.campaignId)

					ads.profiles[i].campaigns[j].adGroups = campaignAdGroups

					const campaignNegativeKeywords = campaignsNegativeKeywords
						.filter((negativeKeywords) => negativeKeywords.campaignId === campaign.campaignId)

					ads.profiles[i].campaigns[j].negativeKeywords = campaignNegativeKeywords

					const reportData = campaignsReport
						.filter((campaignReport) => campaignReport.campaignId === campaign.campaignId)

					ads.profiles[i].campaigns[j].reportData = {}
					ads.profiles[i].campaigns[j].reportData[reportOptions.date] = reportData

					for (let k = 0; k < campaignAdGroups.length; k += 1) {

						const adGroup = campaignAdGroups[k]
						const adGroupKeywords = adGroupsKeywords
							.filter((adGroupKeyword) => adGroupKeyword.adGroupId === adGroup.adGroupId)

						ads.profiles[i].campaigns[j].adGroups[k].keywords = adGroupKeywords === undefined
							? []
							: adGroupKeywords

						const adGroupNegativeKeywords = adGroupsNegativeKeywords
							.filter((adGroupNegativeKeyword) => adGroupNegativeKeyword.adGroupId === adGroup.adGroupId)

						ads.profiles[i].campaigns[j].adGroups[k].negativeKeywords = adGroupNegativeKeywords === undefined
							? []
							: adGroupNegativeKeywords

						if (campaign.targetingType !== 'manual' || adGroup.state !== 'enabled') {

							ads.profiles[i].campaigns[j].adGroups[k].suggestedKeywords = []
							continue

						}

						const adGroupSuggestedKeywords = await this
							.getAdGroupsSuggestedKeywords(profile.profileId, adGroup.adGroupId)

						ads.profiles[i].campaigns[j].adGroups[k].suggestedKeywords = adGroupSuggestedKeywords === undefined
							? []
							: adGroupSuggestedKeywords

					}

				}

			}

			console.log('Saving ads info on ads database')

			const actualDate = moment()
				.tz('America/Los_Angeles')
				.format('YY_MM_DD_H_mm')
			const backupFile = 	`${this.backupPath}/${actualDate}.json`

			if (fs.existsSync(this.spDatabaseFilePath)) {

				fs.copyFileSync(this.spDatabaseFilePath, backupFile)
				console.log('Ads database backed up successfully')

			}

			jsonfile.writeFileSync(
				this.spDatabaseFilePath,
				{
					dateUpdated: moment(new Date())
						.tz('America/Los_Angeles')
						.format('YYYY-MM-DD HH:mm:ss'),
					data: ads,
				},
				{ spaces: 2 },
			)

			console.log('Ads info synced')

		} catch (error) {

			console.log('Error on syncAds: ', error)

		}

	}

}

module.exports = Ads
