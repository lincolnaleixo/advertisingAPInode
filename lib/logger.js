const ini = require('ini')
const fs = require('fs')
const moment = require('moment-timezone')
const path = require('path')
const {
	createLogger,
	format,
	transports,
} = require('winston')
class Logger{

	constructor (module) {

		this.colorizer = format.colorize()
		this.config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'))
		this.logsPath = this.config.system.LOGS_PATH

		const {
			combine,
			printf,
		} = format

		const alignedWithTime = format.combine(format.align(),
			format.printf(info => `${Date.now()
				.toString()}\t${moment()
				.tz('America/Los_Angeles')
				.format('YYYY-MM-DDTHH:mm:ss.SSS')}\t${module}\t${info.level}\t${info.message}`),)

		this.logger = createLogger({
			level: 'debug',
			format: alignedWithTime,
			transports: [
				new transports.File({
					filename: path.join(this.logsPath, 'error.log'),
					level: 'error',
					format: alignedWithTime,
				}),
				new transports.File({ filename: path.join(this.logsPath, 'combined.log'), }),
				new transports.File({ filename: path.join(this.logsPath, `${module}.log`), }),
			],
		})

		if (process.pkg) {

			this.logger.add(new transports.Console({
				level: 'info',
				format: format.printf(msg => this.colorizer.colorize(msg.level, `${Date.now()
					.toString()}\t${moment()
					.tz('America/Los_Angeles')
					.format('YYYY-MM-DDTHH:mm:ss.SSS')}\t${module}\t${msg.message}`)),
			}),)

		} else {

			this.logger.add(new transports.Console({
				level: 'debug',
				format: format.printf(msg => this.colorizer.colorize(msg.level, `${Date.now()
					.toString()}\t${moment()
					.tz('America/Los_Angeles')
					.format('YYYY-MM-DDTHH:mm:ss.SSS')}\t${module}\t${msg.message}`)),
			}),)

		}
		
	}

	get () {

		return this.logger
	
	}

}

module.exports = Logger
