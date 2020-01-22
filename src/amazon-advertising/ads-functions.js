/* eslint-disable no-restricted-properties */
const ini = require('ini')
const fetch = require('node-fetch')
const fs = require('fs')
const Logger = require('./../logger')

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

class AmazonAdvertisingFunctions {

	constructor () {

		this.moduleName = 'advertisingFunctions'

		this.config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'))
		const { credentials } = this.config
		const { system } = this.config
		const { app } = this.config

		this.logger = new Logger(this.moduleName)
			.get()

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

	updateHeaders () {

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

			this.logger.error(`Error on updateHeaders ${error}`)

		}

	}

	setApiScopeProfileId (profileId) {

		this.headers['Amazon-Advertising-API-Scope'] = profileId
	
	}

	async updateConfig () {

		try {

			this.config.credentials.ADVERTISING_ACCESS_TOKEN = this.advertisingAccessToken

			await fs.writeFileSync('./config.ini', ini.stringify(this.config))

		} catch (error) {

			this.logger.error(`Error on updateConfig ${error}`)

		}

	}

	async refreshToken () {

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

				this.logger.info('Refreshed with success!')

			} else {

				if (data.error_description === 'The request has an invalid grant parameter : code') {

					this.logger.error('Refresh token is not valid')

				} else {

					this.logger.error(data)

				}

				this.logger.error(`Status: ${response.status}`)
				this.logger.error(`Text: ${response.statusText}`)

			}

		} catch (error) {

			this.logger.error(`Error on doRefreshToken: ${error.stack}`)

		}

	}

	async doInvalidResponseActions (response, requestType) {

		if (response.status === 401) {

			this.logger.info(this.config.system.RESPONSE_STATUS_401_MESSAGE)
			await this.refreshToken()

		} else if (response.status === 404) {

			this.logger.error(`${this.config.system.RESPONSE_STATUS_404_MESSAGE} on requesting ${requestType}`)

			return false
		
		} else if (response.status === 406) {

			this.logger.error(`${this.config.system.RESPONSE_STATUS_406_MESSAGE} on requesting ${requestType}`)
	
			return false
		
		} else if (response.status === 429) {

			this.logger.error(`${this.config.system.RESPONSE_STATUS_429_MESSAGE} on requesting ${requestType}`)
			await sleep(10000)

		} else if (response.status === 502) {

			this.logger.error(`${this.config.system.RESPONSE_STATUS_502_MESSAGE} on requesting ${requestType}`)
			await sleep(10000)
		
		} else if (response.status === 503) {

			this.logger.error(`${this.config.system.RESPONSE_STATUS_503_MESSAGE} on requesting ${requestType}`)
			await sleep(30000)
		
		} else {

			this.logger.warn(`Not identified status code on request ${requestType}`)
			this.logger.error(`Status Code: ${response.status}: ${response.statusText}`)

			return false

		}

		return true

	}

}

module.exports = AmazonAdvertisingFunctions
