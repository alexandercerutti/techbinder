const google = require("googleapis");
const googleAuth = require("google-auth-library");
const readline = require("readline");
const fs = require("fs");

const CREDENTIALS = (process.env.DATA_DIR || "./data/")+"client_secret.json";
const TOKEN_DIR = (process.env.DATA_DIR || "./data/")+".credentials";

class Auth {
	constructor(service, scopes) {
		this.service = google[service.name](service.version);
		this.scopes = [];

		const gheader = "https://www.googleapis.com/auth";
		scopes.forEach(scope => {
			// checking if scopes contain the "header" above.
			if (!scope.includes(gheader)) {
				this.scopes.push(`${gheader}/${scope}`);
			} else {
				this.scopes.push(scope);
			}
		});

		this.tokenPath = `${TOKEN_DIR}/tokenAuth.json`;

		this.readCredentials(CREDENTIALS).then(cred => {
			const clientSecret 	= cred.installed.client_secret;
			const redirectURI	= cred.installed.redirect_uris[0];
			const clientID		= cred.installed.client_id;
			const OAuth2		= (new googleAuth()).OAuth2;

			this.oauth2Client = new OAuth2(clientID, clientSecret, redirectURI);

			this.readToken().then(token => {
				this.oauth2Client.credentials = token;
				google.options({
					auth: this.oauth2Client
				});
			}).catch(err => {
				console.log(err);
				this.oauth2Client.credentials = null;
			});
		}).catch(err => {
			console.log(err);
		});
	}

	/**
	 * Reads the credentials from a file
	 *
	 * @member {Function} readCredentials
	 * @memberof Auth
	 * @params {String} path - path of the credentials file
	 * @returns {Promise}
	 */

	readCredentials(path) {
		return new Promise((success, reject) => {
			fs.readFile(path, "utf-8", (err, data) => {
				if (err) { return reject(err); }

				return success(JSON.parse(data));
			});
		});
	}

	/**
	 * Reads the token from a file
	 *
	 * @member {Function} readToken
	 * @memberof Auth
	 * @returns {Promise}
	 */

	readToken() {
		return new Promise((success, reject) => {
			fs.readFile(this.tokenPath, (err, data) => {
				if (err) { return reject(err); }

				if (data) {
					return success(JSON.parse(data));
				}
				this.createToken().then(token => {
					return success(JSON.parse(token));
				}).catch(err => {
					return reject(err);
				});
			});
		});
	}

	/**
	 * Creates a new Token using Google authentication
	 *
	 * @member {Function} createToken
	 * @memberof Auth
	 * @returns {Promise}
	 */

	createToken() {
		return new Promise((success, reject) => {
			const authURI = this.oauth2Client.generateAuthUrl({
				access_type: "offline",
				scope: this.scopes,
			});

			console.log("Authorize this app by visiting this URI:\n\n", authURI);
			readline.question("\n\nEnter the code from that page here below:", code => {
				readline.close();

				this.oauth2Client.getToken(code, (err, token) => {
					if (err) { return reject(err); }

					this.storeToken(token);
					return success(token);
				});
			});
		});
	}

	/**
	 * Stores the token into token file
	 *
	 * @member {Function} storeToken
	 * @memberof Auth
	 * @params {Object} token - the token structure to be memorized
	 */

	storeToken(token) {
		fs.mkdir(TOKEN_DIR, () => {
			fs.writeFile(this.tokenPath, JSON.stringify(token), function(err) {
				console.log("New token stored. Error: ", err);
			});
		});
	}
}

module.exports = Auth;
