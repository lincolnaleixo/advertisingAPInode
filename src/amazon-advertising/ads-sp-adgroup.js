const ini = require('ini')
const fetch = require('node-fetch')
const fs = require('fs')
const jsonfile = require('jsonfile')
const moment = require('moment-timezone')
const AmazonAdvertisingFunctions = require('./ads-functions')
const AdsProfile = require('./ads-profile')
const AdsSpCampaign = require('./ads-sp-campaign')
const Logger = require('./../logger')
const path = require('path')
class AdsSpAdgroup {

	constructor () {

		this.moduleName = 'adgroup'
		
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
				
				if (options.campaignId)
					data = data
						.filter((item) => item.campaignId === options.campaignId)
				
				if (options.state)
					data = data
						.filter((item) => item.state === options.state)
			
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

			if (response.status === 200) {

				return response.json()
			
			}

			if (await this.adsFunctions.doInvalidResponseActions(response, this.moduleName)) {

				return this.request(profileId)

			}

		} catch (error) {

			this.logger.error(`Error on ${this.scriptFileName} request: ${error}`)

		}

		return []

	}

	async requestSuggestedBidsForAutoAdGroups (profileId, adGroupId) {

		try {

			const url = this.endpointUrl + this.moduleConfig.API_BID_RECOMMENDATION_ENTITY
				.replace('{adGroupId}', adGroupId)

			const response = await fetch(url, {
				method: 'GET',
				headers: this.adsFunctions.headers,
			})

			if (response.status === 200) {

				return response.json()
			
			}

			if (await this.adsFunctions.doInvalidResponseActions(response, this.moduleName)) {

				return this.request(profileId)

			}

		} catch (error) {

			this.logger.error(`Error on ${this.scriptFileName} requestSuggestedBidsForAutoAdGroups: ${error}`)

		}

		return []

	}

	async requestSuggestedKeywords (profileId, adGroupId) {

		try {

			const url = this.endpointUrl + this.moduleConfig.API_BID_SUGGESTED_KEYWORDS_ENTITY
				.replace('{adGroupId}', adGroupId)

			const response = await fetch(url, {
				method: 'GET',
				headers: this.adsFunctions.headers,
			})

			if (response.status === 200) {

				return response.json()
			
			}

			if (await this.adsFunctions.doInvalidResponseActions(response, this.moduleName)) {

				return this.request(profileId)

			}

		} catch (error) {

			this.logger.error(`Error on ${this.scriptFileName} requestSuggestedKeywords: ${error}`)

		}

		return []

	}

	async get (profileId) {

		try {

			let adGroups = await this.request(profileId)

			const adsSpCampaign = new AdsSpCampaign()
			const campaigns = await adsSpCampaign.select()

			adGroups.forEach(adGroup => {

				adGroup.targetingType = campaigns
					.find(campaign => adGroup.campaignId === campaign.campaignId).targetingType 

			})

			// reference: https://advertising.amazon.com/API/docs/en-us/reference/sponsored-products/2/bid-recommendations
			adGroups = await this.getSuggestedBidsForAutoAdGroups(profileId, adGroups)
			// reference: https://advertising.amazon.com/API/docs/en-us/reference/sponsored-products/2/suggested-keywords
			adGroups = await this.getSuggestedKeywords(profileId, adGroups)

			return adGroups

		} catch (error) {

			this.logger.error(`Error on ${this.scriptFileName} get: ${error}`)

		}

		return []

	}

	async getSuggestedBidsForAutoAdGroups (profileId, adGroups) {

		try {

			if (adGroups.length === 0) {

				this.logger.info('No suggested bids for auto ad groups found')
			
			} else {

				this.logger.info('Getting suggested bids for auto adGroups')

				for (let i = 0; i < adGroups.length; i++) {
						
					if (adGroups[i].state === 'enabled' && adGroups[i].targetingType === 'auto') {
	
						this.logger.debug(`${i}/${adGroups.length}: Getting suggested bid for adGroup id ${adGroups[i].adGroupId}`)
	
						const suggestedBidInfo = await this
							.requestSuggestedBidsForAutoAdGroups(profileId, adGroups[i].adGroupId)
							// eslint-disable-next-line require-atomic-updates
						adGroups[i].suggestedBid = suggestedBidInfo.suggestedBid
	
					}
				
				}
			
			}
			
		} catch (error) {
			
			this.logger.error(`Error on ${this.scriptFileName} getSuggestedBidsForAutoAdGroups: ${error}`)
			
		}
		
		return adGroups

	}

	async getSuggestedKeywords (profileId, adGroups) {

		try {

			if (adGroups.length === 0) {

				this.logger.info('No suggested keywords for adGroups found')
						
			} else {

				this.logger.info('Getting suggested keywords for manual adGroups')
				
				for (let i = 0; i < adGroups.length; i++) {
						
					if (adGroups[i].state === 'enabled' && adGroups[i].targetingType === 'manual') {
	
						this.logger.debug(`${i}/${adGroups.length}: Getting suggested keyword for adGroup id ${adGroups[i].adGroupId}`)
	
						const suggestedKeywordsInfo = await this
							.requestSuggestedKeywords(profileId, adGroups[i].adGroupId)
						// eslint-disable-next-line require-atomic-updates
						adGroups[i].suggestedKeywords = suggestedKeywordsInfo
							.map(item => ({
		
								keywordText: item.keywordText,
								matchType: item.matchType,
								bid: item.bid
		
							}))
	
					}
				
				}
			
			}

		} catch (error) {

			this.logger.error(`Error on ${this.scriptFileName} getSuggestedBidsForAutoAdGroups: ${error}`)

		}

		return adGroups

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

			return true

		} catch (error) {

			this.logger.error(`Error on ${this.scriptFileName} sync: ${error}`)

		}

		return false

	}

}

module.exports = AdsSpAdgroup
