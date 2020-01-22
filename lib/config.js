const googleapis = require('googleapis')
const Google = require('./google.js')
const ini = require('ini')
const fs = require('fs')

class Config {
 
	constructor () {

		this.params = ini.parse(fs.readFileSync('./config.ini', 'utf-8'))
		this.google = new Google()

	}

	async init () {

		if (!this.auth) this.auth =	await this.google.selectAuth()
	
	}

	async get () {
		
		await this.init()
		const sheets = googleapis.google.sheets('v4')
	
		const config = {}
		let configCategory
		
		const request = {
			spreadsheetId: this.params.SHEET_ID,
			range: `${this.params.PROJECT}!A1:Z300`,
			auth: this.auth,
		}

		const response = await sheets.spreadsheets.values.get(request)
		const values = response.data.values

		for (let i = 0; i < values.length; i++) {

			const rows = values[i]

			if (rows.length === 0) continue

			if (rows[0].indexOf('[') > -1 && rows[0].indexOf(']') > -1) {

				configCategory = rows[0]
					.replace('[', '')
					.replace(']', '')
				config[configCategory] = {}

			} else if (rows[1]) {

				config[configCategory][rows[0]] = rows[1]
			
			}
			
		}
		// console.log(config)
		// console.log(response.data.values)

		return config

	}

}

module.exports = Config