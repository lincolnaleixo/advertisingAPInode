const fs = require('fs')
const ini = require('ini')
const Logger = require('./lib/logger')
const Jobs = require('./src/jobs')
function createFolders () {

	const folders = this.config.system.requiredFolders.FOLDERS
	for (let i = 0; i < folders.length; i++) {

		if (!fs.existsSync(folders[i])){

			fs.mkdirSync(folders[i])
			this.logger.info(`Folder ${ folders[i] } created!`)
		
		}
		
	}

}

function start () {

	this.moduleName = 'main'

	this.config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'))
	this.logger = new Logger(this.moduleName)
		.get()
	this.jobs = new Jobs()

	createFolders()
	this.jobs.start()

}

start()