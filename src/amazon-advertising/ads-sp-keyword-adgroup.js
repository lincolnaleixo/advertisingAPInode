const ini = require('ini')
const fetch = require('node-fetch')
const fs = require('fs')
const jsonfile = require('jsonfile')
const moment = require('moment-timezone')
const AmazonAdvertisingFunctions = require('./ads-functions')
const AdsProfile = require('./ads-profile')
const Logger = require('./../logger')
const path = require('path')
const AdsSpAdGroups = require('./ads-sp-adgroup')
class AdsSpKeywordAdgroup {

	constructor () {

		this.moduleName = 'keywordAdgroup'
		
		this.config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'))
		this.moduleConfig = this.config.app.advertising[this.moduleName]
		this.endpointUrl = this.config.app.advertising.ENDPOINT_API_URL
		this.apiUrl = this.endpointUrl + this.moduleConfig.API_ENTITY
		this.adsFunctions = new AmazonAdvertisingFunctions()
		this.scriptFileName = path.basename(__filename)
		this.moduleDatabaseFilePath = this.config.app.advertising[this.moduleName].DATABASE

		this.logger = new Logger(this.moduleName)
			.get()

	}

	select (options) {

		let data = []

		try {

			if (fs.existsSync(this.moduleConfig.DATABASE)) {
				
				data = jsonfile.readFileSync(this.moduleConfig.DATABASE).data
				if (!options) return data
				
				if (options.state)
					data = data
						.filter((item) => item.state === options.state)
				
				if (options.campaignId)
					data = data
						.filter((item) => item.campaignId === options.campaignId)
				
				if (options.adGroupId)
					data = data
						.filter((item) => item.adGroupId === options.adGroupId)
			
			}
		
		} catch (error) {

			this.logger.error(`Error on ${this.scriptFileName} select: ${error}`)

		}

		return data

	}

	async request (profileId) {

		try {

			this.adsFunctions.setApiScopeProfileId(profileId)

			const response = await fetch(this.apiUrl, {
				method: 'GET',
				headers: this.adsFunctions.headers,
			})

			if (response.status === 200) return response.json()

			if (await this.adsFunctions.doInvalidResponseActions(response, this.moduleName)) {

				return this.request(profileId)

			}

		} catch (error) {

			this.logger.error(`Error on ${this.scriptFileName} request: ${error}`)

		}

		return []

	}

	async requestSuggestedBids (profileId, keywordId) {

		try {

			const url = this.endpointUrl + this.moduleConfig.API_BID_RECOMMENDATION_ENTITY
				.replace('{keywordId}', keywordId)

			const response = await fetch(url, {
				method: 'GET',
				headers: this.adsFunctions.headers,
			})

			if (response.status === 404) return { suggestedBid:'N/A' }

			if (response.status === 200) {

				return response.json()
			
			}

			if (await this.adsFunctions.doInvalidResponseActions(response, this.moduleName)) {

				return this.request(profileId)

			}

		} catch (error) {

			this.logger.error(`Error on ${this.scriptFileName} requestSuggestedBids: ${error}`)

		}

		return []

	}

	async get (profileId) {

		try {

			const adGroupsKeywords = await this.request(profileId)

			this.logger.info('Getting suggested bids for manual adgroups keywords')
			// reference: https://advertising.amazon.com/API/docs/en-us/reference/sponsored-products/2/bid-recommendations

			for (let i = 0; i < adGroupsKeywords.length; i++) {
				
				if (adGroupsKeywords[i].state === 'enabled') {

					this.logger.debug(`${i}/${adGroupsKeywords.length}: Getting suggested bid for keyword id ${adGroupsKeywords[i].keywordId}`)

					const suggestedBidInfo = await this
						.requestSuggestedBids(profileId, adGroupsKeywords[i].keywordId)
					// eslint-disable-next-line require-atomic-updates
					adGroupsKeywords[i].suggestedBid = suggestedBidInfo.suggestedBid

				}
				
			}

			return adGroupsKeywords

		} catch (error) {

			this.logger.error(`Error on ${this.scriptFileName} get: ${error}`)

		}

		return []

	}

	save (data) {

		try {

			jsonfile.writeFileSync(
				this.moduleDatabaseFilePath,
				{
					dateUpdated: moment(new Date())
						.tz('America/Los_Angeles')
						.format('YYYY-MM-DD HH:mm:ss'),
					data,
				},
				{ spaces: 2 },
			)

			this.logger.info(`${this.moduleName} data saved. Total: ${data.length} items`)

			return true

		} catch (error) {

			this.logger.error(`Error on ${this.scriptFileName} save: ${error}`)

		}

		return false

	}

	async sync () {

		try {

			this.logger.info(`Starting ${this.moduleName} sync`)

			let dataToSave = []
			const adsProfile = new AdsProfile()
			const profiles = adsProfile.select({ type:'seller' })

			for (const profile of profiles) {

				this.logger.info(`Syncing profile id ${profile.profileId} ${this.moduleName}s`)
				const data = await this.get(profile.profileId)
				data.forEach(item=>item.profileId = profile.profileId)
				dataToSave = [ ...dataToSave, ...data ]
			
			}

			await this.save(dataToSave)

			this.logger.info(`${this.moduleName} data synced`)

			return false

		} catch (error) {

			this.logger.error(`Error on ${this.scriptFileName} sync: ${error}`)

		}

		return true

	}

}

module.exports = AdsSpKeywordAdgroup
