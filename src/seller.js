const MwsApi = require('amazon-mws')
const crypto = require('crypto')
const Config = require('../lib/config')

const algorithm = 'aes-256-cbc'
const key = crypto.randomBytes(32)
const iv = crypto.randomBytes(16)
class Seller {

	async init () {

		if (!this.cfg) {

			this.cfg = new Config()
			const config = await this.cfg.get()
	
			this.awsKey = config.credentials.ACCESS_KEY_ID
			this.clientSecret = config.credentials.SECRET_ACCESS_KEY
			this.sellerId = config.credentials.SELLER_ID
			this.marketplaceId = config.credentials.MARKETPLACE_ID

		}
	
	}

	async validateCredentialsConfig () {

		await this.init()

		try {

			const amazonMws = new MwsApi()
			amazonMws.setApiKey(this.awsKey, this.clientSecret)

			// amazonMws.setCredentials(awsKey, clientSecret, sellerId, marketplaceId);
			// let message, response;

			return amazonMws.products
				.search({
					Version: '2011-10-01',
					Action: 'GetMatchingProduct',
					SellerId: this.sellerId,
					MarketplaceId: this.marketplaceId,
					'ASINList.ASIN.1': 'B07K6SG3LH',
				})
				.then(() => ({
					valid: true,
					message: 'MWS credentials valid',
				}))
				.catch((error) => {

					if (error.Message.indexOf('The AWS Access Key Id you provided') > -1) {

						return {
							valid: false,
							message: 'There is something wrong with the AWS Access Key Id you provided',
						}

					}

					if (error.Message.indexOf('Check your AWS Secret Access Key') > -1) {

						return {
							valid: false,
							message: 'Your Secret Access Key is incorrect',
						}

					}

					return {
						valid: false,
						message: error.Message,
					}

				})

		} catch (error) {

			console.log(`Error on validateCredentials: ${error}`)

			return false

		}

	}

	encrypt (text) {

		const cipher = crypto.createCipheriv(algorithm, Buffer.from(key), iv)
		let encrypted = cipher.update(text)
		encrypted = Buffer.concat([ encrypted, cipher.final() ])

		return {
			iv: iv.toString('hex'),
			encryptedData: encrypted.toString('hex') 
		}

	}

	decrypt (text) {

		const iv = Buffer.from(text.iv, 'hex')
		const encryptedText = Buffer.from(text.encryptedData, 'hex')
		const decipher = crypto.createDecipheriv(algorithm, Buffer.from(key), iv)
		let decrypted = decipher.update(encryptedText)
		decrypted = Buffer.concat([ decrypted, decipher.final() ])

		return decrypted.toString()

	}

}

module.exports = Seller

