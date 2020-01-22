const ini = require('ini')
const fs = require('fs')
const jsonfile = require('jsonfile')
const moment = require('moment-timezone')
const AmazonAdvertisingFunctions = require('./ads-functions')
const AdsProfile = require('./ads-profile')
const AdsSpCampaign = require('./ads-sp-campaign')
const AdsSpAdGroup = require('./ads-sp-adgroup')
const AdsSpKeywordAdgroup = require('./ads-sp-keyword-adgroup')
const AdsSpNegativeKeywordAdgroup = require('./ads-sp-negative-keyword-adgroup')
const AdsSpNegativeKeywordCampaign = require('./ads-sp-negative-keyword-campaign')
const AdsSpProductAd = require('./ads-sp-product-ad')
const AdsSpProductTargeting = require('./ads-sp-product-targeting')
const AdsSpReport = require('./ads-sp-report')
const Logger = require('./../logger')
const path = require('path')
class AdsJobs {

	constructor () {

		this.moduleName = 'ads-jobs'
		
		this.config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'))
		// this.moduleConfig = this.config.app.advertising[this.moduleName]
		// this.endpointUrl = this.config.app.advertising.ENDPOINT_API_URL
		// this.apiUrl = this.endpointUrl + this.moduleConfig.API_ENTITY
		this.adsFunctions = new AmazonAdvertisingFunctions()
		this.scriptFileName = path.basename(__filename)
		// this.moduleDatabaseFilePath = this.config.app.advertising[this.moduleName].DATABASE

		this.logger = new Logger(this.moduleName)
			.get()

	}

	async syncAdsData (options) {

		try {

			const adsProfile = new AdsProfile()
			const adsCampaign = new AdsSpCampaign()
			await adsProfile.sync()
			await adsCampaign.sync()

			const adsAdGroup = new AdsSpAdGroup()
			const adsSpKeywordAdgroup = new AdsSpKeywordAdgroup()
			const adsSpNegativeKeywordAdgroup = new AdsSpNegativeKeywordAdgroup()
			const adsSpNegativeKeywordCampaign = new AdsSpNegativeKeywordCampaign()
			const adsSpProductAd = new AdsSpProductAd()
			const adsSpProductTargeting = new AdsSpProductTargeting()
			const adsSpReport = new AdsSpReport()

			// const profiles = adsProfile.select({ type:'seller' })

			await Promise.all([
				adsAdGroup.sync(),
				adsSpKeywordAdgroup.sync(),
				adsSpNegativeKeywordAdgroup.sync(),
				adsSpNegativeKeywordCampaign.sync(),
				adsSpProductAd.sync(),
				adsSpProductTargeting.sync(),
				adsSpReport.sync(options.reportDays, options.reportType)
			])

			// for (let i = 0; i < profiles.length; i += 1) {

			// 	const profile = profiles[i]
			// 	console.log(`Getting advertising data for profile id ${profile.profileId}`)

			// 	const [
			// 		campaigns,
			// 		adGroups,
			// 		adGroupsKeywords,
			// 		adGroupsNegativeKeywords,
			// 		campaignsNegativeKeywords,
			// 		campaignsReport,
			// 	] = await Promise.all([
			// 		this.getCampaigns(profile.profileId),
			// 		this.getAdGroups(profile.profileId),
			// 		this.getAdGroupsKeywords(profile.profileId),
			// 		this.getAdGroupsNegativeKeywords(profile.profileId),
			// 		this.getCampaignsNegativeKeywords(profile.profileId),
			// 		this.getReport(reportOptions, profile.profileId),
			// 	])

			// 	ads.profiles[i].campaigns = campaigns

			// 	for (let j = 0; j < campaigns.length; j += 1) {

			// 		const campaign = campaigns[j]
			// 		const campaignAdGroups = adGroups
			// 			.filter((adGroup) => adGroup.campaignId === campaign.campaignId)

			// 		ads.profiles[i].campaigns[j].adGroups = campaignAdGroups

			// 		const campaignNegativeKeywords = campaignsNegativeKeywords
			// 			.filter((negativeKeywords) => negativeKeywords.campaignId === campaign.campaignId)

			// 		ads.profiles[i].campaigns[j].negativeKeywords = campaignNegativeKeywords

			// 		const reportData = campaignsReport
			// 			.filter((campaignReport) => campaignReport.campaignId === campaign.campaignId)

			// 		ads.profiles[i].campaigns[j].reportData = {}
			// 		ads.profiles[i].campaigns[j].reportData[reportOptions.date] = reportData

			// 		for (let k = 0; k < campaignAdGroups.length; k += 1) {

			// 			const adGroup = campaignAdGroups[k]
			// 			const adGroupKeywords = adGroupsKeywords
			// 				.filter((adGroupKeyword) => adGroupKeyword.adGroupId === adGroup.adGroupId)

			// 			ads.profiles[i].campaigns[j].adGroups[k].keywords = adGroupKeywords === undefined
			// 				? []
			// 				: adGroupKeywords

			// 			const adGroupNegativeKeywords = adGroupsNegativeKeywords
			// 				.filter((adGroupNegativeKeyword) => adGroupNegativeKeyword.adGroupId === adGroup.adGroupId)

			// 			ads.profiles[i].campaigns[j].adGroups[k].negativeKeywords = adGroupNegativeKeywords === undefined
			// 				? []
			// 				: adGroupNegativeKeywords

			// 			if (campaign.targetingType !== 'manual' || adGroup.state !== 'enabled') {

			// 				ads.profiles[i].campaigns[j].adGroups[k].suggestedKeywords = []
			// 				continue

			// 			}

			// 			const adGroupSuggestedKeywords = await this
			// 				.getAdGroupsSuggestedKeywords(profile.profileId, adGroup.adGroupId)

			// 			ads.profiles[i].campaigns[j].adGroups[k].suggestedKeywords = adGroupSuggestedKeywords === undefined
			// 				? []
			// 				: adGroupSuggestedKeywords

			// 		}

			// 	}

			// }

			// console.log('Saving ads info on ads database')

			// const actualDate = moment()
			// 	.tz('America/Los_Angeles')
			// 	.format('YY_MM_DD_H_mm')
			// const backupFile = 	`${this.backupPath}/${actualDate}.json`

			// if (fs.existsSync(this.spDatabaseFilePath)) {

			// 	fs.copyFileSync(this.spDatabaseFilePath, backupFile)
			// 	console.log('Ads database backed up successfully')

			// }

			// jsonfile.writeFileSync(this.spDatabaseFilePath,
			// 	{
			// 		dateUpdated: moment(new Date())
			// 			.tz('America/Los_Angeles')
			// 			.format('YYYY-MM-DD HH:mm:ss'),
			// 		data: ads,
			// 	},
			// 	{ spaces: 2 },)

			this.logger.info('Ads data synced')

		} catch (error) {

			this.logger.error('Error on syncAdsData: ', error)

		}

	}

}

module.exports = AdsJobs
