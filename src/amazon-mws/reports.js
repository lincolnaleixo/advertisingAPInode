/* eslint-disable no-loop-func */
const MwsApi = require('amazon-mws')
const moment = require('moment-timezone')
const jsonfile = require('jsonfile')
const Seller = require('../seller')
const Config = require('../../lib/config')
/**
 * @param {number} milliseconds
 */
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))

// TODO mudar o resto do codigo para usar this.amazonMws
class MwsReports {

	constructor () {

		this.seller = new Seller()
		this.amazonMws = new MwsApi()
		this.cfg = new Config()
	
	}

	async init () {
		
		this.amazonMws.setApiKey(this.seller.awsKey, this.seller.clientSecret)
		
		this.config = await this.cfg.get()
		this.cacheDir = this.config.system.MWS_CACHE_DIR
		this.sleep_throttled = parseInt(this.config.system.MWS_MS_THROTTLED, 10)
		this.sleep_wait_report = parseInt(this.config.system.MWS_MS_WAIT_REPORT, 10)
		this.max_runs = parseInt(this.config.system.MWS_MAX_RUNS_WAIT_REPORT, 10)
	
	}

	/**
	 * @param {string} reportType
	 */
	async requestReport (reportType) {

		let response

		while (true) {

			try {

				const param = {
					Version: '2009-01-01',
					Action: 'RequestReport',
					SellerId: this.seller.sellerId,
					MWSAuthToken: 'MWS_AUTH_TOKEN',
					'MarketplaceIdList.Id.1': this.seller.marketplaceId,
					ReportType: reportType,
				}

				response = await this.amazonMws.reports.search(param)

				if (response !== undefined) return response.ReportRequestInfo.ReportRequestId

			} catch (error) {

				console.log('Error on requestReportMWS')

				if (error.Code === 'RequestThrottled') {

					console.log('requestReport: Request is throttled')
					console.log(`Waiting ${this.sleep_throttled} ms and trying again...`)
					await sleep(this.sleep_throttled)

				} else if (error.Code === 'GenericError') {

					if (error.type === 'AmazonMwsConnectionError') {

						console.log('Connection error')
						console.log(`Waiting ${this.sleep_throttled} ms and trying again...`)

					} else {

						console.log('Generic error occurred')
						console.log(`Waiting ${this.sleep_throttled} ms and trying again...`)

					}

					await sleep(this.sleep_throttled)

				} else if (error.Code === 'SignatureDoesNotMatch') {

					throw new Error('SignatureDoesNotMatch')

				} else {

					throw new Error(`Error not categorized. Aborting execution: ${error}`)

				}

			}

		}

	}

	/**
	 * @param {any} reportRequestId
	 */
	async getReportRequestStatus (reportRequestId) {

		let response

		while (true) {

			try {

				const param = {
					Version: '2009-01-01',
					Action: 'GetReportRequestList',
					SellerId: this.seller.sellerId,
					MWSAuthToken: 'MWS_AUTH_TOKEN',
					'ReportRequestIdList.Id.1': reportRequestId,
				}

				response = await this.amazonMws.reports.search(param)

				if (response !== undefined) return response

			} catch (error) {

				console.log('Error on getReportRequestStatus')

				if (error.Code === 'RequestThrottled') {

					console.log('requestReport: Request is throttled')
					console.log(`Waiting ${this.sleep_throttled} ms and trying again...`)
					await sleep(this.sleep_throttled)

				} else if (error.Code === 'GenericError') {

					if (error.type === 'AmazonMwsConnectionError') {

						console.log('Connection error')
						console.log(`Waiting ${this.sleep_throttled} ms and trying again...`)
						await sleep(this.sleep_throttled)

					} else {

						console.log('Generic error occurred')
						console.log(`Waiting ${this.sleep_throttled} ms and trying again...`)
						await sleep(this.sleep_throttled)

					}

				} else if (error.Code === 'SignatureDoesNotMatch') {

					throw new Error('SignatureDoesNotMatch')

				} else {

					throw new Error(`Error not categorized. Aborting execution: ${error}`)

				}

			}

		}

	}

	/**
	 * @param {any} reportType
	 */
	async getLastAvailableReportId (reportType) {

		const param = {
			Version: '2009-01-01',
			Action: 'GetReportRequestList',
			SellerId: this.seller.sellerId,
			MWSAuthToken: 'MWS_AUTH_TOKEN',
			'ReportTypeList.Type.1': reportType,
			'ReportProcessingStatusList.Status.1': '_DONE_',
			__CHARSET__: 'ISO-8859-1',
		}

		while (true) {

			try {

				const response = await this.amazonMws.reports.search(param)

				if (response.ReportRequestInfo[0] !== undefined) {

					return response.ReportRequestInfo[0].GeneratedReportId
				
				}

				throw new Error('Doesn\'t exist any last available report id for this report type...')

			} catch (error) {

				console.log('Error on getLastAvailableReportId')

				if (error.Code === 'RequestThrottled') {

					console.log('requestReport: Request is throttled')
					console.log(`Waiting ${this.sleep_throttled} ms and trying again...`)
					await sleep(this.sleep_throttled)

				} else if (error.Code === 'GenericError') {

					if (error.type === 'AmazonMwsConnectionError') {

						console.log('Connection error')
						console.log(`Waiting ${this.sleep_throttled} ms and trying again...`)
						await sleep(this.sleep_throttled)

					} else {

						console.log('Generic error occurred')
						console.log(`Waiting ${this.sleep_throttled} ms and trying again...`)
						await sleep(this.sleep_throttled)

					}

				} else if (error.code === 'SignatureDoesNotMatch') {

					console.log('SignatureDoesNotMatch')

					throw new Error('SignatureDoesNotMatch')

				} else {

					console.log(JSON.stringify(error))

					return false

				}

			}

		}

	}

	/**
	 * @param {any} reportId
	 * @param {any} reportType
	 */
	async getReportData (reportId, reportType) {

		let response

		while (true) {

			try {

				const param = {
					Version: '2009-01-01',
					Action: 'GetReport',
					SellerId: this.seller.sellerId,
					MWSAuthToken: 'MWS_AUTH_TOKEN',
					ReportId: reportId,
					__CHARSET__: 'ISO-8859-1',
				}

				response = await this.amazonMws.reports.search(param)

				if (response !== undefined) {

					await jsonfile.writeFile(`${this.cacheDir}/report${reportType}`,
						{ ...{ dateGenerated: moment(new Date())
							.tz('America/Los_Angeles')
							.format('YYYY-MM-DD HH:mm:ss'), }, },
						{ spaces: 2 },)

				}

				return response.data

			} catch (error) {

				console.log('Error on getReportData')

				if (error.Code === 'RequestThrottled') {

					console.log('requestReport: Request is throttled')
					console.log(`Waiting ${this.sleep_throttled} ms and trying again...`)
					await sleep(this.sleep_throttled)

				} else if (error.Code === 'GenericError') {

					if (error.type === 'AmazonMwsConnectionError') {

						console.log('Connection error')
						console.log(`Waiting ${this.sleep_throttled} ms and trying again...`)
						await sleep(this.sleep_throttled)

					} else {

						console.log('Generic error occurred')
						console.log(`Waiting ${this.sleep_throttled} ms and trying again...`)
						await sleep(this.sleep_throttled)

					}

				} else if (error.code === 'SignatureDoesNotMatch') {

					console.log('SignatureDoesNotMatch')

					throw new Error('SignatureDoesNotMatch')

				} else {

					console.log(JSON.stringify(error))

					return false

				}

			}

		}

	}

	/**
	 * @param {any} reportRequestId
	 * @param {any} reportType
	 */
	async waitForReportId (reportRequestId, reportType) {

		try {

			for (let i = 0; i < this.max_runs; i += 1) {

				const response = await this.getReportRequestStatus(reportRequestId)
				const responseStatus = response.ReportRequestInfo.ReportProcessingStatus

				if (responseStatus === '_IN_PROGRESS_' || responseStatus === '_SUBMITTED_') {

					await console.log(`(${i + 1}) Still not ready! Waiting ${this.sleep_wait_report} ms and trying again...`,)
					await sleep(this.sleep_wait_report)

				} else if (responseStatus === '_CANCELLED_') {

					await console.log('Report cancelled, getting the last one available...')

					return await this.getLastAvailableReportId(reportType)

				} else if (responseStatus === '_DONE_') {

					const reportId = response.ReportRequestInfo.GeneratedReportId

					if (reportId === undefined) {

						throw new Error(`generatedReportId is undefined. Full response: ${response}`)

					} else {

						console.log(`Report ${reportType} is ready, returning it...`)
						
						return reportId

					}

				} else if (i === this.max_runs) {

					throw new Error('Out of number of runs to try')

				}

			}

		} catch (error) {

			console.log(`Error on waitForReportId: ${error}`)

		}

		return false

	}

	/**
	 * @param {any} asin
	 */
	async getDetailProductInfoMWS (asin) {

		let response

		try {

			const param = {
				Version: '2011-10-01',
				Action: 'GetMatchingProductForId',
				SellerId: this.seller.sellerId,
				MWSAuthToken: 'MWS_AUTH_TOKEN',
				MarketplaceId: 'ATVPDKIKX0DER',
				IdType: 'ASIN',
				'IdList.Id.1': asin,
			}

			while (true) {

				try {

					response = await this.amazonMws.products.search(param)
					if (response.Products === undefined) {

						console.log(`Detailed information from asin ${asin} not found on Amazon`)
						// console.log('productDetailedInfo: Not found on Amazon');

						return false

					}

					// console.log(`productDetailedInfo:
					// ${JSON.stringify(response.Products.Product, null, 4)}`);

					return response.Products.Product

				} catch (error) {

					console.log(`Error on getDetailProductInfoMWS: ${error.stack}`)

					if (error.Code === 'RequestThrottled') {

						console.log('Request is throttled')
						console.log(`Waiting ${this.sleep_throttled} ms and trying again...`)
						await sleep(this.sleep_throttled)
						this.sleep_throttled *= 2

					} else if (error.Code === 'GenericError') {

						console.log('Generic error occurred')
						console.log(`Waiting ${this.sleep_throttled} ms and trying again...`)
						await sleep(this.sleep_throttled)
						this.sleep_throttled *= 2

					} else {

						console.log(error)
						console.log('Unknown error occurred, check logs. Aborting')

						return false

					}

				}

			}

		} catch (error) {

			console.log(`Error on getDetailProductInfoMWS: ${JSON.stringify(error)}`)

			return false

		}

	}

}

module.exports = MwsReports

