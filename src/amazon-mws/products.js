// const moment = require('moment-timezone');
const jsonfile = require('jsonfile')
const moment = require('moment-timezone')
const fs = require('fs')
const ini = require('ini')
const MwsReports = require('./reports.js')

class Products {

	constructor () {

		const config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'))
		this.databaseFilePath = config.app.PRODUCTS_DATABASE_FILE_PATH
		this.backupPath = config.app.PRODUCTS_BACKUP_PATH

	}

	syncProducts = async () => {

		try {

			const productsListInfo = await this.getProductsListInfo()
			await this.saveProductsListInfo(productsListInfo)

			return true

		} catch (error) {

			console.log(`Error on syncProducts: ${error.stack ? error.stack : error}`)

		}

		return false

	};

	selectAsins = async () => {

		// TODO fazer por country code

		try {

			const data = await jsonfile.readFile(this.databaseFilePath)

			return data.map((item) => item.asin1)

		} catch (error) {

			console.log(`Error on getAsins ${error}`)

		}

		return false

	}

	getProductsListInfo = async () => {

		try {

			const mwsReports = await new MwsReports()

			const getMerchantListings = async () => {

				const reportType = '_GET_MERCHANT_LISTINGS_ALL_DATA_'
				const cache = await this.selectCache(reportType)
				if (!cache) {

					const reportRequestId = await mwsReports.requestReport(reportType)
					const reportId = await mwsReports.waitForReportId(reportRequestId, reportType)

					return mwsReports.getReportData(reportId, reportType)

				}

				console.log(`We have a fresh ${reportType} report created, getting this one from cache`)

				return cache.data

			}

			const getFbaEstimatedFees = async () => {

				const reportType = '_GET_FBA_ESTIMATED_FBA_FEES_TXT_DATA_'
				const cache = await this.selectCache(reportType)
				if (!cache) {

					const reportRequestId = await mwsReports.requestReport(reportType)
					const reportId = await mwsReports.waitForReportId(reportRequestId, reportType)

					return mwsReports.getReportData(reportId, reportType)

				}

				console.log(`We have a fresh ${reportType} report created, getting this one from cache`)

				return cache.data

			}

			const getMerchantListingsDefects = async () => {

				const reportType = '_GET_MERCHANT_LISTINGS_DEFECT_DATA_'
				const cache = await this.selectCache(reportType)
				if (!cache) {

					const reportRequestId = await mwsReports.requestReport(reportType)
					const reportId = await mwsReports.waitForReportId(reportRequestId, reportType)

					return mwsReports.getReportData(reportId, reportType)

				}

				console.log(`We have a fresh ${reportType} report created, getting this one from cache`)

				return cache.data

			}

			const [
				merchantListingData,
				fbaEstimatedFeesData,
				merchantListingDefectsData,
			] = await Promise.all([
				getMerchantListings(),
				getFbaEstimatedFees(),
				getMerchantListingsDefects(),
			])

			const allProductsDataReports = merchantListingData
				.map((itemA) => (
					{
						...itemA,
						...{ fbaFees: fbaEstimatedFeesData.find((itemB) => itemB.asin === itemA.asin1), },
						...{ qualityAlert: merchantListingDefectsData
							.find((itemC) => itemC.asin === itemA.asin1), },
					}
				))

			return allProductsDataReports

		} catch (error) {

			console.log(error)

		}

		return false

	};

	saveProductsListInfo (productsListInfo) {

		try {

			console.log(`Saving products list on products database`)

			const actualDate = moment()
				.tz('America/Los_Angeles')
				.format('YY_MM_DD_H_mm')
			const backupFile = 	`${this.backupPath}/${actualDate}.json`

			if (fs.existsSync(this.databaseFilePath)) {

				fs.copyFileSync(this.databaseFilePath, backupFile)
				console.log('Product database backed up successfully')

			}

			jsonfile.writeFileSync(this.databaseFilePath,
				{
					dateUpdated: moment(new Date())
						.tz('America/Los_Angeles')
						.format('YYYY-MM-DD HH:mm:ss'),
					data: productsListInfo,
				},
				{ spaces: 2 },)

			console.log('Products list saved')

			return true

		} catch (error) {

			console.log(`Error on saveProductsListInfo: ${error.stack ? error.stack : error}`)

		}

		return false

	}

	selectCache (reportType) {

		try {

			let path = ''
			let cache = ''

			path = `${this.cacheDir}/report${reportType}`
			if (fs.existsSync(path)) {

				cache = jsonfile.readFileSync(path)
				const generatedDate = cache.dateGenerated
				const now = moment(new Date(), 'YYYY-MM-DDTHH:mm:ss+00:00')
				const minutesSubmitted = moment
					.duration(moment(now)
						.diff(moment(generatedDate)))
					.asMinutes()

				if (minutesSubmitted < 20) return cache

			}

		} catch (error) {

			console.log(`Error on selectCache: ${error}`)

		}

		return false

	}

}

module.exports = Products

