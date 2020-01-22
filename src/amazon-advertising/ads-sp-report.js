const ini = require('ini')
const fetch = require('node-fetch')
const fs = require('fs')
const jsonfile = require('jsonfile')
const moment = require('moment-timezone')
const AmazonAdvertisingFunctions = require('./ads-functions')
const AdsProfile = require('./ads-profile')
const Logger = require('./../logger')
const path = require('path')
const download = require('download')
const zlib = require('zlib')
const util = require('util')
const stream = require('stream')
const Scripts = require('../../lib/scripts')
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

class AdsSpReport {

	constructor () {

		this.moduleName = 'report'
		
		this.config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'))
		this.moduleConfig = this.config.app.advertising[this.moduleName]
		this.endpointUrl = this.config.app.advertising.ENDPOINT_API_URL
		this.apiUrl = this.endpointUrl + this.moduleConfig.API_ENTITY
		this.apiReportLocationUrl = this.endpointUrl + this.moduleConfig.API_REPORT_LOCATION_URL
		this.adsFunctions = new AmazonAdvertisingFunctions()
		this.scriptFileName = path.basename(__filename)
		this.moduleDatabaseFilePath = this.config.app.advertising[this.moduleName].DATABASE

		this.scripts = new Scripts()

		this.logger = new Logger(this.moduleName)
			.get()

	}

	select (options) {

		let data = []

		try {

			if (fs.existsSync(this.moduleConfig.DATABASE)) {

				if (options && !options.date) throw new Error('Date is required if other options is set')
				
				data = jsonfile.readFileSync(this.moduleConfig.DATABASE).data

				if (!options) return data

				if (options.profileId)
					data = data[options.date]
						.filter((item) => item.profileId === options.profileId)
				
				if (options.campaignId)
					data = data[options.date]
						.filter((item) => item.state === options.state)
				
			}
		
		} catch (error) {

			this.logger.error(`Error on ${this.scriptFileName} select: ${error}`)

		}

		return data

	}

	async request (type, date, profileId) {

		try {

			this.adsFunctions.setApiScopeProfileId(profileId)

			const response = await fetch(`https://advertising-api.amazon.com/v2/sp/${type}/report`, {
				method: 'POST',
				headers: this.adsFunctions.headers,
				body: JSON.stringify({
					reportDate: date,
					metrics: this.moduleConfig.CAMPAIGN_METRICS, 
				}),
			})

			if (response.status === 202) return await response.json()

			if (await this.adsFunctions.doInvalidResponseActions(response, this.moduleName)) {

				return this.request(type, date, profileId)

			}

		} catch (error) {

			this.logger.error(`Error on ${this.scriptFileName} request: ${error}`)

		}

		return []

	}

	async waitForReport (reportResponse) {

		try {

			const response = await fetch(`https://advertising-api.amazon.com/v2/reports/${reportResponse.reportId}`, {
				method: 'GET',
				headers: this.adsFunctions.headers, 
			})

			const responseData = await response.json()

			if (responseData.status === 'SUCCESS') return responseData

			if (responseData.code === 'UNAUTHORIZED') {

				await this.adsFunctions.doInvalidResponseActions({ status: 401 }, this.moduleName)

				return this.waitForReport(reportResponse)

			}

			this.logger.info(`Not ready, sleeping for ${this.moduleConfig.SLEEP_TIME} ms and trying again`)
			await sleep(this.moduleConfig.SLEEP_TIME)

			return this.waitForReport(reportResponse)

		} catch (error) {

			this.logger.error(`Error on waitForReport: ${error}`)

		}

		return []

	}

	async downloadReport (reportInfo, options, profileId) {

		try {

			this.logger.debug('Setting variables')
			
			this.logger.debug('Getting environment path')
			const tempFilePathCompressed = `${this.moduleConfig.TEMP_PATH}/${options.type}_${profileId}_${options.date}.json.gz`
			const tempFilePathUncompressed = `${this.moduleConfig.TEMP_PATH}/${options.type}_${profileId}_${options.date}.json`

			this.logger.debug('Getting report url')

			const { url } = await fetch(reportInfo.location, {
				method: 'GET',
				headers: this.adsFunctions.headers, 
			})

			this.logger.debug('Getting report url file')

			const response = await fetch(url)

			await download(response.url)
				.on('response', () => {

					this.logger.debug(`Downloading report. Size: ${this.scripts.formatBytes(reportInfo.fileSize)}`)

				})
				.then((data) => {

					fs.writeFileSync(tempFilePathCompressed, data)

				})

			this.logger.info('Unzipping report and saving it')

			const readFile = await fs.createReadStream(tempFilePathCompressed)
			const gzip = await zlib.createGunzip()
			const writeUncompressedFile = await fs.createWriteStream(tempFilePathUncompressed)

			const pipelineUnzipFile = await util.promisify(stream.pipeline)
			await pipelineUnzipFile(readFile, gzip, writeUncompressedFile)
			this.logger.info('Deleting compressed file')

			fs.unlinkSync(tempFilePathCompressed)

			return tempFilePathUncompressed

		} catch (error) {

			this.logger.error(`Error on downloadReport: ${error} : ${JSON.stringify(reportInfo)} | ${JSON.stringify(options)}`)

			return false

		}

	}

	async get (options, profileId) {

		try {

			let reportFile
			this.logger.info(`Requesting ads report ${options.type} date ${options.date}`)
			const rawFilePath = `${this.moduleConfig.TEMP_PATH}/report_${options.type}_${profileId}_${options.date}.json`
			if (fs.existsSync(rawFilePath)) {

				const todayLA = moment(new Date())
					.tz('America/Los_Angeles')
					.format('YYYY-MM-DD HH:mm:ss')
				
				const createdDateLA = moment(fs.statSync(rawFilePath).ctime)
					.tz('America/Los_Angeles')
					.format('YYYY-MM-DD HH:mm:ss')
				
				const hours = moment
					.duration(moment(todayLA)
						.diff(createdDateLA))
					.asHours()
				
				if (hours < parseInt(this.moduleConfig.CACHE_TIME_HOURS, 10)) {

					reportFile = rawFilePath
				
					this.logger.warn(`Getting from cache temp folder (${hours.toFixed(2)} hours)`)
				
				} else {

					const requestResponse = await this.request(options.type, options.date, profileId)
					const reportResponse = await this.waitForReport(requestResponse)
					reportFile = await this.downloadReport(reportResponse, options, profileId)
				
				}
			
			} else {

				const requestResponse = await this.request(options.type, options.date, profileId)
				const reportResponse = await this.waitForReport(requestResponse)
				reportFile = await this.downloadReport(reportResponse, options, profileId)

			}

			const data = this.scripts.removeZerosValues(jsonfile.readFileSync(reportFile))

			return data
			
		} catch (error) {

			this.logger.error(`Error on getReport: ${error}`)

			return false

		}

	}

	save (data) {

		try {
			
			let total = 0
			Object.keys(data)
				.forEach(item => total += data[item].length)
			
			if (fs.existsSync(this.moduleDatabaseFilePath))
				data = {
					...this.select(),
					...data 
				}
		
			jsonfile.writeFileSync(this.moduleDatabaseFilePath,
				{
					dateUpdated: moment(new Date())
						.tz('America/Los_Angeles')
						.format('YYYY-MM-DD HH:mm:ss'),
					data, 
				},
				{ spaces: 2 })
			
			this.logger.info(`${this.moduleName} data saved. Total: ${total} items`)

			return true

		} catch (error) {

			this.logger.error(`Error on ${this.scriptFileName} save: ${error}`)

		}

		return false

	}

	async sync (quantityDays, type) {

		try {

			this.logger.info(`Starting ${this.moduleName} sync`)

			const dataToSave = {}
			const adsProfile = new AdsProfile()
			const profiles = adsProfile.select({ type:'seller' })

			for (const profile of profiles) {

				this.logger.info(`Syncing profile id ${profile.profileId} ${this.moduleName}s`)

				for (let i = 1; i <= quantityDays; i += 1) {

					const date = await moment()
						.subtract(i, 'days')
						.tz('America/Los_Angeles')
						.format('YYYYMMDD')

					const reportOptions = {
						date: date,
						type: type 
					}

					const data = await this.get(reportOptions, profile.profileId)
					data.forEach(item => item.profileId = profile.profileId)
					dataToSave[date] = [ ...data, ...dataToSave[date] || [] ]
				
				}
			
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

module.exports = AdsSpReport
