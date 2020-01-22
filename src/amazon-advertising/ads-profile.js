const ini = require('ini')
const fetch = require('node-fetch')
const fs = require('fs')
const jsonfile = require('jsonfile')
const moment = require('moment-timezone')
const AmazonAdvertisingFunctions = require('./ads-functions')
const Logger = require('./../logger')
const path = require('path')
class AdsProfile {

	constructor () {

		this.moduleName = 'profile'
		
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

		try {

			if (fs.existsSync(this.moduleConfig.DATABASE)) {
				
				const data = jsonfile.readFileSync(this.moduleConfig.DATABASE).data
				if (!options.type) return data

				return data.filter((item) => item.accountInfo.type === options.type)
			
			}

		} catch (error) {

			this.logger.error(`Error on ${this.scriptFileName} select: ${error}`)

		}

		return []

	}

	async request () {

		try {

			const response = await fetch(this.apiUrl, {
				method: 'GET',
				headers: this.adsFunctions.headers,
			})

			if (response.status === 200) return response.json()

			if (await this.adsFunctions.doInvalidResponseActions(response, this.moduleName)) {

				return this.request()

			}

		} catch (error) {

			this.logger.error(`Error on ${this.scriptFileName} request: ${error}`)

		}

		return []

	}

	async get () {

		try {

			const response = await this.request()

			return response

		} catch (error) {

			this.logger.error(`Error on ${this.scriptFileName} get: ${error}`)

		}

		return []

	}

	save (data) {

		try {

			jsonfile.writeFileSync(this.moduleDatabaseFilePath,
				{
					dateUpdated: moment(new Date())
						.tz('America/Los_Angeles')
						.format('YYYY-MM-DD HH:mm:ss'),
					data,
				},
				{ spaces: 2 },)

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

			const data = await this.get()
			await this.save(data)

			this.logger.info(`${this.moduleName} data synced`)

			return true

		} catch (error) {

			this.logger.error(`Error on ${this.scriptFileName} sync: ${error}`)

		}

		return false

	}

}

module.exports = AdsProfile
