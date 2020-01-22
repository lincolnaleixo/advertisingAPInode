const ini = require('ini')
const fetch = require('node-fetch')
const fs = require('fs')
const jsonfile = require('jsonfile')
const moment = require('moment-timezone')
const AmazonAdvertisingFunctions = require('./ads-functions')
const AdsProfile = require('./ads-profile')
const Logger = require('./../logger')
const path = require('path')
class AdsSpProductAd {

	constructor () {

		this.moduleName = 'productAd'
		
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
				
				if (options.profileId)
					data = data
						.filter((item) => item.profileId === options.profileId)
				
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

			const response = await fetch(`${this.apiUrl}/?stateFilter=enabled`, {
				method: 'GET',
				headers: this.adsFunctions.headers,
			})

			if (response.status === 200) return await response.json()

			if (await this.adsFunctions.doInvalidResponseActions(response, this.moduleName)) {

				return this.request(profileId)

			}

		} catch (error) {

			this.logger.error(`Error on ${this.scriptFileName} request: ${error}`)

		}

		return []

	}

	async get (profileId) {

		try {

			const response = await this.request(profileId)

			return response

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

			return true

		} catch (error) {

			this.logger.error(`Error on ${this.scriptFileName} sync: ${error}`)

		}

		return false

	}

}

module.exports = AdsSpProductAd
