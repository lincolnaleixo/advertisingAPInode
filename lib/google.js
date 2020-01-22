
const ini = require('ini')
const googleapis = require('googleapis')
const fs = require('fs')
const jsonfile = require('jsonfile')

class Google {

	constructor () {

		this.config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'))
		this.clientSecret = jsonfile.readFileSync(this.config.CLIENT_SECRET_PATH).installed
		this.gDriveToken = jsonfile.readFileSync(this.config.GDRIVE_TOKEN_PATH)
		
		this.oauth2Client = new googleapis.google.auth.OAuth2(this.clientSecret.client_id,
			this.clientSecret.client_secret,
			this.clientSecret.redirect_uris[0])

	}

	async selectAuth () {
		
		try {

			this.oauth2Client.setCredentials(this.gDriveToken)
			this.oauth2Client.forceRefreshOnFailure = true
			if (this.oauth2Client.isTokenExpiring()) {
	
				console.log('Token expiring, refreshing...')
				
				await this.oauth2Client.refreshAccessToken()
				const tokensRefreshed = this.oauth2Client.credentials
	
				this.gDriveToken.access_token = tokensRefreshed.access_token
				this.gDriveToken.expiry_date = tokensRefreshed.expiry_date
	
				jsonfile.writeFileSync(this.config.GDRIVE_TOKEN_PATH, this.gDriveToken)
				this.oauth2Client.setCredentials(this.gDriveToken)
	
				console.log(`Gdrive token refreshed and updated!`)
			
			}
	
			return this.oauth2Client
		
		} catch (err) {

			console.log(`Error on Google - selectAuth: ${err}`)
		
		}
	
	}

}

module.exports = Google