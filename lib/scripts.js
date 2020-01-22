class Scripts{

	formatBytes (a, b) {

		if (a === 0) return '0 Bytes'
		const c = 1024
		const d = b || 2
		const e = [
			'Bytes',
			'KB',
			'MB',
			'GB',
			'TB',
			'PB',
			'EB',
			'ZB',
			'YB'
		]
		const f = Math.floor(Math.log(a) / Math.log(c))

		return `${parseFloat((a / Math.pow(c, f)).toFixed(d))} ${e[f]}`

	}

	removeZerosValues (data) {

		for (let i = 0; i < data.length; i++) {

			for (const attribute in data[i]) {

				if (data[i][attribute] === 0) {

					delete data[i][attribute]
				
				}
			
			}
		
		}

		return data
	
	}

}

module.exports = Scripts