/* eslint-disable require-atomic-updates */
const jsonfile = require('jsonfile')
const moment = require('moment-timezone')
const ini = require('ini')
const fs = require('fs')
const { CronJob } = require('cron')
const Order = require('./order')
const AdsJobs = require('./amazon-advertising/ads-jobs')
const Logger = require('./logger')
class Jobs {

	constructor () {

		const config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'))

		const { scheduler } = config

		this.databaseFilePath = config.app.JOBS_DATABASE_FILE_PATH
		this.ordersHourSyncIntervalMinutes = scheduler.JOBS_ORDERS_HOUR_SYNC_INTERVAL_MINUTES
		this.ordersDaySyncTime = scheduler.JOBS_ORDERS_DAY_SYNC_TIME
		this.advertisingSyncTime = scheduler.JOBS_ADVERTISING_SYNC_TIME

	}

	start () {

		this.logger = new Logger()

		try {

			const order = new Order()
			const jobsList = []

			console.log('Starting jobs')

			// new CronJob({
			// 	cronTime: '*/2 * * * * *',
			// 	onTick: () => {

			// 		this.config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'))

			// 		this.scheduler = this.config.scheduler
			
			// 		this.databaseFilePath = this.config.app.JOBS_DATABASE_FILE_PATH
			// 		this.ordersHourSyncIntervalMinutes = this.scheduler.JOBS_ORDERS_HOUR_SYNC_INTERVAL_MINUTES
			// 		this.ordersDaySyncTime = this.scheduler.JOBS_ORDERS_DAY_SYNC_TIME
			// 		this.advertisingSyncTime = this.scheduler.JOBS_ADVERTISING_SYNC_TIME

			// 	},
			// 	start: true,
			// 	timeZone: 'America/Los_Angeles',
			// })

			if (this.ordersHourSyncIntervalMinutes) {

				const cronTimeOrdersHour = `0 */${this.ordersHourSyncIntervalMinutes} * * * *`
				jobsList.ordersHour = new CronJob({
					cronTime: cronTimeOrdersHour,
					onTick: async () => {
	
						if (
							jobsList.ordersHour.taskRunning
	
							|| jobsList.ordersDay.taskRunning
						) return
	
						try {
	
							jobsList.ordersHour.taskRunning = true
							await order.syncOrders('1h')
	
						} catch (err) {
	
							console.log('Error on jobs syncOrders.ordersHour')
	
						}
	
						jobsList.ordersHour.taskRunning = false
	
					},
					start: true,
					timeZone: 'America/Los_Angeles',
				})
			
			}

			if (this.ordersDaySyncTime) {

				const cronTimeOrdersDay = `${this.ordersDaySyncTime.split(':')[2]} ${this.ordersDaySyncTime.split(':')[1]} ${this.ordersDaySyncTime.split(':')[0]} * * *`

				jobsList.ordersDay = new CronJob({
					cronTime: cronTimeOrdersDay,
					onTick: async () => {
	
						if (jobsList.ordersDay.taskRunning) return
	
						if (jobsList.ordersHour.taskRunning) jobsList.ordersHour.stop()
	
						try {
	
							jobsList.ordersDay.taskRunning = true
							await order.syncOrders('1d')
	
						} catch (err) {
	
							console.log('Error on jobs syncOrders.ordersDay')
	
						}
	
						jobsList.ordersDay.taskRunning = false
	
					},
					start: true,
					timeZone: 'America/Los_Angeles',
				})
			
			}

			if (this.advertisingSyncTime) {

				const cronTimeAdvertisingTime = `${this.advertisingSyncTime.split(':')[2]} ${this.advertisingSyncTime.split(':')[1]} ${this.advertisingSyncTime.split(':')[0]} * * *`

				jobsList.advertisingDay = new CronJob({
					cronTime: cronTimeAdvertisingTime,
					onTick: async () => {
	
						if (jobsList.advertisingDay.taskRunning) return
	
						try {
	
							jobsList.advertisingDay.taskRunning = true
							const adsJobs = new AdsJobs()
							await adsJobs.syncAdsData({
								reportDays: 7,
								reportType: 'campaigns' 
							})
	
						} catch (err) {
	
							this.logger.error('Error on jobs advertisingDay')
	
						}
	
						jobsList.advertisingDay.taskRunning = false
						this.logger.warn(`Next execution at ${jobsList.advertisingDay.cronTime.source}`)

					},
					start: true,
					timeZone: 'America/Los_Angeles',
				})
			
			}

			if (Object.keys(jobsList).length > 0){

				console.log('Jobs to execute:')
				for (const job in jobsList) {

					console.log(`${job} --- Frequency: ${jobsList[job].cronTime.source}`)

				}

			} else {

				console.log('No jobs to execute, aborting ConquerAmazon')
			
			}

		} catch (error) {

			console.log(`Error on start jobs: ${error}`)

		}

	}

	selectJobs () {

		try {

			if (fs.existsSync(this.databaseFilePath)) {

				const jobs = jsonfile
					.readFileSync(this.databaseFilePath)

				return jobs

			}

			return []

		} catch (error) {

			console.log(`Error on selectJobs: ${error}`)

			return false

		}

	}

	saveJobs (jobsList) {

		try {

			const jobsDb = this.selectJobs()
			console.log('Saving jobs list on jobs database')

			jsonfile.writeFileSync(this.databaseFilePath,
				{
					dateGenerated: moment(new Date())
						.tz('America/Los_Angeles')
						.format('YYYY-MM-DD HH:mm:ss'),
					data: jobsList.length > 0
						? jobsList
						: jobsDb.data,
				},
				{ spaces: 2 },)

			console.log('Jobs list saved')

			return true

		} catch (error) {

			console.log(`Error on saveOrders: ${error.stack ? error.stack : error}`)

		}

		return false

	}

}

module.exports = Jobs

