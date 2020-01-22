const crypto = require('crypto');

const algorithm = 'aes-256-cbc';
const key = crypto.randomBytes(32);
let iv = crypto.randomBytes(16);

function encrypt(text) {

	const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(key), iv);
	let encrypted = cipher.update(text);
	encrypted = Buffer.concat([encrypted, cipher.final()]);

	return { iv: iv.toString('hex'), encryptedData: encrypted.toString('hex') };

}

function decrypt(text) {

	iv = Buffer.from(text.iv, 'hex');
	const encryptedText = Buffer.from(text.encryptedData, 'hex');
	const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), iv);
	let decrypted = decipher.update(encryptedText);
	decrypted = Buffer.concat([decrypted, decipher.final()]);

	return decrypted.toString();

}

module.exports = { encrypt, decrypt };
