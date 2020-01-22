const request = require('request');
const ini = require('ini');
const fs = require('fs');

class Alerts {

	constructor() {

		const config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'));
		this.alerts = config.alerts;

	}

	sendTelegramMessage = async (message) => {

		try {

			console.log('Sending telegram message');

			if (this.alerts !== undefined) {

				const token = this.alerts.TELEGRAM_TOKEN;
				const chatId = this.alerts.TELEGRAM_CHAT_ID;
				const url = encodeURI(`https://api.telegram.org/bot${token}/sendMessage?chat_id=${chatId}&text=${message}&parse_mode=HTML`);
				await request.post(url);
				console.log('telegram message sent');

			}

		} catch (error) {

			console.log(`Error on sendTelegramMessage: ${error.stack}`);

		}

	}

}

module.exports = Alerts;

