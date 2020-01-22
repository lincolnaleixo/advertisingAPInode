/* eslint-disable require-atomic-updates */
const jsonfile = require('jsonfile')
const moment = require('moment-timezone')
const Config = require('../../lib/config')
const fs = require('fs')
const MwsReports = require('./reports.js')
const Seller = require('../seller')
const MwsApi = require('amazon-mws')
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
class Orders {

	async init () {

		if (!this.cfg){

			this.cfg = new Config()
			this.mwsReports = new MwsReports()
			this.seller = new Seller()
			await this.seller.init()
			// await this.seller.init()
			this.amazonMws = new MwsApi()

			this.amazonMws.setApiKey(this.seller.awsKey, this.seller.clientSecret)

			this.config = await this.cfg.get()
			this.sleep_next_token = this.config.orders.MS_WAIT_ORDERS_NEXT_TOKEN
			this.databaseFilePath = this.config.orders.DATABASE_FILE_PATH
			this.backupPath = this.config.orders.BACKUP_PATH
			this.orderItemUpdateInfoHours = this.config.orders.ITEM_UPDATE_INFO_HOURS
			this.cacheDir = this.config.system.MWS_CACHE_DIR

		}
	
	}

	/**
 	 * @param {string} range
	 */
	async syncOrders (range) {

		await this.init()

		try {

			const ordersDb = await this.selectOrders()
			let ordersToSave = []
			let startDate
			let endDate

			if (ordersDb.data === undefined) {

				ordersDb.data = []

			} else {

				ordersToSave = ordersDb.data

			}

			if (range.indexOf('d') > -1) {

				startDate = moment(new Date())
					.tz('America/Los_Angeles')
					.subtract(parseInt(range.replace('d', ''), 10), 'days')
					.format('YYYY-MM-DD')

				endDate = moment(new Date())
					.tz('America/Los_Angeles')
					.format('YYYY-MM-DD')

			} else if (range.indexOf('h') > -1) {

				startDate = moment(new Date())
					.tz('America/Los_Angeles')
					.subtract(parseInt(range.replace('h', ''), 10), 'hours')
					.format('YYYY-MM-DDTHH:mm:ss.SSS')

			} else if (range.indexOf('m') > -1) {

				startDate = moment(new Date())
					.tz('America/Los_Angeles')
					.subtract(parseInt(range.replace('m', ''), 10), 'minutes')
					.format('YYYY-MM-DDTHH:mm:ss.SSS')

			}

			const orders = await this.getOrders(startDate, endDate)

			if (orders.length > 0) {

				for (let i = 0; i < orders.length; i += 1) {

					let order = orders[i]

					if (ordersDb.data.length > 0) {

						const orderDb = ordersDb.data
							.find((item) => item.AmazonOrderId === order.AmazonOrderId)

						if (orderDb !== undefined) {

							// TODO metodo para verificar se existe update separado
							if (order.LastUpdateDate !== orderDb.LastUpdateDate) {

								console.log(`(${i + 1}/${orders.length}) Getting orders items from order id ${order.AmazonOrderId}`)

								order = {
									...order,
									...await this.getOrdersItems(order.AmazonOrderId)
								}
								const ordersIndex = ordersToSave
									.findIndex((item) => item.AmazonOrderId === order.AmazonOrderId)

								ordersToSave[ordersIndex] = order
								await sleep(2000)

							} else {

								console.log(`(${i + 1}/${orders.length}) No update on order ${order.AmazonOrderId}, skipping`)

							}

							continue

						}

					}

					console.log(`(${i + 1}/${orders.length}) Getting orders items from order id ${order.AmazonOrderId}`)

					order = {
						...order,
						...await this.getOrdersItems(order.AmazonOrderId)
					}

					ordersToSave.push(order)

					await sleep(2000)

				}

			} else {

				console.log(`No orders found in range ${range}`)

			}

			await this.saveOrders(ordersToSave)

		} catch (error) {

			console.log(`Error on SyncOrders(${range}): ${error}`)

		}

	}

	async selectOrders () {

		await this.init()

		try {

			if (fs.existsSync(this.databaseFilePath)) {

				const orders = jsonfile
					.readFileSync(this.databaseFilePath)

				return orders

			}

			return []

		} catch (error) {

			console.log(`Error on selectOrders: ${error}`)

			return false

		}

	}

	/**
	 * @param {string | any[]} ordersList
	 */
	async saveOrders (ordersList) {

		try {

			const ordersDb = await this.selectOrders()
			console.log('Saving orders list on order database')

			const actualDate = moment()
				.tz('America/Los_Angeles')
				.format('YY_MM_DD_H_mm')
			const backupFile = 	`${this.backupPath}/${actualDate}.json`

			if (fs.existsSync(this.databaseFilePath)) {

				fs.copyFileSync(this.databaseFilePath, backupFile)
				console.log('Orders database backed up successfully')

			}

			jsonfile.writeFileSync(this.databaseFilePath,
				{
					dateGenerated: moment(new Date())
						.tz('America/Los_Angeles')
						.format('YYYY-MM-DD HH:mm:ss'),
					data: ordersList.length > 0
						? ordersList
						: ordersDb.data,
				},
				{ spaces: 2 },)

			console.log('Order list saved')

			return true

		} catch (error) {

			console.log(`Error on saveOrders: ${error.stack ? error.stack : error}`)

		}

		return false

	}

	/**
	 * @param {string} startDate
	 * @param {string} endDate
	 */
	async getOrders (startDate, endDate) {

		await this.init()

		let orders = []

		const zone = 'America/Los_Angeles'
		const waitLoop = 30000
		const createdAfter = moment.tz(startDate, zone)
			.format()
		const createdBefore = endDate === undefined
			? moment(new Date())
				.tz('America/Los_Angeles')
				.format('YYYY-MM-DDTHH:mm:ss.SSS')
			: moment.tz(endDate, zone)
				.format()

		const searchParam = {
			Version: '2013-09-01',
			Action: 'ListOrders',
			SellerId: this.seller.sellerId,
			MWSAuthToken: 'MWS_AUTH_TOKEN',
			'MarketplaceId.Id.1': 'ATVPDKIKX0DER',
			CreatedAfter: createdAfter,
		}

		if (endDate !== undefined) searchParam.createdBefore = moment.tz(endDate, zone)
			.format()

		console.log(`Getting orders range: (${startDate} --- ${endDate === undefined ? createdBefore : endDate})`)

		try {

			let response = await this.amazonMws.orders.search(searchParam)

			if (response.Orders.Order !== undefined) {

				response.Orders.Order = response.Orders.Order.length === undefined
					? [ response.Orders.Order ] : response.Orders.Order

				response.Orders.Order.forEach((order, idx) => {

					response.Orders.Order[idx].PurchaseDate = moment(order.PurchaseDate)
						.tz('America/Los_Angeles')
						.format('YYYY-MM-DDTHH:mm:ss.SSS')

					response.Orders.Order[idx].LastConquerUpdateDate = moment(new Date())
						.tz('America/Los_Angeles')
						.format('YYYY-MM-DDTHH:mm:ss.SSS')

				})

				orders = [ ...orders, ...response.Orders.Order, ]

				while (response.NextToken !== undefined) {

					console.log('Getting more than 100 orders, this can take a while...')

					response = await this.getResponseNextToken(response.NextToken)

					response.Orders.Order.forEach((order, idx) => {

						response.Orders.Order[idx].PurchaseDate = moment(order.PurchaseDate)
							.tz('America/Los_Angeles')
							.format('YYYY-MM-DDTHH:mm:ss.SSS')

					})

					orders = [ ...orders, ...response.Orders.Order, ]

					await this.sleep(1000)

				}

				jsonfile.writeFileSync(`${this.cacheDir}/order_${createdAfter}-${createdBefore}`,
					{
						...{ dateGenerated: moment(new Date())
							.tz('America/Los_Angeles')
							.format('YYYY-MM-DD HH:mm:ss'), },
						response,
					},
					{ spaces: 2 },)

			}

		} catch (error) {

			if (error.Code === 'RequestThrottled') {

				console.log('ListOrders Request is throttled')

			} else {

				console.log('Error on getOrders')
				console.log(typeof error === 'object' ? JSON.stringify(error) : error)

			}

			console.log(`Waiting ${waitLoop} ms and trying again...`)
			await sleep(waitLoop)

		}

		return orders

	}

	/**
	 * @param {any} nextToken
	 */
	async getResponseNextToken (nextToken) {

		let response
		const waitLoop = 30000
		const searchParam = {
			Version: '2013-09-01',
			Action: 'ListOrdersByNextToken',
			SellerId: this.seller.sellerId,
			MWSAuthToken: 'MWS_AUTH_TOKEN',
			'MarketplaceId.Id.1': 'ATVPDKIKX0DER',
			NextToken: nextToken,
		}

		while (true) {

			try {

				response = await this.amazonMws.orders.search(searchParam)

				if (response !== undefined) return response

			} catch (error) {

				console.log(`Error on getOrdersNextToken: (${nextToken})`)
				console.log(typeof error === 'object' ? JSON.stringify(error) : error)

				if (error.Code === 'RequestThrottled') {

					console.log(`ListOrdersByNextToken Request is throttled, waiting ${waitLoop} ms and trying again...`)

					await sleep(waitLoop)

				}

			}

		}

	}

	/**
	 * @param {any} orderId
	 */
	async getOrdersItems (orderId) {

		let response
		const waitLoop = 30000

		const searchParam = {
			Version: '2013-09-01',
			Action: 'ListOrderItems',
			SellerId: this.seller.sellerId,
			MWSAuthToken: 'MWS_AUTH_TOKEN',
			'MarketplaceId.Id.1': 'ATVPDKIKX0DER',
			AmazonOrderId: orderId,
		}

		while (true) {

			try {

				response = await this.amazonMws.orders.search(searchParam)

				return response.OrderItems

			} catch (error) {

				if (error.Code === 'RequestThrottled') {

					console.log('ListOrders Request is throttled')

				} else {

					console.log('Error on getOrdersItems')
					console.log(typeof error === 'object' ? JSON.stringify(error) : error)

				}

				console.log(`Waiting ${waitLoop} ms and trying again...`)
				await sleep(waitLoop)

			}

		}

	}

	/**
	 * @param {any} reportType
	 */
	selectCache (reportType) {

		try {

			let path = ''
			let dump = ''

			path = `${this.cacheDir}/report${reportType}`
			if (fs.existsSync(path)) {

				dump = jsonfile.readFileSync(path)
				// @ts-ignore
				const generatedDate = dump.dateGenerated
				const now = moment(new Date(), 'YYYY-MM-DDTHH:mm:ss+00:00')
				const minutesSubmitted = moment
					.duration(moment(now)
						.diff(moment(generatedDate)))
					.asMinutes()

				if (minutesSubmitted < 20) return dump

			}

		} catch (error) {

			console.log(`Error on selectCache: ${error}`)

		}

		return false

	}

}

module.exports = Orders

